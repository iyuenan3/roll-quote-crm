# 报价送货系统 · roll-quote-crm

> 面向卷材（低温胶等按卷 / 按㎡ 计价产品）销售商家的本地桌面 CRM。客户按固定模板发单，粘贴即自动按「客户 × 产品」最新报价算出每行单价金额，生成订单、打印送货单、看月度消费统计。本地单机、离线、双击启动。

## 🚦 状态

开发中（in-progress）。**Phase 1 已完成**：Electron 脚手架 + `src/core` 计价 / 解析纯函数 + 单测。下方「特性」描述目标产品全貌，其中订单保存、送货单打印、数据库、统计等属 **Phase 2 计划**，尚未实现（路线图见 `AIREADME/ROADMAP`）。

## ✨ 特性（目标）

- 「客户 × 产品 × 每卷报价」二维报价管理，报价改动只追加、留全量历史。
- 微信订单文本粘贴即解析，品名三级匹配（精确 → 别名 → 模糊），匹配不到给告警。
- 一卷恒等于 21㎡ 折算计价，单价金额零手算，自动输出中文大写金额。
- 订单保存时快照下单报价，历史订单不随后续改价变动。
- 送货单 `window.print()` 打印 / 存 PDF。
- 客户 / 产品 × 月 消费统计。
- 纯本地单机离线，数据存 SQLite 单文件。

## 🏗 技术栈

Electron + React + Vite + TypeScript + SQLite（better-sqlite3，Phase 2 引入）。计价 / 解析为 `src/core` 纯函数，全部带 vitest 单测；UI 只调用、不内联算法。

## 📐 计价口径

一卷 = 21㎡。

```
面积   = (宽mm / 1000) × (长mm / 1000)
单价   = round(每卷报价 × 面积 ÷ 21, 2)
金额   = round(每卷报价 × 面积 ÷ 21 × 张数, 2)   // 用未截断单价乘，避免累积误差
```

张 / 卷同一公式：整卷面积 ≈ 21㎡ 时单价自然退化为每卷报价。

## 📝 下单模板

```
客户：张三
05纯低温胶 2500*893 21张
06纯低温胶 420*50000 22卷
```

品名 + 尺寸（毫米）+ 数量，每行一个规格。尺寸分隔符 `*` `×` `x` `X` 全 / 半角通用，数量单位为 张 / 卷。

## 🚀 开发

```bash
npm install        # 安装依赖（国内装 Electron 二进制见下）
npm run dev        # 启动桌面应用
npm test           # 跑核心单元测试
npm run typecheck  # 类型检查
npm run build      # 构建三进程产物
```

国内网络从 GitHub 拉 Electron 二进制易超时，改用镜像：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install --registry=https://registry.npmmirror.com
```

## 📚 设计文档

完整架构、数据模型、对外输入契约、决策记录见 [`AIREADME/`](./AIREADME/)（AI 原生跨文件文档体系，先读 `AIREADME/INDEX.md`）。

## 📄 License

[MIT](./LICENSE)
