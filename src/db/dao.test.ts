import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  openDb,
  migrate,
  type DB,
  createCustomer,
  createProduct,
  listProducts,
  listCustomers,
  setQuote,
  getCurrentQuote,
  listQuoteHistory,
  setBasePrice,
  getCurrentBasePrice,
  listBasePriceHistory,
  listCurrentBasePrices,
  getEffectiveQuote,
  listCurrentQuotesByProduct,
  applyBatchRepricing,
  createOrder,
  getOrder,
  listOrders,
  voidOrder,
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

describe('product_prices 基础价（红线 D7：改价追加 + 客户价优先回落）', () => {
  it('设/改基础价：追加新行、旧行 is_current=0、历史保留、只一条 current', () => {
    setBasePrice(db, { productId: pid, rollPrice: 80 });
    setBasePrice(db, { productId: pid, rollPrice: 90 });
    expect(getCurrentBasePrice(db, pid)?.rollPrice).toBe(90);
    const hist = listBasePriceHistory(db, pid);
    expect(hist).toHaveLength(2);
    expect(hist.filter((b) => b.isCurrent)).toHaveLength(1);
    expect(hist.find((b) => b.rollPrice === 80)?.isCurrent).toBe(false); // 旧行翻 0
  });

  it('部分唯一索引：每产品至多一条 is_current=1（绕过 setBasePrice 直插亦被拦）', () => {
    setBasePrice(db, { productId: pid, rollPrice: 80 });
    expect(() =>
      db
        .prepare('INSERT INTO product_prices (product_id, roll_price, is_current) VALUES (?, ?, 1)')
        .run(pid, 100),
    ).toThrow();
  });

  it('setBasePrice 拒绝非正价（0 / 负）', () => {
    expect(() => setBasePrice(db, { productId: pid, rollPrice: 0 })).toThrow();
    expect(() => setBasePrice(db, { productId: pid, rollPrice: -1 })).toThrow();
  });

  it('FK：给不存在产品设基础价直接抛错', () => {
    expect(() => setBasePrice(db, { productId: 99999, rollPrice: 80 })).toThrow();
  });

  it('listCurrentBasePrices 只返回各产品当前价', () => {
    const pid2 = createProduct(db, { name: '06纯低温胶' });
    setBasePrice(db, { productId: pid, rollPrice: 80 });
    setBasePrice(db, { productId: pid, rollPrice: 90 }); // pid 改价
    setBasePrice(db, { productId: pid2, rollPrice: 70 });
    const cur = listCurrentBasePrices(db);
    expect(cur).toHaveLength(2);
    expect(cur.find((b) => b.productId === pid)?.rollPrice).toBe(90);
    expect(cur.find((b) => b.productId === pid2)?.rollPrice).toBe(70);
  });

  it('getEffectiveQuote 取价顺序：客户价优先 → 基础价回落 → 都无 undefined', () => {
    expect(getEffectiveQuote(db, cid, pid)).toBeUndefined(); // 都没设
    setBasePrice(db, { productId: pid, rollPrice: 80 });
    expect(getEffectiveQuote(db, cid, pid)).toEqual({ rollPrice: 80, source: 'base' }); // 回落基础价
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 120 });
    expect(getEffectiveQuote(db, cid, pid)).toEqual({ rollPrice: 120, source: 'customer' }); // 客户价优先（二维不退化）
  });
});

