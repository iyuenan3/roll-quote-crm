// 渲染进程访问主进程 DB 的入口。window.api 由 preload 注入，Electron 运行时必存在。
import type { Api } from '../../../shared/api';

export function getDb(): Api['db'] {
  if (!window.api?.db) throw new Error('未在 Electron 环境中运行（window.api 缺失）');
  return window.api.db;
}

/** 把任意错误转成可显示的中文消息。 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
