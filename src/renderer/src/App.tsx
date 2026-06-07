import { useState } from 'react';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { QuotesPage } from './pages/QuotesPage';

type View = 'products' | 'customers' | 'quotes';

const NAV: { key: View; label: string }[] = [
  { key: 'products', label: '产品' },
  { key: 'customers', label: '客户' },
  { key: 'quotes', label: '报价' },
];

export function App() {
  const [view, setView] = useState<View>('products');

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
        {view === 'products' && <ProductsPage />}
        {view === 'customers' && <CustomersPage />}
        {view === 'quotes' && <QuotesPage />}
      </main>
    </div>
  );
}
