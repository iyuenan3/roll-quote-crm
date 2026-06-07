import { contextBridge } from 'electron';

// 预留：Phase 2 通过 contextBridge 暴露 DB / 打印等主进程能力。
contextBridge.exposeInMainWorld('appInfo', {
  name: '报价送货系统',
  version: '0.0.0',
});
