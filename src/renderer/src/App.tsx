import { useState } from 'react';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { QuotesPage } from './pages/QuotesPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { SettingsPage } from './pages/SettingsPage';

type View = 'neworder' | 'orders' | 'products' | 'customers' | 'quotes' | 'settings';

const NAV: { key: View; label: string }[] = [
  { key: 'neworder', label: '新建订单' },
  { key: 'orders', label: '订单历史' },
  { key: 'products', label: '产品' },
  { key: 'customers', label: '客户' },
  { key: 'quotes', label: '报价' },
  { key: 'settings', label: '公司信息' },
];

export function App() {
  const [view, setView] = useState<View>('neworder');

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>报价送货系统</h1>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={'nav-item' + (view === n.key ? ' active' : '')}
            onClick={() => setView(n.key)}
          >
            {n.label}
          </button>
        ))}
        <div className="sidebar-foot">Phase 2 · 管理页</div>
      </aside>

      <main className="main">
        {view === 'neworder' && <NewOrderPage />}
        {view === 'orders' && <OrdersPage />}
        {view === 'products' && <ProductsPage />}
        {view === 'customers' && <CustomersPage />}
        {view === 'quotes' && <QuotesPage />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
