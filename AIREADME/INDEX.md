# roll-quote-crm · AIREADME
> 卷材（低温胶等）按卷报价 + 客户下单解析 + 送货单 + 月度统计的本地桌面 CRM ｜ 生命周期: in-progress（Phase 1 核心已完成）
> last-synced: 877c8fe · 2026-06-07

<!-- 路由器：只指路，不放实质内容。INDEX 不列自己。任何文件增减/状态变都更新这里。符号：✅已填 / ⚑占位 / —N/A -->

## 状态
| 文件 | 状态 | 摘要 |
|---|:--:|---|
| CORE | ✅ | 身份 / non-goals / 红线 |
| RELATIONS | ✅ | 独立单机，无跨项目依赖 |
| SPEC | ✅ | 下单模板格式 + 计价公式（对外输入契约）|
| ARCHITECTURE | ✅ | 数据模型 + 模块 + 数据流 |
| DEPLOYMENT | ⚑ | 未打包，计划 electron-builder + CI 出 Windows 安装包 |
| PRD | ✅ | 产品意图 / 用户问题 / UX 哲学 |
| ROADMAP | ✅ | Now/Next/Later |
| CONVENTIONS | ✅ | 计价取整 / 命名 / 中文标点 |
| DECISIONS | ✅ | 6 条决策（D1-D6；D5 推翻 D3 改 Electron，D6 单价 3 位 / 金额取整）|
| MEMORY | ✅ | round bug / 解析静默猜值 / Electron 镜像 等踩坑 |
| CHANGELOG | ⚑ | 未 release |

## 按任务读
- 跨项目了解 → CORE + RELATIONS
- 集成 / 对接下单格式 → SPEC
- 改架构 / 数据模型 → ARCHITECTURE + DECISIONS
- 加功能 → PRD + ROADMAP + CONVENTIONS
- 部署 / 打包 → DEPLOYMENT
