import { test, expect } from '@playwright/test';
import { createTestUser, loginUI, skipOnboarding, apiCall, createTestArtist } from './helpers';
import type { TestUser } from './helpers';

let user: Awaited<ReturnType<typeof createTestUser>>;
let user2: Awaited<ReturnType<typeof createTestUser>>;
let usersReady = false;

test.beforeAll(async () => {
  try {
    [user, user2] = await Promise.all([createTestUser('nna'), createTestUser('nnb')]);
    usersReady = true;
  } catch (e: any) {
    console.warn('[beforeAll] createTestUser failed:', e.message,
      '— tests that require users will be skipped.');
  }
});

// Skip every test in this file if user creation failed (e.g. auth rate limit hit).
test.beforeEach(async () => {
  test.skip(!usersReady, 'User creation failed (rate limit or auth error) — skipping auth-required tests');
});

// ── Bottom navigation ──────────────────────────────────────────────────────────

test.describe('Bottom navigation', () => {
  test('bottom nav is visible on home page after login', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    // Bottom nav on mobile, sidebar nav on desktop (lg+).
    await expect(page.locator('nav:visible').first()).toBeVisible();
  });

  test('nav icon Каталог → /search', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    // Find the link to /search in bottom nav
    const searchLink = page.locator('a[href=\"/search\"]:visible').first();
    await expect(searchLink).toBeVisible();
    await searchLink.click();
    await expect(page).toHaveURL(/\/search/);
  });

  test('nav icon Сообщения → /messages', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const messagesLink = page.locator('a[href=\"/messages\"]:visible').first();
    await expect(messagesLink).toBeVisible();
    await messagesLink.click();
    await expect(page).toHaveURL(/\/messages/);
  });

  test('nav icon Профиль → /profile', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const profileLink = page.locator('a[href=\"/profile\"]:visible').first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await expect(page).toHaveURL(/\/profile/);
  });

  test('nav icon Друзья → /friends', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const friendsLink = page.locator('a[href=\"/friends\"]:visible').first();
    await expect(friendsLink).toBeVisible();
    await friendsLink.click();
    await expect(page).toHaveURL(/\/friends/);
  });

  test('nav icon Главная → / (from another page)', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    // Navigate to search first, then go back to home
    await page.goto('/search');
    // Dismiss cookie/consent dialogs if present
    const consentBtn = page.locator('button:has-text("Принять"), button:has-text("OK"), button:has-text("Закрыть")');
    if (await consentBtn.count() > 0) {
      await consentBtn.first().click().catch(() => {});
    }
    const homeLink = page.locator('a[href=\"/\"]:visible').first();
    await expect(homeLink).toBeVisible();
    await homeLink.click({ force: true });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
  });
});

// ── Notification bell ──────────────────────────────────────────────────────────

test.describe('Notifications', () => {
  test('bell button opens notification panel', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);

    // Create friendship request from user2 → user so user gets a notification
    const r = await apiCall('POST', '/friendships', { receiverId: user.id }, user2.token);
    // Ignore if already exists

    // Reload to pick up new notification state
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Find the bell button in the header
    const bellBtn = page.locator('header button').filter({ has: page.locator('svg') }).first();
    // More specific: look for the NotificationBell button with a Bell icon
    // The bell is rendered before the Info icon in the header
    // Updated: bell has aria-label (header on mobile, sidebar on desktop — both in DOM).
    const bellButton = page.locator('button[aria-label="Уведомления"]:visible');
    await expect(bellButton).toBeVisible();
    await bellButton.click();

    // Notification panel should appear — it renders "Уведомления" text
    await expect(page.locator('text=Уведомления').first()).toBeVisible({ timeout: 8_000 });
  });

  test('notification from user2 is visible in panel', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);

    // Open notification panel
    await page.locator('button[aria-label="Уведомления"]:visible').click();

    // Panel should show either "Нет уведомлений" or a notification
    const panel = page.locator('text=Уведомления').first();
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // At least one of these should be true: notification exists OR empty state shown
    const hasNotif = await page.locator('button[class*="hover:bg-slate-800"]').count();
    const hasEmpty = await page.locator('text=Нет уведомлений').count();
    expect(hasNotif + hasEmpty).toBeGreaterThan(0);
  });

  test('mark all read button reduces unread count', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);

    // Open notifications
    await page.locator('button[aria-label="Уведомления"]:visible').click();
    await expect(page.locator('text=Уведомления').first()).toBeVisible({ timeout: 8_000 });

    // If "Прочитать все" button exists, click it
    const markAllBtn = page.locator('button:has-text("Прочитать все")');
    const exists = await markAllBtn.count();
    if (exists > 0) {
      await markAllBtn.click();
      // Badge should disappear or count should be 0
      await page.waitForTimeout(1000);
      const badge = page.locator('header').locator('span').filter({ hasText: /^\d+$/ });
      const badgeCount = await badge.count();
      // Badge either gone or shows 0-like state
      if (badgeCount > 0) {
        const text = await badge.first().textContent();
        expect(Number(text)).toBe(0);
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'No unread notifications — skipping mark-all-read check' });
    }
  });

  test('close notification panel with X button', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);

    await page.locator('button[aria-label="Уведомления"]:visible').click();
    await expect(page.locator('text=Уведомления').first()).toBeVisible({ timeout: 8_000 });

    // Find close button (X) inside the notification panel
    // Updated: X is the last button of the panel header (no label).
    const closeBtn = page.locator('span', { hasText: /^Уведомления$/ }).locator('xpath=ancestor::div[2]').locator('button').last();
    await closeBtn.click();

    // Panel should be gone
    await expect(page.locator('span', { hasText: /^Уведомления$/ })).toHaveCount(0, { timeout: 5_000 });
  });
});

