import { defineConfig } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // One worker per process; CI scales through shards (see ci.yml).
  workers: 1,
  // CI shards write blob reports that the merge-reports job combines.
  reporter: process.env.CI ? 'blob' : 'list',
  use: {
    browserName: 'chromium',
    launchOptions: { args: ['--no-sandbox'] },
    // Fixtures use UTC times; keep results independent of the machine's time zone.
    timezoneId: 'UTC',
    // English without a country: Automatic units resolve to km and °C (from
    // the UTC zone), while the initial map view still follows "en".
    locale: 'en-150',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
