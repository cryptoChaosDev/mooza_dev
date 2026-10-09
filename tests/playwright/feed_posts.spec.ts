/**
 * Playwright UI tests — Feed, Posts, Profile
 *
 * Covers:
 *   - Feed page: tabs (По новизне / Популярное / Сохранённые), FAB creates post
 *   - Create post page: form validation, text input enables publish, successful submit
 *   - Post interactions: like, comment, save (star), share
 *   - Poll type: vote button clickable, counter updates
 *   - Profile page: opens, avatar/name visible, edit button present
 */

import { test, expect } from '@playwright/test';
import { createTestUser, loginUI, skipOnboarding, apiCall } from './helpers';
import type { TestUser } from './helpers';

// ── shared state ──────────────────────────────────────────────────────────────
let user: TestUser;
let postId: string;

test.beforeAll(async () => {
  // Create a fresh user
  user = await createTestUser('fp');

  // Create a blog post via API so the feed has content to interact with
  const r = await apiCall(
    'POST',
    '/posts',
    { content: 'PW test post — feed_posts_spec', type: 'blog' },
    user.token,
  );
  postId = r.data?.id ?? '';
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Feed page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Feed page', () => {
  test('feed renders after login (posts or empty state)', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Either at least one post card OR the empty-state copy
    const hasPosts = await page.locator('[id^="post-"]').count();
    const hasEmpty = await page.getByText('Поток пуст').count();
    expect(hasPosts + hasEmpty).toBeGreaterThan(0);
  });

  // Updated: the tabs «По новизне / Популярное / Сохранённые» were replaced by a
  // «Сортировка» dropdown (Для вас / Новые / Популярные / Обсуждаемые) and a
  // «Сохранённые» star toggle in the «Поток» header.
  test('feed header: Поток, sort dropdown, saved toggle, filters', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Поток' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[title="Сортировка"]')).toBeVisible();
    await expect(page.locator('button[title="Сохранённые"]')).toBeVisible();
    await expect(page.locator('button[title="Фильтры"]')).toBeVisible();
  });

  test('switching sort to Популярные does not crash', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.locator('button[title="Сортировка"]').click();
    await page.getByRole('button', { name: /^Популярные/ }).click();
    await expect(page.locator('button[title="Сортировка"]')).toContainText(/Популярные/);
    await expect(page.getByRole('heading', { name: 'Поток' })).toBeVisible();
  });

  test('Сохранённые toggle shows saved view without crash', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.locator('button[title="Сохранённые"]').click();
    await expect(page.getByText('Нет сохранённых').or(page.locator('[id^="post-"]').first())).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Поток' })).toBeVisible();
  });

  test('FAB (+) opens post-type picker or navigates to /create-post', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // The FAB is a fixed button at bottom-right containing a Plus SVG
    const fab = page.locator('button.fixed.w-14.h-14');
    await expect(fab).toBeVisible({ timeout: 5000 });
    await fab.click();

    // Either a bottom sheet appears with "Создать пост" or we navigate to /create-post
    const sheetVisible = await page.getByText('Создать пост').isVisible({ timeout: 3000 }).catch(() => false);
    const onCreatePost = page.url().includes('/create-post');
    expect(sheetVisible || onCreatePost).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Create Post page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Create post page', () => {
  // Updated: the composer is a TipTap/ProseMirror contenteditable, not a <textarea>;
  // the publish button is icon-only (<640px the «Опубликовать» label is hidden).
  const editor = (page: import('@playwright/test').Page) => page.locator('.ProseMirror[contenteditable="true"]');
  const publishBtn = (page: import('@playwright/test').Page) => page.locator('div.sticky button:has(svg.lucide-send)');
  test.beforeEach(async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mooza_draft_')) localStorage.removeItem(k); });
    await page.goto('/create-post?type=blog');
  });

  test('page opens at /create-post with editor', async ({ page }) => {
    await expect(editor(page)).toBeVisible({ timeout: 8000 });
  });

  test('publish button is disabled when editor is empty', async ({ page }) => {
    await expect(editor(page)).toBeVisible({ timeout: 8000 });
    await expect(publishBtn(page)).toBeDisabled();
  });

  test('entering text makes publish button enabled', async ({ page }) => {
    await editor(page).click();
    await page.keyboard.type('Hello from Playwright test');
    await expect(editor(page)).toContainText('Hello from Playwright test');
    await expect(publishBtn(page)).toBeEnabled();
  });

  test('publishing a post redirects to /', async ({ page }) => {
    const content = 'Playwright auto-published post ' + Date.now();
    await editor(page).click();
    await page.keyboard.type(content);
    await publishBtn(page).click();
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    await expect(page.getByText(content).first()).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Post interactions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Post interactions', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    if (postId) {
      await page.goto(`/?post=${postId}`);
    } else {
      await page.goto('/');
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy
  });

  test('our test post is visible in feed', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });
  });

  test('like button is present (own-post disabled state is expected)', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // The action row: div with flex + gap-1 at ml-[52px]
    const actionRow = postEl.locator('div.flex.items-center.gap-1').first();
    const likeBtn = actionRow.locator('button').first();
    await expect(likeBtn).toBeVisible({ timeout: 5000 });
    // Own post: button renders (even if disabled)
    expect(likeBtn).toBeDefined();
  });

  test('comment button opens comment input field', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // Updated: comments open in a portal modal with a <textarea>.
    await postEl.locator('button:has(svg.lucide-message-circle)').first().click();
    await expect(page.getByPlaceholder('Написать комментарий...')).toBeVisible({ timeout: 5000 });
  });

  test('typing a comment and submitting makes it appear', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // Updated: comments modal (portal) — textarea + icon send button.
    await postEl.locator('button:has(svg.lucide-message-circle)').first().click();
    const commentInput = page.getByPlaceholder('Написать комментарий...');
    await expect(commentInput).toBeVisible({ timeout: 5000 });
    const commentText = 'PW comment ' + Date.now();
    await commentInput.fill(commentText);
    await commentInput.locator('xpath=following-sibling::button[1]').click();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 8000 });
  });

  test('save (star) button is visible and clickable', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // Save button has a title attribute
    const saveBtn = postEl.locator('button[title*="охранит"], button[title*="охранён"]').first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(800);
    // Confirm no crash
    await expect(saveBtn).toBeVisible();
  });

  test('share button click does not crash the page', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // Updated: the action row was reworked (ReactionBar) — target ShareButton by its title.
    // Stub the share/clipboard APIs so the link it hands out can be checked.
    await page.evaluate(() => {
      (window as any).__pwShared = '';
      const grab = (u: string) => { (window as any).__pwShared = u; };
      try { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: any) => grab(d?.url || '') }); } catch { /* ignore */ }
      try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => grab(t) } }); } catch { /* ignore */ }
    });
    const shareBtn = postEl.locator('button[title="Поделиться"]').first();
    await shareBtn.click();
    // Since the audit the shared link is /feed?post=<id> (the old /post/<id> route never existed).
    await expect.poll(() => page.evaluate(() => (window as any).__pwShared), { timeout: 5000 }).toContain(`/feed?post=${postId}`);

    // Page should still be alive
    await expect(postEl).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Poll type interactions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Poll post interactions', () => {
  let pollPostId: string;

  test.beforeAll(async () => {
    const pollEndsAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    const r = await apiCall(
      'POST',
      '/posts',
      {
        content: 'PW poll test',
        type: 'poll',
        pollOptions: ['Option A', 'Option B', 'Option C'],
        pollEndsAt,
      },
      user.token,
    );
    pollPostId = r.data?.id ?? '';
  });

  test('poll post renders option buttons in feed', async ({ page }) => {
    if (!pollPostId) {
      test.skip(true, 'Poll creation failed — skipping');
      return;
    }
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto(`/?post=${pollPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    const pollEl = page.locator(`#post-${pollPostId}`);
    await expect(pollEl).toBeVisible({ timeout: 10000 });

    await expect(pollEl.getByText('Option A')).toBeVisible({ timeout: 5000 });
    await expect(pollEl.getByText('Option B')).toBeVisible();
    await expect(pollEl.getByText('Option C')).toBeVisible();
  });

  test('clicking a poll option updates vote state', async ({ page }) => {
    if (!pollPostId) {
      test.skip(true, 'Poll creation failed — skipping');
      return;
    }
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto(`/?post=${pollPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    const pollEl = page.locator(`#post-${pollPostId}`);
    await expect(pollEl).toBeVisible({ timeout: 10000 });

    const optionBtn = pollEl.locator('button', { hasText: 'Option A' }).first();
    await expect(optionBtn).toBeVisible({ timeout: 5000 });

    const isDisabled = await optionBtn.getAttribute('disabled');
    if (isDisabled !== null) {
      test.skip(true, 'Poll option disabled — already voted or poll ended');
      return;
    }

    await optionBtn.click();
    await page.waitForTimeout(1500);

    // Post still renders — no crash
    await expect(pollEl).toBeVisible();
    // Vote count text appears
    const totalText = pollEl.locator('text=/голос/i').first();
    await expect(totalText).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Profile page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Profile page', () => {
  test('profile page opens without error', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    expect(page.url()).toContain('/profile');
    // User's firstName starts with "PWFP"
    await expect(page.locator(`text=/PWFP/i`).first()).toBeVisible({ timeout: 10000 });
  });

  test('avatar element is present on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Avatar is an img or a rounded initials element
    // Updated: first match was in the hidden (lg:hidden) mobile header on desktop.
    const avatar = page.locator('main img[alt]:visible, main [class*="rounded-full"]:visible').first();
    await expect(avatar).toBeVisible({ timeout: 8000 });
  });

  test('user first name is visible on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // createTestUser('fp') → firstName = 'PWFP'
    await expect(page.getByText(/PWFP/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('at least one interactive button is present on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking the first edit button does not crash the page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Updated: profile edit is an icon button title="Редактировать" (→ «Закрыть» when open).
    await page.locator('button[title="Редактировать"]').click();
    await expect(page.locator('button[title="Закрыть"]')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/profile');
  });

  test('portfolio tab buttons switch without crash (if present)', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    const audioTab = page.getByRole('button', { name: /аудио/i }).first();
    const imagesTab = page.getByRole('button', { name: /фото|изображения/i }).first();

    const audioVisible = await audioTab.isVisible({ timeout: 2000 }).catch(() => false);
    const imagesVisible = await imagesTab.isVisible({ timeout: 2000 }).catch(() => false);

    if (!audioVisible && !imagesVisible) {
      test.skip(true, 'No portfolio tabs visible — user has no portfolio entries yet');
      return;
    }

    if (audioVisible) {
      await audioTab.click();
      await page.waitForTimeout(300);
      expect(page.url()).toContain('/profile');
    }
    if (imagesVisible) {
      await imagesTab.click();
      await page.waitForTimeout(300);
      expect(page.url()).toContain('/profile');
    }
  });
});
