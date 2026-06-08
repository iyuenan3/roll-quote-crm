// 数据访问层（DAO）。纯粹围绕 better-sqlite3 同步 API，注入 db 便于单测（:memory:）。
// 红线：
//  - setQuote 改价 = 翻旧行 is_current=0 + 追加新行，绝不原地改价（保全历史）。
//  - createOrder 把 roll_price_used / unit_price / amount 快照入 order_items，后续报价变动不回改。
import type Database from 'better-sqlite3';
import { amountToChinese, round, AMOUNT_DECIMALS } from '../core/pricing';

type DB = Database.Database;

// ---------- 输出模型（camelCase）----------
export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
}
export interface Product {
  id: number;
  code: string;
  name: string;
  aliases: string[];
  specNote: string;
  defaultUnit: string;
  createdAt: string;
}
export interface Quote {
  id: number;
  customerId: number;
  productId: number;
  rollPrice: number;
  effectiveDate: string;
  isCurrent: boolean;
  note: string;
}
/** 产品基础价（仅 product 维，客户无专属价时回落用）。 */
export interface BasePrice {
  id: number;
  productId: number;
  rollPrice: number;
  effectiveDate: string;
  isCurrent: boolean;
  note: string;
}
/** 取价结果：实际每卷价 + 来源（客户专属价 / 产品基础价）。 */
export interface EffectiveQuote {
  rollPrice: number;
  source: 'customer' | 'base';
}
/** 某产品下、各客户当前专属价一行（批量调价页用，带客户名）。 */
export interface ProductQuoteRow {
  customerId: number;
  customerName: string;
  rollPrice: number;
  effectiveDate: string;
}
export interface Company {
  name: string;
  address: string;
  phone: string;
  terms: string;
}
export interface Order {
  id: number;
  orderNo: string;
  customerId: number;
  orderDate: string;
  totalAmount: number;
  totalInWords: string;
  remark: string;
  status: string;
  createdAt: string;
}
export interface OrderItem {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: string;
  areaSqm: number;
  rollPriceUsed: number;
  unitPrice: number;
  amount: number;
  isManual: boolean;
  remark: string;
}

// ---------- 行映射 ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
/** 安全解析 aliases JSON：脏数据 / 非数组一律降级为空数组，绝不让一行坏数据拖垮整列表。 */
function parseAliases(s: unknown): string[] {
  try {
    const a = JSON.parse(typeof s === 'string' && s ? s : '[]');
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function toProduct(r: any): Product {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    aliases: parseAliases(r.aliases),
    specNote: r.spec_note,
    defaultUnit: r.default_unit,
    createdAt: r.created_at,
  };
}
function toQuote(r: any): Quote {
  return {
    id: r.id,
    customerId: r.customer_id,
    productId: r.product_id,
    rollPrice: r.roll_price,
    effectiveDate: r.effective_date,
    isCurrent: !!r.is_current,
    note: r.note,
  };
}
function toBasePrice(r: any): BasePrice {
  return {
    id: r.id,
    productId: r.product_id,
    rollPrice: r.roll_price,
    effectiveDate: r.effective_date,
    isCurrent: !!r.is_current,
    note: r.note,
  };
}
function toOrderItem(r: any): OrderItem {
  return {
    id: r.id,
    orderId: r.order_id,
    productId: r.product_id,
    productName: r.product_name,
    rawSpec: r.raw_spec,
    widthMm: r.width_mm,
    heightMm: r.height_mm,
    qty: r.qty,
    unit: r.unit,
    areaSqm: r.area_sqm,
    rollPriceUsed: r.roll_price_used,
    unitPrice: r.unit_price,
    amount: r.amount,
    isManual: !!r.is_manual,
    remark: r.remark,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- company ----------
export function getCompany(db: DB): Company {
  const r = db.prepare('SELECT name, address, phone, terms FROM company WHERE id = 1').get() as
    | Company
    | undefined;
  return r ?? { name: '', address: '', phone: '', terms: '' };
}

export function upsertCompany(db: DB, c: Company): void {
  db.prepare(
    `INSERT INTO company (id, name, address, phone, terms) VALUES (1, @name, @address, @phone, @terms)
     ON CONFLICT(id) DO UPDATE SET name=@name, address=@address, phone=@phone, terms=@terms`,
  ).run(c);
}

// ---------- customers ----------
export function createCustomer(
  db: DB,
  input: { name: string; phone?: string; address?: string },
): number {
  const r = db
    .prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)')
    .run(input.name, input.phone ?? '', input.address ?? '');
  return Number(r.lastInsertRowid);
}

export function listCustomers(db: DB): Customer[] {
  return (db.prepare('SELECT * FROM customers ORDER BY name').all() as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    createdAt: r.created_at,
  }));
}

