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
  listOrderMonths,
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

describe('月度统计聚合（多月 / ym 过滤 / 多客户 / 手动行 null 产品 / 改名快照）', () => {
  let db: DB;
  let zhang: number;
  let li: number;
  let p05: number;
  let p06: number;

  beforeEach(() => {
    db = openDb();
    zhang = createCustomer(db, { name: '张三' });
    li = createCustomer(db, { name: '李四' });
    p05 = createProduct(db, { name: '05纯低温胶' });
    p06 = createProduct(db, { name: '06纯低温胶' });
    setQuote(db, { customerId: zhang, productId: p05, rollPrice: 100 });
    setQuote(db, { customerId: li, productId: p05, rollPrice: 100 });
  });
  afterEach(() => db.close());

  // 整卷 05 胶（420×50000≈21㎡，报价 100/卷）→ 单价/金额 = 100
  const roll = (productId: number, productName: string) => ({
    productId,
    productName,
    rawSpec: '420*50000',
    widthMm: 420,
    heightMm: 50000,
    qty: 1,
    unit: '卷',
    areaSqm: areaSqm(420, 50000),
    rollPriceUsed: 100,
    unitPrice: 100,
    amount: 100,
    isManual: false,
  });

  it('跨月 + 多客户分组 + ym 过滤分支 + 作废不计 + listOrderMonths 去重倒序', () => {
    createOrder(db, { orderNo: 'M-401', customerId: zhang, orderDate: '2026-04-10', items: [roll(p05, '05纯低温胶')] });
    createOrder(db, { orderNo: 'M-402', customerId: li, orderDate: '2026-04-20', items: [roll(p05, '05纯低温胶')] });
    createOrder(db, { orderNo: 'M-501', customerId: zhang, orderDate: '2026-05-05', items: [roll(p05, '05纯低温胶')] });
    createOrder(db, { orderNo: 'M-502', customerId: zhang, orderDate: '2026-05-15', items: [roll(p05, '05纯低温胶')] });
    const voided = createOrder(db, { orderNo: 'M-503', customerId: li, orderDate: '2026-05-25', items: [roll(p05, '05纯低温胶')] });
    voidOrder(db, voided);

    const all = statsByCustomerMonth(db);
    expect(all).toHaveLength(3); // (4月张三)(4月李四)(5月张三)；作废的 5 月李四不计
    const pick = (y: string, c: number) => all.find((r) => r.ym === y && r.customerId === c);
    expect(pick('2026-04', zhang)).toMatchObject({ orderCount: 1, total: 100 });
    expect(pick('2026-04', li)).toMatchObject({ orderCount: 1, total: 100 });
    expect(pick('2026-05', zhang)).toMatchObject({ orderCount: 2, total: 200 });
    expect(pick('2026-05', li)).toBeUndefined();

    const may = statsByCustomerMonth(db, '2026-05'); // ym 过滤分支
    expect(may).toHaveLength(1);
    expect(may[0]).toMatchObject({ ym: '2026-05', customerId: zhang, orderCount: 2, total: 200 });

    expect(listOrderMonths(db)).toEqual(['2026-05', '2026-04']); // 去重倒序，仅含有有效单的月
  });

  it('产品统计：手动行 product_id=null 分组（同名合并 / 异名各行 / 与目录产品同名因 id 不同独立）', () => {
    const manual = (name: string, qty: number, amount: number) => ({
      productId: null,
      productName: name,
      rawSpec: '100*100',
      widthMm: 100,
      heightMm: 100,
      qty,
      unit: '张',
      areaSqm: areaSqm(100, 100),
      rollPriceUsed: 0,
      unitPrice: amount / qty,
      amount,
      isManual: true,
    });
    createOrder(db, { orderNo: 'PM-1', customerId: zhang, orderDate: '2026-06-01', items: [manual('定制护角', 2, 20), manual('加工费', 1, 30)] });
    createOrder(db, { orderNo: 'PM-2', customerId: zhang, orderDate: '2026-06-02', items: [manual('定制护角', 3, 30), roll(p05, '05纯低温胶')] });

    const p = statsByProductMonth(db, '2026-06');
    const row = (n: string) => p.filter((r) => r.productName === n);
    expect(row('定制护角')).toHaveLength(1); // 两笔同名手动行(null id)合并为一行
    expect(row('定制护角')[0]).toMatchObject({ productId: null, qty: 5, total: 50 });
    expect(row('加工费')[0]).toMatchObject({ productId: null, qty: 1, total: 30 });
    expect(row('05纯低温胶')[0]).toMatchObject({ productId: p05, qty: 1, total: 100 }); // 目录产品独立成行
  });

  it('产品统计：同一 product_id 改名后按「快照品名」分两行（明细保留历史名，符合快照红线）', () => {
    createOrder(db, { orderNo: 'RN-1', customerId: zhang, orderDate: '2026-06-10', items: [roll(p06, '06纯低温胶')] });
    createOrder(db, { orderNo: 'RN-2', customerId: zhang, orderDate: '2026-06-11', items: [roll(p06, '06高级胶')] }); // 改名后再下单

    const p = statsByProductMonth(db, '2026-06').filter((r) => r.productId === p06);
    expect(p).toHaveLength(2); // 同 id、不同快照名 → 2 行（明细按历史名；仪表盘 Top 再按 id 合并，是有意的口径分工）
    expect(p.map((r) => r.productName).sort()).toEqual(['06纯低温胶', '06高级胶'].sort());
  });
});
