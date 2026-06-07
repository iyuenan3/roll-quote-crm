import { useEffect, useState } from 'react';
import type { Customer, Product, Quote } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function QuotesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [current, setCurrent] = useState<Quote | undefined>(undefined);
  const [history, setHistory] = useState<Quote[]>([]);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = customerId !== '' && productId !== '';

  useEffect(() => {
    void (async () => {
      try {
        const [cs, ps] = await Promise.all([getDb().listCustomers(), getDb().listProducts()]);
        setCustomers(cs);
        setProducts(ps);
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, []);

  const loadQuote = async () => {
    if (!selected) return;
    setError('');
    const a = { customerId: Number(customerId), productId: Number(productId) };
    try {
      const [cur, hist] = await Promise.all([
        getDb().getCurrentQuote(a),
        getDb().listQuoteHistory(a),
      ]);
      setCurrent(cur);
      setHistory(hist);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    void loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, productId]);

  const submit = async () => {
    setError('');
    if (!selected) {
      setError('请先选客户和产品');
      return;
    }
    const rollPrice = Number(price);
    if (!Number.isFinite(rollPrice) || rollPrice <= 0) {
      setError('报价必须为正数');
      return;
    }
    setBusy(true);
    try {
      await getDb().setQuote({
        customerId: Number(customerId),
        productId: Number(productId),
        rollPrice,
        note: note.trim(),
      });
      setPrice('');
      setNote('');
      await loadQuote();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">报价</h2>
      <p className="page-sub">
        报价按「客户 × 产品」二维。改价不覆盖旧价：追加新记录并把旧的转为历史，全程留痕。
      </p>

      <div className="card">
        <h3>选择客户与产品</h3>
        <div className="form-row">
          <div className="field">
            <label>客户</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">请选择</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>产品</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">请选择</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {customers.length === 0 && <p className="empty">还没有客户，请先到「客户」页添加。</p>}
        {products.length === 0 && <p className="empty">还没有产品，请先到「产品」页添加。</p>}
      </div>

      {selected && (
        <>
          <div className="card">
            <h3>当前报价</h3>
            {current ? (
              <p>
                <span className="current-price">¥{current.rollPrice}</span>
                <span className="price-sub"> 元 / 卷（生效日 {current.effectiveDate}）</span>
              </p>
            ) : (
              <p className="empty">该客户该产品暂无报价，请在下方设置。</p>
            )}
            <div className="form-row">
              <div className="field">
                <label>{current ? '改为新报价（元/卷）' : '设置报价（元/卷）'}</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="如 100"
                />
              </div>
              <div className="field">
                <label>备注</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button className="btn" onClick={submit} disabled={busy}>
                {current ? '保存为新报价' : '设置报价'}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>

          <div className="card">
            <h3>报价历史（{history.length}）</h3>
            {history.length === 0 ? (
              <p className="empty">暂无历史。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>生效日</th>
                    <th>报价（元/卷）</th>
                    <th>状态</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((q) => (
                    <tr key={q.id}>
                      <td>{q.effectiveDate}</td>
                      <td className="price">¥{q.rollPrice}</td>
                      <td>
                        {q.isCurrent ? (
                          <span className="badge badge-ok">当前</span>
                        ) : (
                          <span className="badge">历史</span>
                        )}
                      </td>
                      <td>{q.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