// ---------- products ----------
export function createProduct(
  db: DB,
  input: {
    name: string;
    code?: string;
    aliases?: string[];
    specNote?: string;
    defaultUnit?: string;
  },
): number {
  const r = db
    .prepare(
      'INSERT INTO products (code, name, aliases, spec_note, default_unit) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      input.code ?? '',
      input.name,
      JSON.stringify(input.aliases ?? []),
      input.specNote ?? '',
      input.defaultUnit ?? '张',
    );
  return Number(r.lastInsertRowid);
}

export function listProducts(db: DB): Product[] {
  return (db.prepare('SELECT * FROM products ORDER BY name').all() as any[]).map(toProduct);
}

// ---------- quotes（红线：改价追加 + 翻 is_current）----------
export function setQuote(
  db: DB,
  input: {
    customerId: number;
    productId: number;
    rollPrice: number;
    effectiveDate?: string;
    note?: string;
  },
): number {
  if (!Number.isFinite(input.rollPrice) || input.rollPrice <= 0) {
    throw new Error('setQuote: rollPrice 必须为正有限数');
  }
  const effectiveDate = input.effectiveDate?.trim() || null; // 空串 / 空白归一为 null，回落当天本地日期
  const tx = db.transaction((i: typeof input) => {
    // 翻旧的 current（不删、不原地改价，保全历史）
    db.prepare(
      'UPDATE quotes SET is_current = 0 WHERE customer_id = ? AND product_id = ? AND is_current = 1',
    ).run(i.customerId, i.productId);
    // 追加新行为当前
    const r = db
      .prepare(
        `INSERT INTO quotes (customer_id, product_id, roll_price, effective_date, is_current, note)
         VALUES (?, ?, ?, COALESCE(?, date('now', 'localtime')), 1, ?)`,
      )
      .run(i.customerId, i.productId, i.rollPrice, effectiveDate, i.note ?? '');
    return Number(r.lastInsertRowid);
  });
  return tx(input);
}

export function getCurrentQuote(db: DB, customerId: number, productId: number): Quote | undefined {
  const r = db
    .prepare('SELECT * FROM quotes WHERE customer_id = ? AND product_id = ? AND is_current = 1')
    .get(customerId, productId);
  return r ? toQuote(r) : undefined;
}

export function listQuoteHistory(db: DB, customerId: number, productId: number): Quote[] {
  return (
    db
      .prepare(
        'SELECT * FROM quotes WHERE customer_id = ? AND product_id = ? ORDER BY id DESC',
      )
      .all(customerId, productId) as any[]
  ).map(toQuote);
}

/** 某产品下所有客户的当前专属价（带客户名，按客户名排序）。批量调价页一览用。 */
export function listCurrentQuotesByProduct(db: DB, productId: number): ProductQuoteRow[] {
  return (
    db
      .prepare(
        `SELECT q.customer_id, c.name AS customer_name, q.roll_price, q.effective_date
         FROM quotes q JOIN customers c ON c.id = q.customer_id
         WHERE q.product_id = ? AND q.is_current = 1
         ORDER BY c.name`,
      )
      .all(productId) as any[]
  ).map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    rollPrice: r.roll_price,
    effectiveDate: r.effective_date,
  }));
}

// ---------- product_prices（产品基础价；改价追加 + 翻 is_current，同 quotes）----------
export function setBasePrice(
  db: DB,
  input: { productId: number; rollPrice: number; effectiveDate?: string; note?: string },
): number {
  if (!Number.isFinite(input.rollPrice) || input.rollPrice <= 0) {
    throw new Error('setBasePrice: rollPrice 必须为正有限数');
  }
  const effectiveDate = input.effectiveDate?.trim() || null; // 空串 / 空白归一为 null，回落当天本地日期
  const tx = db.transaction((i: typeof input) => {
    db.prepare(
      'UPDATE product_prices SET is_current = 0 WHERE product_id = ? AND is_current = 1',
    ).run(i.productId);
    const r = db
      .prepare(
        `INSERT INTO product_prices (product_id, roll_price, effective_date, is_current, note)
         VALUES (?, ?, COALESCE(?, date('now', 'localtime')), 1, ?)`,
      )
      .run(i.productId, i.rollPrice, effectiveDate, i.note ?? '');
    return Number(r.lastInsertRowid);
  });
  return tx(input);
}

