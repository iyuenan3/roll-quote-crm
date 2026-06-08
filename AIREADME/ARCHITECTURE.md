# ARCHITECTURE · roll-quote-crm

> 实现状态（2026-06-08）：Phase 1 + Phase 2 主线全部落地，并已加下单手动行 / 行级备注、三层报价（产品基础价回落，DECISIONS D7）。下方标 ✅ 者均已实现并有单测；DEPLOYMENT（Windows 打包）仍为计划。

## 技术栈
Electron + React + Vite + TypeScript + SQLite（better-sqlite3，主进程同步读写）。本地单机、离线、双击启动。Electron 自带 Chromium 渲染器，打印走 `window.print()`，Mac 开发所见即≈Windows 效果。选型理由见 DECISIONS D5（推翻 D3）。
注：better-sqlite3 为原生模块。vitest 用 Node ABI、Electron 运行用 Electron ABI，两者编译产物不通用；接入主进程前需 electron-rebuild 重建（并在 electron-vite 里把它列为 main 进程 external，不进 bundle）。

## 组件 + 数据流

```
微信订单文本
   │ 粘贴
   ▼
parse-order（纯函数）  解析行 + 品名匹配 + 告警
   │
   ▼
pricing（纯函数）  按取价顺序（客户专属价 quotes → 产品基础价 product_prices）算 unit_price / amount / 合计 + 中文大写
   │
   ▼
订单预览（逐行可改价 / 改量 / 加手动行）
   │ 保存
   ▼
SQLite（orders + order_items，快照 roll_price_used）
   │
   ├─►  DeliveryNote 视图  →  window.print() / 存 PDF
   └─►  统计聚合查询（客户 / 产品 × 月）
```

## 数据模型（SQLite）✅ 已建表。schema 见 `src/db/schema.ts`；版本经 `PRAGMA user_version` 迁移
- company（单行）：name, address, phone, terms
- customers：id, name, phone, address, created_at
- products：id, code, name（唯一）, aliases, spec_note, default_unit, created_at
- quotes：id, customer_id, product_id, roll_price, effective_date, is_current, note。客户专属价，每 (customer, product) 至多一条 is_current=1（部分唯一索引 + CHECK 强制），改价追加新行
- product_prices：id, product_id, roll_price, effective_date, is_current, note。产品基础价（仅 product 维，镜像 quotes 去客户维），每 product 至多一条 is_current=1，改价追加新行。客户无专属价时下单回落此价（取价顺序 quotes → product_prices → 无价，见 DECISIONS D7）
- orders：id, order_no, customer_id, order_date, total_amount, total_in_words, remark, status（active/void）, created_at
- order_items：id, order_id, product_id, product_name（品名快照）, raw_spec, width_mm, height_mm, qty, unit, area_sqm, roll_price_used（报价快照）, unit_price, amount, is_manual, remark

## 关键模块
- ✅ `src/core/pricing.ts`：计价 + 中文大写金额。纯函数 + 单测。
- ✅ `src/core/parse-order.ts`：模板解析 + 品名匹配。纯函数 + 单测。
- ✅ `src/db/`：schema + 迁移 + DAO（catalog / quotes / 基础价 product_prices / 取价回落 getEffectiveQuote / 批量调价 applyBatchRepricing / orders / 统计聚合）+ 红线单测。
- ✅ DB IPC 桥：`src/main/db-service.ts`（主进程持库 + ipcMain.handle + 错误脱敏）、`src/preload/index.ts`（contextBridge 暴露 window.api）、`src/shared/api.ts`（IPC 类型契约）。渲染进程经 window.api 调用，不直接碰 Node / DB。
- ✅ `src/renderer/src/pages/DeliveryNote.tsx` + `styles.css @media print`：送货单视图 + 打印（window.print，只出送货单）。
- ✅ `src/renderer/src/pages/{NewOrder,Orders,Products,Customers,Quotes,BatchReprice,Stats,Settings}Page.tsx`：业务页全部落地。

## 禁改项
- 计价 / 解析必须留在 `src/core` 纯函数，UI 只调用、不内联算法。
- order_items 必须快照下单时 roll_price_used，报价后续变动不回改历史订单。
- quotes / product_prices 改价均走「追加新行 + 翻 is_current」，不原地 UPDATE 价格字段。
- 取价顺序固定「客户专属价 → 产品基础价 → 无价拦单」：客户价永远优先，基础价只回落、不取代（不退化成一维全局价，见 DECISIONS D7）。