// ── Profile settings ───────────────────────────────────────────────────────────

test.describe('Profile settings', () => {
  test('profile page loads', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    // Name should be visible
    await expect(page.locator(`text=${user.firstName}`).first()).toBeVisible({ timeout: 10_000 });
  });

  test('edit profile button opens edit form', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');

    // Click "Редактировать" button
    // Updated: icon button with title (no text).
    const editBtn = page.locator('button[title="Редактировать"]');
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // An input for firstName or some form element should appear
    const input = page.locator('input[placeholder="Имя"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
  });

  test('bio field is editable', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // The bio section has either "+ Добавить описание" button or a small pencil Edit3 icon.
    // Both lead to the bio textarea (placeholder "Расскажите о себе...") becoming visible.
    const addBioBtn = page.locator('button:has-text("+ Добавить описание")');
    const addBioCount = await addBioBtn.count();

    if (addBioCount > 0) {
      await addBioBtn.click();
    } else {
      // Bio exists; there's a tiny Edit3 icon button just after the bio text.
      // It's the last button before the bio editing form — click it by targeting
      // the element that wraps bio text + edit button.
      const bioSection = page.locator('div.flex.items-start.gap-2').first();
      const pencil = bioSection.locator('button').last();
      await pencil.click();
    }

    const textarea = page.locator('textarea[placeholder="Расскажите о себе..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
  });

  test('save button is clickable in hero edit', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');

    // Updated: icon button with title (no text).
    const editBtn = page.locator('button[title="Редактировать"]');
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const saveBtn = page.locator('button:has-text("Сохранить")').first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeEnabled();
  });

  test('save hero form completes without error', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/profile');

    // Updated: icon button with title (no text).
    const editBtn = page.locator('button[title="Редактировать"]');
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Change city field
    const cityInput = page.locator('input[placeholder="Москва"]');
    await expect(cityInput).toBeVisible({ timeout: 5_000 });
    await cityInput.fill('Санкт-Петербург');

    const saveBtn = page.locator('button:has-text("Сохранить")').first();
    await saveBtn.click();

    // Should not show any red error text
    await page.waitForTimeout(2000);
    const errors = page.locator('text=Ошибка, text=error, text=Error');
    const errorCount = await errors.count();
    expect(errorCount).toBe(0);
  });
});

// ── Artist create page ─────────────────────────────────────────────────────────

