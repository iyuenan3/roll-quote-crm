# CONVENTIONS · roll-quote-crm

## 命名
- 项目 slug：roll-quote-crm（全小写连字符）。对外应用名（窗口标题）用中文，如「报价送货系统」。
- 金额用元为单位、两位小数；计算用 number，显示 toFixed(2)。

## 计价取整
- unit_price、amount 各 round 到 2 位小数。
- amount 用未截断单价乘张数再取整：`round(roll_price × area ÷ 21 × qty, 2)`，不用已截断的 unit_price 乘，避免累积误差。

## 核心算法
- pricing / parse-order 必须是纯函数，放 `src/core`，带单测。UI 只调用，不内联算法。

## 报价变更
- 改价 = quotes 追加新行 + 旧行 is_current=0，不原地改价。
- 订单保存时快照 roll_price_used，历史订单不随后续报价变动。

## 中文标点
- 绝不使用破折号（—— / —）。用逗号 / 句号 / 冒号 / 括号。适用所有中文产出（文档 / commit / UI 文案）。

## Git
- 主分支 main。commit 仅在用户要求时。
