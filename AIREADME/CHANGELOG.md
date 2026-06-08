# CHANGELOG · roll-quote-crm （append-only）

⚑ 未 release。首个里程碑后倒序记版本块（Added / Changed / Fixed / Removed / Deprecated），理由链 DECISIONS。

## Unreleased
- 批量调价（2026-06-08）：新增「批量调价」页 + DAO（listCurrentQuotesByProduct / applyBatchRepricing：一笔事务逐客户追加新报价、可同时追加基础价，复用 setQuote/setBasePrice 的 savepoint 原子）+ core `adjustRollPrice`（percent/delta/set，round 2 位）。原料浮动时按统一方式给选中客户（可逐个排除）调价，仍只追加、旧价留痕。测试 81 → 89。

- 产品基础价层（2026-06-08，DECISIONS D7）：新增 `product_prices` 表（append-only，镜像 quotes 去 customer 维）+ DAO（setBasePrice / getCurrentBasePrice / listBasePriceHistory / listCurrentBasePrices / getEffectiveQuote）+ 5 个 IPC。下单取价回落「客户专属价 → 产品基础价 → 无价拦单」；产品页设/改/看基础价历史，报价页预填基础价并显示，下单行标价来源（客户价 / 基础价）。测试 → 80。

- 下单加手动行 + 行级备注（2026-06-08）：NewOrderPage 支持从零加手动行（目录外品名 / 自填规格单价 / 单位）+ 每行删除 + 每行备注；送货单按行显示备注。纯前端，数据层早已预留 is_manual / remark 列。

- Phase 2（2026-06-07）：DB（schema + 迁移 + DAO + 红线单测）+ Electron IPC 桥；产品/客户/报价 管理页；新建订单（粘贴→解析→计价→预览→保存）；订单历史 + 作废；送货单视图 + 打印；月度统计（客户×月 / 产品×月，作废不计）；公司信息。order_items 增 product_name 品名快照；PRAGMA user_version 最小迁移。测试 34 → 71。

- 计价精度调整（2026-06-07，DECISIONS D6）：单价 round 到 3 位小数，金额四舍五入到整数元（原均 2 位）。公式与「未截断单价乘」不变。

- Phase 1（2026-06-07，commit 877c8fe）：
  - Added：Electron + React + Vite + TS 脚手架；`src/core/pricing.ts`（计价 + 中文大写）与 `src/core/parse-order.ts`（模板解析 + 品名匹配）纯函数 + vitest 单测。
  - Changed：技术栈 Tauri → Electron（DECISIONS D5 推翻 D3）。
  - Fixed（审查后）：round() 分半进位 bug（EPSILON 改 toFixed）；解析器小数静默截断、品名内 数字x数字 吞尺寸、空品名 fuzzy 误绑、fuzzy 多命中歧义，均改为报错 / 告警。
- 立项（2026-06-07）：建仓 + AIREADME + 计划确定。
