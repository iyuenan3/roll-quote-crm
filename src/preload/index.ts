import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

// 通过 contextBridge 暴露受控 DB API，渲染进程经此 invoke 主进程，不直接碰 Node / DB。
const db: Api['db'] = {
  getCompany: () => ipcRenderer.invoke('db:getCompany'),
  upsertCompany: (c) => ipcRenderer.invoke('db:upsertCompany', c),
  listCustomers: () => ipcRenderer.invoke('db:listCustomers'),
  createCustomer: (i) => ipcRenderer.invoke('db:createCustomer', i),
  listProducts: () => ipcRenderer.invoke('db:listProducts'),
  createProduct: (i) => ipcRenderer.invoke('db:createProduct', i),
  setQuote: (i) => ipcRenderer.invoke('db:setQuote', i),
  getCurrentQuote: (a) => ipcRenderer.invoke('db:getCurrentQuote', a),
  listQuoteHistory: (a) => ipcRenderer.invoke('db:listQuoteHistory', a),
  setBasePrice: (i) => ipcRenderer.invoke('db:setBasePrice', i),
  getCurrentBasePrice: (a) => ipcRenderer.invoke('db:getCurrentBasePrice', a),
  listBasePriceHistory: (a) => ipcRenderer.invoke('db:listBasePriceHistory', a),
  listCurrentBasePrices: () => ipcRenderer.invoke('db:listCurrentBasePrices'),
  getEffectiveQuote: (a) => ipcRenderer.invoke('db:getEffectiveQuote', a),
  listCurrentQuotesByProduct: (a) => ipcRenderer.invoke('db:listCurrentQuotesByProduct', a),
  applyBatchRepricing: (i) => ipcRenderer.invoke('db:applyBatchRepricing', i),
  createOrder: (i) => ipcRenderer.invoke('db:createOrder', i),
  getOrder: (a) => ipcRenderer.invoke('db:getOrder', a),
  listOrders: () => ipcRenderer.invoke('db:listOrders'),
  voidOrder: (a) => ipcRenderer.invoke('db:voidOrder', a),
  listOrderMonths: () => ipcRenderer.invoke('db:listOrderMonths'),
  statsByCustomerMonth: (a) => ipcRenderer.invoke('db:statsByCustomerMonth', a),
  statsByProductMonth: (a) => ipcRenderer.invoke('db:statsByProductMonth', a),
};

contextBridge.exposeInMainWorld('api', { db } satisfies Api);
