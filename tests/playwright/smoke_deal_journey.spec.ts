/**
 * End-to-end smoke of the main user journey, run on every device project:
 *   login (UI form) → onboarding tour → profile → add profession → find executor
 *   in the catalog → write in chat → publish an order → deal: create → accept →
 *   pay → submit → approve → review.
 *
 * Bob (customer) is driven through the UI. Alice (executor) is the "second side"
 * and acts through the API. Deal *creation* goes through the API because the
 * client hides every «Оформить сделку» entry point (client/src/lib/features.ts:
 * DEALS_ENABLED = false); the deal page itself (status actions, review) is live.
 *
 * Every step is soft: a failing step is recorded (with a screenshot) and the
 * journey continues where possible. Per-step results, console errors, page
 * errors, failed /api requests and horizontal-overflow findings are written to
 * test-results/smoke/<project>.json. The test fails if any step failed.
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createTestUser, apiCall, runSqlStrict, TestUser } from './helpers';

type StepResult = { step: string; status: 'OK' | 'FAIL' | 'SKIP'; error?: string; screenshot?: string; ms: number };

test.describe.configure({ mode: 'serial' });

test('smoke: login → onboarding → profile → catalog → chat → order → deal → review', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const project = testInfo.project.name;
  const outDir = path.join('test-results', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });

  const steps: StepResult[] = [];
  const consoleErrors: { url: string; text: string }[] = [];
  const pageErrors: { url: string; text: string }[] = [];
  const apiErrors: { method: string; url: string; status: number; page: string }[] = [];
  const requestFailures: { url: string; error: string }[] = [];
  const overflow: { page: string; scrollWidth: number; clientWidth: number; offenders: string[] }[] = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ url: page.url(), text: m.text().slice(0, 400) });
  });
  page.on('pageerror', (e) => pageErrors.push({ url: page.url(), text: String(e?.message || e).slice(0, 400) }));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400) {
      apiErrors.push({ method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status(), page: page.url().replace(/^https?:\/\/[^/]+/, '') });
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('/api/') || u.includes('/socket.io/')) requestFailures.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), error: r.failure()?.errorText || '' });
  });

  const step = async (name: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    try {
      await fn();
      steps.push({ step: name, status: 'OK', ms: Date.now() - t0 });
    } catch (e: any) {
      const shot = path.join(outDir, `${project}-${steps.length + 1}-${name.replace(/[^a-z0-9]+/gi, '_')}.png`);
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      steps.push({ step: name, status: 'FAIL', error: String(e?.message || e).split('\n').slice(0, 4).join(' | ').slice(0, 600), screenshot: shot, ms: Date.now() - t0 });
    }
  };
  const skip = (name: string, why: string) => steps.push({ step: name, status: 'SKIP', error: why, ms: 0 });

  const checkOverflow = async (label: string) => {
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const cw = de.clientWidth;
      const offenders: string[] = [];
      if (de.scrollWidth > cw + 1) {
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.right > cw + 1) {
            const h = el as HTMLElement;
            const cls = typeof h.className === 'string' ? h.className.slice(0, 80) : '';
            offenders.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(rect.right)} "${(h.innerText || '').slice(0, 30).replace(/\s+/g, ' ')}"`);
            if (offenders.length >= 5) break;
          }
        }
      }
      return { scrollWidth: de.scrollWidth, clientWidth: cw, offenders };
    });
    if (r.scrollWidth > r.clientWidth + 1) overflow.push({ page: label, ...r });
  };

  // ── Setup (API/SQL): executor Alice with a profession + active service; customer Bob ──
  const pair = runSqlStrict(
    `SELECT sp."professionId" || '|' || sp."serviceId" FROM "ServiceProfession" sp JOIN "Service" s ON s.id = sp."serviceId"
     WHERE s.name ILIKE 'Запись вокальных%' LIMIT 1;`,
  ).trim();
  const [profId, serviceId] = pair.split('|');
  expect(profId && serviceId, 'profession/service pair on DEV').toBeTruthy();

  const birth = new Date(); birth.setFullYear(birth.getFullYear() - 25);
  const birthDate = birth.toISOString().split('T')[0];
  const [alice, bob]: TestUser[] = await Promise.all([
    createTestUser('smka', { birthDate }),
    createTestUser('smkb', { birthDate, userProfessions: [] }), // no profession → ProfessionGate
  ]);
  await apiCall('PUT', '/users/me', { userProfessions: [{ professionId: profId, features: [], selectedCustomFilterValueIds: [] }] }, alice.token);
  const svc = await apiCall('PUT', '/users/me/services', [{ professionId: profId, serviceId, priceFrom: 1000, priceTo: 5000, name: 'PW вокал' }] as any, alice.token);
  const aliceUserServiceId: string | undefined = svc.data?.[0]?.id;
  // Bob must see the onboarding tour on his first UI login.
  runSqlStrict(`UPDATE "User" SET "onboardingCompletedAt" = NULL WHERE id = '${bob.id}';`);

  await page.addInitScript(() => {
    try { localStorage.setItem('mooza_cookie_consent', 'necessary'); } catch { /* ignore */ }
  });

  // 1. Login via the real form
  await step('1 login (UI form)', async () => {
    await page.goto('/');
    await checkOverflow('/ (landing, guest)');
    await page.goto('/login');
    await checkOverflow('/login');
    await page.locator('input[type="email"]').fill(bob.email);
    await page.locator('input[autocomplete="current-password"]').fill(bob.password);
    await page.getByRole('button', { name: /^войти$/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
  });

  // 2. Onboarding, part 1: mandatory profession gate (ProfessionGate overlay for new users)
  await step('2 onboarding: profession gate → choose profession', async () => {
    await expect(page.getByText('Укажите вашу профессию')).toBeVisible({ timeout: 15_000 });
    await checkOverflow('profession gate');
    await page.getByRole('button', { name: /Выбрать профессию/ }).click();
    await page.waitForURL(/\/professions\/new/, { timeout: 10_000 });
    await page.getByPlaceholder('Поиск профессии...').fill('Вокалист');
    await page.getByRole('button', { name: /Вокалист/ }).first().click();
    await checkOverflow('/professions/new');
    await page.getByRole('button', { name: /^Сохранить$/ }).click();
    await page.waitForURL(/\/profile$/, { timeout: 15_000 });
    const me = await apiCall('GET', '/users/me', undefined, bob.token);
    expect((me.data?.userProfessions || []).length, 'profession saved').toBeGreaterThan(0);
    await expect(page.getByText('Укажите вашу профессию')).toHaveCount(0);
  });

  // 3. Onboarding, part 2: the slide tour (/onboarding) → «Перейти в профиль»
  await step('3 onboarding: slide tour', async () => {
    await page.goto('/onboarding');
    await checkOverflow('/onboarding');
    for (let i = 0; i < 10; i++) {
      const toProfile = page.getByRole('button', { name: /перейти в профиль/i });
      if (await toProfile.isVisible().catch(() => false)) { await toProfile.click(); break; }
      await page.getByRole('button', { name: /далее/i }).click();
    }
    await page.waitForURL(/\/profile$/, { timeout: 15_000 });
    await expect.poll(async () => (await apiCall('GET', '/users/me', undefined, bob.token)).data?.onboardingCompletedAt,
      { timeout: 10_000, message: 'onboardingCompletedAt set on server' }).toBeTruthy();
  });

  // 4. Own profile renders with the chosen profession
  await step('4 profile page', async () => {
    if (!/\/profile$/.test(page.url())) await page.goto('/profile');
    await expect(page.getByText(bob.lastName).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Вокалист/).first()).toBeVisible({ timeout: 10_000 });
    await checkOverflow('/profile');
  });

  // 5. Find the executor in the catalog (People tab) and open her profile
  await step('5 catalog search → executor profile', async () => {
    await page.goto('/search');
    await page.getByRole('button', { name: /^Люди$/ }).click();
    const input = page.getByPlaceholder('Поиск людей...');
    await input.fill(alice.lastName);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(1500);
    await checkOverflow('/search (people)');
    await page.getByText(alice.lastName).first().click();
    await page.waitForURL(new RegExp(`/(profile|services)/`), { timeout: 15_000 });
    if (!page.url().includes(`/profile/${alice.id}`)) await page.goto(`/profile/${alice.id}`);
    await expect(page.getByText(alice.lastName).first()).toBeVisible({ timeout: 10_000 });
    await checkOverflow('/profile/:executor');
  });

  // 6. Write to the executor
  const chatText = `PW привет ${Date.now()}`;
  await step('6 chat: send message', async () => {
    if (!page.url().includes(`/profile/${alice.id}`)) await page.goto(`/profile/${alice.id}`);
    await page.locator('button[title="Написать сообщение"]').click();
    await page.waitForURL(/\/(messages|chat)\//, { timeout: 15_000 });
    const box = page.getByPlaceholder('Сообщение...');
    await box.fill(chatText);
    // Enter inserts a newline (no keyboard submit) — send with the button.
    await page.locator('form button[type="submit"]').last().click();
    await expect(box).toHaveValue('', { timeout: 10_000 });
    await expect(page.locator('div,p,span').filter({ hasText: chatText }).last()).toBeVisible({ timeout: 10_000 });
    await checkOverflow('/messages/:id');
    // Received on the other side?
    let got = false;
    for (let i = 0; i < 10 && !got; i++) {
      const conv = await apiCall('GET', '/messages/conversations', undefined, alice.token);
      got = JSON.stringify(conv.data || '').includes(chatText.slice(0, 20));
      if (!got) await page.waitForTimeout(500);
    }
    expect(got, 'executor sees the message in conversations').toBeTruthy();
  });

  // 7. Publish an order through the UI form
  const orderTitle = `PW заказ ${Date.now().toString(36)}`;
  await step('7 create order (UI)', async () => {
    await page.goto('/orders/new');
    await page.getByPlaceholder('Например: Нужно свести трек').fill(orderTitle);
    await page.getByPlaceholder('Поиск услуги в каталоге...').fill('Запись вокальных');
    await page.getByRole('button', { name: /Запись вокальных партий/ }).first().click();
    await page.getByPlaceholder('Опишите, что нужно сделать...').fill('Smoke-тест Playwright');
    await checkOverflow('/orders/new');
    await page.getByRole('button', { name: /^Опубликовать$/ }).click();
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      const mine = await apiCall('GET', '/orders/mine', undefined, bob.token);
      found = JSON.stringify(mine.data || '').includes(orderTitle);
      if (!found) await page.waitForTimeout(700);
    }
    expect(found, 'order published').toBeTruthy();
  });

  // 8. Deal creation (API — UI entry points are disabled by DEALS_ENABLED=false)
  let dealId = '';
  await step('8 create deal (API; UI gated) + /deals list', async () => {
    const r = await apiCall('POST', '/deals', {
      executorId: alice.id, title: `PW сделка ${orderTitle}`, dealType: 'process',
      userServiceId: aliceUserServiceId, serviceId, price: 3000, revisionCount: 1,
    }, bob.token);
    expect(r.status, `POST /deals → ${JSON.stringify(r.data)}`).toBe(201);
    dealId = r.data.id;
    await page.goto('/deals');
    await expect(page.getByText(`PW сделка ${orderTitle}`).first()).toBeVisible({ timeout: 15_000 });
    await checkOverflow('/deals');
  });

  const dealStatus = async () => (await apiCall('GET', `/deals/${dealId}`, undefined, bob.token)).data?.status;

  // 9. Executor accepts (API) → customer pays in the UI
  await step('9 deal: accept (executor API) → pay (UI)', async () => {
    expect(dealId, 'deal exists').toBeTruthy();
    const acc = await apiCall('PATCH', `/deals/${dealId}/accept`, undefined, alice.token);
    expect(acc.ok, `accept → ${acc.status}`).toBeTruthy();
    await page.goto(`/deals/${dealId}`);
    await checkOverflow('/deals/:id');
    await page.getByRole('button', { name: /Подтвердить и начать работу/ }).click();
    await expect.poll(dealStatus, { timeout: 10_000 }).toBe('IN_PROGRESS');
  });

  // 10. Executor submits (API) → customer approves in the UI
  await step('10 deal: submit (executor API) → approve (UI) → COMPLETED', async () => {
    expect(dealId, 'deal exists').toBeTruthy();
    const sub = await apiCall('PATCH', `/deals/${dealId}/submit`, undefined, alice.token);
    expect(sub.ok, `submit → ${sub.status}`).toBeTruthy();
    await page.goto(`/deals/${dealId}`);
    await page.getByRole('button', { name: /Принять работу/ }).click();
    await expect.poll(dealStatus, { timeout: 10_000 }).toBe('COMPLETED');
  });

  // 11. Review via the deal page
  await step('11 review (UI)', async () => {
    expect(dealId, 'deal exists').toBeTruthy();
    if (!page.url().endsWith(`/deals/${dealId}`)) await page.goto(`/deals/${dealId}`);
    await page.reload();
    await page.getByRole('button', { name: /Оценить взаимодействие/ }).click();
    const block = page.locator('div.space-y-3').filter({ hasText: /Оценить взаимодействие с/ });
    await block.locator('div.flex.gap-1 button').nth(8).click();
    await page.getByPlaceholder('Комментарий (необязательно)...').fill('Smoke OK');
    await checkOverflow('/deals/:id (review)');
    await page.getByRole('button', { name: /^Отправить$/ }).click();
    await expect(page.getByText('Оценка отправлена')).toBeVisible({ timeout: 10_000 });
    const rv = await apiCall('GET', `/reviews/user/${alice.id}`, undefined, bob.token);
    expect(JSON.stringify(rv.data || '')).toContain('Smoke OK');
  });

  // 12. Executor's public profile shows the review; feed renders
  await step('12 reviews page + feed render', async () => {
    await page.goto(`/profile/${alice.id}/reviews`);
    await expect(page.getByText('Smoke OK').first()).toBeVisible({ timeout: 10_000 });
    await checkOverflow('/profile/:id/reviews');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await checkOverflow('/ (feed)');
    await page.goto('/messages');
    await checkOverflow('/messages');
    await page.goto('/orders');
    await checkOverflow('/orders');
  });

  void skip;
  const report = {
    project, users: { alice: alice.email, bob: bob.email }, dealId, steps,
    consoleErrors, pageErrors, apiErrors, requestFailures, overflow,
  };
  fs.writeFileSync(path.join(outDir, `${project}.json`), JSON.stringify(report, null, 2));
  await testInfo.attach('smoke-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

  const failed = steps.filter((s) => s.status === 'FAIL');
  expect(failed.map((s) => `${s.step}: ${s.error}`), 'failed journey steps').toEqual([]);
});
