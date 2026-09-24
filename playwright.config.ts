import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'https://whisper360.io',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      // Login/logout/invalid-credentials flows — always start unauthenticated.
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
    },
    {
      // Signs in once and saves storage state for every other spec to reuse.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'authenticated',
      testMatch: /(inbox|email|dashboard|agent-creation)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      // Team Inbox perf diagnostics. trace: 'on' (vs. the suite-wide retain-on-failure)
      // captures a full action-by-action network waterfall on every run, not just
      // failures, since these tests exist to look at timing, not to catch regressions.
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json', trace: 'on' },
      dependencies: ['setup'],
    },
  ],
});
