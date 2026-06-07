# MEMORY · roll-quote-crm （append-only）

运行时事故 / 踩坑 / 复盘在此追加（每条：现象 + 根因 + 结论 / 避免）。

## 2026-06-07 · round() 用 Number.EPSILON 补偿是错的（财务取整 bug）
- 现象：`round(8.575,2)` 得 8.57（应 8.58），0.005~9.995 的 1000 个「分半」值有 53 个少进位，金额系统性少一分。单测却全绿。
- 根因：`Math.round((abs + Number.EPSILON) * factor)`。Number.EPSILON ≈ 2.2e-16 是「1.0 附近」间隔，×100 后仅 2.2e-14，远小于多数 x.xx5 值在二进制里偏小的量，补不动。且初版单测恰好只挑了 1.005/2.345 这几个能蒙对的值，制造虚假安全感。
- 结论：货币取整不要用绝对 EPSILON 加偏。改为先 `Number((abs*factor).toFixed(8))` 削掉浮点尾噪再 `Math.round`，实测 53→0。测试要专门覆盖会失败的边界（8.575/2.135/2.385/4.015）而非只挑能过的。

## 2026-06-07 · 解析器静默猜值是隐患（小数截断 / 品名吞尺寸 / 空品名误绑）
- 现象：`\d+` 遇小数静默截断（2500.5 → 5）；品名内「数字x数字」被首个 SIZE_RE 抢匹配（3x5加强胶 → 尺寸=3x5）；空品名因 `name.includes('')` 恒真 fuzzy 误绑首个产品。均无告警，错值直进计价。
- 根因：正则取首个匹配 + `\d+` 不认小数 + 包含式 fuzzy 对空串恒真。
- 结论：第一性原理「不确定输入应报错，不静默猜」。改为：行尾锚定数量 → 数量前取最后一个尺寸 token；小数 / 缺品名一律 parse-error；matchProduct 开头挡空串；fuzzy 多命中改 ambiguous + 告警交商家手选。

## 2026-06-07 · SQLite date('now') 是 UTC，中国凌晨订单错算日期 / 月份
- 现象：schema 默认值与 DAO 兜底用 `date('now')`，北京时间 00:00-08:00 建的订单 order_date 记成前一天；跨月凌晨（如 6/1 01:00）被算进上个月，污染月度统计（本项目核心功能）。
- 根因：SQLite 的 `date('now')` / `datetime('now')` 返回 UTC，不随进程时区。
- 结论：本机单机 CRM 一律用 `date('now','localtime')` / `datetime('now','localtime')`；DAO 对外来日期串 `trim() || null` 归一（空串绕过 COALESCE 会存空日期）。见 CONVENTIONS「时间 / 时区」。

## 2026-06-07 · 部分唯一索引只对「值=1」去重，需配 CHECK
- 现象：`UNIQUE INDEX ... WHERE is_current = 1` 只拦 is_current=1 的重复，raw 插 is_current=2 能绕过「至多一条 current」红线，成孤儿数据。
- 结论：布尔列必须配 `CHECK (col IN (0,1))`，索引语义才与红线严格等价。is_manual、status 同理加值域 CHECK。

## TODO（接入用户前必做）· schema 迁移机制
- 现状：建表用 `CREATE TABLE IF NOT EXISTS`，已有库改结构不会升级。pre-release 还没有真实订单库，是引入成本最低的窗口。
- 计划：用 `PRAGMA user_version` 记版本，openDb 按版本顺序跑 ALTER + 回填。一旦有真实数据在外，再补会很贵。

## 2026-06-07 · electron-rebuild 必须带 -f，否则 node↔electron 切换会留旧 ABI
- 现象:跑过 `npm run rebuild:node`(better-sqlite3 切 Node ABI 127)后,再 `electron-rebuild -w better-sqlite3`(无 -f)虽打印「Rebuild Complete」却跳过实际重编,留下 127;Electron 33(ABI 130)加载报 `NODE_MODULE_VERSION 127 vs 130 / ERR_DLOPEN_FAILED`。
- 根因:electron-rebuild 不加 -f 时会「判断已是最新就跳过」,node↔electron 来回切时该判断失准。
- 结论:`rebuild:electron` 脚本必须 `electron-rebuild -f -w better-sqlite3`(强制)。验证 round-trip:rebuild:node→127、rebuild:electron→130 各跑一次确认。headers 缓存在 ~/.electron-gyp 后不依赖网络,不需要 --build-from-source / 指定 dist-url(那是我被假探针带偏的弯路)。
- 验尺教训:探 better-sqlite3 的 ABI 不能用 `require('better-sqlite3')`,它在 `new Database()` 才 lazy load 原生模块;`require` 成功是假阴性。正确探针:`new (require('better-sqlite3'))(':memory:')` 看是否抛 ERR_DLOPEN_FAILED。

## 2026-06-07 · Electron 二进制装不上要用国内镜像
- 现象：`npm install` 在 electron postinstall 卡 `RequestError: read ETIMEDOUT`，整个 install 回滚。
- 根因：electron 二进制默认从 GitHub releases 拉，国内网络超时。
- 结论：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install --registry=https://registry.npmmirror.com`。git push 遇代理 502 时清空 *_proxy 环境变量直连 GitHub 可救急。