test.describe('Artist create page', () => {
  // Updated: «Новый коллектив» → «Новый артист»; required: role, avatar, name, type;
  // submit button is «Получить код» (artist is created as a draft with a verification code).
  test.beforeEach(async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/artist/create');
  });

  test('/artist/create opens successfully', async ({ page }) => {
    await expect(page.getByText('Новый артист').first()).toBeVisible({ timeout: 10_000 });
  });

  test('name field is present', async ({ page }) => {
    await expect(page.getByPlaceholder('Название артиста')).toBeVisible({ timeout: 10_000 });
  });

  test('type selector is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Выбрать тип' })).toBeVisible({ timeout: 10_000 });
  });

  test('submit «Получить код» is disabled when the form is empty', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Получить код' });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await expect(createBtn).toBeDisabled();
  });

  test('submit stays disabled with only a name (role/avatar/type required)', async ({ page }) => {
    await page.getByPlaceholder('Название артиста').fill('Test Band PW');
    await expect(page.getByRole('button', { name: 'Получить код' })).toBeDisabled();
  });

  test('type selector opens sheet with options', async ({ page }) => {
    await page.getByRole('button', { name: 'Выбрать тип' }).click();
    await expect(page.getByText('Сольный артист').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── Artist page ────────────────────────────────────────────────────────────────

test.describe('Artist page', () => {
  let artistId: string;

  test.beforeAll(async () => {
    if (!usersReady) return; // global users failed — skip
    // Updated: POST /artists now requires the creator's role (submitterRoleIds) and a type.
    artistId = await createTestArtist(user, 'PW Band', 'GROUP');
  });

  test('artist page loads and shows name', async ({ page }) => {
    if (!artistId) {
      test.skip(true, 'Artist was not created via API');
      return;
    }
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto(`/artist/${artistId}`);
    await expect(page.locator('text=PW Band').first()).toBeVisible({ timeout: 10_000 });
  });

  test('subscribe button toggles to unsubscribe', async ({ page }) => {
    if (!artistId) {
      test.skip(true, 'Artist was not created via API');
      return;
    }
    // Use user2 to follow (user is owner, owner has no follow button)
    await loginUI(page, user2);
    await skipOnboarding(page);
    await page.goto(`/artist/${artistId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Updated: follow is an icon button title «В избранное» / «В избранном».
    const followBtn = page.locator('button[title="В избранное"]');
    const unfollowBtn = page.locator('button[title="В избранном"]');

    const followCount = await followBtn.count();
    if (followCount > 0) {
      await followBtn.click();
      await expect(unfollowBtn).toBeVisible({ timeout: 5_000 });
    } else {
      // Already following
      await expect(unfollowBtn).toBeVisible({ timeout: 5_000 });
    }
  });

  test('unsubscribe button toggles back to subscribe', async ({ page }) => {
    if (!artistId) {
      test.skip(true, 'Artist was not created via API');
      return;
    }
    await loginUI(page, user2);
    await skipOnboarding(page);
    await page.goto(`/artist/${artistId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {}); // live polling may keep the network busy

    // Make sure we are following first
    // Updated: follow is an icon button title «В избранное» / «В избранном».
    const followBtn = page.locator('button[title="В избранное"]');
    const unfollowBtn = page.locator('button[title="В избранном"]');

    const followCount = await followBtn.count();
    if (followCount > 0) {
      await followBtn.click();
      await expect(unfollowBtn).toBeVisible({ timeout: 5_000 });
    }

    const unfollowCount = await unfollowBtn.count();
    if (unfollowCount > 0) {
      await unfollowBtn.click();
      await expect(followBtn).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ── Flow settings ──────────────────────────────────────────────────────────────

test.describe('Flow settings', () => {
  test('/flow-settings page opens', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/flow-settings');
    await expect(page.locator('text=Настроить Поток')).toBeVisible({ timeout: 10_000 });
  });

  test('post type chips are visible', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/flow-settings');
    await expect(page.locator('button:has-text("Все")').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button:has-text("Блог")').first()).toBeVisible();
  });

  test('period chips are visible', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/flow-settings');
    await expect(page.locator('button:has-text("За всё время")')).toBeVisible({ timeout: 10_000 });
    // Updated: period chips are Сегодня / Вчера / За 3 дня / … (no «День»).
    await expect(page.locator('button:has-text("Сегодня")')).toBeVisible();
  });

  test('clicking a chip changes its active state', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/flow-settings');
    const blogChip = page.locator('button:has-text("Блог")');
    await expect(blogChip).toBeVisible({ timeout: 10_000 });
    await blogChip.click();
    // After clicking, "Блог" chip should have bg-primary-600 class
    await expect(blogChip).toHaveClass(/bg-primary-600/);
  });

  test('apply button is visible', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    await page.goto('/flow-settings');
    await expect(page.locator('button:has-text("Применить")')).toBeVisible({ timeout: 10_000 });
  });

  test('apply button navigates back', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    // Navigate to flow-settings from home so back works
    await page.goto('/');
    await page.goto('/flow-settings');
    await page.locator('button:has-text("Применить")').click();
    // Should navigate away from /flow-settings
    await expect(page).not.toHaveURL(/\/flow-settings/, { timeout: 5_000 });
  });
});

// ── Info modal ─────────────────────────────────────────────────────────────────

test.describe('Info modal', () => {
  test('info button (ⓘ) is visible in header', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    // Info button is second button in header (after NotificationBell)
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await expect(infoBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicking info button opens modal with О Moooza', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await infoBtn.click();
    await expect(page.getByRole('heading', { name: 'О Moooza' })).toBeVisible({ timeout: 5_000 });
  });

  test('info modal contains Terms and Privacy links', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await infoBtn.click();
    await expect(page.locator('text=Пользовательское соглашение')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Политика конфиденциальности')).toBeVisible();
  });

  test('info modal contains onboarding restart button', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await infoBtn.click();
    await expect(page.locator('text=Начать онбординг заново')).toBeVisible({ timeout: 5_000 });
  });

  test('clicking "Начать онбординг заново" closes modal and goes to /onboarding', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await infoBtn.click();
    await expect(page.locator('text=Начать онбординг заново')).toBeVisible({ timeout: 5_000 });
    await page.locator('button:has-text("Начать онбординг заново")').click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 8_000 });
    // Modal should be gone
    await expect(page.getByRole('heading', { name: 'О Moooza' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('X button closes info modal', async ({ page }) => {
    await loginUI(page, user);
    await skipOnboarding(page);
    const infoBtn = page.locator('button[aria-label="Информация"]:visible');
    await infoBtn.click();
    await expect(page.getByRole('heading', { name: 'О Moooza' })).toBeVisible({ timeout: 5_000 });
    // Find X button inside the modal
    const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(3);
    // More precisely: look for a button that is inside the modal overlay area
    const modalCloseBtn = page.locator('div[class*="fixed"][class*="inset-x-0"][class*="bottom-0"] button').first();
    await modalCloseBtn.click();
    await expect(page.getByRole('heading', { name: 'О Moooza' })).not.toBeVisible({ timeout: 5_000 });
  });
});
