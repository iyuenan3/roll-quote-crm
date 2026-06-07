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
function toOrderItem(r: any): OrderItem {
  return {
    id: r.id,
    orderId: r.order_id,
    productId: r.product_id,
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

// ---------- orders（红线：快照 roll_price_used，历史不回改）----------
export interface NewOrderItem {
  productId?: number | null;
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
        (order_id, product_id, raw_spec, width_mm, height_mm, qty, unit, area_sqm, roll_price_used, unit_price, amount, is_manual, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const it of o.items) {
      insItem.run(
        orderId,
        it.productId ?? null,
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
