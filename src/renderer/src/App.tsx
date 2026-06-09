import { useState } from 'react';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { QuotesPage } from './pages/QuotesPage';
import { BatchRepricePage } from './pages/BatchRepricePage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

type View = 'neworder' | 'orders' | 'products' | 'customers' | 'quotes' | 'reprice' | 'stats' | 'settings';

// 按业务分组：业务（开单/订单）/ 档案（客户·产品·报价·调价）/ 经营（统计）/ 系统（设置）。组间用小标题 + 分割线分隔。
const NAV_GROUPS: { label: string; items: { key: View; label: string }[] }[] = [
  {
    label: '业务',
    items: [
      { key: 'neworder', label: '新建订单' },
      { key: 'orders', label: '订单历史' },
    ],
  },
  {
    label: '档案',
    items: [
      { key: 'customers', label: '客户' },
      { key: 'products', label: '产品' },
      { key: 'quotes', label: '报价' },
      { key: 'reprice', label: '批量调价' },
    ],
  },
  {
    label: '经营',
    items: [{ key: 'stats', label: '月度统计' }],
  },
  {
    label: '系统',
    items: [{ key: 'settings', label: '公司信息' }],
  },
];

export function App() {
  const [view, setView] = useState<View>('neworder');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">卷</div>
          <div className="brand-name">报价送货系统</div>
        </div>
        {NAV_GROUPS.map((g) => (
          <div className="nav-group" key={g.label}>
            <div className="nav-group-label">{g.label}</div>
            {g.items.map((n) => (
              <button
                key={n.key}
                className={'nav-item' + (view === n.key ? ' active' : '')}
                onClick={() => setView(n.key)}
              >
                {n.label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">卷材报价送货 · 数据全部本地存储</div>
      </aside>

      <main className="main">
        {view === 'neworder' && <NewOrderPage />}
        {view === 'orders' && <OrdersPage />}
        {view === 'products' && <ProductsPage />}
        {view === 'customers' && <CustomersPage />}
        {view === 'quotes' && <QuotesPage />}
        {view === 'reprice' && <BatchRepricePage />}
        {view === 'stats' && <StatsPage />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
