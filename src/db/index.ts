import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';

export type DB = Database.Database;

/** 当前 schema 版本。加迁移 = 加 migrate 块 + bump 此常量 + 同步 SCHEMA_SQL。 */
export const SCHEMA_VERSION = 1;

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
 * 最小迁移：用 PRAGMA user_version 记 schema 版本，按版本顺序补差异。幂等。
 * 约定：加表 / 加索引靠 SCHEMA_SQL 的 IF NOT EXISTS（每次 openDb 安全）；改列 / 加列 / 改约束
 * 必须在此写迁移块并 bump SCHEMA_VERSION。每个版本块用事务包裹，保证「应用变更 + 推进版本」原子。
 */
export function migrate(db: DB): void {
  const raw = db.pragma('user_version', { simple: true });
  const v = typeof raw === 'number' ? raw : 0;

  if (v < 1) {
    db.transaction(() => {
      // v1：order_items.product_name（早期版本无此列）
      const cols = (db.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map(
        (c) => c.name,
      );
      if (!cols.includes('product_name')) {
        db.exec("ALTER TABLE order_items ADD COLUMN product_name TEXT NOT NULL DEFAULT ''");
      }
      db.pragma('user_version = 1');
    })();
  }
}

export * from './dao';
