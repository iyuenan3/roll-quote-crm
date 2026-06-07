# CLAUDE.md · roll-quote-crm（router）

> 卷材（低温胶等）按卷报价 + 下单解析 + 送货单 + 月度统计的本地桌面 CRM。
> 本文件是 bootstrap router：只放状态 / 路由 / 红线指针 / 维护责任 / 命令。详细真相源在 `AIREADME/`（先读 `AIREADME/INDEX.md`）。

## 当前状态
planned（2026-06-07 立项）。pre-code。下一步：计价 / 解析纯函数核心 + 单测。

## 加载路由（任务 → 读 AIREADME）

| 任务 | 读 |
|---|---|
| 了解项目 / 定位 / 红线 | `AIREADME/CORE` |
| 下单模板格式 / 计价公式 | `AIREADME/SPEC` |
| 改架构 / 数据模型 | `AIREADME/ARCHITECTURE` + `DECISIONS` |
| 加功能 / 产品意图 | `AIREADME/PRD` + `ROADMAP` + `CONVENTIONS` |
| 打包 / 部署 | `AIREADME/DEPLOYMENT` |
| 决策理由 | `AIREADME/DECISIONS` |

## 红线指针
见 `AIREADME/CORE`「绝不」段：计价口径不可变 / 报价二维不可退化 / 报价历史只追加 / 订单快照不回改 / 核心算法纯函数 / 中文不用破折号。

## 维护责任（什么变 → 更新哪个）
- 定位 / 边界 / 红线变 → `CORE`（+ `DECISIONS` 记理由）
- 数据模型 / 结构变 → `ARCHITECTURE`
- 下单格式 / 计价契约变 → `SPEC`
- 打包 / 部署变 → `DEPLOYMENT`
- 重大决策 → `DECISIONS`（append）
- 踩坑 / 复盘 → `MEMORY`（append）
- release / 里程碑 → `CHANGELOG`（append）

## 常用命令
（待 Electron 脚手架搭好后补：dev / test / build）

## 元信息
- git 主分支 main。commit 仅在用户要求时。
- 中文产出绝不使用破折号。
