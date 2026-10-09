/**
 * Feed journey (soft steps, see journey.ts): author A creates text / image / poll
 * posts in the UI; reader B likes, reacts, comments, votes, saves and reposts;
 * A deletes the posts. Report: test-results/smoke/<project>-feed.json
 */
import { test, expect, Page } from '@playwright/test';
import { createTestUser, apiCall, TestUser } from './helpers';
import { Journey, injectSession } from './journey';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('smoke: feed — posts (text, image, poll), like/reaction, comment, save, repost, delete', async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const j = new Journey(page, testInfo, 'feed');
  const [a, b]: TestUser[] = await Promise.all([createTestUser('fda'), createTestUser('fdb')]);
  await injectSession(page, a);
  const ctxB = await browser.newContext({ ...(testInfo.project.use as any) });
  const pb: Page = await ctxB.newPage();
  j.watch(pb);
  await injectSession(pb, b);
  // A follows nothing; B sees A's posts via direct link /?post=<id>.

  const stamp = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const findPost = async (marker: string) => {
    for (let i = 0; i < 15; i++) {
      const feed = await apiCall('GET', '/posts/feed?sort=new&limit=50', undefined, a.token);
      const list = Array.isArray(feed.data) ? feed.data : (feed.data?.posts || feed.data?.items || []);
      const p = list.find((x: any) => String(x.content || '').includes(marker) || (x.pollOptions && JSON.stringify(x.pollOptions).includes(marker)));
      if (p) return p.id as string;
      // fallback: author's posts
      const mine = await apiCall('GET', `/posts/user/${a.id}`, undefined, a.token);
      const l2 = Array.isArray(mine.data) ? mine.data : (mine.data?.posts || []);
      const p2 = l2.find((x: any) => JSON.stringify(x).includes(marker));
      if (p2) return p2.id as string;
      await page.waitForTimeout(700);
    }
    throw new Error(`post with marker ${marker} not found via API`);
  };
  const publish = async () => {
    await page.locator('div.sticky button:has(svg.lucide-send)').click();
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 15_000 });
  };

  await j.step('F1 feed opens (Поток)', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Поток' })).toBeVisible({ timeout: 15_000 });
    await j.checkOverflow('/ (feed)');
  });

  await j.step('F2 create text post (UI)', async () => {
    await page.goto('/create-post?type=blog');
    const ed = page.locator('.ProseMirror[contenteditable="true"]');
    await ed.click();
    await page.keyboard.type(`PW текст ${stamp}`);
    await j.checkOverflow('/create-post?type=blog');
    await publish();
    ids.text = await findPost(`PW текст ${stamp}`);
    await expect(page.getByText(`PW текст ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    // Own post: like is disabled in the UI and rejected by the API (400 since the audit).
    const own = page.locator(`#post-${ids.text}`);
    await expect(own.locator('button[title="Нельзя лайкать свой пост"]')).toBeDisabled({ timeout: 10_000 });
    const selfLike = await apiCall('POST', `/posts/${ids.text}/like`, undefined, a.token);
    expect(selfLike.status, `self-like → ${JSON.stringify(selfLike.data)}`).toBe(400);
  });

  await j.step('F3 create image post (UI upload)', async () => {
    await page.goto('/create-post?type=blog');
    await page.locator('input[type=file][accept="image/*,.gif"]').setInputFiles({ name: 'pw.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('img[alt="photo 1"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('.ProseMirror[contenteditable="true"]').click();
    await page.keyboard.type(`PW фото ${stamp}`);
    await publish();
    ids.image = await findPost(`PW фото ${stamp}`);
    const p = await apiCall('GET', `/posts/${ids.image}`, undefined, a.token);
    expect((p.data?.images || []).length || (p.data?.imageUrl ? 1 : 0), 'image attached').toBeGreaterThan(0);
  });

  await j.step('F4 create poll (UI)', async () => {
    await page.goto('/create-post?type=poll');
    await page.getByPlaceholder('Вариант 1').fill(`PWда ${stamp}`);
    await page.getByPlaceholder('Вариант 2').fill(`PWнет ${stamp}`);
    await j.checkOverflow('/create-post?type=poll');
    await publish();
    ids.poll = await findPost(`PWда ${stamp}`);
  });

  const openPost = async (id: string) => {
    await pb.goto(`/?post=${id}`);
    const card = pb.locator(`#post-${id}`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    return card;
  };

  await j.step('F5 like + emoji reaction (reader, UI)', async () => {
    expect(ids.text, 'text post exists').toBeTruthy();
    const card = await openPost(ids.text);
    await j.checkOverflow('/?post (reader)', pb);
    await card.locator('button:has(svg.lucide-heart)').first().click();
    await expect.poll(async () => (await apiCall('GET', `/posts/${ids.text}`, undefined, b.token)).data?.isLiked, { timeout: 10_000 }).toBe(true);
    await expect(card.locator('button[aria-label="Убрать лайк"]')).toHaveAttribute('aria-pressed', 'true');
    await card.locator('.ProseMirror, .rte-content, p').filter({ hasText: `PW текст ${stamp}` }).first().dblclick();
    await pb.locator('button[title="🔥"]').first().click();
    await expect(card.getByText('🔥').first()).toBeVisible({ timeout: 10_000 });
    // Post payload since the audit: reactionSummary / myReaction (no raw reactions[]).
    await expect.poll(async () => {
      const d = (await apiCall('GET', `/posts/${ids.text}`, undefined, b.token)).data || {};
      return `${d.myReaction}|${JSON.stringify(d.reactionSummary || [])}|${'reactions' in d}`;
    }, { timeout: 10_000 }).toMatch(/^🔥\|.*🔥.*\|false$/);
  });

  await j.step('F6 comment (reader, UI)', async () => {
    const card = await openPost(ids.text);
    await card.locator('button:has(svg.lucide-message-circle)').first().click();
    const ta = pb.getByPlaceholder('Написать комментарий...');
    await ta.fill(`PW коммент ${stamp}`);
    await ta.locator('xpath=following-sibling::button[1]').click();
    await expect(pb.getByText(`PW коммент ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    await j.checkOverflow('comments modal', pb);
    await pb.keyboard.press('Escape').catch(() => {});
  });

  await j.step('F6b comments: feed carries the last 3, the modal loads the rest (GET /posts/:id/comments)', async () => {
    expect(ids.text, 'text post exists').toBeTruthy();
    for (let i = 2; i <= 5; i++) {
      const r = await apiCall('POST', `/posts/${ids.text}/comments`, { content: `PW коммент#${i} ${stamp}` }, b.token);
      expect(r.status, `comment ${i} → ${JSON.stringify(r.data)}`).toBeLessThan(300);
    }
    const feedPost = (await apiCall('GET', `/posts/${ids.text}`, undefined, b.token)).data || {};
    expect((feedPost.comments || []).length, 'embedded comments are capped at 3').toBeLessThanOrEqual(3);
    expect(feedPost._count?.comments, '_count.comments counts all').toBe(5);
    const all = await apiCall('GET', `/posts/${ids.text}/comments?limit=20`, undefined, b.token);
    expect((all.data?.items || []).length, 'GET /posts/:id/comments returns all top-level comments').toBe(5);
    const card = await openPost(ids.text);
    await card.locator('button:has(svg.lucide-message-circle)').first().click();
    // The oldest comment is outside the embedded 3 → must be fetched by the modal.
    await expect(pb.getByText(`PW коммент ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(pb.getByText(`PW коммент#5 ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    await pb.keyboard.press('Escape').catch(() => {});
  });

  await j.step('F7 poll vote (reader, UI)', async () => {
    expect(ids.poll, 'poll exists').toBeTruthy();
    const card = await openPost(ids.poll);
    await card.getByRole('button', { name: new RegExp(`PWда ${stamp}`) }).click();
    await expect(card.getByText(/1 голос/).first()).toBeVisible({ timeout: 10_000 });
  });

  await j.step('F8 save post (reader, UI) → visible in Сохранённые', async () => {
    const card = await openPost(ids.image);
    await card.locator('button[title="Сохранить"]').click();
    await expect(card.locator('button[title="Убрать из сохранённого"]')).toBeVisible({ timeout: 10_000 });
    const saved = await apiCall('GET', '/posts/saved/list', undefined, b.token);
    expect(JSON.stringify(saved.data || '')).toContain(ids.image);
  });

  await j.step('F9 repost to feed «Поделиться в ленте» (reader, UI)', async () => {
    const card = await openPost(ids.text);
    await card.locator('button[title="Поделиться в ленте"]').click();
    await pb.getByPlaceholder('Добавьте комментарий (необязательно)...').fill(`PW репост ${stamp}`);
    const resp = pb.waitForResponse((r) => /\/api\/posts\/[^/]+\/repost$/.test(r.url()), { timeout: 10_000 });
    await pb.getByRole('button', { name: 'Поделиться в ленте' }).last().click();
    expect((await resp).status()).toBeLessThan(300);
  });

  j.skip('F10 repost to chat', 'Нет такой функции в UI: на карточке поста нет «отправить в чат» (ChatPicker используется только в чате/заказе/услуге)', 'NOT RUN');

  await j.step('F11 «Поделиться» shares /feed?post=<id> and that link opens the post', async () => {
    // Since the audit ShareButton shares `${origin}/feed?post=<id>` (was /post/<id>, a dead route).
    // Capture what the button hands to navigator.share / the clipboard, then open it.
    const card = await openPost(ids.text);
    await pb.evaluate(() => {
      (window as any).__pwShared = '';
      const grab = (u: string) => { (window as any).__pwShared = u; };
      try { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: any) => grab(d?.url || '') }); } catch { /* ignore */ }
      try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => grab(t) } }); } catch { /* ignore */ }
    });
    await card.locator('button[title="Поделиться"]').first().click();
    await expect.poll(() => pb.evaluate(() => (window as any).__pwShared), { timeout: 5_000 }).toContain(`/feed?post=${ids.text}`);
    const shared: string = await pb.evaluate(() => (window as any).__pwShared);
    await pb.goto(new URL(shared).pathname + new URL(shared).search);
    await expect(pb.locator(`#post-${ids.text}`), `${shared} → ${pb.url()}`).toBeVisible({ timeout: 15_000 });
  });

  await j.step('F12 delete own posts (author, UI menu)', async () => {
    for (const key of ['text', 'image', 'poll']) {
      const id = ids[key];
      if (!id) continue;
      await page.goto(`/?post=${id}`);
      const card = page.locator(`#post-${id}`);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.locator('button:has(svg.lucide-ellipsis), button:has(svg.lucide-more-horizontal)').first().click();
      await page.getByRole('button', { name: 'Удалить пост' }).click();
      await page.getByRole('button', { name: /^Удалить$/ }).click();
      await expect.poll(async () => (await apiCall('GET', `/posts/${id}`, undefined, a.token)).status, { timeout: 10_000 }).toBe(404);
    }
  });

  await ctxB.close();
  await j.finish({ users: [a.email, b.email], posts: ids });
});