describe('批量调价 applyBatchRepricing（红线：仍只追加 + 原子）', () => {
  it('逐客户追加新报价、旧价留痕、当前价更新；listCurrentQuotesByProduct 带客户名', () => {
    const cid2 = createCustomer(db, { name: '李四' });
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    setQuote(db, { customerId: cid2, productId: pid, rollPrice: 80 });

    const rows = listCurrentQuotesByProduct(db, pid);
    expect(rows.map((r) => r.customerName)).toEqual(['张三', '李四']); // 按客户名排序
    expect(rows.find((r) => r.customerId === cid)?.rollPrice).toBe(100);

    // 两个客户各上浮（已在 UI 算好新价），同时调基础价
    const n = applyBatchRepricing(db, {
      quotes: [
        { customerId: cid, productId: pid, rollPrice: 105, note: '原料涨价' },
        { customerId: cid2, productId: pid, rollPrice: 84, note: '原料涨价' },
      ],
      base: { productId: pid, rollPrice: 90, note: '原料涨价' },
    });
    expect(n).toBe(3); // 2 客户 + 1 基础价

    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(105);
    expect(getCurrentQuote(db, cid2, pid)?.rollPrice).toBe(84);
    expect(getCurrentBasePrice(db, pid)?.rollPrice).toBe(90);
    // 红线：旧价仍在历史里
    expect(listQuoteHistory(db, cid, pid).map((q) => q.rollPrice)).toEqual([105, 100]);
    expect(listQuoteHistory(db, cid, pid).filter((q) => q.isCurrent)).toHaveLength(1);
  });

  it('原子：某行非正价整体取消，已有当前价不受影响、无新行残留', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() =>
      applyBatchRepricing(db, {
        quotes: [
          { customerId: cid, productId: pid, rollPrice: 110 },
          { customerId: cid, productId: pid, rollPrice: 0 }, // 非正 → 整批拒绝
        ],
      }),
    ).toThrow();
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(100); // 不受影响
    expect(listQuoteHistory(db, cid, pid)).toHaveLength(1); // 无残留
  });

  it('原子：事务中途 FK 失败（不存在客户）整批回滚', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    expect(() =>
      applyBatchRepricing(db, {
        quotes: [
          { customerId: cid, productId: pid, rollPrice: 110 },
          { customerId: 99999, productId: pid, rollPrice: 120 }, // FK 失败
        ],
      }),
    ).toThrow();
    expect(getCurrentQuote(db, cid, pid)?.rollPrice).toBe(100); // 第一条也回滚
    expect(listQuoteHistory(db, cid, pid)).toHaveLength(1);
  });

  it('只调基础价（无客户报价行）也可用', () => {
    const n = applyBatchRepricing(db, { quotes: [], base: { productId: pid, rollPrice: 77 } });
    expect(n).toBe(1);
    expect(getCurrentBasePrice(db, pid)?.rollPrice).toBe(77);
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

  it('listOrders 带客户名、按 id 倒序；voidOrder 改状态不删', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    const o1 = createOrder(db, { orderNo: 'O-1', customerId: cid, items: [okItem()] });
    createOrder(db, { orderNo: 'O-2', customerId: cid, items: [okItem()] });
    const list = listOrders(db);
    expect(list.map((o) => o.orderNo)).toEqual(['O-2', 'O-1']); // 倒序
    expect(list[0].customerName).toBe('张三'); // JOIN 出客户名
    expect(list.every((o) => o.status === 'active')).toBe(true);

    voidOrder(db, o1);
    const after = listOrders(db);
    expect(after).toHaveLength(2); // 不物理删
    expect(after.find((o) => o.id === o1)?.status).toBe('void');
  });

  it('品名快照入库（产品改名 / 删产品后仍可读出当时品名）', () => {
    setQuote(db, { customerId: cid, productId: pid, rollPrice: 100 });
    const oid = createOrder(db, {
      orderNo: 'O-SNAP',
      customerId: cid,
      items: [okItem({ productName: '05纯低温胶' })],
    });
    expect(getOrder(db, oid)!.items[0].productName).toBe('05纯低温胶');
  });

  it('迁移：openDb 后 user_version = 1', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });
});

describe('migrate 旧库补列（回归）', () => {
  it('无 product_name 的旧 order_items：补列、保数据、幂等、user_version=1', () => {
    const old = new Database(':memory:');
    old.exec('CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, remark TEXT)');
    old.prepare('INSERT INTO order_items (order_id, remark) VALUES (?, ?)').run(1, '旧备注');
    old.pragma('user_version = 0');

    migrate(old);
    const cols = (old.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain('product_name');
    const row = old.prepare('SELECT * FROM order_items').get() as { remark: string; product_name: string };
    expect(row.remark).toBe('旧备注'); // 原数据不丢
    expect(row.product_name).toBe(''); // 默认空
    expect(old.pragma('user_version', { simple: true })).toBe(1);

    migrate(old); // 再跑幂等
    expect(old.pragma('user_version', { simple: true })).toBe(1);
    const cols2 = (old.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols2.filter((c) => c === 'product_name')).toHaveLength(1); // 不重复加列
    old.close();
  });
});

describe('旧库 openDb 自动补建 product_prices（升级回归，D7）', () => {
  it('已迁移旧库（user_version=1、无 product_prices）重开后自动补表、旧数据保留、可回落基础价', () => {
    // 用真实文件（非 :memory:，:memory: 每次 new 都是新库无法复开），结束清理
    const file = join(tmpdir(), `rqc-upgrade-${process.pid}-${Date.now()}.db`);
    const cleanup = () => {
      for (const ext of ['', '-wal', '-shm']) if (existsSync(file + ext)) rmSync(file + ext);
    };
    try {
      // 造「旧库」：跑现行 schema 后删掉 product_prices，模拟该表诞生前建、且已迁移过的库
      const old = openDb(file);
      const oc = createCustomer(old, { name: '老客户' });
      const op = createProduct(old, { name: '老产品' });
      old.exec('DROP TABLE product_prices'); // 索引随表一并删除
      old.pragma('user_version = 1'); // 已迁移：migrate 对它是 no-op，补表只能靠 SCHEMA_SQL 的 IF NOT EXISTS
      old.close();

      // 重开同一文件：openDb 先 exec(SCHEMA_SQL) 再 migrate，product_prices 应被 IF NOT EXISTS 补回
      const db2 = openDb(file);
      const cols = db2.prepare('PRAGMA table_info(product_prices)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('roll_price'); // 表已补建

      // 旧数据原样还在
      expect(listCustomers(db2).map((c) => c.name)).toContain('老客户');
      expect(listProducts(db2).map((p) => p.name)).toContain('老产品');

      // 基础价机制可用 + getEffectiveQuote 回落
      setBasePrice(db2, { productId: op, rollPrice: 88 });
      expect(getEffectiveQuote(db2, oc, op)).toEqual({ rollPrice: 88, source: 'base' });
      db2.close();
    } finally {
      cleanup();
    }
  });
});
