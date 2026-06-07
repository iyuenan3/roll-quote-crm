import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// 三进程默认约定：main=src/main/index.ts，preload=src/preload/index.ts，renderer=src/renderer。
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
  },
});
