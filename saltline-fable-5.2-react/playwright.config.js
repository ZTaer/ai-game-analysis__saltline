import { defineConfig } from '@playwright/test';

// Both servers are explicit so the untouched HTML remains the regression oracle.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'node scripts/serve-original.mjs',
      url: 'http://127.0.0.1:8731',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
  },
});
