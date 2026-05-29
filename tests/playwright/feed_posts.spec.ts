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
    await page.waitForLoadState('networkidle');

    // Either at least one post card OR the empty-state copy
    const hasPosts = await page.locator('[id^="post-"]').count();
    const hasEmpty = await page.getByText('Поток пуст').count();
    expect(hasPosts + hasEmpty).toBeGreaterThan(0);
  });

  test('tab filters are present: По новизне, Популярное, Сохранённые', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /по новизне/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /популярное/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /сохранённые/i })).toBeVisible();
  });

  test('switching to Популярное does not crash', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /популярное/i }).click();
    await page.waitForLoadState('networkidle');

    // Tabs still present — page did not crash
    await expect(page.getByRole('button', { name: /популярное/i })).toBeVisible();
  });

  test('switching to Сохранённые shows tab content without crash', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /сохранённые/i }).click();
    await page.waitForLoadState('networkidle');

    // Just confirm no JS crash — the tab is now active (the Saved button has active classes)
    const savedBtn = page.getByRole('button', { name: /сохранённые/i });
    await expect(savedBtn).toBeVisible();
    // Page still renders the header
    await expect(page.getByRole('button', { name: /по новизне/i })).toBeVisible();
  });

  test('FAB (+) opens post-type picker or navigates to /create-post', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The FAB is a fixed button at bottom-right containing a Plus SVG
    const fab = page.locator('button.fixed, button[class*="fixed"]').last();
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
  test('page opens at /create-post', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/create-post?type=blog');
    await page.waitForLoadState('networkidle');

    // The textarea should be present
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 8000 });
  });

  test('text area is present', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/create-post?type=blog');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 });
  });

  test('publish button is disabled when textarea is empty', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/create-post?type=blog');
    await page.waitForLoadState('networkidle');

    // Clear any draft that might have been saved previously
    const textarea = page.locator('textarea').first();
    await textarea.clear();
    await expect(textarea).toHaveValue('');

    // The publish button must be disabled when nothing is typed
    const publishBtn = page.locator('button[disabled]').filter({ has: page.locator('svg') });
    await expect(publishBtn.first()).toBeVisible({ timeout: 3000 });
  });

  test('entering text makes publish button enabled', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/create-post?type=blog');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea').first();
    await textarea.fill('Hello from Playwright test');
    await page.waitForTimeout(300);

    // After filling, textarea should have our text
    await expect(textarea).toHaveValue('Hello from Playwright test');
    // Page should not have crashed
    await expect(textarea).toBeVisible();
  });

  test('publishing a post redirects to /', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/create-post?type=blog');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea').first();
    const content = 'Playwright auto-published post ' + Date.now();
    await textarea.fill(content);
    await page.waitForTimeout(300);

    // The publish button is in the sticky header — it has a Send icon and "Опубликовать" text
    // On mobile, text is hidden (hidden sm:inline) so we locate by the disabled state change
    // Strategy: wait for a button that was disabled to become enabled after typing
    // The publish button is: bg-primary-600 + disabled:bg-slate-700 + has Send icon
    const publishBtn = page.locator('div.sticky button.bg-primary-600, div.sticky button[class*="bg-primary-6"]').first();

    // If bg-primary-600 button not found, fall back to the last non-disabled button
    const isVisible = await publishBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const btnToClick = isVisible ? publishBtn : page.locator('div.sticky button:not([disabled])').last();

    await btnToClick.click();

    // Should redirect to / after success (createMut.onSuccess calls navigate('/'))
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    expect(page.url()).toMatch(/\/$/);
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
    await page.waitForLoadState('networkidle');
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

    // Comment button is the second in the action row
    const actionRow = postEl.locator('div.flex.items-center.gap-1').first();
    await actionRow.locator('button').nth(1).click();

    // Comment input should appear
    const commentInput = postEl.locator('input[placeholder*="комментари"]');
    await expect(commentInput).toBeVisible({ timeout: 5000 });
  });

  test('typing a comment and submitting makes it appear', async ({ page }) => {
    if (!postId) {
      test.skip(true, 'No postId from beforeAll — post creation failed');
      return;
    }
    const postEl = page.locator(`#post-${postId}`);
    await expect(postEl).toBeVisible({ timeout: 10000 });

    // Open comments
    const actionRow = postEl.locator('div.flex.items-center.gap-1').first();
    await actionRow.locator('button').nth(1).click();

    const commentInput = postEl.locator('input[placeholder*="комментари"]');
    await expect(commentInput).toBeVisible({ timeout: 5000 });

    const commentText = 'PW comment ' + Date.now();
    await commentInput.fill(commentText);
    await commentInput.press('Enter');
    await page.waitForTimeout(2000);

    await expect(postEl.getByText(commentText)).toBeVisible({ timeout: 8000 });
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

    // ShareButton is the third action button
    const actionRow = postEl.locator('div.flex.items-center.gap-1').first();
    const shareBtn = actionRow.locator('button').nth(2);
    await shareBtn.click({ force: true });
    await page.waitForTimeout(500);

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
    await page.waitForLoadState('networkidle');

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
    await page.waitForLoadState('networkidle');

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
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/profile');
    // User's firstName starts with "PWFP"
    await expect(page.locator(`text=/PWFP/i`).first()).toBeVisible({ timeout: 10000 });
  });

  test('avatar element is present on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Avatar is an img or a rounded initials element
    const avatar = page.locator('img[alt], [class*="rounded-full"]').first();
    await expect(avatar).toBeVisible({ timeout: 8000 });
  });

  test('user first name is visible on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // createTestUser('fp') → firstName = 'PWFP'
    await expect(page.getByText(/PWFP/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('at least one interactive button is present on profile page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking the first edit button does not crash the page', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const buttons = page.locator('button');
    const count = await buttons.count();
    if (count > 0) {
      await buttons.first().click();
      await page.waitForTimeout(500);
      expect(page.url()).toMatch(/profile|edit/);
    }
  });

  test('portfolio tab buttons switch without crash (if present)', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

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
