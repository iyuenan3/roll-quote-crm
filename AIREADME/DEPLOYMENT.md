# DEPLOYMENT · roll-quote-crm

⚑ 占位：未打包。

本地桌面单机应用，无服务器、无域名、无远程部署。

计划：electron-builder 构建 Windows 安装包（NSIS），经 GitHub Actions Windows runner 云端产出（开发机为 M 芯片 Mac，不做本地交叉编译），用户双击安装即用，数据存本地 SQLite 单文件。better-sqlite3 为原生模块，打包前需 electron-rebuild。

打包后回填：
- 构建命令、安装包产物路径。
- 本地数据文件位置。
- 备份 / 导出方式。

遵循立项最小骨架原则：打包 / 部署脚本部署现场再补，不预写。

运维约束（计划）：数据为本地单文件，易丢。内置自动备份 + 一键导出，提示用户定期把导出文件存网盘。
