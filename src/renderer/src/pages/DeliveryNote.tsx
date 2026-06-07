import type { Order, OrderItem, Customer, Company } from '../../../shared/api';

interface Props {
  order: Order;
  items: OrderItem[];
  customer?: Customer;
  company: Company;
}

// 送货单视图：抬头 + 表格 + 合计大写 + 条款 + 盖章区。打印走 window.print()（见 styles.css @media print）。
export function DeliveryNote({ order, items, customer, company }: Props) {
  return (
    <div className="delivery-note">
      <h1 className="dn-title">{company.name || '送货单'}</h1>
      <div className="dn-sub">送货单</div>

      <div className="dn-meta">
        <div>
          <strong>客户：</strong>
          {customer?.name ?? '-'}
        </div>
        <div>
          <strong>订单号：</strong>
          {order.orderNo}
        </div>
        <div>
          <strong>日期：</strong>
          {order.orderDate}
        </div>
        {customer?.phone ? (
          <div>
            <strong>电话：</strong>
            {customer.phone}
          </div>
        ) : null}
        {customer?.address ? (
          <div>
            <strong>地址：</strong>
            {customer.address}
          </div>
        ) : null}
      </div>

      <table className="dn-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>品名</th>
            <th>规格</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td>{i + 1}</td>
              <td>{it.productName || '-'}</td>
              <td>{it.rawSpec}</td>
              <td>
                {it.qty}
                {it.unit}
              </td>
              <td className="price">{it.unitPrice.toFixed(3)}</td>
              <td className="price">{it.amount.toLocaleString('zh-CN')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>
              合计金额
            </td>
            <td className="price">{order.totalAmount.toLocaleString('zh-CN')}</td>
          </tr>
          <tr>
            <td colSpan={2}>合计（大写）</td>
            <td colSpan={4}>{order.totalInWords}</td>
          </tr>
        </tfoot>
      </table>

      {company.terms ? <div className="dn-terms">{company.terms}</div> : null}

      <div className="dn-sign">
        <div>供货方（盖章）：</div>
        <div>客户签收：</div>
      </div>

      {(company.phone || company.address) && (
        <div className="dn-foot">
          {company.address}
          {company.address && company.phone ? '　' : ''}
          {company.phone ? '电话：' + company.phone : ''}
        </div>
      )}
    </div>
  );
}
