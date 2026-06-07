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
  createOrder: (i) => ipcRenderer.invoke('db:createOrder', i),
  getOrder: (a) => ipcRenderer.invoke('db:getOrder', a),
};

contextBridge.exposeInMainWorld('api', { db } satisfies Api);
