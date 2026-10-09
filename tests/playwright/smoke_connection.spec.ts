/**
 * Business connection (request → accept → rating) + Pro page + privacy settings.
 * Report: test-results/smoke/<project>-connection.json
 */
import { test, expect, Page } from '@playwright/test';
import { createTestUser, apiCall, TestUser } from './helpers';
import { Journey, injectSession } from './journey';

test('smoke: business connection request → accept → rate; /pro; /settings/privacy', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const j = new Journey(page, testInfo, 'connection');
  const [a, b]: TestUser[] = await Promise.all([createTestUser('cna'), createTestUser('cnb')]);
  await injectSession(page, a);
  const ctxB = await browser.newContext({ ...(testInfo.project.use as any) });
  const pb: Page = await ctxB.newPage();
  j.watch(pb);
  await injectSession(pb, b);
  let connId = '';

  await j.step('C1 request connection from profile (UI)', async () => {
    await page.goto(`/profile/${b.id}`);
    await page.locator('button[title="Создать связь"]').click();
    await expect(page.getByRole('heading', { name: 'Установить связь' })).toBeVisible({ timeout: 10_000 });
    await j.checkOverflow('connection request modal');
    await page.getByRole('button', { name: /Совместная работа без сделки/ }).click();
    await page.getByRole('button', { name: /^Отправить запрос/ }).click();
    await expect.poll(async () => {
      const r = await apiCall('GET', '/connections/sent', undefined, a.token);
      const hit = (Array.isArray(r.data) ? r.data : []).find((c: any) => c.receiverId === b.id || c.receiver?.id === b.id);
      connId = hit?.id || '';
      return !!connId;
    }, { timeout: 10_000, message: 'request visible in /connections/sent' }).toBe(true);
  });

  await j.step('C2 accept request (receiver, UI /connections/requests)', async () => {
    expect(connId, 'request exists').toBeTruthy();
    await pb.goto('/connections/requests');
    await expect(pb.getByRole('heading', { name: 'Запросы связи' })).toBeVisible({ timeout: 10_000 });
    await j.checkOverflow('/connections/requests', pb);
    await pb.getByRole('button', { name: 'Просмотреть' }).first().click();
    await pb.getByRole('button', { name: /^Принять$/ }).click();
    await expect.poll(async () => (await apiCall('GET', `/connections/with/${a.id}`, undefined, b.token)).data?.status,
      { timeout: 10_000 }).toBe('ACCEPTED');
  });

  await j.step('C3 rate the connection (UI /connection/:partner)', async () => {
    await page.goto(`/connection/${b.id}`);
    await j.checkOverflow('/connection/:partner');
    await page.getByRole('button', { name: 'Оценить взаимодействие' }).click();
    await page.locator('div.flex.gap-1.flex-wrap button').nth(7).click();
    await page.getByPlaceholder('Комментарий (необязательно)...').fill('PW связь ок');
    await page.getByRole('button', { name: /^Отправить$/ }).click();
    await expect(page.getByText('Оценка отправлена')).toBeVisible({ timeout: 10_000 });
    const rv = await apiCall('GET', `/reviews/user/${b.id}`, undefined, a.token);
    expect(JSON.stringify(rv.data || '')).toContain('PW связь ок');
  });

  await j.step('C4 /pro opens', async () => {
    await page.goto('/pro');
    await expect(page.getByRole('heading', { level: 1, name: 'Moooza Pro' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Как получить Pro')).toBeVisible();
    await j.checkOverflow('/pro');
  });

  await j.step('C5 /settings/privacy opens and saves', async () => {
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible({ timeout: 10_000 });
    await j.checkOverflow('/settings/privacy');
    await page.getByRole('button', { name: /Только друзья и коллеги/ }).click();
    await expect.poll(async () => (await apiCall('GET', '/users/me', undefined, a.token)).data?.contactsVisibility, { timeout: 10_000 }).toBe('FRIENDS');
    await page.getByRole('button', { name: /^Уведомления$/ }).first().click();
    await expect(page.getByText(/Telegram/).first()).toBeVisible({ timeout: 10_000 });
    await j.checkOverflow('/settings/privacy (notifications)');
  });

  await ctxB.close();
  await j.finish({ users: [a.email, b.email], connId });
});
