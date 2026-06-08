import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDb,
  type DB,
  createCustomer,
  createProduct,
  setQuote,
  getCurrentQuote,
  setBasePrice,
  getEffectiveQuote,
  createOrder,
  getOrder,
  voidOrder,
  statsByCustomerMonth,
  statsByProductMonth,
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

  it('手动行（productId null）+ 行级备注：落库读回一致，与自动行同单共存', () => {
    // 自动行：整卷 06胶 → 单价 100、金额 2200
    const auto = buildItems('06纯低温胶 420*50000 22卷')[0];
    // 手动行：目录外品名、手填单价，带备注；金额 = round(单价 × 数量) = 12.5 × 4 = 50
    const manual = {
      productId: null,
      productName: '定制护角（目录外）',
      rawSpec: '1000*1000',
      widthMm: 1000,
      heightMm: 1000,
      qty: 4,
      unit: '张',
      areaSqm: areaSqm(1000, 1000),
      rollPriceUsed: 0,
      unitPrice: computeRow({ rollPrice: 0, widthMm: 1000, heightMm: 1000, qty: 4, isManual: true, manualUnitPrice: 12.5 }).unitPrice,
      amount: computeRow({ rollPrice: 0, widthMm: 1000, heightMm: 1000, qty: 4, isManual: true, manualUnitPrice: 12.5 }).amount,
      isManual: true,
      remark: '加急，周五前要',
    };

    const oid = createOrder(db, { orderNo: 'D-MANUAL-1', customerId: cid, items: [auto, manual] });
    const saved = getOrder(db, oid)!;

    expect(saved.items).toHaveLength(2);
    const m = saved.items[1];
    expect(m.isManual).toBe(true);
    expect(m.productId).toBeNull(); // 目录外，无产品 id
    expect(m.productName).toBe('定制护角（目录外）'); // 品名快照
    expect(m.remark).toBe('加急，周五前要'); // 行级备注落库读回
    expect(m.unitPrice).toBe(12.5);
    expect(m.amount).toBe(50); // 12.5 × 4
    expect(saved.items[0].remark).toBe(''); // 自动行未填备注默认空
    expect(saved.order.totalAmount).toBe(2250); // 2200 + 50
    expect(saved.order.totalInWords).toBe(amountToChinese(2250));
  });

  it('回落基础价下单：客户无专属价按产品基础价算并快照；之后设客户价不动老订单', () => {
    // 新产品只设基础价、不设该客户专属价
    const p07 = createProduct(db, { name: '07纯低温胶' });
    setBasePrice(db, { productId: p07, rollPrice: 100 });

    const eq = getEffectiveQuote(db, cid, p07)!;
    expect(eq).toEqual({ rollPrice: 100, source: 'base' }); // 回落基础价

    const r = computeRow({ rollPrice: eq.rollPrice, widthMm: 420, heightMm: 50000, qty: 1 }); // 整卷 → 100
    const oid = createOrder(db, {
      orderNo: 'D-BASE-1',
      customerId: cid,
      items: [
        {
          productId: p07,
          productName: '07纯低温胶',
          rawSpec: '420*50000',
          widthMm: 420,
          heightMm: 50000,
          qty: 1,
          unit: '卷',
          areaSqm: areaSqm(420, 50000),
          rollPriceUsed: eq.rollPrice,
          unitPrice: r.unitPrice,
          amount: r.amount,
          isManual: false,
        },
      ],
    });
    const saved = getOrder(db, oid)!;
    expect(saved.items[0].rollPriceUsed).toBe(100); // 快照回落价
    expect(saved.items[0].amount).toBe(100);

    // 之后给该客户该产品设专属价：取价改走客户价，但老订单快照纹丝不动
    setQuote(db, { customerId: cid, productId: p07, rollPrice: 150 });
    expect(getEffectiveQuote(db, cid, p07)).toEqual({ rollPrice: 150, source: 'customer' });
    expect(getOrder(db, oid)!.items[0].rollPriceUsed).toBe(100); // 红线：历史快照不回改
  });

  it('月度统计：作废订单不计入', () => {
    const items = buildItems('05纯低温胶 2500*893 21张'); // amount 223
    const keep = createOrder(db, { orderNo: 'S-1', customerId: cid, items });
    const drop = createOrder(db, { orderNo: 'S-2', customerId: cid, items });

    const before = statsByCustomerMonth(db).find((r) => r.customerId === cid)!;
    expect(before.orderCount).toBe(2);

    voidOrder(db, drop);

    const after = statsByCustomerMonth(db).find((r) => r.customerId === cid)!;
    expect(after.orderCount).toBe(1); // 作废单不计
    expect(after.total).toBe(getOrder(db, keep)!.order.totalAmount); // 只剩有效单金额

    const prod = statsByProductMonth(db).find((r) => r.productId === p05)!;
    expect(prod.qty).toBe(21); // 仅有效单的数量
  });
});
