import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { TZ: 'Asia/Jerusalem' },
    include: ['js/**/*.test.js', '*.test.js'],
    exclude: ['node_modules/**', 'e2e/**'],
  },
});
