import { computeRow, amountToChinese } from '../../core/pricing';
import { parseOrder } from '../../core/parse-order';

const SAMPLE = `客户：张三
05纯低温胶 2500*893 21张
06纯低温胶 420*50000 22卷`;

// 仅用于验证 Phase 1 核心已接通 UI（UI 只调用 core，不内联算法）。
export function App() {
  const demo = computeRow({ rollPrice: 100, widthMm: 2100, heightMm: 1000, qty: 5 });
  const parsed = parseOrder(SAMPLE);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.7 }}>
      <h1>报价送货系统</h1>
      <p>Phase 1 核心已就绪（计价 + 解析纯函数，UI 仅调用）。</p>

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
    </div>
  );
}
