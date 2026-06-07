import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDb,
  type DB,
  createCustomer,
  createProduct,
  setQuote,
  getCurrentQuote,
  createOrder,
  getOrder,
} from './index';
import { parseOrder } from '../core/parse-order';
import { computeRow, areaSqm, amountToChinese } from '../core/pricing';

// 端到端：粘贴文本 → 解析 → 取当前报价 → 计价 → 存订单 → 读回。
// 镜像 NewOrderPage 的逻辑管线（不含 React），把 core 与 DB 的接线整体验证。
describe('order flow 端到端（parse → quote → price → persist → read）', () => {
  let db: DB;
  let cid: number;
  let p05: number;
  let p06: number;

  beforeEach(() => {
    db = openDb();
    cid = createCustomer(db, { name: '张三' });
    p05 = createProduct(db, { name: '05纯低温胶', aliases: ['05胶'] });
    p06 = createProduct(db, { name: '06纯低温胶' });
    setQuote(db, { customerId: cid, productId: p05, rollPrice: 100 });
    setQuote(db, { customerId: cid, productId: p06, rollPrice: 100 });
  });
  afterEach(() => db.close());

  const products = () => [
    { id: p05, name: '05纯低温胶', aliases: ['05胶'] },
    { id: p06, name: '06纯低温胶', aliases: [] as string[] },
  ];

  const buildItems = (text: string) =>
    parseOrder(text, products()).items.map((it) => {
      const pid = it.matchedProduct!.id!;
      const q = getCurrentQuote(db, cid, pid)!;
      const r = computeRow({
        rollPrice: q.rollPrice,
        widthMm: it.widthMm,
        heightMm: it.heightMm,
        qty: it.qty,
      });
      return {
        productId: pid,
        productName: it.productName,
        rawSpec: it.rawSpec,
        widthMm: it.widthMm,
        heightMm: it.heightMm,
        qty: it.qty,
        unit: it.unit,
        areaSqm: areaSqm(it.widthMm, it.heightMm),
        rollPriceUsed: q.rollPrice,
        unitPrice: r.unitPrice,
        amount: r.amount,
        isManual: false,
      };
    });

  it('SPEC 三行样例：解析 + 计价 + 落库 + 读回一致', () => {
    const text = `客户：张三
05纯低温胶 2500*893 21张
05纯低温胶 2500*893 25张
06纯低温胶 420*50000 22卷`;
    const items = buildItems(text);
    expect(items).toHaveLength(3);

    const oid = createOrder(db, { orderNo: 'D-FLOW-1', customerId: cid, items });
    const saved = getOrder(db, oid)!;

    expect(saved.items).toHaveLength(3);
    // 整卷行：单价退化为每卷价 100，金额 = 100 × 22 = 2200
    expect(saved.items[2].unitPrice).toBe(100);
    expect(saved.items[2].amount).toBe(2200);
    // 单价 3 位、金额取整（D6）：2500×893 21张 → 单价 10.631
    expect(saved.items[0].unitPrice).toBe(10.631);
    expect(saved.items[0].rollPriceUsed).toBe(100); // 报价快照
    expect(saved.items[0].productName).toBe('05纯低温胶'); // 品名快照
    expect(saved.items[2].productName).toBe('06纯低温胶');

    const expectedTotal = items.reduce((s, x) => s + x.amount, 0);
    expect(saved.order.totalAmount).toBe(expectedTotal);
    expect(saved.order.totalInWords).toBe(amountToChinese(expectedTotal));
  });

  it('下单后改价不影响已存订单（快照红线，端到端）', () => {
    const items = buildItems('05纯低温胶 2500*893 21张');
    const oid = createOrder(db, { orderNo: 'D-FLOW-2', customerId: cid, items });
    const before = getOrder(db, oid)!.items[0].amount;

    setQuote(db, { customerId: cid, productId: p05, rollPrice: 200 }); // 改价翻倍

    const after = getOrder(db, oid)!;
    expect(after.items[0].amount).toBe(before); // 历史订单金额纹丝不动
    expect(after.items[0].rollPriceUsed).toBe(100);
    expect(getCurrentQuote(db, cid, p05)!.rollPrice).toBe(200); // 当前报价已更新
  });
});
