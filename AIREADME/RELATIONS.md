# RELATIONS · roll-quote-crm

## 出向依赖（我用谁）
无。完全独立的本地单机应用，不依赖任何其它项目或远程服务。

## 入向（谁用我）
无。不被其它项目读取或集成。

## 共享底座
无。本地 SQLite 单文件，不共享任何 Caddy / 域名 / 公共库 / 平台服务。

> 与 worklog 的关系：worklog 仅作为活动日记 / 项目追踪记录本项目进展（wiki/projects/juancai-crm.md），不构成代码或运行时依赖。
