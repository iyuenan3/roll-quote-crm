# ROADMAP · roll-quote-crm

## Now（立项 + 核心可测）
- 立项骨架 + AIREADME + git init。
- 计价引擎 + 中文大写金额（纯函数 + 单测）。
- 模板解析器（纯函数 + 单测）。

## Next（业务 UI + 出单）
- 公司信息 / 客户 / 产品 / 报价 管理页。
- 新建订单：粘贴 → 解析预览 → 改价改量 → 保存。
- 订单历史（查看 / 重打 / 作废）。
- 送货单视图 + window.print / 存 PDF。
- 客户 / 产品 × 月 统计。

## Later
- 数据自动备份 + 一键导出。
- Electron Windows 安装包交付（electron-builder + GitHub Actions）。
- 别名表 / 模糊匹配增强（视实际乱填程度）。
- AI 兜底解析（若固定模板覆盖不住）。

## 搁置（+ 原因）
- 针式预印三联单对齐：放弃，成本高、维护重，空白纸整打已满足（DECISIONS D2）。
- Excel 批量导入：规格数据不多，手录够，暂不做。
