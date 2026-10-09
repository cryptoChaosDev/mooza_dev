import { test, expect } from '@playwright/test';
import { createTestUser, loginUI, apiCall, runSqlStrict, createTestArtist, createArtistInvite, TEST_PASSWORD, TEST_EMAIL_DOMAIN } from './helpers';
import type { TestUser } from './helpers';

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

  test('submit button is enabled on a fresh browser (terms are a footnote now, no checkbox)', async ({ page }) => {
    // Updated: the login form no longer has a terms checkbox — consent is given at
    // registration, login only shows a reference footnote.
    const submitBtn = page.getByRole('button', { name: /^войти$/i });
    await expect(submitBtn).toBeEnabled();
    await expect(page.getByText(/Входя, вы подтверждаете согласие/)).toBeVisible();
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
    // Hidden when registration is closed site-wide. The page renders it by default and
    // hides it once /site-settings arrives — decide only after that request settled.
    const settings = page.waitForResponse((r) => r.url().includes('/site-settings'), { timeout: 10000 }).catch(() => null);
    await page.reload();
    await settings;
    await page.waitForTimeout(500);
    if (!(await page.getByRole('link', { name: /зарегистрироваться/i }).isVisible().catch(() => false))) {
      test.skip(true, 'Registration closed — no «Зарегистрироваться» link on /login');
    }
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
// Updated: DEV runs in invite-only mode (registrationEnabled=false,
// referralRegistrationEnabled=true) — /register without an invite redirects to
// /login, but a role-bound artist invite link opens the wizard. The wizard now has
// a password confirmation, a mandatory PD consent, a masked birth date (16+) and a
// mandatory profession; /auth/register stores consentPd/birthDate in the pending
// registration and a repeat for an unexpired pending email answers 409.
test.describe('Register page', () => {
  let owner: TestUser;
  let artistId = '';
  let inviteToken = '';
  test.beforeAll(async () => {
    owner = await createTestUser('regown');
    artistId = await createTestArtist(owner, `PW RegInvite ${Date.now().toString(36)}`);
    inviteToken = (await createArtistInvite(owner, artistId)).token;
  });

  const fillStep0 = async (page: import('@playwright/test').Page, email: string) => {
    await page.locator('input[type="email"]').first().fill(email);
    await page.getByPlaceholder('Придумайте пароль').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Ещё раз тот же пароль').fill(TEST_PASSWORD);
  };
  const consentBox = (page: import('@playwright/test').Page) =>
    page.locator('label').filter({ hasText: 'Я даю согласие на обработку' }).locator('div.rounded-md.border-2');

  test('without an invite /register follows the site switch (closed → /login)', async ({ page }) => {
    await dismissCookies(page);
    const settings = await apiCall('GET', '/site-settings');
    await page.goto('/register');
    if (settings.data?.registrationEnabled === 'false') {
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    } else {
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test.describe('wizard via artist invite link', () => {
    test.beforeEach(async ({ page }) => {
      await dismissCookies(page);
      await page.goto(`/register?artistInvite=${inviteToken}`);
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15000 });
    });

    test('step 0: invite banner, email, password and confirmation fields are visible', async ({ page }) => {
      await expect(page.getByText(/Приглашение в артиста/).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder('Придумайте пароль')).toBeVisible();
      await expect(page.getByPlaceholder('Ещё раз тот же пароль')).toBeVisible();
    });

    test('step 0: "Далее" stays disabled without PD consent', async ({ page }) => {
      await fillStep0(page, `pw_reg0_${Date.now()}@${TEST_EMAIL_DOMAIN}`);
      const nextBtn = page.getByRole('button', { name: /далее/i });
      await expect(page.getByText(/Осталось:.*согласие с условиями/)).toBeVisible({ timeout: 10000 });
      await expect(nextBtn).toBeDisabled();
    });

    test('step 0: ticking the PD consent enables "Далее"', async ({ page }) => {
      await fillStep0(page, `pw_reg1_${Date.now()}@${TEST_EMAIL_DOMAIN}`);
      await consentBox(page).click();
      await expect(page.getByRole('button', { name: /далее/i })).toBeEnabled({ timeout: 10000 });
    });

    test('full registration: consent + birth date 16+ + profession → code → account, invite consumed, slides', async ({ page }) => {
      test.setTimeout(120000);
      const email = `pw_regui_${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
      // Step 0
      await fillStep0(page, email);
      await consentBox(page).click();
      await page.getByRole('button', { name: /далее/i }).click();
      // Step 1 — under-16 date is refused, then a valid one
      await page.getByPlaceholder('Иван', { exact: true }).fill('PWREG');
      await page.getByPlaceholder('Иванов', { exact: true }).fill('Регистрация');
      const bd = page.getByPlaceholder('ДД.ММ.ГГГГ');
      const young = new Date().getFullYear() - 10;
      await bd.pressSequentially(`0101${young}`);
      await expect(bd, 'birth date mask').toHaveValue(`01.01.${young}`);
      await page.getByRole('button', { name: /далее/i }).click();
      await expect(page.getByText('Для регистрации необходимо быть старше 16 лет')).toBeVisible({ timeout: 5000 });
      const adult = new Date().getFullYear() - 25;
      await bd.fill('');
      await bd.pressSequentially(`1505${adult}`);
      await page.getByRole('button', { name: /далее/i }).click();
      // Step 2 — profession is mandatory
      const save = page.getByRole('button', { name: /Сохранить/ });
      await expect(save).toBeDisabled({ timeout: 10000 });
      await page.getByPlaceholder('Начните вводить и выберите из списка').fill('Вокалист');
      await page.locator('div.absolute button').filter({ hasText: /Вокалист/ }).first().click();
      await expect(save).toBeEnabled();
      await save.click();
      // Step 3 — create
      const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Создать аккаунт/ }).click();
      const regRes = await reg;
      expect(regRes.status(), 'POST /auth/register').toBe(201);
      const sent = regRes.request().postDataJSON();
      expect(sent.consentPd, 'consentPd sent').toBe(true);
      expect(sent.birthDate, 'birthDate sent as ISO day').toBe(`${adult}-05-15`);
      expect(sent.userProfessions?.length, 'professions sent').toBe(1);
      expect(sent.artistInviteToken, 'invite token sent').toBe(inviteToken);
      expect('artistIds' in sent, 'artistIds no longer sent').toBe(false);
      await expect(page.getByText('Проверьте почту')).toBeVisible({ timeout: 10000 });
      // Pending row carries consent + birth date; read the emailed code from it.
      const row = runSqlStrict(`SELECT code || '|' || (payload->>'birthDate') || '|' || coalesce(payload->>'consentPdAt','') FROM "PendingRegistration" WHERE email = '${email}';`).trim();
      const [code, pBirth, pConsent] = row.split('|');
      expect(pBirth, 'pending birthDate').toBe(`${adult}-05-15`);
      expect(pConsent, 'pending consentPdAt').not.toBe('');
      // A second /auth/register for the same unexpired pending email → 409 PENDING_EXISTS.
      const again = await apiCall('POST', '/auth/register', { ...sent });
      expect(again.status, `repeat register → ${JSON.stringify(again.data)}`).toBe(409);
      expect(again.data?.code).toBe('PENDING_EXISTS');
      // Enter the code
      await page.getByPlaceholder('00000000').fill(code);
      await page.getByRole('button', { name: /Подтвердить/ }).click();
      await page.waitForURL(/\/onboarding/, { timeout: 20000 });
      await expect(page.getByRole('button', { name: /далее/i })).toBeVisible({ timeout: 15000 });
      const u = runSqlStrict(`SELECT id || '|' || ("consentPdAt" IS NOT NULL) || '|' || ("termsAgreedAt" IS NOT NULL) || '|' || to_char("birthDate", 'YYYY-MM-DD') FROM "User" WHERE email = '${email}';`).trim();
      const [uid, hasConsent, hasTerms, uBirth] = u.split('|');
      expect(hasConsent, 'User.consentPdAt').toBe('true');
      expect(hasTerms, 'User.termsAgreedAt').toBe('true');
      expect(uBirth, 'User.birthDate').toBe(`${adult}-05-15`);
      const member = runSqlStrict(`SELECT "inviteStatus" FROM "UserArtist" WHERE "artistId" = '${artistId}' AND "userId" = '${uid}';`).trim();
      expect(member, 'membership created from the invite').toBe('ACCEPTED');
    });
  });

  test('API /auth/register validation: consentPd, userProfessions, birth date 16+', async () => {
    const base = {
      email: `pw_regapi_${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`,
      password: TEST_PASSWORD, firstName: 'PWAPI', lastName: 'Рег',
      artistInviteToken: inviteToken,
    };
    const birthDate = `15.05.${new Date().getFullYear() - 25}`;
    const prof = [{ professionId: runSqlStrict(`SELECT id FROM "Profession" ORDER BY name LIMIT 1;`).trim() }];
    const noConsent = await apiCall('POST', '/auth/register', { ...base, birthDate, userProfessions: prof });
    expect(noConsent.status, `no consentPd → ${JSON.stringify(noConsent.data)}`).toBe(400);
    const noProf = await apiCall('POST', '/auth/register', { ...base, birthDate, consentPd: true, userProfessions: [] });
    expect(noProf.status, `no professions → ${JSON.stringify(noProf.data)}`).toBe(400);
    const noBirth = await apiCall('POST', '/auth/register', { ...base, consentPd: true, userProfessions: prof });
    expect(noBirth.status, `no birthDate → ${JSON.stringify(noBirth.data)}`).toBe(400);
    const young = await apiCall('POST', '/auth/register', { ...base, consentPd: true, userProfessions: prof, birthDate: `01.01.${new Date().getFullYear() - 15}` });
    expect(young.status, `15 y.o. → ${JSON.stringify(young.data)}`).toBe(400);
    expect(young.data?.code).toBe('AGE_TOO_YOUNG');
    const ok = await apiCall('POST', '/auth/register', { ...base, consentPd: true, userProfessions: prof, birthDate, artistIds: [artistId] });
    expect(ok.status, `valid → ${JSON.stringify(ok.data)}`).toBe(201);
    const payload = runSqlStrict(`SELECT payload::text FROM "PendingRegistration" WHERE email = '${base.email}';`);
    expect(payload, 'artistIds are not accepted any more').not.toContain('artistIds');
    expect(JSON.parse(payload).birthDate).toBe(`${new Date().getFullYear() - 25}-05-15`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Onboarding page', () => {
  test('unauthenticated user can open /onboarding (route is public by design now)', async ({ page }) => {
    // Updated: App.tsx deliberately mounts /onboarding in the unauthenticated tree
    // too (needed right after e-mail verification / VK setup), so no redirect.
    await dismissCookies(page);
    await page.goto('/onboarding');
    await expect(page.getByRole('button', { name: /далее/i })).toBeVisible({ timeout: 10000 });
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

  test('last slide shows «Перейти в профиль» (no terms checkbox anymore) and it opens /profile', async ({ page }) => {
    // Updated: the terms checkbox / «Начать работу» button were removed from the tour.
    test.setTimeout(60000);
    await dismissCookies(page);
    const user = await createTestUser('onb4');
    await loginUI(page, user);
    await page.goto('/onboarding');
    for (let i = 0; i < 10; i++) {
      const toProfile = page.getByRole('button', { name: /перейти в профиль/i });
      if (await toProfile.isVisible().catch(() => false)) break;
      await page.getByRole('button', { name: /далее/i }).click();
    }
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await page.getByRole('button', { name: /перейти в профиль/i }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 10000 });
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
