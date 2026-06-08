import { useEffect, useState } from 'react';
import type { Product, BasePrice } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function ProductsPage() {
  const [list, setList] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [aliases, setAliases] = useState('');
  const [specNote, setSpecNote] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('张');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 基础价管理
  const [baseMap, setBaseMap] = useState<Record<number, BasePrice>>({}); // 产品 id → 当前基础价（列表列）
  const [selected, setSelected] = useState<Product | null>(null); // 正在设基础价的产品
  const [baseHistory, setBaseHistory] = useState<BasePrice[]>([]);
  const [basePrice, setBasePrice] = useState('');
  const [baseNote, setBaseNote] = useState('');
  const [baseError, setBaseError] = useState('');
  const [baseBusy, setBaseBusy] = useState(false);

  const load = async () => {
    try {
      const [ps, bases] = await Promise.all([
        getDb().listProducts(),
        getDb().listCurrentBasePrices(),
      ]);
      setList(ps);
      const m: Record<number, BasePrice> = {};
      for (const b of bases) m[b.productId] = b;
      setBaseMap(m);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  // 选中产品管理其基础价：拉历史 + 预填当前价（改价默认值）
  const selectForBase = async (p: Product) => {
    setBaseError('');
    setSelected(p);
    setBaseNote('');
    try {
      const hist = await getDb().listBasePriceHistory({ productId: p.id });
      setBaseHistory(hist);
      const cur = hist.find((h) => h.isCurrent);
      setBasePrice(cur ? String(cur.rollPrice) : '');
    } catch (e) {
      setBaseError(errMsg(e));
    }
  };

  // 设 / 改基础价：追加新行 + 翻旧 is_current（DAO 内事务保证），刷新历史与列表列
  const submitBase = async () => {
    if (!selected) return;
    setBaseError('');
    const rollPrice = Number(basePrice);
    if (!Number.isFinite(rollPrice) || rollPrice <= 0) {
      setBaseError('基础价必须为正数');
      return;
    }
    setBaseBusy(true);
    try {
      await getDb().setBasePrice({ productId: selected.id, rollPrice, note: baseNote.trim() });
      setBaseNote('');
      await Promise.all([selectForBase(selected), load()]);
    } catch (e) {
      setBaseError(errMsg(e));
    } finally {
      setBaseBusy(false);
    }
  };

  const submit = async () => {
    setError('');
    if (!name.trim()) {
      setError('品名必填');
      return;
    }
    setBusy(true);
    try {
      await getDb().createProduct({
        name: name.trim(),
        code: code.trim(),
        aliases: aliases
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        specNote: specNote.trim(),
        defaultUnit,
      });
      setName('');
      setCode('');
      setAliases('');
      setSpecNote('');
      setDefaultUnit('张');
      await load();
    } catch (e) {
      setError(errMsg(e)); // 品名重复会得「记录已存在（唯一约束冲突）」
    } finally {
      setBusy(false);
    }
  };

  const currentBase = baseHistory.find((h) => h.isCurrent);

  return (
    <div>
      <h2 className="page-title">产品</h2>
      <p className="page-sub">
        维护产品与别名。下单解析时按品名精确 → 别名 → 模糊匹配。可给每个产品设「基础价」（元/卷），客户无专属价时下单回落此价。
      </p>

      <div className="card">
        <h3>新增产品</h3>
        <div className="form-row">
          <div className="field">
            <label>品名 *（唯一）</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 05纯低温胶" />
          </div>
          <div className="field">
            <label>编码</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label>别名（逗号分隔）</label>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="05胶, 低温胶05" />
          </div>
          <div className="field">
            <label>默认单位</label>
            <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)}>
              <option value="张">张</option>
              <option value="卷">卷</option>
            </select>
          </div>
          <div className="field">
            <label>规格备注</label>
            <input value={specNote} onChange={(e) => setSpecNote(e.target.value)} />
          </div>
          <button className="btn" onClick={submit} disabled={busy}>
            添加
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h3>产品列表（{list.length}）</h3>
        {list.length === 0 ? (
          <p className="empty">暂无产品，先在上方添加。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>品名</th>
                <th>编码</th>
                <th>别名</th>
                <th>默认单位</th>
                <th>基础价（元/卷）</th>
                <th>规格备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code || '-'}</td>
                  <td>{p.aliases.length ? p.aliases.join('、') : '-'}</td>
                  <td>{p.defaultUnit}</td>
                  <td className="price">
                    {baseMap[p.id] ? (
                      '¥' + baseMap[p.id].rollPrice
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>未设</span>
                    )}
                  </td>
                  <td>{p.specNote || '-'}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ padding: '4px 10px' }}
                      onClick={() => void selectForBase(p)}
                    >
                      设/改基础价
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="card">
          <h3>基础价 · {selected.name}</h3>
          {currentBase ? (
            <p>
              <span className="current-price">¥{currentBase.rollPrice}</span>
              <span className="price-sub"> 元 / 卷（生效日 {currentBase.effectiveDate}）</span>
            </p>
          ) : (
            <p className="empty">该产品暂无基础价，请在下方设置。</p>
          )}
          <div className="form-row">
            <div className="field">
              <label>{currentBase ? '改为新基础价（元/卷）' : '设置基础价（元/卷）'}</label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="如 100"
              />
            </div>
            <div className="field">
              <label>备注</label>
              <input value={baseNote} onChange={(e) => setBaseNote(e.target.value)} />
            </div>
            <button className="btn" onClick={submitBase} disabled={baseBusy}>
              {currentBase ? '保存为新基础价' : '设置基础价'}
            </button>
            <button
              className="btn"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}
              onClick={() => setSelected(null)}
            >
              关闭
            </button>
          </div>
          {baseError && <p className="error">{baseError}</p>}

          <h4 style={{ marginTop: 16 }}>基础价历史（{baseHistory.length}）</h4>
          {baseHistory.length === 0 ? (
            <p className="empty">暂无历史。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>生效日</th>
                  <th>基础价（元/卷）</th>
                  <th>状态</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {baseHistory.map((b) => (
                  <tr key={b.id}>
                    <td>{b.effectiveDate}</td>
                    <td className="price">¥{b.rollPrice}</td>
                    <td>
                      {b.isCurrent ? (
                        <span className="badge badge-ok">当前</span>
                      ) : (
                        <span className="badge">历史</span>
                      )}
                    </td>
                    <td>{b.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
