import { useEffect, useState } from 'react';
import { computeRow, amountToChinese } from '../../core/pricing';
import { parseOrder } from '../../core/parse-order';

const SAMPLE = `客户：张三
05纯低温胶 2500*893 21张
06纯低温胶 420*50000 22卷`;

// 仅用于验证 Phase 1/2 已接通：UI 只调用 core 纯函数与 window.api（IPC），不内联算法、不直接碰 DB。
export function App() {
  const demo = computeRow({ rollPrice: 100, widthMm: 2100, heightMm: 1000, qty: 5 });
  const parsed = parseOrder(SAMPLE);

  const [products, setProducts] = useState<string[]>([]);
  const [dbMsg, setDbMsg] = useState('加载中…');

  const refresh = () => {
    if (!window.api?.db) {
      setDbMsg('未在 Electron 中运行（无 window.api），仅 UI 预览');
      return;
    }
    window.api.db
      .listProducts()
      .then((ps) => {
        setProducts(ps.map((p) => p.name));
        setDbMsg(`已连库，products 共 ${ps.length} 条`);
      })
      .catch((e) => setDbMsg('DB 出错：' + (e?.message ?? String(e))));
  };

  useEffect(refresh, []);

  const addOne = async () => {
    if (!window.api?.db) return;
    try {
      await window.api.db.createProduct({ name: '示例产品 ' + Date.now(), aliases: ['示例'] });
      refresh();
    } catch (e) {
      setDbMsg('新增失败：' + ((e as Error)?.message ?? String(e)));
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.7 }}>
      <h1>报价送货系统</h1>
      <p>Phase 1 核心 + Phase 2 DB/IPC 已接通（UI 仅调用 core 与 window.api）。</p>

      <h3>计价样例：100 元/卷，2100×1000mm，5 张</h3>
      <p>
        面积 {demo.areaSqm} ㎡，单价 {demo.unitPrice.toFixed(3)} 元，金额{' '}
        {demo.amount.toFixed(0)} 元
      </p>
      <p>大写：{amountToChinese(demo.amount)}</p>

      <h3>解析样例（客户：{parsed.customer}）</h3>
      <ul>
        {parsed.items.map((it, i) => (
          <li key={i}>
            {it.productName} ｜ {it.rawSpec}（{it.widthMm}×{it.heightMm}mm）｜ {it.qty}
            {it.unit}
          </li>
        ))}
      </ul>

      <h3>数据库冒烟（IPC）</h3>
      <p>{dbMsg}</p>
      <button onClick={addOne}>新增一个示例产品</button>
      <ul>
        {products.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
