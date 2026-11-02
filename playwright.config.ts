import { defineConfig } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { browserName: 'chromium', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/route-gpx/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
