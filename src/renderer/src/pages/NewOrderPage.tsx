import { useEffect, useState } from 'react';
import type { Customer, Product, NewOrderItem } from '../../../shared/api';
import { parseOrder } from '../../../core/parse-order';
import { computeRow, areaSqm, amountToChinese, round, AMOUNT_DECIMALS } from '../../../core/pricing';
import { getDb, errMsg } from '../lib/db';

interface Row {
  productName: string;
  productId: number | null;
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: string;
  rollPrice?: number; // 当前报价（快照来源）
  unitPrice: number;
  amount: number;
  isManual: boolean;
  warning: string;
}

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
        let warning = '';
        if (it.matchType === 'none') warning = '品名未匹配，请改手动价或先建产品';
        else if (it.matchType === 'ambiguous') warning = '品名匹配到多个产品，请改手动价或规范品名';
        else if (pid != null) {
          const q = await getDb().getCurrentQuote({ customerId: cid, productId: pid });
          if (q) rollPrice = q.rollPrice;
          else warning = '该客户该产品无报价，请先设报价或改手动价';
        }
        built.push(
          price({
            productName: it.productName,
            productId: pid,
            rawSpec: it.rawSpec,
            widthMm: it.widthMm,
            heightMm: it.heightMm,
            qty: it.qty,
            unit: it.unit,
            rollPrice,
            unitPrice: 0,
            amount: 0,
            isManual: false,
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

  const total = round(
    rows.reduce((s, r) => s + r.amount, 0),
    AMOUNT_DECIMALS,
  );

  const unresolved = rows.filter((r) => !r.isManual && (r.warning !== '' || r.rollPrice == null));
  const canSave = customerId !== '' && rows.length > 0 && orderNo.trim() !== '' && unresolved.length === 0;

  const doSave = async () => {
    setMsg('');
    if (!canSave) {
      setMsg('有未匹配 / 无报价的行，请改手动价或先补产品/报价');
      return;
    }
    setBusy(true);
    try {
      const items: NewOrderItem[] = rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        rawSpec: r.rawSpec,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        qty: r.qty,
        unit: r.unit,
        areaSqm: areaSqm(r.widthMm, r.heightMm),
        rollPriceUsed: r.rollPrice ?? 0,
        unitPrice: r.unitPrice,
        amount: r.amount,
        isManual: r.isManual,
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
      <p className="page-sub">粘贴客户下单文本，自动解析并按该客户该产品最新报价算价。可改量、改价（改价即转手动行）。</p>

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
            rows={6}
            style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
            placeholder={'客户：张三\n05纯低温胶 2500*893 21张\n06纯低温胶 420*50000 22卷'}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={doParse}>
            解析
          </button>
        </div>
        {msg && <p className="error" style={{ color: msg.startsWith('✅') ? 'var(--ok)' : undefined }}>{msg}</p>}
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
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.productName || '（空）'}</td>
                  <td>
                    {r.rawSpec}
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      {r.widthMm}×{r.heightMm}mm
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => updateRow(i, { qty: Number(e.target.value) })}
                      style={{ width: 70 }}
                    />
                    {r.unit}
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
                    {r.warning ? (
                      <span className="badge" style={{ background: '#fde8e8', color: 'var(--danger)' }}>
                        {r.warning}
                      </span>
                    ) : r.isManual ? (
                      <span className="badge">手动价</span>
                    ) : (
                      <span className="badge badge-ok">自动（{r.rollPrice}/卷）</span>
                    )}
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
                <td>{amountToChinese(total)}</td>
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
          </div>
        </div>
      )}
    </div>
  );
}
