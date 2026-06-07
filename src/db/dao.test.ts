import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDb,
  type DB,
  createCustomer,
  createProduct,
  listProducts,
  listCustomers,
  setQuote,
  getCurrentQuote,
  listQuoteHistory,
  createOrder,
  getOrder,
  getCompany,
  upsertCompany,
} from './index';

let db: DB;
let cid: number;
let pid: number;

beforeEach(() => {
  db = openDb(); // :memory:
  cid = createCustomer(db, { name: '张三' });
  pid = createProduct(db, { name: '05纯低温胶', aliases: ['05胶'] });
});
afterEach(() => db.close());

describe('schema / catalog', () => {
  it('建表后基础 CRUD 正常，aliases JSON 往返', () => {
    expect(listCustomers(db).map((c) => c.name)).toEqual(['张三']);
    const ps = listProducts(db);
    expect(ps[0].name).toBe('05纯低温胶');
    expect(ps[0].aliases).toEqual(['05胶']);
  });
  it('products.name 唯一约束', () => {
    expect(() => createProduct(db, { name: '05纯低温胶' })).toThrow();
  });
  it('company 单行 upsert', () => {
    expect(getCompany(db).name).toBe('');
    upsertCompany(db, { name: '某卷材店', address: 'X 路 1 号', phone: '000', terms: '款到发货' });
    expect(getCompany(db).name).toBe('某卷材店');
    upsertCompany(db, { name: '改名店', address: '', phone: '', terms: '' });
    expect(getCompany(db).name).toBe('改名店'); // 仍单行覆盖
  });
});

describe('quotes 红线：改价追加 + 翻 is_current', () => {
  it('改价写新行、旧行 is_current=0、历史保留', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 120 });
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(120);
    const hist = listQuoteHistory(db, cid, pid);
    expect(hist).toHaveLength(2); // 历史两条都在
    expect(hist.filter((q) => q.isCurrent)).toHaveLength(1); // 只有一条 current
    expect(hist.find((q) => q.rollPrice === 100)?.isCurrent).toBe(false); // 旧行翻成 0
  });
  it('每 (customer, product) 至多一条 is_current=1（DB 部分唯一索引强制）', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() =>
      db
        .prepare('INSERT INTO quotes (customer_id, product_id, roll_price, is_current) VALUES (?, ?, ?, 1)')
        .run(cid, pid, 200),
    ).toThrow();
  });
  it('报价是「客户 × 产品」二维，同产品不同客户不同价', () => {
    const cid2 = createCustomer(db, { name: '李四' });
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    setQuote(db, { customerId: cid2, productId: pid, rollPrice: 80 });
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(100);
    expect(getCurrentQuote(db, cid2, pid)?.rollPrice).toBe(80);
  });
});

describe('orders 红线：快照 roll_price_used，历史不回改', () => {
  it('createOrder 快照报价；下单后改价不影响历史订单', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    const q = getCurrentQuote(db, cid, pid)!;

    const orderId = createOrder(db, {
      orderNo: 'D20260607-001',
      customerId: cid,
      items: [
        {
          productId: pid,
          rawSpec: '2500*893',
          widthMm: 2500,
          heightMm: 893,
          qty: 1,
          unit: '张',
          areaSqm: 2.2325,
          rollPriceUsed: q.rollPrice, // 快照当时报价 100
          unitPrice: 10.631,
          amount: 11,
        },
      ],
    });

    const before = getOrder(db, orderId)!;
    expect(before.order.totalAmount).toBe(11);
    expect(before.order.totalInWords).toBe('人民币壹拾壹元整');
    expect(before.items[0].rollPriceUsed).toBe(100);

    // 下单后改价
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 130 });

    const after = getOrder(db, orderId)!;
    expect(after.items[0].rollPriceUsed).toBe(100); // 红线：历史快照不变
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(130); // 当前报价已更新
  });

  it('order_no 唯一', () => {
    const mk = () =>
      createOrder(db, {
        orderNo: 'DUP-1',
        customerId: cid,
        items: [
          {
            rawSpec: '100*200',
            widthMm: 100,
            heightMm: 200,
            qty: 1,
            unit: '张',
            areaSqm: 0.02,
            rollPriceUsed: 100,
            unitPrice: 0.095,
            amount: 0,
          },
        ],
      });
    mk();
    expect(mk).toThrow();
  });
});
