import { useEffect, useRef, useState } from 'react';
import type { CustomerMonthStat, ProductMonthStat } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';

const fmt = (n: number) => n.toLocaleString('zh-CN');

export function StatsPage() {
  const [months, setMonths] = useState<string[]>([]);
  const [ym, setYm] = useState(''); // '' = 全部月份
  const [byCustomer, setByCustomer] = useState<CustomerMonthStat[]>([]);
  const [byProduct, setByProduct] = useState<ProductMonthStat[]>([]);
  const [monthly, setMonthly] = useState<{ ym: string; total: number }[]>([]); // 各月销售额趋势（全部月份）
  const [msg, setMsg] = useState('');
  const reqSeq = useRef(0); // 防竞态：挂载时 ym 由 '' 切到最近月，两次拉取并发，丢弃过期响应

  useEffect(() => {
    void (async () => {
      try {
        const [ms, all] = await Promise.all([
          getDb().listOrderMonths(),
          getDb().statsByCustomerMonth({}), // 全部月份，聚合出趋势
        ]);
        setMonths(ms);
        setYm(ms[0] ?? ''); // 默认最近一个月，无数据则全部
        const acc: Record<string, number> = {};
        for (const r of all) acc[r.ym] = (acc[r.ym] || 0) + r.total;
        setMonthly(
          Object.entries(acc)
            .map(([m, total]) => ({ ym: m, total }))
            .sort((a, b) => a.ym.localeCompare(b.ym)),
        );
      } catch (e) {
        setMsg(errMsg(e));
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setMsg('');
      const seq = ++reqSeq.current;
      try {
        const arg = ym ? { ym } : {};
        const [c, p] = await Promise.all([
          getDb().statsByCustomerMonth(arg),
          getDb().statsByProductMonth(arg),
        ]);
        if (seq !== reqSeq.current) return; // 已切到别的范围，丢弃过期响应
        setByCustomer(c);
        setByProduct(p);
      } catch (e) {
        if (seq === reqSeq.current) setMsg(errMsg(e));
      }
    })();
  }, [ym]);

  const rangeLabel = ym || '全部月份';

  // ---- KPI ----
  const salesTotal = byCustomer.reduce((s, r) => s + r.total, 0);
  const orderTotal = byCustomer.reduce((s, r) => s + r.orderCount, 0);
  const customerCount = new Set(byCustomer.map((r) => r.customerId)).size;
  const productKinds = new Set(byProduct.map((r) => (r.productId != null ? `p${r.productId}` : `m:${r.productName}`)))
    .size;

  // ---- Top 客户（按销售额，跨月聚合）。key 用稳定聚合键（customerId），客户重名不撞 key ----
  const custAgg: Record<string, { key: string; name: string; total: number }> = {};
  for (const r of byCustomer) {
    const k = String(r.customerId);
    const cur = custAgg[k] || { key: k, name: r.customerName, total: 0 };
    cur.total += r.total;
    custAgg[k] = cur;
  }
  const topCustomers = Object.values(custAgg).sort((a, b) => b.total - a.total).slice(0, 8);
  const maxCust = Math.max(1, ...topCustomers.map((c) => c.total));

  // ---- Top 产品（按销售额）。key 用 p<id> / m:<品名>，目录产品与手动行重名不撞 key ----
  const prodAgg: Record<string, { key: string; name: string; total: number }> = {};
  for (const r of byProduct) {
    const k = r.productId != null ? `p${r.productId}` : `m:${r.productName}`;
    const cur = prodAgg[k] || { key: k, name: r.productName || '（手动行）', total: 0 };
    cur.total += r.total;
    prodAgg[k] = cur;
  }
  const topProducts = Object.values(prodAgg).sort((a, b) => b.total - a.total).slice(0, 8);
  const maxProd = Math.max(1, ...topProducts.map((p) => p.total));

  // ---- 各月趋势 ----
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.total));
  const barPx = (t: number) => (t > 0 ? Math.max(6, Math.round((t / maxMonthly) * 150)) : 2);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="page-title">月度统计</h2>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            按月看销售额、订单、客户与产品。仅统计有效订单（作废不计），日期按本地时区分月。
          </p>
        </div>
        <div className="field">
          <label>统计范围</label>
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
      {msg && <p className="error" style={{ marginTop: 0, marginBottom: 16 }}>{msg}</p>}

      {/* KPI 指标卡 */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">销售额</div>
          <div className="kpi-value">
            ¥{fmt(salesTotal)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">订单数</div>
          <div className="kpi-value">
            {fmt(orderTotal)}
            <span className="kpi-unit">单</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">客户数</div>
          <div className="kpi-value">
            {fmt(customerCount)}
            <span className="kpi-unit">个</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">产品种类</div>
          <div className="kpi-value">
            {fmt(productKinds)}
            <span className="kpi-unit">种</span>
          </div>
        </div>
      </div>

      {/* 各月销售额趋势 */}
      <div className="card">
        <h3>各月销售额（全部月份）</h3>
        {monthly.length === 0 ? (
          <p className="empty">暂无数据，去开几单。</p>
        ) : (
          <div className="trend">
            {monthly.map((m) => (
              <div className="trend-col" key={m.ym} title={`${m.ym}：¥${fmt(m.total)}`}>
                <span className="trend-val price">{fmt(m.total)}</span>
                <div
                  className={'trend-bar' + (m.ym === ym ? ' on' : '')}
                  style={{ height: barPx(m.total) }}
                />
                <span className="trend-label">{m.ym.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top 客户 / Top 产品 横向条形 */}
      <div className="chart-2col">
        <div className="card">
          <h3>客户消费 Top · {rangeLabel}</h3>
          {topCustomers.length === 0 ? (
            <p className="empty">该范围暂无数据。</p>
          ) : (
            <div className="barlist">
              {topCustomers.map((c) => (
                <div className="bar-row" key={c.key}>
                  <div className="bar-head">
                    <span className="bar-name">{c.name}</span>
                    <span className="bar-val price">¥{fmt(c.total)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(c.total / maxCust) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>产品销售额 Top · {rangeLabel}</h3>
          {topProducts.length === 0 ? (
            <p className="empty">该范围暂无数据。</p>
          ) : (
            <div className="barlist">
              {topProducts.map((p) => (
                <div className="bar-row" key={p.key}>
                  <div className="bar-head">
                    <span className="bar-name">{p.name}</span>
                    <span className="bar-val price">¥{fmt(p.total)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill alt" style={{ width: `${(p.total / maxProd) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 明细表 */}
      <div className="card">
        <h3>客户消费明细</h3>
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
                  <td className="price">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>产品销量明细</h3>
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
                  <td className="price">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
