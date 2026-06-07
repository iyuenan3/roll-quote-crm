# CLAUDE.md · roll-quote-crm（router）

> 卷材（低温胶等）按卷报价 + 下单解析 + 送货单 + 月度统计的本地桌面 CRM。
> 本文件是 bootstrap router：只放状态 / 路由 / 红线指针 / 维护责任 / 命令。详细真相源在 `AIREADME/`（先读 `AIREADME/INDEX.md`）。

## 当前状态
in-progress。Phase 1 + Phase 2 主线完成：DB（schema/迁移/DAO）+ Electron IPC + 全部业务页（下单/订单/送货单打印/管理/统计/公司信息），「粘贴→出单→送货单」闭环已通，71 测试绿。下一步：打磨（加手动行 / 行级备注）+ 真机验收 + Later（备份 / Windows 安装包，见 `AIREADME/ROADMAP`）。

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
- `npm run dev`：启动 Electron 桌面应用（已自动 rebuild:electron 把 better-sqlite3 切 Electron ABI）
- `npm test`：跑 core + db 单元测试（vitest，需 Node ABI）
- `npm run typecheck`：类型检查
- `npm run build`：构建三进程产物
- 国内装 Electron 二进制需镜像：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install --registry=https://registry.npmmirror.com`

### better-sqlite3 双 ABI（原生模块，重要）
- better-sqlite3 的 Node ABI 与 Electron ABI 不通用，同一份编译产物不能两边用。
- 跑过 `npm run dev`（切 Electron ABI）后，再 `npm test` 会因 ABI 不符报错，先 `npm run rebuild:node` 切回。
- 反之 `npm run dev` 已内置 `rebuild:electron`，无需手动。

## 元信息
- git 主分支 main。commit 仅在用户要求时。
- 中文产出绝不使用破折号。
