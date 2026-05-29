import { test, expect } from '@playwright/test';
import { createTestUser, loginUI } from './helpers';

// ─── Dismiss cookie consent banner on every page load ───────────────────────
// CookieConsent checks localStorage.mooza_cookie_consent; if set, banner is hidden.
// Without this, the fixed bottom banner intercepts all pointer events.
test.use({
  storageState: undefined,
});

async function dismissCookies(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mooza_cookie_consent', 'necessary');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Landing page', () => {
  test('shows "Войти" and/or "Зарегистрироваться" for unauthenticated visitor', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/');
    // Wait for React to hydrate and site-settings to load
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    const loginBtn = page.getByRole('button', { name: /^войти$/i });
    const registerBtn = page.getByRole('button', { name: /зарегистрироваться/i }).first();

    const loginVisible = await loginBtn.isVisible().catch(() => false);
    const registerVisible = await registerBtn.isVisible().catch(() => false);

    expect(loginVisible || registerVisible).toBeTruthy();
  });

  test('clicking "Войти" navigates to /login', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);

    const loginBtn = page.getByRole('button', { name: /^войти$/i });
    const visible = await loginBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'loginEnabled=false — Войти button not rendered');
      return;
    }
    await loginBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test('clicking "Зарегистрироваться" navigates to /register', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);

    // First "Зарегистрироваться" button is in the hero section
    const regBtn = page.getByRole('button', { name: /зарегистрироваться/i }).first();
    const visible = await regBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'registrationEnabled=false — Зарегистрироваться button not rendered');
      return;
    }
    await regBtn.click();
    await expect(page).toHaveURL(/\/register/, { timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Login page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/login');
    await page.waitForSelector('form', { timeout: 10000 });
  });

  test('form has email field, password field, and submit button', async ({ page }) => {
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^войти$/i })).toBeVisible();
  });

  test('submit button is disabled until user agrees to terms', async ({ page }) => {
    // The button is disabled while agreed=false (new user without termsAgreed in localStorage)
    const submitBtn = page.getByRole('button', { name: /^войти$/i });
    // Button disabled check — either HTML disabled attr or the handler blocks
    const disabled = await submitBtn.isDisabled();
    expect(disabled).toBeTruthy();
  });

  test('wrong credentials show error message after agreeing to terms', async ({ page }) => {
    test.setTimeout(30000);
    // Agree to terms first (the amber button)
    const agreeBtn = page.locator('button').filter({ hasText: /ознакомился/i });
    const agreeBtnVisible = await agreeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (agreeBtnVisible) {
      await agreeBtn.click();
      await page.waitForTimeout(400);
    }

    await page.locator('input[type="email"]').first().fill('nobody_xyz_999@moooza.test');
    await page.locator('input[type="password"]').first().fill('wrongpass123');
    await page.getByRole('button', { name: /^войти$/i }).click();

    // Error div has class including "red"
    const errEl = page.locator('[class*="red-"]').filter({ hasText: /.+/ }).first();
    await expect(errEl).toBeVisible({ timeout: 10000 });
  });

  test('"Забыли пароль?" link navigates to /forgot-password', async ({ page }) => {
    const link = page.getByRole('link', { name: /забыли пароль/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password/, { timeout: 8000 });
  });

  test('"Зарегистрироваться" link navigates to /register', async ({ page }) => {
    const link = page.getByRole('link', { name: /зарегистрироваться/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/register/, { timeout: 8000 });
  });

  test('successful login redirects away from /login', async ({ page }) => {
    test.setTimeout(40000);
    const user = await createTestUser('login');
    // loginUI does goto /login itself and also sets termsAgreed=1 via localStorage
    // We already have dismissCookies set. loginUI will also check for the checkbox.
    await loginUI(page, user.email, user.password);
    expect(page.url()).not.toContain('/login');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Register page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/register');
    await page.waitForTimeout(800);
  });

  test('step 0: email and password fields are visible', async ({ page }) => {
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('step 0: "Далее" is disabled without PD consent checkbox', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /далее/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    const disabled = await nextBtn.isDisabled();
    expect(disabled).toBeTruthy();
  });

  test('step 0: filling valid data and agreeing to PD enables "Далее"', async ({ page }) => {
    const uniqueEmail = `pw_reg_${Date.now()}@moooza.test`;

    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill('Password123!');

    // The PD checkbox is a custom div that toggles when clicked.
    // It's the first div.rounded-md.border-2 child inside the first label
    const pdCheckboxDiv = page.locator('label').first().locator('div.rounded-md').first();
    await pdCheckboxDiv.click();
    await page.waitForTimeout(300);

    const nextBtn = page.getByRole('button', { name: /далее/i });
    const disabled = await nextBtn.isDisabled();
    expect(disabled).toBeFalsy();
  });

  test('step 0 → step 1: valid data transitions to name/birthdate form', async ({ page }) => {
    test.setTimeout(30000);
    const uniqueEmail = `pw_reg2_${Date.now()}@moooza.test`;

    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill('Password123!');

    // Click the PD agreement checkbox div
    const pdCheckboxDiv = page.locator('label').first().locator('div.rounded-md').first();
    await pdCheckboxDiv.click();
    await page.waitForTimeout(300);

    const nextBtn = page.getByRole('button', { name: /далее/i });
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Step 1 shows firstName placeholder "Иван"
    const firstNameInput = page.locator('input[placeholder="Иван"]');
    await expect(firstNameInput).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Onboarding page', () => {
  test('unauthenticated user cannot stay on /onboarding (redirected or landing shown)', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/onboarding');
    await page.waitForTimeout(2000);

    // When no token, App renders LandingPage for /* routes.
    // /onboarding is not in the unauthenticated route list so it redirects to /
    // which renders LandingPage
    const url = page.url();
    // Should be / (LandingPage) not /onboarding
    expect(url).not.toMatch(/\/onboarding/);
  });

  test('authenticated user sees onboarding slides with dots and "Далее"', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb1');
    // loginUI navigates to /login, fills form, clicks submit
    // The page will redirect to /onboarding for new users (no onboardingCompletedAt)
    await loginUI(page, user.email, user.password);

    // Ensure we're on onboarding (or navigate there)
    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
      await page.waitForTimeout(1000);
    }

    // Dots: small round buttons in the flex gap-1.5 container
    const dotsContainer = page.locator('.flex.gap-1\\.5').first();
    await expect(dotsContainer).toBeVisible({ timeout: 5000 });

    const dots = dotsContainer.locator('button');
    expect(await dots.count()).toBeGreaterThan(0);

    // "Далее" button
    await expect(page.getByRole('button', { name: /далее/i })).toBeVisible({ timeout: 5000 });
  });

  test('"Далее" advances to next slide', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb2');
    await loginUI(page, user.email, user.password);

    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
      await page.waitForTimeout(1000);
    }

    // Read current slide title
    const slideTitle = page.locator('h1').first();
    const titleBefore = await slideTitle.textContent();

    await page.getByRole('button', { name: /далее/i }).click();
    await page.waitForTimeout(500);

    const titleAfter = await slideTitle.textContent();
    // Title should have changed to next slide
    expect(titleAfter).not.toBe(titleBefore);
  });

  test('"Пропустить" button redirects to /', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb3');
    await loginUI(page, user.email, user.password);

    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
      await page.waitForTimeout(1000);
    }

    const skipBtn = page.getByRole('button', { name: /пропустить/i });
    await expect(skipBtn).toBeVisible({ timeout: 5000 });
    await skipBtn.click();

    await page.waitForURL('/', { timeout: 8000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test('last slide has terms checkbox; "Начать работу" disabled without it', async ({ page }) => {
    test.setTimeout(60000);
    await dismissCookies(page);
    const user = await createTestUser('onb4');
    await loginUI(page, user.email, user.password);

    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
      await page.waitForTimeout(1000);
    }

    // Navigate to last slide (8 slides, index 0-7, need 7 clicks of "Далее")
    for (let i = 0; i < 7; i++) {
      const nextBtn = page.getByRole('button', { name: /далее/i });
      const visible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;
      await nextBtn.click();
      await page.waitForTimeout(350);
    }

    // On the last slide: checkbox visible
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });

    // "Начать работу" button — disabled (opacity-40 applied via class when not checked)
    const startBtn = page.getByRole('button', { name: /начать работу/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });

    // disabled attribute OR opacity-40 class
    const isDisabled = await startBtn.isDisabled();
    const cls = await startBtn.getAttribute('class') || '';
    expect(isDisabled || cls.includes('opacity-40')).toBeTruthy();
  });

  test('checking terms checkbox enables "Начать работу"', async ({ page }) => {
    test.setTimeout(60000);
    await dismissCookies(page);
    const user = await createTestUser('onb5');
    await loginUI(page, user.email, user.password);

    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
      await page.waitForTimeout(1000);
    }

    // Navigate to last slide
    for (let i = 0; i < 7; i++) {
      const nextBtn = page.getByRole('button', { name: /далее/i });
      const visible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;
      await nextBtn.click();
      await page.waitForTimeout(350);
    }

    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.check();
    await page.waitForTimeout(300);

    // Now "Начать работу" should be enabled (no opacity-40 class)
    const startBtn = page.getByRole('button', { name: /начать работу/i });
    const isDisabled = await startBtn.isDisabled();
    const cls = await startBtn.getAttribute('class') || '';
    expect(isDisabled || cls.includes('opacity-40')).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forgot password page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Forgot password page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/forgot-password');
    await page.waitForTimeout(500);
  });

  test('form with email field and send button is present', async ({ page }) => {
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /отправить/i })).toBeVisible({ timeout: 5000 });
  });

  test('"Отправить" with empty email shows validation error', async ({ page }) => {
    // The ForgotPasswordPage has client-side validation: empty/invalid email → setError
    const sendBtn = page.getByRole('button', { name: /отправить/i });
    await sendBtn.click();
    await page.waitForTimeout(500);

    // Should show error message
    const errEl = page.locator('[class*="red-"]').filter({ hasText: /.+/ }).first();
    await expect(errEl).toBeVisible({ timeout: 5000 });

    // Still on email stage (email input still visible)
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test('submitting valid email transitions to code-entry stage', async ({ page }) => {
    test.setTimeout(30000);
    const user = await createTestUser('forgot');

    await page.locator('input[type="email"]').first().fill(user.email);
    await page.getByRole('button', { name: /отправить/i }).click();

    // Wait for API response and stage transition
    // Stage 'code' shows "Введите код" heading and a numeric input
    await page.waitForTimeout(5000);

    const codeInput = page.locator('input[inputmode="numeric"]');
    const codeHeading = page.locator('h1').filter({ hasText: /введите код/i });

    const inputVisible = await codeInput.isVisible().catch(() => false);
    const headingVisible = await codeHeading.isVisible().catch(() => false);

    expect(inputVisible || headingVisible).toBeTruthy();
  });
});
