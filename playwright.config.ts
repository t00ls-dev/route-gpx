import { defineConfig } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // Two workers per process, locally and in each CI shard (see ci.yml): the
  // suite runs in about half the time and tests must stay independent.
  workers: 2,
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
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      // A production build for the service worker tests (offline.spec.ts),
      // which the development server does not register. Built fresh every
      // run into an ignored folder, so it always matches the checkout.
      command:
        'npx vite build --outDir .preview-test.local --emptyOutDir && npx vite preview --outDir .preview-test.local --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
