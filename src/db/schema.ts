// SQLite 表结构（6 表）。对应 AIREADME/ARCHITECTURE 数据模型。
// 红线落地点：
//  - quotes：报价二维（customer_id × product_id），改价追加新行；每 (customer, product) 至多一条 is_current=1
//    （部分唯一索引 + CHECK(is_current IN (0,1)) 双重强制，后者堵住非 0/1 值绕过索引）。
//  - order_items：快照 roll_price_used，历史订单不随后续报价变动。
// 时区：日期 / 时间默认一律本机本地时区（商家所在地），用 'localtime'，避免 UTC 导致凌晨订单错算日期 / 月份。

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS company (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  name    TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone   TEXT NOT NULL DEFAULT '',
  terms   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL UNIQUE,
  aliases      TEXT NOT NULL DEFAULT '[]',   -- JSON 数组字符串
  spec_note    TEXT NOT NULL DEFAULT '',
  default_unit TEXT NOT NULL DEFAULT '张',
  created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  product_id     INTEGER NOT NULL REFERENCES products(id),
  roll_price     REAL    NOT NULL CHECK (roll_price >= 0),
  effective_date TEXT    NOT NULL DEFAULT (date('now', 'localtime')),
  is_current     INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  note           TEXT    NOT NULL DEFAULT ''
);
-- 红线：每 (customer, product) 至多一条 is_current=1。部分唯一索引去重，CHECK(is_current IN (0,1)) 堵住非布尔值绕过。
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_one_current
  ON quotes (customer_id, product_id) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_quotes_cp ON quotes (customer_id, product_id);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no       TEXT    NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  order_date     TEXT    NOT NULL DEFAULT (date('now', 'localtime')),
  total_amount   REAL    NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_in_words TEXT    NOT NULL DEFAULT '',
  remark         TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id),
  product_name    TEXT    NOT NULL DEFAULT '',   -- 快照下单时品名（产品改名 / 手动行不丢）
  raw_spec        TEXT    NOT NULL DEFAULT '',
  width_mm        REAL    NOT NULL CHECK (width_mm > 0),
  height_mm       REAL    NOT NULL CHECK (height_mm > 0),
  qty             REAL    NOT NULL CHECK (qty > 0),
  unit            TEXT    NOT NULL,
  area_sqm        REAL    NOT NULL CHECK (area_sqm >= 0),
  roll_price_used REAL    NOT NULL CHECK (roll_price_used >= 0),   -- 红线：快照下单时报价，绝不回改
  unit_price      REAL    NOT NULL CHECK (unit_price >= 0),
  amount          REAL    NOT NULL CHECK (amount >= 0),
  is_manual       INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0, 1)),
  remark          TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
`;
