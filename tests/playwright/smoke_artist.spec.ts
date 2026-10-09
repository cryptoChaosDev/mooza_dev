/**
 * Artist journey (soft steps, see journey.ts):
 * owner A creates an artist in the UI (role + avatar), edits it, genres, contacts;
 * invites B by link (B accepts), adds existing user C (C accepts), changes C's role,
 * removes B, C leaves; release + clip create/open/delete; vacancy → B responds.
 * Report: test-results/smoke/<project>-artist.json
 */
import { test, expect, Page } from '@playwright/test';
import zlib from 'node:zlib';
import { createTestUser, apiCall, runSqlStrict, TestUser } from './helpers';
import { Journey, injectSession } from './journey';

function solidPng(w: number, h: number, rgb = [120, 60, 200]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function pickRole(p: Page, roleName: string) {
  const sheet = p.locator('div.fixed.inset-0').filter({ has: p.locator('h3') }).last();
  await expect(sheet.getByRole('button', { name: roleName, exact: true })).toBeVisible({ timeout: 10_000 });
  await sheet.getByRole('button', { name: roleName, exact: true }).click();
  await sheet.getByRole('button', { name: 'Сохранить' }).click();
}

test('smoke: artist — create, edit, genres, contacts, members, release, clip, vacancy', async ({ page, browser }, testInfo) => {
  test.setTimeout(420_000);
  const j = new Journey(page, testInfo, 'artist');
  const [a, b, c]: TestUser[] = await Promise.all([createTestUser('ara'), createTestUser('arb'), createTestUser('arc')]);
  await injectSession(page, a);
  const mk = async (u: TestUser) => {
    const ctx = await browser.newContext({ ...(testInfo.project.use as any) });
    const p = await ctx.newPage(); j.watch(p); await injectSession(p, u); return { ctx, p };
  };
  const B = await mk(b);
  const C = await mk(c);
  const stamp = Date.now().toString(36);
  const artistName = `PW Артист ${stamp}`;
  let artistId = '';
  const extra: Record<string, unknown> = { users: [a.email, b.email, c.email] };
  const memberStatus = (u: TestUser) =>
    runSqlStrict(`SELECT "inviteStatus" FROM "UserArtist" WHERE "artistId" = '${artistId}' AND "userId" = '${u.id}';`).trim();
  const memberRoles = (u: TestUser) =>
    runSqlStrict(`SELECT string_agg(r.name, ',') FROM "UserArtist" ua JOIN "UserArtistRole" uar ON uar."userArtistId" = ua.id JOIN "Role" r ON r.id = uar."roleId" WHERE ua."artistId" = '${artistId}' AND ua."userId" = '${u.id}';`).trim();
  const notes: string[] = [];
  extra.notes = notes;
  const needArtist = () => expect(artistId, 'artist exists').toBeTruthy();

  await j.step('A1 create artist (UI: role + avatar + name + type)', async () => {
    await page.goto('/artist/create');
    await expect(page.getByText('Новый артист').first()).toBeVisible({ timeout: 15_000 });
    await j.checkOverflow('/artist/create');
    await page.getByRole('button', { name: 'Выбрать роль из каталога' }).click();
    await pickRole(page, 'Композитор');
    await page.locator('input[type=file][accept="image/*"]').nth(1).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: solidPng(300, 300) });
    const crop = page.locator('div.fixed').filter({ hasText: 'Аватар' }).last();
    await crop.getByRole('button', { name: 'Сохранить' }).click({ timeout: 15_000 });
    await page.getByPlaceholder('Название артиста').fill(artistName);
    await page.getByRole('button', { name: 'Выбрать тип' }).click();
    await page.getByRole('button', { name: 'Группа', exact: true }).click();
    await page.getByRole('button', { name: 'Получить код' }).click();
    await expect(page.getByText('Артист создан')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Перейти на страницу артиста' }).click();
    await page.waitForURL(/\/artist\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    artistId = page.url().split('/artist/')[1];
    const av = await apiCall('GET', `/artists/${artistId}`, undefined, a.token);
    expect(av.data?.avatar || av.data?.avatarUrl, 'avatar uploaded').toBeTruthy();
  });
  if (!artistId) {
    // Fallback seed so the remaining steps can still run.
    const r = await apiCall('POST', '/artists', { name: artistName, type: 'GROUP' }, a.token);
    artistId = r.data?.id || '';
    extra.artistSeededViaApi = true;
  }
  extra.artistId = artistId;

  await j.step('A2 artist page', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}`);
    await expect(page.getByRole('heading', { level: 1, name: artistName })).toBeVisible({ timeout: 15_000 });
    await j.checkOverflow('/artist/:id');
  });

  await j.step('A3 edit main info (UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}/edit`);
    await expect(page.getByText('Основная информация').first()).toBeVisible({ timeout: 15_000 });
    await j.checkOverflow('/artist/:id/edit');
    await page.getByPlaceholder('Готовы к гастролям').fill('Да, PW');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(async () => (await apiCall('GET', `/artists/${artistId}`, undefined, a.token)).data?.tourReady, { timeout: 10_000 }).toBe('Да, PW');
  });

  await j.step('A4 genres (UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}/genres`);
    const chip = page.locator('div.flex.flex-wrap.gap-1\\.5 > button').first();
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await j.checkOverflow('/artist/:id/genres');
    await chip.click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(async () => {
      const d = (await apiCall('GET', `/artists/${artistId}`, undefined, a.token)).data || {};
      return (d.genres || d.artistGenres || []).length;
    }, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  await j.step('A5 contacts (UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}/contacts`);
    await page.getByPlaceholder('https://band.link/...').fill(`https://band.link/pw${stamp}`);
    await j.checkOverflow('/artist/:id/contacts');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(async () => (await apiCall('GET', `/artists/${artistId}`, undefined, a.token)).data?.bandLink, { timeout: 10_000 }).toContain(`pw${stamp}`);
  });

  await j.step('A6 invite by link (owner UI) → B accepts (UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}/invite`);
    await page.getByRole('button', { name: 'Выбрать роли' }).click();
    await pickRole(page, 'Автор текста');
    await j.checkOverflow('/artist/:id/invite');
    await page.getByRole('button', { name: 'Создать ссылку' }).click();
    const code = page.locator('code').first();
    await expect(code).toBeVisible({ timeout: 10_000 });
    const link = (await code.innerText()).trim();
    extra.inviteLink = link;
    const token = new URL(link).searchParams.get('artistInvite');
    expect(token, `token in ${link}`).toBeTruthy();
    // Opened on the stand under test (the generated link host is recorded in the report).
    await B.p.goto(`/register?artistInvite=${token}`);
    await B.p.getByRole('button', { name: 'Принять приглашение' }).click();
    await B.p.waitForURL(new RegExp(`/artist/${artistId}`), { timeout: 15_000 });
    await expect.poll(() => memberStatus(b), { timeout: 10_000 }).toBe('ACCEPTED');
    expect(new URL(link).host, 'invite link host should be the DEV stand').toBe(new URL(B.p.url()).host);
  });

  await j.step('A7 add existing user C (owner UI) → C accepts on artist page (UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}/members/add`);
    await page.getByPlaceholder('Имя или никнейм...').fill(c.lastName);
    await page.getByRole('button', { name: new RegExp(c.lastName) }).first().click();
    await page.getByRole('button', { name: 'Выбрать роли' }).click();
    await pickRole(page, 'Битмейкер');
    await j.checkOverflow('/artist/:id/members/add');
    await page.getByRole('button', { name: /^Добавить$/ }).click();
    await expect.poll(() => memberStatus(c), { timeout: 10_000 }).toBe('PENDING');
    await C.p.goto(`/artist/${artistId}`);
    await C.p.getByRole('button', { name: 'Подтвердить' }).click();
    await expect.poll(() => memberStatus(c), { timeout: 10_000 }).toBe('ACCEPTED');
  });

  // Click the member-card button (by title) that belongs to the given user.
  const clickMemberBtn = async (p: Page, u: TestUser, title: string) => {
    await expect(p.getByText(u.lastName).first()).toBeAttached({ timeout: 15_000 });
    const idx = await p.evaluate(({ title, last }) => {
      const btns = Array.from(document.querySelectorAll(`button[title="${title}"]`));
      return btns.findIndex((btn) => {
        let el: HTMLElement | null = btn as HTMLElement;
        while (el && !/PWAR[ABC]/.test(el.innerText || '')) el = el.parentElement;
        return !!el && (el.innerText || '').includes(last);
      });
    }, { title, last: u.lastName });
    expect(idx, `«${title}» button for ${u.lastName}`).toBeGreaterThanOrEqual(0);
    await p.locator(`button[title="${title}"]`).nth(idx).click();
  };

  await j.step('A8 change C role (owner UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}`);
    await clickMemberBtn(page, c, 'Изменить роли');
    await pickRole(page, 'Аранжировщик');
    await expect.poll(() => memberRoles(c), { timeout: 10_000 }).toContain('Аранжировщик');
  });

  await j.step('A9 remove member B (owner UI)', async () => {
    needArtist();
    await page.goto(`/artist/${artistId}`);
    await clickMemberBtn(page, b, 'Удалить участника');
    await page.getByRole('button', { name: /^Удалить$/ }).click();
    await expect.poll(() => memberStatus(b), { timeout: 10_000 }).toBe('');
  });

  await j.step('A10 member C leaves the artist (API only — no UI)', async () => {
    needArtist();
    const r = await apiCall('DELETE', `/groups/${artistId}/leave`, undefined, c.token);
    expect(r.status, `DELETE /groups/:id/leave → ${JSON.stringify(r.data)}`).toBeLessThan(300);
    await expect.poll(() => memberStatus(c), { timeout: 10_000 }).toBe('');
    throw new Error('Leave works via legacy API only: there is no «Выйти из артиста» control in the UI');
  });

  for (const kind of ['release', 'clip'] as const) {
    const label = kind === 'release' ? 'релиз' : 'клип';
    await j.step(`A11 ${label}: create → open → delete (UI)`, async () => {
      needArtist();
      const title = `PW ${label} ${stamp}`;
      await page.goto(`/artist/${artistId}/${kind}s/new`);
      await page.getByPlaceholder('https://...').first().fill(kind === 'release' ? 'https://music.yandex.ru/album/123456' : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.getByPlaceholder(kind === 'release' ? 'Название релиза' : 'Название трека').fill(title);
      await j.checkOverflow(`/artist/:id/${kind}s/new`);
      await page.getByRole('button', { name: 'Сохранить' }).last().click();
      await page.waitForURL(new RegExp(`/artist/${artistId}$`), { timeout: 15_000 });
      if (!(await page.getByText(title).first().isVisible({ timeout: 6_000 }).catch(() => false))) {
        notes.push(`${kind}: после сохранения и возврата на страницу артиста новый ${label} не виден в ленте до перезагрузки страницы`);
        await page.reload();
      }
      await page.getByText(title).first().click();
      await page.waitForURL(new RegExp(`/${kind}s/[0-9a-f-]{36}`), { timeout: 15_000 });
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 });
      await j.checkOverflow(`/${kind}s/:id`);
      const id = page.url().split(`/${kind}s/`)[1];
      await page.locator('button[title="Удалить"]').click();
      await page.locator('button.bg-red-600', { hasText: 'Удалить' }).click();
      await page.waitForURL(new RegExp(`/artist/${artistId}`), { timeout: 15_000 });
      const left = runSqlStrict(`SELECT count(*) FROM "${kind === 'release' ? 'Release' : 'Clip'}" WHERE id = '${id}';`).trim();
      expect(left, `${kind} row deleted`).toBe('0');
    });
  }

  let vacancyId = '';
  await j.step('A12 vacancy: create & publish (owner UI)', async () => {
    needArtist();
    const title = `PW вакансия ${stamp}`;
    await page.goto(`/artist/${artistId}/vacancies/new`);
    await page.getByPlaceholder('Например: Ищем гитариста в группу').fill(title);
    await page.getByPlaceholder('Поиск профессии…').fill('Гитар');
    await page.locator('button:has(span.truncate)').filter({ hasText: /Гитар/ }).first().click();
    for (const [lab, opt] of [['Формат работы', 'Онлайн'], ['География', 'По всей стране'], ['Тип занятости', 'Проектная'], ['Тип оплаты', 'Бартер']]) {
      await page.getByRole('button', { name: new RegExp(`^${lab}`) }).click();
      await page.getByRole('button', { name: opt, exact: true }).click();
    }
    await page.getByPlaceholder('Расскажите, кого вы ищете и на каких условиях…').fill('Smoke-тест Playwright');
    await j.checkOverflow('/artist/:id/vacancies/new');
    await page.getByRole('button', { name: 'Опубликовать' }).click();
    await expect.poll(() => {
      vacancyId = runSqlStrict(`SELECT id FROM "Vacancy" WHERE title = '${title}' AND status = 'active' LIMIT 1;`).trim();
      return vacancyId;
    }, { timeout: 15_000 }).not.toBe('');
  });

  await j.step('A13 vacancy response (B, UI)', async () => {
    expect(vacancyId, 'vacancy exists').toBeTruthy();
    await B.p.goto(`/vacancies/${vacancyId}`);
    await j.checkOverflow('/vacancies/:id', B.p);
    await B.p.getByRole('button', { name: 'Откликнуться' }).click();
    await B.p.getByPlaceholder('Расскажите о себе и почему вы подходите...').fill('PW отклик');
    await B.p.getByRole('button', { name: 'Отправить отклик' }).click();
    await expect(B.p.getByText('Ваш отклик отправлен')).toBeVisible({ timeout: 10_000 });
  });

  await B.ctx.close();
  await C.ctx.close();
  await j.finish(extra);
});
