import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,   // share login state sequentially per suite
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,             // avoid race conditions on shared test accounts
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/playwright-report' }]],
  use: {
    baseURL: process.env.PW_BASE_URL || 'https://moooza.ru',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Needed for Russian locale and realistic mobile viewport
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 390, height: 844 },  // iPhone 14 — primary target
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
