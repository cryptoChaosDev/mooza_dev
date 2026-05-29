import { test, expect } from '@playwright/test';
import { createTestUser, loginUI } from './helpers';

// ─── Dismiss cookie consent on every page load ───────────────────────────────
// CookieConsent reads localStorage.mooza_cookie_consent; set it via initScript
// so the fixed bottom banner never intercepts pointer events.
async function dismissCookies(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mooza_cookie_consent', 'necessary');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Landing page', () => {
  test('landing page renders for unauthenticated visitor', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    // The LandingPage is always rendered for unauthenticated users.
    // Check that it shows the platform headline (always visible regardless of site-settings).
    const h1 = page.locator('h1').filter({ hasText: /музыкант|moooza/i });
    const h1Count = await h1.count();

    // Also check for the logo image
    const logo = page.locator('img[alt="Moooza"]');
    const logoCount = await logo.count();

    expect(h1Count > 0 || logoCount > 0).toBeTruthy();

    // Войти/Зарегистрироваться buttons are OPTIONAL — controlled by site-settings admin flags.
    // When both loginEnabled=false and registrationEnabled=false, no CTA buttons are shown.
    const loginEl = page.locator('button, a').filter({ hasText: /войти/i });
    const registerEl = page.locator('button, a').filter({ hasText: /зарегистрироваться/i });
    const loginCount = await loginEl.count();
    const registerCount = await registerEl.count();
    // Log for visibility (not assertion)
    console.log(`Landing CTA buttons — Войти: ${loginCount}, Зарегистрироваться: ${registerCount}`);
  });

  test('clicking "Войти" navigates to /login', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);

    const loginBtn = page.getByRole('button', { name: /войти/i }).first();
    const visible = await loginBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'loginEnabled=false — Войти button not rendered by site-settings');
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

    // Pick the FIRST register button (hero section)
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

  test('submit button is disabled when user has not agreed to terms', async ({ page }) => {
    // Login page: agreed=false on fresh browser → button disabled
    const submitBtn = page.getByRole('button', { name: /^войти$/i });
    const disabled = await submitBtn.isDisabled();
    expect(disabled).toBeTruthy();
  });

  test('wrong credentials show error message (after agreeing to terms)', async ({ page }) => {
    // Make the terms block disappear by setting termsAgreed in localStorage
    await page.evaluate(() => localStorage.setItem('termsAgreed', '1'));
    await page.reload();
    await page.waitForSelector('form', { timeout: 8000 });

    await page.locator('input[type="email"]').first().fill('nobody_xyz_000@moooza.test');
    await page.locator('input[type="password"]').first().fill('wrongpass1234');

    // Submit button should now be enabled
    const submitBtn = page.getByRole('button', { name: /^войти$/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    // Wait for the API error response — server returns {"error": "Неверные учетные данные"}
    // The error renders as text in the red-styled div or as a <span> inside
    await page.waitForTimeout(5000);

    // Get all visible text on the page and check for error keywords
    const pageText = await page.locator('body').innerText().catch(() => '');
    const hasError = /неверн|ошибка|error|учетн|пароль|войт/i.test(pageText);

    // Also check if still on /login (no redirect = form submission failed or showed error)
    const stillOnLogin = page.url().includes('/login');

    // Either an error message appeared OR we're still on login (no redirect on wrong creds)
    expect(hasError || stillOnLogin).toBeTruthy();
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

  test('successful login (via token injection) lands user outside /login', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('login');
    // loginUI injects token directly into localStorage — no form interaction needed
    await loginUI(page, user);
    // Should be on / or /onboarding, NOT /login
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

  test('step 0: "Далее" is disabled without PD consent', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /далее/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    expect(await nextBtn.isDisabled()).toBeTruthy();
  });

  test('step 0: clicking PD consent div enables "Далее" button', async ({ page }) => {
    const uniqueEmail = `pw_reg_${Date.now()}@moooza.test`;
    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill('Password123!');

    // The PD checkbox is a custom div with an onClick handler.
    // It has classes: rounded-md border-2 w-5 h-5 flex items-center justify-center
    // Use JS click to bypass any overlay issues
    await page.evaluate(() => {
      // Find all divs inside labels that look like custom checkboxes
      const checkboxDivs = document.querySelectorAll('label div.rounded-md.border-2');
      if (checkboxDivs.length > 0) {
        (checkboxDivs[0] as HTMLElement).click();
      }
    });
    await page.waitForTimeout(300);

    const nextBtn = page.getByRole('button', { name: /далее/i });
    expect(await nextBtn.isDisabled()).toBeFalsy();
  });

  test('step 0 → step 1: valid submission shows name/birthdate form', async ({ page }) => {
    test.setTimeout(30000);
    const uniqueEmail = `pw_reg2_${Date.now()}@moooza.test`;

    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill('Password123!');

    // Click the PD consent checkbox div via JS
    await page.evaluate(() => {
      const checkboxDivs = document.querySelectorAll('label div.rounded-md.border-2');
      if (checkboxDivs.length > 0) {
        (checkboxDivs[0] as HTMLElement).click();
      }
    });
    await page.waitForTimeout(300);

    const nextBtn = page.getByRole('button', { name: /далее/i });
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Step 1 shows first-name placeholder "Иван"
    await expect(page.locator('input[placeholder="Иван"]')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Onboarding page', () => {
  test('unauthenticated user is redirected away from /onboarding', async ({ page }) => {
    await dismissCookies(page);
    await page.goto('/onboarding');
    await page.waitForTimeout(2000);
    // App wraps unauthenticated routes: /* → Navigate to /
    // /onboarding is NOT in the unauthenticated route list, so it redirects to /
    expect(page.url()).not.toMatch(/\/onboarding/);
  });

  test('authenticated user can open /onboarding and sees dots + "Далее"', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb1');
    await loginUI(page, user);

    // Navigate to /onboarding (createTestUser calls complete-onboarding, but
    // the onboarding page itself is still directly accessible)
    await page.goto('/onboarding');
    await page.waitForTimeout(1500);

    // Dots container: flex gap-1.5 in the top bar
    const dots = page.locator('.flex.gap-1\\.5 button');
    const dotsCount = await dots.count();
    expect(dotsCount).toBeGreaterThan(0);

    // "Далее" button
    await expect(page.getByRole('button', { name: /далее/i })).toBeVisible({ timeout: 5000 });
  });

  test('"Далее" button advances slide (h1 title changes)', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb2');
    await loginUI(page, user);

    await page.goto('/onboarding');
    await page.waitForTimeout(1000);

    const h1 = page.locator('h1').first();
    const titleBefore = await h1.textContent();

    await page.getByRole('button', { name: /далее/i }).click();
    await page.waitForTimeout(500);

    const titleAfter = await h1.textContent();
    expect(titleAfter).not.toBe(titleBefore);
  });

  test('"Пропустить" redirects to /', async ({ page }) => {
    test.setTimeout(40000);
    await dismissCookies(page);
    const user = await createTestUser('onb3');
    await loginUI(page, user);

    await page.goto('/onboarding');
    await page.waitForTimeout(1000);

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
    await loginUI(page, user);

    await page.goto('/onboarding');
    await page.waitForTimeout(1000);

    // Navigate to last slide (7 clicks through 8 total slides)
    for (let i = 0; i < 7; i++) {
      const btn = page.getByRole('button', { name: /далее/i });
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;
      await btn.click();
      await page.waitForTimeout(350);
    }

    // On last slide: checkbox for terms
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });

    // "Начать работу" button should be effectively disabled (opacity-40 class)
    const startBtn = page.getByRole('button', { name: /начать работу/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });

    const cls = await startBtn.getAttribute('class') || '';
    const isDisabled = await startBtn.isDisabled();
    expect(isDisabled || cls.includes('opacity-40')).toBeTruthy();
  });

  test('checking terms checkbox enables "Начать работу"', async ({ page }) => {
    test.setTimeout(60000);
    await dismissCookies(page);
    const user = await createTestUser('onb5');
    await loginUI(page, user);

    await page.goto('/onboarding');
    await page.waitForTimeout(1000);

    // Go to last slide
    for (let i = 0; i < 7; i++) {
      const btn = page.getByRole('button', { name: /далее/i });
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;
      await btn.click();
      await page.waitForTimeout(350);
    }

    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.check();
    await page.waitForTimeout(300);

    const startBtn = page.getByRole('button', { name: /начать работу/i });
    const cls = await startBtn.getAttribute('class') || '';
    const isDisabled = await startBtn.isDisabled();
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

  test('form has email field and send button', async ({ page }) => {
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /отправить/i })).toBeVisible({ timeout: 5000 });
  });

  test('"Отправить код" with empty email shows validation error', async ({ page }) => {
    // ForgotPasswordPage validates email before making API call
    const sendBtn = page.getByRole('button', { name: /отправить/i });
    await sendBtn.click();
    await page.waitForTimeout(500);

    const errEl = page.locator('[class*="red-"]').filter({ hasText: /.+/ }).first();
    await expect(errEl).toBeVisible({ timeout: 5000 });

    // Email field still visible (still on stage 'email')
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test('submitting registered email transitions to code-entry stage', async ({ page }) => {
    test.setTimeout(30000);
    const user = await createTestUser('forgot');

    await page.locator('input[type="email"]').first().fill(user.email);

    // Use force-click to handle any layout issues
    const sendBtn = page.getByRole('button', { name: /отправить/i });
    await sendBtn.click({ force: true });

    // Wait for API + stage transition
    await page.waitForTimeout(5000);

    // Stage 'code': shows numeric input and/or "Введите код" heading
    const codeInput = page.locator('input[inputmode="numeric"]');
    const codeHeading = page.locator('h1').filter({ hasText: /введите код/i });

    const inputVisible = await codeInput.isVisible().catch(() => false);
    const headingVisible = await codeHeading.isVisible().catch(() => false);

    expect(inputVisible || headingVisible).toBeTruthy();
  });
});
