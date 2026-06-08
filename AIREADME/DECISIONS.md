# DECISIONS · roll-quote-crm （append-only）

## D1 · 2026-06-07 · 计价按「每卷报价 × 面积 ÷ 21」
- Problem: 同型号客户报价不同，客户按长 × 宽 × 张数裁切下单，单价要现算。
- Constraint: 报价单位是一卷价，一卷 = 21㎡。
- Decision: 单张单价 = 每卷报价 × (长 × 宽面积 ÷ 21)，金额 = 单价 × 张数。张 / 卷同一公式。
- Alternatives: 按㎡直接报价（否决：商家习惯按卷报价）。
- Tradeoff: 公式简单统一，但依赖客户尺寸单位一致（约定毫米）。

## D2 · 2026-06-07 · 打印走空白纸整张，放弃针式预印三联单
- Problem: 送货单要打印，目标用户现有 EPSON LQ-615KII 针式 + 预印三联单。
- Constraint: 预印单坐标对齐耗时、依赖实机反复调、换纸换机重校。
- Decision: 系统渲染完整送货单（抬头 + 表格 + 数据 + 合计大写 + 条款 + 盖章区），window.print() 打空白纸 / 存 PDF。
- Alternatives: 针式预印单坐标校准（否决：成本高、维护重，复写价值不抵开发成本）。
- Tradeoff: 失去三联现场复写，换来打印模块大幅简化 + 可存 PDF 发客户。

## D3 · 2026-06-07 · 技术栈 Tauri 而非 Electron
> 状态：已被 D5 取代（2026-06-07）。保留原文记录决策演变，理由失效详见 D5。
- Problem: 本地桌面应用选栈。
- Constraint: 单人离线、双击友好；放弃针式对齐后不再需要精细静默打印控制。
- Decision: Tauri + React + SQLite。
- Alternatives: Electron（否决：体积大；其精细打印控制优势在 D2 后失去意义）；本地网页 + 起服务（否决：非技术用户起服务不友好）。
- Tradeoff: 体积小、贴近常用栈；window.print 走对话框（D2 后够用）。

## D4 · 2026-06-07 · 客户下单走固定模板严格填
- Problem: 客户微信发单要能自动解析。
- Constraint: 自动化价值取决于解析成功率。
- Decision: 固定模板「品名 尺寸 数量」逐行严格填，正则精确解析；品名精确 → 别名 → 模糊匹配，不中标红手选。
- Alternatives: 自由文本 + AI 解析（否决：需联网、偶错、要复核，留作 Later 兜底）。
- Tradeoff: 最稳、离线、零成本，但要求客户配合按格式填。

## D5 · 2026-06-07 · 技术栈改 Electron（推翻 D3）
- Problem: 开发机仅 M 芯片 Mac，软件交付到目标用户的 Windows，需要跨平台开发与打包。
- Constraint: 开发者不熟 Rust；Tauri 用系统 webview，Mac（WKWebView）与 Windows（WebView2）打印行为不一致，送货单打印须在 Windows 反复实测。
- Decision: 改用 Electron + React + Vite + TypeScript；SQLite 用 better-sqlite3（主进程同步读写）；打包用 electron-builder + GitHub Actions Windows runner（一台 Mac 即可云端产出 Windows 安装包）。
- Why D3 不再成立: D3 否决 Electron 的两条理由在本约束下失效。其一「体积大」，单机自用工具不在意安装包体积；其二「精细打印控制优势在 D2 后失去意义」，本就不需要。反之 Electron 自带 Chromium 渲染器，Mac 开发所见即≈Windows 效果，打印高保真、跨平台一致，且打包链路（electron-builder）对纯 JS 全栈最成熟，零 Rust 门槛。
- Alternatives: 保持 Tauri + CI 交叉编译（否决：Rust 交叉编译 + WebView2 + 安装包工具链对不熟 Rust 者门槛高，且 webview 打印跨平台不一致）。
- Tradeoff: 安装包体积变大（约 100MB 级），换来 Mac→Windows 的开发、打包、打印一致性与零 Rust 门槛。

## D6 · 2026-06-07 · 单价取 3 位小数、金额四舍五入到整数
- Problem: 业务方（商家）要求单价精确到小数点后 3 位、金额四舍五入到整数（元）。原约定（CONVENTIONS）为两者均 2 位小数。
- Constraint: 计价公式不可变（每卷报价 × 面积 ÷ 21 × 张数、一卷 = 21㎡、二维报价、未截断单价乘）。本次仅改「输出取整精度」，不动公式，故未违反「计价口径不可变」红线。
- Decision: unit_price = round(rawUnit, 3)；amount = round(rawUnit × qty, 0)，仍以未截断单价乘张数后取整到元。常量见 `pricing.ts` 的 UNIT_PRICE_DECIMALS / AMOUNT_DECIMALS。
- Alternatives: 金额用「显示的 3 位单价 × 数量」再取整（否决：违反未截断红线；且 3 位精度下两种算法差异可忽略）。
- Tradeoff: 送货单上「单价 × 数量」与整数金额可能有不超过 1 元的视觉差（金额取整所致，以金额为准）。

## D7 · 2026-06-08 · 加产品基础价层（客户无专属价时回落），不破二维红线
- Problem: 同一产品有「基础报价」，各客户又有不同专属价，价格还随原料浮动。商家不想给每个客户每个产品都手录一遍价。
- Constraint: 红线「报价是客户×产品二维，绝不退化成产品一维全局价」「报价历史只追加」「订单快照不回改」不可破；计价公式（D1）不可变。
- Decision: 新增 `product_prices` 表（仅 product 维，结构镜像 quotes：roll_price + effective_date + is_current + 部分唯一索引；改价同样追加新行 + 翻 is_current）。下单取价顺序 = 客户专属价（quotes）→ 产品基础价（product_prices）→ 都无则拦下单（`dao.getEffectiveQuote`）。客户价始终优先且独立存绝对值，基础价只回落、绝不改写客户价。订单仍快照 roll_price_used。基础价也 append-only、可看历史与浮动。加表走 SCHEMA_SQL 的 IF NOT EXISTS，旧库 openDb 自动补建，无需 user_version 迁移块。
- Why 不破红线: 基础价是「回落默认」而非「全局价」。客户专属价存在时永远优先，二维定价不被取代；新增层只补「客户没单独报价」的空缺，是 enrich 不是 degrade。历史只追加、订单快照、计价公式全沿用既有机制。
- Alternatives: ① 客户价存「基础价×折扣」相对值，基础价变则自动浮动（否决：客户实际价变成算出来的，历史追溯与订单快照口径复杂、易与红线冲突；且商家明确选「客户价存绝对值」）。② 基础价存 products 一个可变列、不留史（否决：基础价也会浮动，留痕并与客户价对称更一致，代价仅一张镜像表）。
- Tradeoff: 多一张表 + 一套镜像 DAO，换来三层报价（基础 / 客户 / 订单快照）清晰解耦、各自留痕。批量调价（原料涨价一键给多客户追加新报价）留作后续，当前靠逐客户 setQuote 已可达成。
