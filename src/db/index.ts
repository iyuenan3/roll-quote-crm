import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';

export type DB = Database.Database;

/**
 * 打开（或新建）数据库并应用表结构。
 * filename 默认 ':memory:'（单测用）；应用运行时传入本地文件路径。
 * 开启外键约束与 WAL（:memory: 下 WAL 自动降级，无碍）。
 */
export function openDb(filename = ':memory:'): DB {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

export * from './dao';
