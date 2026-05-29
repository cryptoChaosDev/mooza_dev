import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/playwright-report' }]],
  use: {
    baseURL: process.env.PW_BASE_URL || 'https://moooza.ru',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // ── Android (Chrome / Pixel 5) ────────────────────────────────────────────
    {
      name: 'android-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    // ── iOS (Safari / WebKit — iPhone 15 Pro) ─────────────────────────────────
    // WebKit emulates iOS Safari behaviour: safe-area-inset, rubber-band scroll,
    // no beforeinstallprompt, standalone navigator.standalone, webkit-overflow-scrolling.
    {
      name: 'ios-safari',
      use: {
        ...devices['iPhone 15 Pro'],
        // viewport-fit=cover is the key iOS PWA setting — WebKit respects it
        viewport: { width: 393, height: 852 },
      },
    },
    // ── Desktop Chrome (optional, for admin/wide-layout checks) ───────────────
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
