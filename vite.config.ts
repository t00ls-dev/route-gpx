import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: '/route-gpx/',
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
