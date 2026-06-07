import { useEffect, useState } from 'react';
import type { CustomerMonthStat, ProductMonthStat } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

export function StatsPage() {
  const [months, setMonths] = useState<string[]>([]);
  const [ym, setYm] = useState(''); // '' = 全部月份
  const [byCustomer, setByCustomer] = useState<CustomerMonthStat[]>([]);
  const [byProduct, setByProduct] = useState<ProductMonthStat[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const ms = await getDb().listOrderMonths();
        setMonths(ms);
        setYm(ms[0] ?? ''); // 默认最近一个月，无数据则全部
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setMsg('');
      try {
        const arg = ym ? { ym } : {};
        const [c, p] = await Promise.all([
          getDb().statsByCustomerMonth(arg),
          getDb().statsByProductMonth(arg),
        ]);
        setByCustomer(c);
        setByProduct(p);
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, [ym]);

  const custTotal = byCustomer.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <h2 className="page-title">月度统计</h2>
      <p className="page-sub">按月看每个客户消费、每个产品销量。仅统计有效订单（作废不计），日期按本地时区分月。</p>

      <div className="card">
        <div className="form-row">
          <div className="field">
            <label>月份</label>
            <select value={ym} onChange={(e) => setYm(e.target.value)}>
              <option value="">全部月份</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        {msg && <p className="error">{msg}</p>}
      </div>

      <div className="card">
        <h3>客户消费（合计 {custTotal} 元）</h3>
        {byCustomer.length === 0 ? (
          <p className="empty">该范围暂无数据。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>客户</th>
                <th>订单数</th>
                <th>消费金额（元）</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((r, i) => (
                <tr key={i}>
                  <td>{r.ym}</td>
                  <td>{r.customerName}</td>
                  <td>{r.orderCount}</td>
                  <td className="price">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>产品销量</h3>
        {byProduct.length === 0 ? (
          <p className="empty">该范围暂无数据。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>产品</th>
                <th>数量</th>
                <th>金额（元）</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((r, i) => (
                <tr key={i}>
                  <td>{r.ym}</td>
                  <td>{r.productName || '（手动行）'}</td>
                  <td className="price">{r.qty}</td>
                  <td className="price">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
