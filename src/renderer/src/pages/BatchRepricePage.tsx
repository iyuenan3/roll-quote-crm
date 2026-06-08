import { useEffect, useState } from 'react';
import type { Product, BasePrice, ProductQuoteRow } from '../../../shared/api';
import { adjustRollPrice, type PriceAdjustMode } from '../../../core/pricing';
import { getDb, errMsg } from '../lib/db';

// 批量调价：原料浮动时，选一个产品，给其下各客户专属价（可逐个排除）按统一方式调整并追加新报价。
// 红线：仍走「追加新行 + 翻 is_current」，一笔事务原子（见 dao.applyBatchRepricing）。调价算法在 core/pricing 纯函数。
export function BatchRepricePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState<ProductQuoteRow[]>([]);
  const [base, setBase] = useState<BasePrice | undefined>(undefined);
  const [excluded, setExcluded] = useState<Set<number>>(new Set()); // 排除的客户 id（默认全选 = 空集）
  const [mode, setMode] = useState<PriceAdjustMode>('percent');
  const [value, setValue] = useState('');
  const [adjustBase, setAdjustBase] = useState(false);
  const [note, setNote] = useState('原料调价');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setProducts(await getDb().listProducts());
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, []);

  const loadForProduct = async (pid: number) => {
    setMsg('');
    try {
      const [qs, b] = await Promise.all([
        getDb().listCurrentQuotesByProduct({ productId: pid }),
        getDb().getCurrentBasePrice({ productId: pid }),
      ]);
      setRows(qs);
      setBase(b);
      setExcluded(new Set());
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const onSelectProduct = (id: string) => {
    setProductId(id);
    setValue('');
    setAdjustBase(false);
    setRows([]);
    setBase(undefined);
    if (id) void loadForProduct(Number(id));
  };

  const toggle = (cid: number) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(cid)) n.delete(cid);
      else n.add(cid);
      return n;
    });

  const v = Number(value);
  const valueValid = value.trim() !== '' && Number.isFinite(v);
  // 调价预览（≤0 视为非法，会被拦）
  const newPriceOf = (current: number): number | null => (valueValid ? adjustRollPrice(current, mode, v) : null);

  const included = rows.filter((r) => !excluded.has(r.customerId));
  const targetInvalid = included.some((r) => {
    const np = newPriceOf(r.rollPrice);
    return np == null || np <= 0;
  });
  const writeBase = adjustBase && base != null;
  const baseNew = writeBase ? newPriceOf(base!.rollPrice) : null;
  const baseInvalid = writeBase && (baseNew == null || baseNew <= 0);

  const canApply =
    valueValid && !busy && (included.length > 0 || writeBase) && !targetInvalid && !baseInvalid;

  const doApply = async () => {
    if (!canApply) return;
    if (
      !window.confirm(
        `确认给 ${included.length} 个客户${writeBase ? ' + 产品基础价' : ''} 追加新报价？旧价保留为历史，可随时回看。`,
      )
    )
      return;
    setBusy(true);
    setMsg('');
    try {
      const n = await getDb().applyBatchRepricing({
        quotes: included.map((r) => ({
          customerId: r.customerId,
          productId: Number(productId),
          rollPrice: newPriceOf(r.rollPrice)!,
          note: note.trim(),
        })),
        base: writeBase
          ? { productId: Number(productId), rollPrice: baseNew!, note: note.trim() }
          : undefined,
      });
      setMsg(`✅ 已为 ${n} 项追加新报价（旧价留痕）`);
      setValue('');
      await loadForProduct(Number(productId)); // 刷新成新当前价
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">批量调价</h2>
      <p className="page-sub">
        原料浮动时，选产品后给其下各客户专属价统一调整（按百分比 / 固定额 / 设为指定值），可逐个排除、可同时调基础价。
        全部走「追加新报价」，旧价留痕，不覆盖历史。
      </p>

      <div className="card">
        <h3>选择产品</h3>
        <div className="form-row">
          <div className="field">
            <label>产品</label>
            <select value={productId} onChange={(e) => onSelectProduct(e.target.value)}>
              <option value="">请选择</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {products.length === 0 && <p className="empty">还没有产品，请先到「产品」页添加。</p>}
        {msg && (
          <p className="error" style={{ color: msg.startsWith('✅') ? 'var(--ok)' : undefined }}>
            {msg}
          </p>
        )}
      </div>

      {productId !== '' && (
        <>
          <div className="card">
            <h3>调价方式</h3>
            <div className="form-row">
              <div className="field">
                <label>方式</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as PriceAdjustMode)}>
                  <option value="percent">按百分比 (%)</option>
                  <option value="delta">按固定额 (元/卷)</option>
                  <option value="set">设为指定值 (元/卷)</option>
                </select>
              </div>
              <div className="field">
                <label>
                  {mode === 'percent' ? '涨跌幅（%，负数为降）' : mode === 'delta' ? '增减额（元/卷，负数为降）' : '统一设为（元/卷）'}
                </label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === 'percent' ? '如 5 或 -3' : mode === 'set' ? '如 100' : '如 8 或 -5'}
                />
              </div>
              <div className="field">
                <label>备注（写入每条新报价）</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={adjustBase}
                disabled={base == null}
                onChange={(e) => setAdjustBase(e.target.checked)}
                style={{ width: 'auto' }}
              />
              同时调整产品基础价
              {base != null ? (
                <span style={{ color: 'var(--muted)' }}>
                  （当前 ¥{base.rollPrice}
                  {writeBase && baseNew != null ? ` → ¥${baseNew}` : ''}）
                </span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>（该产品未设基础价）</span>
              )}
            </label>
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={doApply} disabled={!canApply}>
                应用调价（追加新报价）
              </button>
              {valueValid && targetInvalid && (
                <span style={{ color: 'var(--danger)', marginLeft: 12 }}>
                  有客户新价 ≤ 0，调整幅度后再应用
                </span>
              )}
              {valueValid && baseInvalid && !targetInvalid && (
                <span style={{ color: 'var(--danger)', marginLeft: 12 }}>基础价新价 ≤ 0，调整后再应用</span>
              )}
            </div>
          </div>

          <div className="card">
            <h3>
              客户当前价 → 新价（{included.length}/{rows.length} 选中）
            </h3>
            {rows.length === 0 ? (
              <p className="empty">该产品暂无客户专属价{base ? '（客户均按基础价回落，可只勾上面「同时调基础价」）' : ''}。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>调</th>
                    <th>客户</th>
                    <th>当前价（元/卷）</th>
                    <th>新价（元/卷）</th>
                    <th>变化</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const inc = !excluded.has(r.customerId);
                    const np = newPriceOf(r.rollPrice);
                    const bad = inc && (np == null || np <= 0);
                    const delta = np != null ? Math.round((np - r.rollPrice) * 100) / 100 : null;
                    return (
                      <tr key={r.customerId} style={{ opacity: inc ? 1 : 0.45 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={inc}
                            onChange={() => toggle(r.customerId)}
                            style={{ width: 'auto' }}
                          />
                        </td>
                        <td>{r.customerName}</td>
                        <td className="price">¥{r.rollPrice}</td>
                        <td className="price">
                          {!inc ? (
                            <span style={{ color: 'var(--muted)' }}>不变</span>
                          ) : np == null ? (
                            <span style={{ color: 'var(--muted)' }}>填幅度后预览</span>
                          ) : (
                            <span style={{ color: bad ? 'var(--danger)' : undefined }}>¥{np}</span>
                          )}
                        </td>
                        <td className="price">
                          {inc && delta != null ? (
                            <span style={{ color: delta > 0 ? 'var(--danger)' : delta < 0 ? 'var(--ok)' : 'var(--muted)' }}>
                              {delta > 0 ? '+' : ''}
                              {delta}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
