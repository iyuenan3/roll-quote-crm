// 渲染进程 ↔ 主进程的 IPC 契约（仅类型，无运行时代码）。
// preload 按此实现 window.api，renderer 按此调用。从 dao 复用领域模型（import type，编译期擦除，不会把 better-sqlite3 带进渲染进程）。
import type {
  Company,
  Customer,
  Product,
  Quote,
  BasePrice,
  EffectiveQuote,
  ProductQuoteRow,
  Order,
  OrderItem,
  NewOrderItem,
  ListedOrder,
  CustomerMonthStat,
  ProductMonthStat,
} from '../db/dao';

// 给渲染进程复用领域模型（渲染层从 shared 取类型，不直接 import db 层）
export type {
  Company,
  Customer,
  Product,
  Quote,
  BasePrice,
  EffectiveQuote,
  ProductQuoteRow,
  Order,
  OrderItem,
  NewOrderItem,
  ListedOrder,
  CustomerMonthStat,
  ProductMonthStat,
} from '../db/dao';

export interface DbApi {
  getCompany(): Promise<Company>;
  upsertCompany(c: Company): Promise<void>;
  listCustomers(): Promise<Customer[]>;
  createCustomer(i: { name: string; phone?: string; address?: string }): Promise<number>;
  listProducts(): Promise<Product[]>;
  createProduct(i: {
    name: string;
    code?: string;
    aliases?: string[];
    specNote?: string;
    defaultUnit?: string;
  }): Promise<number>;
  setQuote(i: {
    customerId: number;
    productId: number;
    rollPrice: number;
    effectiveDate?: string;
    note?: string;
  }): Promise<number>;
  getCurrentQuote(a: { customerId: number; productId: number }): Promise<Quote | undefined>;
  listQuoteHistory(a: { customerId: number; productId: number }): Promise<Quote[]>;
  setBasePrice(i: {
    productId: number;
    rollPrice: number;
    effectiveDate?: string;
    note?: string;
  }): Promise<number>;
  getCurrentBasePrice(a: { productId: number }): Promise<BasePrice | undefined>;
  listBasePriceHistory(a: { productId: number }): Promise<BasePrice[]>;
  listCurrentBasePrices(): Promise<BasePrice[]>;
  getEffectiveQuote(a: { customerId: number; productId: number }): Promise<EffectiveQuote | undefined>;
  listCurrentQuotesByProduct(a: { productId: number }): Promise<ProductQuoteRow[]>;
  applyBatchRepricing(i: {
    quotes: { customerId: number; productId: number; rollPrice: number; note?: string }[];
    base?: { productId: number; rollPrice: number; note?: string };
  }): Promise<number>;
  createOrder(i: {
    orderNo: string;
    customerId: number;
    orderDate?: string;
    remark?: string;
    status?: string;
    items: NewOrderItem[];
  }): Promise<number>;
  getOrder(a: { id: number }): Promise<{ order: Order; items: OrderItem[] } | undefined>;
  listOrders(): Promise<ListedOrder[]>;
  voidOrder(a: { id: number }): Promise<number>;
  listOrderMonths(): Promise<string[]>;
  statsByCustomerMonth(a: { ym?: string }): Promise<CustomerMonthStat[]>;
  statsByProductMonth(a: { ym?: string }): Promise<ProductMonthStat[]>;
}

export interface Api {
  db: DbApi;
}
