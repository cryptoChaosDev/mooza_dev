import { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// ─── Target environment ────────────────────────────────────────────────────────
// Defaults to the DEV stand. Never point this at PROD (moooza.ru): test users are
// created by writing straight into the target DB over SSH.
export const BASE_URL = (process.env.PW_BASE_URL || 'https://dev.moooza.ru').replace(/\/$/, '');
export const API = (process.env.PW_API_URL || `${BASE_URL}/api`).replace(/\/$/, '');

if (/^https?:\/\/(www\.)?moooza\.ru/i.test(BASE_URL) || /^https?:\/\/(www\.)?moooza\.ru/i.test(API)) {
  throw new Error('Playwright helpers refuse to run against PROD (moooza.ru). Use DEV (https://dev.moooza.ru).');
}

// SSH access to the server hosting the target stand's DB (key auth only, no passwords).
const SSH_HOST = process.env.PW_SSH_HOST || 'root@81.31.246.105';
const SSH_KEY = process.env.PW_SSH_KEY || path.join(os.homedir(), '.ssh', 'moooza_admin');
const PG_CONTAINER = process.env.PW_PG_CONTAINER || 'mooza-postgres';
const API_CONTAINER = process.env.PW_API_CONTAINER || 'mooza-api';
const DBNAME = process.env.PW_DB_NAME || 'mooza_db';
const DBUSER = process.env.PW_DB_USER || 'mooza';

/** All E2E accounts use this domain (rate limiters skip it; cleanup keys on it). */
export const TEST_EMAIL_DOMAIN = 'moooza.test';
export const TEST_PASSWORD = 'Test_PW_2026!';

export type TestUser = {
  id: string;
  email: string;
  password: string;
  token: string;
  firstName: string;
  lastName: string;
  /** The `user` object POST /auth/verify-email answered with (SELF_USER_SELECT). */
  verifiedUser?: Record<string, any>;
};

export async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; data: any; ok: boolean }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  // The local network occasionally drops a connection ("fetch failed"). Retry reads,
  // and writes only when the failure happened while connecting (request never sent).
  const connectPhase = /ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT|ENOTFOUND|EAI_AGAIN/;
  let res!: Response;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      break;
    } catch (e: any) {
      const code = String(e?.cause?.code || e?.code || '');
      const retriable = method === 'GET' || connectPhase.test(code);
      if (!retriable || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, ok: res.ok };
}