export function getCurrentBasePrice(db: DB, productId: number): BasePrice | undefined {
  const r = db
    .prepare('SELECT * FROM product_prices WHERE product_id = ? AND is_current = 1')
    .get(productId);
  return r ? toBasePrice(r) : undefined;
}

export function listBasePriceHistory(db: DB, productId: number): BasePrice[] {
  return (
    db.prepare('SELECT * FROM product_prices WHERE product_id = ? ORDER BY id DESC').all(productId) as any[]
  ).map(toBasePrice);
}

/** 全部产品的当前基础价（产品列表页一览用）。 */
export function listCurrentBasePrices(db: DB): BasePrice[] {
  return (db.prepare('SELECT * FROM product_prices WHERE is_current = 1').all() as any[]).map(
    toBasePrice,
  );
}

/**
 * 取该「客户 × 产品」下单应用的每卷价 + 来源。
 * 取价顺序（红线 D7）：客户专属价 → 产品基础价 → 都无则 undefined（调用方拦下单）。
 * 客户价始终优先，基础价只回落，绝不取代客户价（不退化成一维全局价）。
 */
export function getEffectiveQuote(
  db: DB,
  customerId: number,
  productId: number,
): EffectiveQuote | undefined {
  const q = getCurrentQuote(db, customerId, productId);
  if (q) return { rollPrice: q.rollPrice, source: 'customer' };
  const b = getCurrentBasePrice(db, productId);
  if (b) return { rollPrice: b.rollPrice, source: 'base' };
  return undefined;
}

/**
 * 批量调价（原料浮动场景）：一笔事务里给每个客户追加新报价、可选同时追加产品基础价。
 * 复用 setQuote / setBasePrice（各自的事务在外层事务内退化为 savepoint，保持原子）：
 * 全部走「追加新行 + 翻旧 is_current」，绝不原地改价（红线：报价历史只追加）。
 * 任一价 ≤0 或非有限数先整体拒绝（与单条 setQuote / setBasePrice 一致），不留半套。
 * 返回追加的行数（客户报价数 + 基础价 0/1）。
 */
export function applyBatchRepricing(
  db: DB,
  input: {
    quotes: { customerId: number; productId: number; rollPrice: number; note?: string }[];
    base?: { productId: number; rollPrice: number; note?: string };
  },
): number {
  for (const q of input.quotes) {
    if (!Number.isFinite(q.rollPrice) || q.rollPrice <= 0) {
      throw new Error('批量调价：存在非正报价，已全部取消');
    }
  }
  if (input.base && (!Number.isFinite(input.base.rollPrice) || input.base.rollPrice <= 0)) {
    throw new Error('批量调价：基础价非正，已全部取消');
  }
  const tx = db.transaction(() => {
    let n = 0;
    for (const q of input.quotes) {
      setQuote(db, q);
      n++;
    }
    if (input.base) {
      setBasePrice(db, input.base);
      n++;
    }
    return n;
  });
  return tx();
}

// ---------- orders（红线：快照 roll_price_used，历史不回改）----------
export interface NewOrderItem {
  productId?: number | null;
  productName?: string;
  rawSpec: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unit: string;
  areaSqm: number;
  rollPriceUsed: number;
  unitPrice: number;
  amount: number;
  isManual?: boolean;
  remark?: string;
}

