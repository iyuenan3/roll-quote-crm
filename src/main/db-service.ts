// 主进程 DB 服务：持有唯一连接，把 DAO 暴露为 ipcMain.handle 通道。
// 错误在边界脱敏：原始 SqliteError 细节只记主进程日志，给渲染进程的是中文友好消息。
import { app, ipcMain } from 'electron';
import { join } from 'path';
import {
  openDb,
  type DB,
  getCompany,
  upsertCompany,
  listCustomers,
  createCustomer,
  listProducts,
  createProduct,
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
  listOrderMonths,
  statsByCustomerMonth,
  statsByProductMonth,
} from '../db';

let db: DB | null = null;
function getDb(): DB {
  if (!db) db = openDb(join(app.getPath('userData'), 'roll-quote-crm.db'));
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function sanitizeError(e: unknown): Error {
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    if (typeof code === 'string' && code.startsWith('SQLITE_')) {
      if (code.includes('UNIQUE')) return new Error('记录已存在（唯一约束冲突）');
      if (code.includes('FOREIGNKEY')) return new Error('关联数据不存在（外键约束）');
      if (code.includes('CHECK')) return new Error('数据不合法（校验未通过）');
      return new Error('数据库操作失败');
    }
    // 我们自己抛的校验错误：剥掉内部函数名前缀（如 "setBasePrice: "）再透传，不泄露实现细节
    return new Error(e.message.replace(/^[A-Za-z][\w]*:\s*/, ''));
  }
  return new Error('未知错误');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const handlers: Record<string, (arg: any) => unknown> = {
  'db:getCompany': () => getCompany(getDb()),
  'db:upsertCompany': (c) => upsertCompany(getDb(), c),
  'db:listCustomers': () => listCustomers(getDb()),
  'db:createCustomer': (i) => createCustomer(getDb(), i),
  'db:listProducts': () => listProducts(getDb()),
  'db:createProduct': (i) => createProduct(getDb(), i),
  'db:setQuote': (i) => setQuote(getDb(), i),
  'db:getCurrentQuote': (a) => getCurrentQuote(getDb(), a.customerId, a.productId),
  'db:listQuoteHistory': (a) => listQuoteHistory(getDb(), a.customerId, a.productId),
  'db:setBasePrice': (i) => setBasePrice(getDb(), i),
  'db:getCurrentBasePrice': (a) => getCurrentBasePrice(getDb(), a.productId),
  'db:listBasePriceHistory': (a) => listBasePriceHistory(getDb(), a.productId),
  'db:listCurrentBasePrices': () => listCurrentBasePrices(getDb()),
  'db:getEffectiveQuote': (a) => getEffectiveQuote(getDb(), a.customerId, a.productId),
  'db:listCurrentQuotesByProduct': (a) => listCurrentQuotesByProduct(getDb(), a.productId),
  'db:applyBatchRepricing': (i) => applyBatchRepricing(getDb(), i),
  'db:createOrder': (i) => createOrder(getDb(), i),
  'db:getOrder': (a) => getOrder(getDb(), a.id),
  'db:listOrders': () => listOrders(getDb()),
  'db:voidOrder': (a) => voidOrder(getDb(), a.id),
  'db:listOrderMonths': () => listOrderMonths(getDb()),
  'db:statsByCustomerMonth': (a) => statsByCustomerMonth(getDb(), a?.ym),
  'db:statsByProductMonth': (a) => statsByProductMonth(getDb(), a?.ym),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export function registerDbIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, arg) => {
      try {
        return fn(arg);
      } catch (e) {
        console.error('[db]', channel, e);
        throw sanitizeError(e);
      }
    });
  }
}
