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

// 一个通过所有 CHECK 的合法行项工厂
const okItem = (over: Partial<Parameters<typeof createOrder>[1]['items'][number]> = {}) => ({
  productId: pid,
  rawSpec: '100*200',
  widthMm: 100,
  heightMm: 200,
  qty: 1,
  unit: '张',
  areaSqm: 0.02,
  rollPriceUsed: 100,
  unitPrice: 1,
  amount: 1,
  ...over,
});

describe('DB 加固（审查后补测）', () => {
  it('setQuote 拒绝非正报价（0 / 负）', () => {
    expect(() => setQuote(db, { customerId: cid, productId: pid, rollPrice: 0 })).toThrow();
    expect(() => setQuote(db, { customerId: cid, productId: pid, rollPrice: -5 })).toThrow();
  });

  it('CHECK 堵住 is_current 非 0/1 绕过部分唯一索引', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() =>
      db
        .prepare('INSERT INTO quotes (customer_id, product_id, roll_price, is_current) VALUES (?, ?, ?, 2)')
        .run(cid, pid, 200),
    ).toThrow();
  });

  it('setQuote 事务原子：追加步失败时旧 current 不受影响、无孤儿行', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() => setQuote(db, { customerId: cid, productId: 99999, rollPrice: 50 })).toThrow(); // FK
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(100); // 真实当前价不受影响
    expect(listQuoteHistory(db, cid, 99999)).toEqual([]); // 无孤儿
  });

  it('createOrder 事务回滚：某行 FK 失败则整单不残留', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() =>
      createOrder(db, {
        orderNo: 'ROLLBACK-1',
        customerId: cid,
        items: [okItem(), okItem({ productId: 99999 })], // 第二行 FK 失败
      }),
    ).toThrow();
    const c = db.prepare("SELECT count(*) c FROM orders WHERE order_no = 'ROLLBACK-1'").get() as {
      c: number;
    };
    expect(c.c).toBe(0); // 订单头与已插行项全部回滚
  });

  it('FK 违反：不存在的 customer / product 直接抛错', () => {
    expect(() => setQuote(db, { customerId: 99999, productId: pid, rollPrice: 100 })).toThrow();
    expect(() =>
      createOrder(db, { orderNo: 'FK-1', customerId: 99999, items: [okItem()] }),
    ).toThrow();
  });

  it('无数据查询返回 undefined / 空数组', () => {
    expect(getCurrentQuote(db, cid, pid)).toBeUndefined();
    expect(listQuoteHistory(db, cid, pid)).toEqual([]);
    expect(getOrder(db, 99999)).toBeUndefined();
  });

  it('删订单级联删行项（ON DELETE CASCADE）', () => {
    const oid = createOrder(db, { orderNo: 'CASCADE-1', customerId: cid, items: [okItem()] });
    db.prepare('DELETE FROM orders WHERE id = ?').run(oid);
    const c = db.prepare('SELECT count(*) c FROM order_items WHERE order_id = ?').get(oid) as {
      c: number;
    };
    expect(c.c).toBe(0);
  });

  it('多行合计与中文大写：[11, 22] → 33 / 人民币叁拾叁元整', () => {
    const oid = createOrder(db, {
      orderNo: 'MULTI-1',
      customerId: cid,
      items: [okItem({ unitPrice: 11, amount: 11 }), okItem({ unitPrice: 22, amount: 22 })],
    });
    const o = getOrder(db, oid)!;
    expect(o.order.totalAmount).toBe(33);
    expect(o.order.totalInWords).toBe('人民币叁拾叁元整');
  });

  it('aliases 特殊字符 JSON 往返；脏数据降级为空数组', () => {
    const id = createProduct(db, { name: '特殊品', aliases: ['a"b', '逗,号', '换\n行', '😀'] });
    expect(listProducts(db).find((x) => x.id === id)?.aliases).toEqual(['a"b', '逗,号', '换\n行', '😀']);
    db.prepare("UPDATE products SET aliases = 'not-json' WHERE id = ?").run(id);
    expect(listProducts(db).find((x) => x.id === id)?.aliases).toEqual([]); // 不崩，降级
  });
});
