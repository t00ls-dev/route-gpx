import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: { input: { main: 'index.html', help: 'help.html' } },
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
