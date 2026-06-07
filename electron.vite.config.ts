import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// 三进程默认约定：main=src/main/index.ts，preload=src/preload/index.ts，renderer=src/renderer。
// externalizeDepsPlugin：把 dependencies（含原生模块 better-sqlite3）排除出 main/preload bundle，
// 运行时 require，由 electron-rebuild 按 Electron ABI 重建。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
