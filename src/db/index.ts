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
  migrate(db);
  return db;
}

/**
 * 最小迁移：用 PRAGMA user_version 记 schema 版本，按版本顺序补差异。
 * 新库已由 SCHEMA_SQL 建全，旧库（pre-release dev 库）在此补列。幂等。
 */
function migrate(db: DB): void {
  const v = (db.pragma('user_version', { simple: true }) as number) || 0;

  if (v < 1) {
    // v1：order_items.product_name（早期版本无此列）
    const cols = (db.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!cols.includes('product_name')) {
      db.exec("ALTER TABLE order_items ADD COLUMN product_name TEXT NOT NULL DEFAULT ''");
    }
    db.pragma('user_version = 1');
  }
}

export * from './dao';
