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

## 2026-06-07 · Electron 二进制装不上要用国内镜像
- 现象：`npm install` 在 electron postinstall 卡 `RequestError: read ETIMEDOUT`，整个 install 回滚。
- 根因：electron 二进制默认从 GitHub releases 拉，国内网络超时。
- 结论：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install --registry=https://registry.npmmirror.com`。git push 遇代理 502 时清空 *_proxy 环境变量直连 GitHub 可救急。
