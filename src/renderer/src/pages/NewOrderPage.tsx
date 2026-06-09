import { useEffect, useState } from 'react';
import type { Customer, Product, NewOrderItem } from '../../../shared/api';
import { parseOrder } from '../../../core/parse-order';
import { computeRow, areaSqm, amountToChinese, round, AMOUNT_DECIMALS } from '../../../core/pricing';
import { getDb, errMsg } from '../lib/db';

interface Row {
  uid: string; // 稳定行标识，作 React key + 行匹配；避免删中间行后下标错位、输入焦点乱跳
  productName: string;
  productId: number | null;
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: string;
  rollPrice?: number; // 当前报价（快照来源）
  priceSource?: 'customer' | 'base'; // 自动行取价来源：客户专属价 / 产品基础价回落
  unitPrice: number;
  amount: number;
  isManual: boolean;
  scratch: boolean; // 从零手动添加的行（品名 / 规格也可编辑）；解析出来的行为 false
  remark: string;
  warning: string;
}

let rowSeq = 0;
const nextRowUid = (): string => `row-${rowSeq++}`;

function genOrderNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `D${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 按行重新计价（手动行走手填单价，自动行走公式；金额取整到元 D6）
function price(r: Row): Row {
  if (r.isManual) {
    const res = computeRow({
      rollPrice: 0,
      widthMm: r.widthMm,
      heightMm: r.heightMm,
      qty: r.qty,
      isManual: true,
      manualUnitPrice: r.unitPrice,
    });
    return { ...r, amount: res.amount };
  }
  if (r.rollPrice == null) return { ...r, unitPrice: 0, amount: 0 };
  const res = computeRow({ rollPrice: r.rollPrice, widthMm: r.widthMm, heightMm: r.heightMm, qty: r.qty });
  return { ...r, unitPrice: res.unitPrice, amount: res.amount };
}

export function NewOrderPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [orderNo, setOrderNo] = useState(() => genOrderNo());
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [cs, ps] = await Promise.all([getDb().listCustomers(), getDb().listProducts()]);
        setCustomers(cs);
        setProducts(ps);
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, []);

  const doParse = async () => {
    setMsg('');
    setRows([]);
    const result = parseOrder(text, products);

    // 客户：优先已选；否则用文本首行「客户：X」匹配已存在客户
    let cid = Number(customerId);
    if (!cid && result.customer) {
      const c = customers.find((x) => x.name === result.customer);
      if (c) {
        cid = c.id;
        setCustomerId(String(c.id));
      }
    }
    if (!cid) {
      setMsg('请选择客户（或文本首行写「客户：名称」且该客户已建档）');
      return;
    }

    try {
      const built: Row[] = [];
      for (const it of result.items) {
        const pid = it.matchedProduct?.id ?? null;
        let rollPrice: number | undefined;
        let priceSource: 'customer' | 'base' | undefined;
        let warning = '';
        if (it.matchType === 'none') warning = '品名未匹配，请改手动价或先建产品';
        else if (it.matchType === 'ambiguous') warning = '品名匹配到多个产品，请改手动价或规范品名';
        else if (pid != null) {
          // 取价回落：客户专属价 → 产品基础价 → 都无则提示（红线 D7：客户价优先，基础价只回落）
          const eq = await getDb().getEffectiveQuote({ customerId: cid, productId: pid });
          if (eq) {
            rollPrice = eq.rollPrice;
            priceSource = eq.source;
          } else {
            warning = '该客户与该产品均无报价（客户价 / 基础价都没设），请先设价或改手动价';
          }
        }
        built.push(
          price({
            uid: nextRowUid(),
            productName: it.productName,
            productId: pid,
            rawSpec: it.rawSpec,
            widthMm: it.widthMm,
            heightMm: it.heightMm,
            qty: it.qty,
            unit: it.unit,
            rollPrice,
            priceSource,
            unitPrice: 0,
            amount: 0,
            isManual: false,
            scratch: false,
            remark: '',
            warning,
          }),
        );
      }
      setRows(built);
      if (result.warnings.length) {
        setMsg('解析提示：' + result.warnings.map((w) => w.message).join('；'));
      }
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? price({ ...r, ...patch }) : r)));
  };

  const removeRow = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  };

  // 从零加一行：手动行，品名 / 规格 / 数量 / 单价全手填，不走解析与自动报价
  const addManualRow = () => {
    setMsg('');
    setRows((rs) => [
      ...rs,
      {
        uid: nextRowUid(),
        productName: '',
        productId: null,
        rawSpec: '',
        widthMm: 0,
        heightMm: 0,
        qty: 1,
        unit: '张',
        unitPrice: 0,
        amount: 0,
        isManual: true,
        scratch: true,
        remark: '',
        warning: '',
      },
    ]);
  };

  const total = round(
    rows.reduce((s, r) => s + r.amount, 0),
    AMOUNT_DECIMALS,
  );

  // 自动行未匹配 / 无报价：阻止保存
  const unresolved = rows.filter((r) => !r.isManual && (r.warning !== '' || r.rollPrice == null));
  // 手动行未填全（品名 / 正的宽长 / 正的数量）：阻止保存，避免触发 DB 的 CHECK 抛错
  const incompleteManual = rows.filter(
    (r) => r.isManual && (!r.productName.trim() || !(r.widthMm > 0) || !(r.heightMm > 0) || !(r.qty > 0)),
  );
  // 任何行数量被清空 / 改成非正数：前置拦，别推到 DB 的 CHECK(qty>0)（自动行不在上面两道闸内）
  const invalidQty = rows.filter((r) => !(r.qty > 0));
  const canSave =
    customerId !== '' &&
    rows.length > 0 &&
    orderNo.trim() !== '' &&
    unresolved.length === 0 &&
    incompleteManual.length === 0 &&
    invalidQty.length === 0;

  const doSave = async () => {
    setMsg('');
    if (!canSave) {
      setMsg(
        invalidQty.length > 0
          ? '有行数量为 0 或空，请填正确数量后再保存'
          : incompleteManual.length > 0
            ? '有手动行未填全（品名 / 规格宽长 / 数量需大于 0），请补全后再保存'
            : '有未匹配 / 无报价的行，请改手动价或先补产品/报价',
      );
      return;
    }
    setBusy(true);
    try {
      const items: NewOrderItem[] = rows.map((r) => ({
        productId: r.productId,
        productName: r.productName.trim(),
        rawSpec: r.scratch ? `${r.widthMm}*${r.heightMm}` : r.rawSpec,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        qty: r.qty,
        unit: r.unit,
        areaSqm: areaSqm(r.widthMm, r.heightMm),
        rollPriceUsed: r.rollPrice ?? 0,
        unitPrice: r.unitPrice,
        amount: r.amount,
        isManual: r.isManual,
        remark: r.remark.trim(),
      }));
      const id = await getDb().createOrder({
        orderNo: orderNo.trim(),
        customerId: Number(customerId),
        items,
      });
      setMsg(`✅ 已保存，订单 #${id}（合计 ${total} 元 ${amountToChinese(total)}）`);
      setRows([]);
      setText('');
      setOrderNo(genOrderNo());
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">新建订单</h2>
      <p className="page-sub">粘贴客户下单文本，自动按该客户该产品报价算价（无客户专属价时回落产品基础价）。可改量、改价（改价即转手动行），也可从零加手动行；每行可填备注。</p>

      <div className="form-with-aside">
        <div className="card">
        <h3>下单信息</h3>
        <div className="form-row">
          <div className="field">
            <label>客户</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">请选择（或文本首行写「客户：X」）</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>订单号</label>
            <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>下单文本</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{ width: '100%', resize: 'vertical' }}
            placeholder={'客户：张三\n05纯低温胶 2500*893 21张\n06纯低温胶 420*50000 22卷'}
          />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <button className="btn" onClick={doParse}>
            解析
          </button>
          <button className="btn btn-secondary" onClick={addManualRow}>
            + 手动加行
          </button>
        </div>
        {msg && <p className="error" style={{ color: msg.startsWith('✅') ? 'var(--ok)' : undefined }}>{msg}</p>}
        </div>

        <aside className="card help-card">
          <h3>下单格式</h3>
          <pre className="code-sample">{`客户：张三
05纯低温胶 2500*893 21张
06纯低温胶 420*50000 22卷`}</pre>
          <ul className="help-list">
            <li>每行：<b>品名 尺寸 数量</b>，空格分隔。</li>
            <li>尺寸：<b>宽*长</b>，毫米；分隔符 * × x 均可。</li>
            <li>数量：数字 + 单位（<b>张 / 卷</b>）。</li>
            <li>首行可写「客户：名称」自动选客户。</li>
            <li>无客户专属价时，自动回落产品基础价。</li>
          </ul>
        </aside>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <h3>订单预览（{rows.length} 行）</h3>
          <table>
            <thead>
              <tr>
                <th>品名</th>
                <th>规格</th>
                <th>数量</th>
                <th>单价（元）</th>
                <th>金额（元）</th>
                <th>备注</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.uid}>
                  <td>
                    {r.scratch ? (
                      <input
                        value={r.productName}
                        onChange={(e) => updateRow(i, { productName: e.target.value })}
                        placeholder="品名"
                        style={{ width: 130 }}
                      />
                    ) : (
                      r.productName || '（空）'
                    )}
                  </td>
                  <td>
                    {r.scratch ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          value={r.widthMm || ''}
                          onChange={(e) => updateRow(i, { widthMm: Number(e.target.value) })}
                          style={{ width: 64 }}
                          className="price"
                        />
                        <span style={{ color: 'var(--muted)' }}>×</span>
                        <input
                          type="number"
                          value={r.heightMm || ''}
                          onChange={(e) => updateRow(i, { heightMm: Number(e.target.value) })}
                          style={{ width: 64 }}
                          className="price"
                        />
                        <span style={{ color: 'var(--muted)' }}>mm</span>
                      </span>
                    ) : (
                      <>
                        {r.rawSpec}
                        <span style={{ color: 'var(--muted)' }}>
                          {' '}
                          {r.widthMm}×{r.heightMm}mm
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={r.qty || ''}
                      onChange={(e) => updateRow(i, { qty: Number(e.target.value) })}
                      style={{ width: 64 }}
                    />
                    {r.scratch ? (
                      <select
                        value={r.unit}
                        onChange={(e) => updateRow(i, { unit: e.target.value })}
                        style={{ width: 56, marginLeft: 4 }}
                      >
                        <option value="张">张</option>
                        <option value="卷">卷</option>
                      </select>
                    ) : (
                      r.unit
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={r.unitPrice}
                      onChange={(e) => updateRow(i, { unitPrice: Number(e.target.value), isManual: true, warning: '' })}
                      style={{ width: 90 }}
                      className="price"
                    />
                  </td>
                  <td className="price">{r.amount}</td>
                  <td>
                    <input
                      value={r.remark}
                      onChange={(e) => updateRow(i, { remark: e.target.value })}
                      placeholder="选填"
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    {r.warning ? (
                      <span className="badge" style={{ background: '#fde8e8', color: 'var(--danger)' }}>
                        {r.warning}
                      </span>
                    ) : r.scratch ? (
                      <span className="badge">手动行</span>
                    ) : r.isManual ? (
                      <span className="badge">手动价</span>
                    ) : (
                      <span
                        className="badge badge-ok"
                        title={r.priceSource === 'base' ? '该客户无专属价，回落产品基础价' : '客户专属价'}
                      >
                        {r.priceSource === 'base' ? '基础价' : '客户价'} {r.rollPrice}/卷
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>
                  合计
                </td>
                <td className="price" style={{ fontWeight: 600 }}>
                  {total}
                </td>
                <td colSpan={3}>{amountToChinese(total)}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={doSave} disabled={busy || !canSave}>
              保存订单
            </button>
            {unresolved.length > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 12 }}>
                有 {unresolved.length} 行未匹配/无报价，改手动价或先补数据后可保存
              </span>
            )}
            {unresolved.length === 0 && incompleteManual.length > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 12 }}>
                有 {incompleteManual.length} 行手动行未填全（品名 / 规格 / 数量），补全后可保存
              </span>
            )}
            {unresolved.length === 0 && incompleteManual.length === 0 && invalidQty.length > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 12 }}>
                有 {invalidQty.length} 行数量为 0 或空，填正确数量后可保存
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