export function createOrder(
  db: DB,
  input: {
    orderNo: string;
    customerId: number;
    orderDate?: string;
    remark?: string;
    status?: string;
    items: NewOrderItem[];
  },
): number {
  const orderDate = input.orderDate?.trim() || null; // 空串 / 空白归一为 null，回落当天本地日期
  const tx = db.transaction((o: typeof input) => {
    // 防御性取整：保证 total_amount 为整数元（D6），且与 total_in_words 同源
    const total = round(
      o.items.reduce((s, it) => s + it.amount, 0),
      AMOUNT_DECIMALS,
    );
    const words = amountToChinese(total);
    const r = db
      .prepare(
        `INSERT INTO orders (order_no, customer_id, order_date, total_amount, total_in_words, remark, status)
         VALUES (?, ?, COALESCE(?, date('now', 'localtime')), ?, ?, ?, ?)`,
      )
      .run(o.orderNo, o.customerId, orderDate, total, words, o.remark ?? '', o.status ?? 'active');
    const orderId = Number(r.lastInsertRowid);
    const insItem = db.prepare(
      `INSERT INTO order_items
        (order_id, product_id, product_name, raw_spec, width_mm, height_mm, qty, unit, area_sqm, roll_price_used, unit_price, amount, is_manual, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const it of o.items) {
      insItem.run(
        orderId,
        it.productId ?? null,
        it.productName ?? '',
        it.rawSpec,
        it.widthMm,
        it.heightMm,
        it.qty,
        it.unit,
        it.areaSqm,
        it.rollPriceUsed,
        it.unitPrice,
        it.amount,
        it.isManual ? 1 : 0,
        it.remark ?? '',
      );
    }
    return orderId;
  });
  return tx(input);
}

export function getOrder(db: DB, id: number): { order: Order; items: OrderItem[] } | undefined {
  const r = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!r) return undefined;
  const order: Order = {
    id: r.id,
    orderNo: r.order_no,
    customerId: r.customer_id,
    orderDate: r.order_date,
    totalAmount: r.total_amount,
    totalInWords: r.total_in_words,
    remark: r.remark,
    status: r.status,
    createdAt: r.created_at,
  };
  const items = (
    db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id) as any[]
  ).map(toOrderItem);
  return { order, items };
}

export interface ListedOrder {
  id: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export function listOrders(db: DB): ListedOrder[] {
  return (
    db
      .prepare(
        `SELECT o.*, COALESCE(c.name, '(客户已删除)') AS customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
         ORDER BY o.id DESC`,
      )
      .all() as any[]
  ).map((r) => ({
    id: r.id,
    orderNo: r.order_no,
    customerId: r.customer_id,
    customerName: r.customer_name,
    orderDate: r.order_date,
    totalAmount: r.total_amount,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** 作废订单：改 status 而非物理删，保留快照。返回受影响行数（0 = 该 id 不存在）。 */
export function voidOrder(db: DB, id: number): number {
  return db.prepare("UPDATE orders SET status = 'void' WHERE id = ?").run(id).changes;
}

// ---------- 统计（仅统计 active 订单；按本地日期分月）----------
export interface CustomerMonthStat {
  ym: string;
  customerId: number;
  customerName: string;
  orderCount: number;
  total: number;
}
export interface ProductMonthStat {
  ym: string;
  productId: number | null;
  productName: string;
  qty: number;
  total: number;
}

/** 有订单的月份列表（倒序），供统计页筛选。 */
export function listOrderMonths(db: DB): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m', order_date) AS ym FROM orders WHERE status = 'active' ORDER BY ym DESC`,
      )
      .all() as { ym: string }[]
  )
    .map((r) => r.ym)
    .filter(Boolean);
}

/** 客户 × 月 消费。ym 省略则跨全部月份。作废单不计。 */
export function statsByCustomerMonth(db: DB, ym?: string): CustomerMonthStat[] {
  const sql = `
    SELECT strftime('%Y-%m', o.order_date) AS ym, o.customer_id, c.name AS customer_name,
           COUNT(*) AS order_count, SUM(o.total_amount) AS total
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.status = 'active' ${ym ? "AND strftime('%Y-%m', o.order_date) = ?" : ''}
    GROUP BY ym, o.customer_id
    ORDER BY ym DESC, total DESC`;
  const rows = (ym ? db.prepare(sql).all(ym) : db.prepare(sql).all()) as any[];
  return rows.map((r) => ({
    ym: r.ym,
    customerId: r.customer_id,
    customerName: r.customer_name,
    orderCount: r.order_count,
    total: r.total,
  }));
}

/** 产品 × 月 销量（按快照品名）。ym 省略则跨全部月份。作废单不计。 */
export function statsByProductMonth(db: DB, ym?: string): ProductMonthStat[] {
  const sql = `
    SELECT strftime('%Y-%m', o.order_date) AS ym, oi.product_id, oi.product_name,
           SUM(oi.qty) AS qty, SUM(oi.amount) AS total
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'active' ${ym ? "AND strftime('%Y-%m', o.order_date) = ?" : ''}
    GROUP BY ym, oi.product_id, oi.product_name
    ORDER BY ym DESC, total DESC`;
  const rows = (ym ? db.prepare(sql).all(ym) : db.prepare(sql).all()) as any[];
  return rows.map((r) => ({
    ym: r.ym,
    productId: r.product_id,
    productName: r.product_name,
    qty: r.qty,
    total: r.total,
  }));
}
