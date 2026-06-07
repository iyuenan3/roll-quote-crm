import { useEffect, useState } from 'react';
import type { ListedOrder, Order, OrderItem, Customer, Company } from '../../../shared/api';
import { getDb, errMsg } from '../lib/db';
import { DeliveryNote } from './DeliveryNote';

export function OrdersPage() {
  const [orders, setOrders] = useState<ListedOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [company, setCompany] = useState<Company>({ name: '', address: '', phone: '', terms: '' });
  const [detail, setDetail] = useState<{ order: Order; items: OrderItem[] } | null>(null);
  const [msg, setMsg] = useState('');

  const loadList = async () => {
    try {
      const [os, cs, co] = await Promise.all([
        getDb().listOrders(),
        getDb().listCustomers(),
        getDb().getCompany(),
      ]);
      setOrders(os);
      setCustomers(cs);
      setCompany(co);
    } catch (e) {
      setMsg(errMsg(e));
    }
  };
  useEffect(() => {
    void loadList();
  }, []);

  const view = async (id: number) => {
    setMsg('');
    try {
      const d = await getDb().getOrder({ id });
      setDetail(d ?? null);
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const doVoid = async (id: number) => {
    if (!window.confirm('确认作废该订单？作废后不计入统计，但保留记录。')) return;
    try {
      await getDb().voidOrder({ id });
      if (detail?.order.id === id) setDetail(null);
      await loadList();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  return (
    <div>
      <h2 className="page-title">订单历史</h2>
      <p className="page-sub">查看 / 打印送货单 / 作废。订单的报价与金额是下单时快照，后续改价不影响。</p>

      <div className="card no-print">
        <h3>订单列表（{orders.length}）</h3>
        {msg && <p className="error">{msg}</p>}
        {orders.length === 0 ? (
          <p className="empty">暂无订单，去「新建订单」开一单。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>客户</th>
                <th>日期</th>
                <th>合计（元）</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>{o.customerName}</td>
                  <td>{o.orderDate}</td>
                  <td className="price">{o.totalAmount}</td>
                  <td>
                    {o.status === 'void' ? (
                      <span className="badge" style={{ background: '#fde8e8', color: 'var(--danger)' }}>
                        已作废
                      </span>
                    ) : (
                      <span className="badge badge-ok">有效</span>
                    )}
                  </td>
                  <td>
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => view(o.id)}>
                      查看
                    </button>{' '}
                    {o.status !== 'void' && (
                      <button
                        className="btn"
                        style={{ padding: '4px 10px', background: 'var(--danger)' }}
                        onClick={() => doVoid(o.id)}
                      >
                        作废
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div className="card">
          <div className="no-print" style={{ marginBottom: 12 }}>
            <button className="btn" onClick={() => window.print()}>
              打印 / 存 PDF
            </button>{' '}
            <button className="btn" style={{ background: 'var(--bg)', color: 'var(--text)' }} onClick={() => setDetail(null)}>
              关闭
            </button>
          </div>
          <DeliveryNote
            order={detail.order}
            items={detail.items}
            customer={customers.find((c) => c.id === detail.order.customerId)}
            company={company}
          />
        </div>
      )}
    </div>
  );
}
