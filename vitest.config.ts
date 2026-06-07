import { defineConfig } from 'vitest/config';

// 仅测核心纯函数（src/core）。与 electron.vite.config.ts 互不干扰。
export default defineConfig({
  test: {
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
  },
});
