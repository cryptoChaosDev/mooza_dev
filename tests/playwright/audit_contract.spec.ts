/**
 * API contract checks for the behaviour changed by the audit fix pack (DEV).
 * Device-independent, so it runs on one project only (android-chrome); the
 * other projects report it as skipped.
 *
 * Covered: verify-email answers SELF_USER_SELECT (no codes/hashes); feed array vs
 * ?cursor= → {items,nextCursor}; save {saved}; own-post like 400; public consent
 * gate for services (PUT and PATCH status); complaints — one open complaint per
 * reporter/target (409) and auto-block only from ≥3 distinct accounts older than 7 days.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, apiCall, runSqlStrict, TestUser } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'API-контракт не зависит от устройства — гоняется один раз (android-chrome)');
});

let a: TestUser;
let b: TestUser;
test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'android-chrome') return;
  [a, b] = await Promise.all([createTestUser('aca'), createTestUser('acb')]);
});

test('verify-email answers the whitelisted self user (no codes / hashes / password)', async () => {
  const u = a.verifiedUser || {};
  expect(u.id, 'user.id').toBe(a.id);
  const leaked = Object.keys(u).filter((k) => /password|code|hash|token|secret/i.test(k));
  expect(leaked, 'sensitive keys in verify-email user').toEqual([]);
  expect(u.consentPdAt, 'consentPdAt carried from the pending registration').toBeTruthy();
});

test('feed: array without cursor, {items,nextCursor} with ?cursor=, pages do not overlap', async () => {
  const stamp = Date.now().toString(36);
  for (let i = 0; i < 3; i++) {
    const r = await apiCall('POST', '/posts', { content: `PW contract ${stamp} #${i}`, type: 'blog' }, a.token);
    expect(r.status, `create post → ${JSON.stringify(r.data)}`).toBeLessThan(300);
  }
  // Reader = author A: users without own posts get up to 7 pinned team posts on page 1.
  const legacy = await apiCall('GET', '/posts/feed?sort=new&limit=5', undefined, a.token);
  expect(legacy.status).toBe(200);
  expect(Array.isArray(legacy.data), 'legacy feed is an array').toBe(true);
  const p1 = await apiCall('GET', '/posts/feed?sort=new&limit=2&cursor=', undefined, a.token);
  expect(p1.status).toBe(200);
  expect(Array.isArray(p1.data?.items), '{items}').toBe(true);
  expect(p1.data.items.length).toBe(2);
  expect(typeof p1.data.nextCursor, 'nextCursor').toBe('string');
  const p2 = await apiCall('GET', `/posts/feed?sort=new&limit=2&cursor=${encodeURIComponent(p1.data.nextCursor)}`, undefined, a.token);
  expect(p2.status).toBe(200);
  const ids1 = p1.data.items.map((p: any) => p.id);
  expect(p2.data.items.some((p: any) => ids1.includes(p.id)), 'page 2 repeats page 1').toBe(false);
  const post = p1.data.items[0];
  for (const k of ['reactionSummary', 'myReaction', 'myVote', 'isLiked', 'isSaved']) expect(k in post, `post.${k}`).toBe(true);
  expect('reactions' in post, 'raw reactions[] no longer exposed').toBe(false);
});

test('posts: save takes {saved} (idempotent), own-post like → 400', async () => {
  const r = await apiCall('POST', '/posts', { content: `PW save ${Date.now()}`, type: 'blog' }, a.token);
  const id = r.data?.id;
  expect(id, 'post id').toBeTruthy();
  for (const want of [true, true, false, false]) {
    const s = await apiCall('POST', `/posts/${id}/save`, { saved: want }, b.token);
    expect(s.status).toBe(200);
    expect(s.data?.saved).toBe(want);
    const p = await apiCall('GET', `/posts/${id}`, undefined, b.token);
    expect(p.data?.isSaved, `isSaved after {saved:${want}}`).toBe(want);
  }
  const self = await apiCall('POST', `/posts/${id}/like`, undefined, a.token);
  expect(self.status, `self-like → ${JSON.stringify(self.data)}`).toBe(400);
  const other = await apiCall('POST', `/posts/${id}/like`, undefined, b.token);
  expect(other.status).toBe(201);
});

test('services: publishing (active) requires public consent — PUT and PATCH status', async () => {
  const c = await createTestUser('acc');
  const pair = runSqlStrict(`SELECT sp."professionId" || '|' || sp."serviceId" FROM "ServiceProfession" sp LIMIT 1;`).trim();
  const [professionId, serviceId] = pair.split('|');
  await apiCall('PUT', '/users/me', { userProfessions: [{ professionId, features: [], selectedCustomFilterValueIds: [] }] }, c.token);
  const active = await apiCall('PUT', '/users/me/services', [{ professionId, serviceId, priceFrom: 100, status: 'active' }] as any, c.token);
  expect(`${active.status} ${active.data?.code}`).toBe('403 PUBLIC_CONSENT_REQUIRED');
  const draft = await apiCall('PUT', '/users/me/services', [{ professionId, serviceId, priceFrom: 100, status: 'draft' }] as any, c.token);
  expect(draft.status, `draft without consent → ${JSON.stringify(draft.data)}`).toBe(200);
  const usId = draft.data?.[0]?.id;
  const patch = await apiCall('PATCH', `/users/me/services/${usId}/status`, { status: 'active' }, c.token);
  expect(`${patch.status} ${patch.data?.code}`).toBe('403 PUBLIC_CONSENT_REQUIRED');
  const consent = await apiCall('POST', '/users/me/public-consent', undefined, c.token);
  expect(consent.status).toBe(200);
  const patch2 = await apiCall('PATCH', `/users/me/services/${usId}/status`, { status: 'active' }, c.token);
  expect(patch2.status, `after consent → ${JSON.stringify(patch2.data)}`).toBe(200);
});

test('complaints: one open complaint per target (409); auto-block only from ≥3 accounts older than 7 days', async () => {
  test.setTimeout(90_000);
  const [t1, t2, r1, r2, r3, r4] = await Promise.all(['act1', 'act2', 'acr1', 'acr2', 'acr3', 'acr4'].map((p) => createTestUser(p)));
  const category = 'Мошенничество / обман';
  const text = 'PW: автотест жалоб, проверка дедупликации и автоблокировки (DEV)';
  // Prior complaints are planted via SQL to keep admin notifications to a minimum.
  const plant = (target: TestUser, reporters: TestUser[]) => runSqlStrict(
    `INSERT INTO "Complaint" (id, "reporterId", "targetType", "targetId", category, text, "riskScore", status, "createdAt", "updatedAt") VALUES ` +
    reporters.map((r) => `(gen_random_uuid()::text, '${r.id}', 'user', '${target.id}', '${category}', '${text}', 60, 'pending', now(), now())`).join(',') + ';');
  const blockedUntil = (u: TestUser) => runSqlStrict(`SELECT coalesce("blockedUntil"::text, '') FROM "User" WHERE id = '${u.id}';`).trim();

  // 1) three FRESH reporters + a 4th → high score, but no trusted reporters → no block
  plant(t2, [r1, r2, r3]);
  const fresh = await apiCall('POST', '/complaints', { targetType: 'user', targetId: t2.id, category, text }, r4.token);
  expect(fresh.status, `4th complaint (fresh accounts) → ${JSON.stringify(fresh.data)}`).toBeLessThan(300);
  expect(blockedUntil(t2), 'fresh accounts must not auto-block').toBe('');

  // 2) duplicate from the same reporter → 409
  const dup = await apiCall('POST', '/complaints', { targetType: 'user', targetId: t2.id, category, text }, r4.token);
  expect(dup.status, `duplicate complaint → ${JSON.stringify(dup.data)}`).toBe(409);

  // 3) the same three reporters aged > 7 days + a 4th → auto-block for 24h
  runSqlStrict(`UPDATE "User" SET "createdAt" = now() - interval '10 days' WHERE id IN ('${r1.id}','${r2.id}','${r3.id}');`);
  plant(t1, [r1, r2, r3]);
  const trusted = await apiCall('POST', '/complaints', { targetType: 'user', targetId: t1.id, category, text }, r4.token);
  expect(trusted.status, `4th complaint (trusted reporters) → ${JSON.stringify(trusted.data)}`).toBeLessThan(300);
  await expect.poll(() => blockedUntil(t1), { timeout: 10_000, message: 'auto-block from ≥3 trusted reporters' }).not.toBe('');
});
