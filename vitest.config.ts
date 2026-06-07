import { defineConfig } from 'vitest/config';

// 测核心纯函数（src/core）与数据层（src/db）。与 electron.vite.config.ts 互不干扰。
export default defineConfig({
  test: {
    include: ['src/core/**/*.test.ts', 'src/db/**/*.test.ts'],
    environment: 'node',
  },
});