/** Run a shell command on the DEV server. The command is shipped base64-encoded to dodge quoting. */
function runRemote(shellCmd: string): string {
  const b64 = Buffer.from(shellCmd).toString('base64');
  return execFileSync(
    'ssh',
    ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_HOST, `echo ${b64} | base64 -d | sh`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** Execute SQL against the DEV DB (psql -At: unaligned, tuples only). Throws on failure. */
export function runSqlStrict(sql: string): string {
  const b64 = Buffer.from(sql).toString('base64');
  return runRemote(
    `echo ${b64} | base64 -d | docker exec -i ${PG_CONTAINER} psql -v ON_ERROR_STOP=1 -At -U ${DBUSER} -d ${DBNAME}`,
  );
}

export function runSql(sql: string): string {
  try {
    return runSqlStrict(sql);
  } catch (e: any) {
    console.warn('runSql failed:', e.message);
    return '';
  }
}

let cachedHash: string | null = null;
/** bcrypt hash of TEST_PASSWORD, computed with the API container's own bcryptjs. */
function testPasswordHash(): string {
  if (cachedHash) return cachedHash;
  const js = `require('bcryptjs').hash(${JSON.stringify(TEST_PASSWORD)},10).then(h=>process.stdout.write(h))`;
  const b64 = Buffer.from(js).toString('base64');
  const out = runRemote(`docker exec ${API_CONTAINER} node -e "$(echo ${b64} | base64 -d)"`).trim();
  if (!/^\$2[aby]\$/.test(out)) throw new Error(`bcrypt hash failed: ${out}`);
  cachedHash = out;
  return out;
}

let cachedProfessionId: string | null = null;
function defaultProfessionId(): string {
  if (cachedProfessionId) return cachedProfessionId;
  const id = runSqlStrict(`SELECT id FROM "Profession" WHERE name ILIKE 'Вокалист%' ORDER BY name LIMIT 1;`).trim()
    || runSqlStrict(`SELECT id FROM "Profession" ORDER BY name LIMIT 1;`).trim();
  if (!id) throw new Error('No Profession rows on target DB');
  cachedProfessionId = id;
  return id;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Create a verified user on DEV.
 * Public registration is closed (registrationEnabled=false), so instead of
 * POST /auth/register we plant a PendingRegistration row with a known code and
 * then call the real POST /auth/verify-email — that runs the production account
 * creation path and returns a JWT.
 */
export async function createTestUser(prefix: string, extra: Record<string, unknown> = {}): Promise<TestUser> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `pw_${prefix}_${stamp}@${TEST_EMAIL_DOMAIN}`.toLowerCase();
  const password = TEST_PASSWORD;
  const firstName = `PW${prefix.toUpperCase()}`;
  const lastName = stamp;
  const code = String(10000000 + Math.floor(Math.random() * 89999999));
  // Users registered after 2026-07-16 without a profession are locked behind the
  // full-screen ProfessionGate overlay (client/src/components/ProfessionGate.tsx).
  // Give every test user a profession unless the caller opts out ({ userProfessions: [] }).
  // Mirror what POST /auth/register now stashes in PendingRegistration.payload:
  // birthDate (ISO, 16+ is mandatory), PD consent timestamp + version (consentPd:true
  // is mandatory; verify-email turns it into consentPdAt/termsAgreedAt).
  const nowIso = new Date().toISOString();
  const adult = new Date(); adult.setFullYear(adult.getFullYear() - 25);
  const payload: Record<string, unknown> = {
    email, firstName, lastName, city: 'Москва', country: 'Россия',
    birthDate: adult.toISOString().split('T')[0], // parseBirthDate() stores YYYY-MM-DD
    consentPdAt: nowIso, consentPdVersion: '2026-05-31', consentMarketingAt: null,
    ...extra,
  };
  if (!('userProfessions' in extra)) {
    payload.userProfessions = [{ professionId: defaultProfessionId(), features: [], selectedCustomFilterValueIds: [] }];
  }

  runSqlStrict(
    `INSERT INTO "PendingRegistration" (id, email, "passwordHash", payload, code, "expiresAt", "lastSentAt", "createdAt")
     VALUES (gen_random_uuid()::text, ${sqlStr(email)}, ${sqlStr(testPasswordHash())}, ${sqlStr(JSON.stringify(payload))}::jsonb,
             ${sqlStr(code)}, now() + interval '1 hour', now(), now());`,
  );

  const verify = await apiCall('POST', '/auth/verify-email', { email, code });
  if (!verify.ok || !verify.data?.token) {
    throw new Error(`createTestUser verify-email failed (${verify.status}): ${JSON.stringify(verify.data)}`);
  }
  const token: string = verify.data.token;
  const userId: string = verify.data.user?.id || '';

  // Skip onboarding tour (individual tests can reset it via SQL)
  await apiCall('PATCH', '/users/me/complete-onboarding', undefined, token);

  return { id: userId, email, password, token, firstName, lastName, verifiedUser: verify.data.user };
}

let cachedCollectiveRoleId: string | null = null;
/** Any artist-membership role (Role.context = COLLECTIVE) — POST /artists requires one. */
export function collectiveRoleId(): string {
  if (cachedCollectiveRoleId) return cachedCollectiveRoleId;
  const id = runSqlStrict(`SELECT id FROM "Role" WHERE context = 'COLLECTIVE' ORDER BY "sortOrder", name LIMIT 1;`).trim();
  if (!id) throw new Error('No COLLECTIVE roles on target DB');
  cachedCollectiveRoleId = id;
  return id;
}

/**
 * Create an artist via the API. Since the audit, POST /artists requires a type
 * and the creator's role (submitterRoleIds); without them it answers 400.
 */
export async function createTestArtist(owner: TestUser, name: string, type = 'GROUP'): Promise<string> {
  const r = await apiCall('POST', '/artists', { name, type, submitterRoleIds: [collectiveRoleId()] }, owner.token);
  if (r.status !== 201 || !r.data?.id) throw new Error(`createTestArtist failed (${r.status}): ${JSON.stringify(r.data)}`);
  return r.data.id as string;
}

/** Role-bound invite link for an artist (opens /register in invite-only mode). */
export async function createArtistInvite(owner: TestUser, artistId: string): Promise<{ token: string; url: string; expiresAt: string }> {
  const r = await apiCall('POST', `/artists/${artistId}/invite-link`, { roleIds: [collectiveRoleId()] }, owner.token);
  if (r.status !== 201 || !r.data?.token) throw new Error(`invite-link failed (${r.status}): ${JSON.stringify(r.data)}`);
  return r.data;
}

/**
 * Delete every E2E account (email @moooza.test) and the data hanging off it.
 * Most relations cascade from User; the rest are cleared explicitly first.
 */
export function cleanupTestUsers(): string {
  return runSqlStrict(CLEANUP_SQL);
}

// Every FK to "User" is ON DELETE CASCADE / SET NULL, so deleting the users removes
// their deals, orders, reviews, messages, notifications, professions, etc.
// Conversations are not owned by a user — drop the ones that had only E2E members.
export const CLEANUP_SQL = `
BEGIN;
CREATE TEMP TABLE pw_u AS SELECT id FROM "User" WHERE email LIKE '%@${TEST_EMAIL_DOMAIN}';
CREATE TEMP TABLE pw_c AS
  SELECT DISTINCT cm."conversationId" AS id FROM "ConversationMember" cm
  WHERE cm."userId" IN (SELECT id FROM pw_u)
    AND NOT EXISTS (SELECT 1 FROM "ConversationMember" o
                    WHERE o."conversationId" = cm."conversationId" AND o."userId" NOT IN (SELECT id FROM pw_u));
-- Artist.submittedById is SET NULL on user delete → drop E2E artists explicitly
-- (cascades to members, releases, clips, vacancies, invites, genres, followers).
CREATE TEMP TABLE pw_a AS SELECT id FROM "Artist" WHERE "submittedById" IN (SELECT id FROM pw_u)
  OR id IN (SELECT "artistId" FROM "UserArtist" WHERE "isOwner" AND "userId" IN (SELECT id FROM pw_u));
DELETE FROM "Artist" WHERE id IN (SELECT id FROM pw_a);
-- Notification.actorId is SET NULL on user delete: drop what E2E actors sent to anyone
-- (e.g. admin notifications about complaints filed by test accounts).
DELETE FROM "Notification" WHERE "actorId" IN (SELECT id FROM pw_u);
-- Complaint.targetId is not a FK: drop complaints ABOUT test users / their posts too.
DELETE FROM "Complaint" WHERE ("targetType" = 'user' AND "targetId" IN (SELECT id FROM pw_u))
  OR ("targetType" = 'post' AND "targetId" IN (SELECT id FROM "Post" WHERE "authorId" IN (SELECT id FROM pw_u)));
DELETE FROM "User" WHERE id IN (SELECT id FROM pw_u);
DELETE FROM "Conversation" WHERE id IN (SELECT id FROM pw_c);
DELETE FROM "PendingRegistration" WHERE email LIKE '%@${TEST_EMAIL_DOMAIN}';
SELECT 'deleted_users=' || (SELECT count(*) FROM pw_u) || ' deleted_artists=' || (SELECT count(*) FROM pw_a) || ' deleted_conversations=' || (SELECT count(*) FROM pw_c);
COMMIT;
`;

// Accept either a TestUser object or (email, password) strings for backwards compat
export async function loginUI(page: Page, userOrEmail: TestUser | string, _password?: string): Promise<void> {
  let user: TestUser;
  if (typeof userOrEmail === 'string') {
    const r = await apiCall('POST', '/auth/login', { email: userOrEmail, password: _password });
    user = {
      id: r.data?.user?.id || '',
      email: userOrEmail,
      password: _password!,
      token: r.data?.token || '',
      firstName: r.data?.user?.firstName || '',
      lastName: r.data?.user?.lastName || '',
    };
  } else {
    user = userOrEmail;
  }
  // Diagnostics: if the app falls into its ErrorBoundary («Что-то пошло не так»), surface
  // the error it logged instead of a bare «nav not found» timeout.
  const boundaryLogs: string[] = [];
  page.on('console', (m) => {
    if (!m.text().includes('[ErrorBoundary]')) return;
    boundaryLogs.push(m.text().slice(0, 600));
    console.log(`[app ErrorBoundary @ ${page.url()}] ${m.text().slice(0, 600)}`); // ends up in the test's stdout
  });
  page.on('pageerror', (e) => boundaryLogs.push(`pageerror: ${String(e?.message || e).slice(0, 300)}`));
  // Set token directly in localStorage to bypass login form
  await page.goto('/');
  await page.evaluate(({ token, u }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('termsAgreed', '1');
    localStorage.setItem('mooza_tour_done', '1');
    localStorage.setItem('mooza_cookie_consent', 'necessary');
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user: u, token }, version: 0 }));
  }, { token: user.token, u: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
  await page.reload();
  // Bottom nav (nav.fixed) is lg:hidden — on desktop only the sidebar is visible,
  // so wait for the app shell to be attached rather than for a visible nav.fixed.
  const crashed = page.getByText('Что-то пошло не так');
  await page.locator('nav').first().or(crashed).first().waitFor({ state: 'attached', timeout: 20_000 });
  if (await crashed.isVisible().catch(() => false)) {
    throw new Error(`App ErrorBoundary after login at ${page.url()}: ${boundaryLogs.filter((l) => l.includes('ErrorBoundary') || !/access control checks|mc\.yandex/.test(l)).join(' || ') || '(no console output)'}`);
  }
  try {
    const consent = page.locator('button:has-text("Принять"), button:has-text("OK")');
    if (await consent.count() > 0) await consent.first().click();
  } catch { /* ignore */ }
}

export async function skipOnboarding(page: Page): Promise<void> {
  // If onboarding is shown, skip it
  const url = page.url();
  if (url.includes('/onboarding')) {
    // Try to find a skip/continue button
    const skipBtn = page.locator('button:has-text("Пропустить"), button:has-text("Далее"), button:has-text("Начать")');
    const count = await skipBtn.count();
    if (count > 0) {
      await skipBtn.first().click();
    } else {
      await page.goto('/');
    }
  }
}
