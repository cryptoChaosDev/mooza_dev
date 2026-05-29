import { Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const API = 'https://moooza.ru/api';
const PLINK_PW = process.env.PLINK_PW || 'x-wGeH5uVZs-Y@';
const VPS = 'root@147.45.166.246';
const DBNAME = 'mooza_db';
const DBUSER = 'mooza';

export type TestUser = {
  id: string;
  email: string;
  password: string;
  token: string;
  firstName: string;
  lastName: string;
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

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, ok: res.ok };
}

export function runSql(sql: string): string {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const remote = `echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME}`;
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "${remote}"`;
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e: any) {
    console.warn('runSql failed:', e.message);
    return '';
  }
}

export async function createTestUser(prefix: string): Promise<TestUser> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `pw_${prefix}_${stamp}@moooza.test`;
  const password = 'Test_PW_2026!';
  const firstName = `PW${prefix.toUpperCase()}`;
  const lastName = stamp;

  // Register
  const reg = await apiCall('POST', '/auth/register', {
    firstName,
    lastName,
    email,
    password,
    role: 'musician',
    city: 'Moscow',
  });
  if (!reg.ok) {
    throw new Error(`createTestUser register failed: ${JSON.stringify(reg.data)}`);
  }

  // Auto-verify email via SSH: set emailVerified=true AND plant a known code so we can
  // call /auth/verify-email to receive a token without hitting the login rate limiter.
  const KNOWN_CODE = '123456';
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hr from now
  const sql = `UPDATE "User" SET "emailVerified" = false, "emailVerificationCode" = '${KNOWN_CODE}', "emailVerificationExpires" = '${future}' WHERE email = '${email}';`;
  runSql(sql);

  // Call verify-email to get a token — avoids the login rate limiter entirely.
  const verify = await apiCall('POST', '/auth/verify-email', { email, code: KNOWN_CODE });

  let token: string = '';
  let userId: string = '';

  if (verify.ok) {
    token = verify.data.token;
    userId = verify.data.user?.id || '';
  } else {
    // Fallback: set emailVerified directly and use login
    runSql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}';`);
    const login = await apiCall('POST', '/auth/login', { email, password });
    if (!login.ok) {
      throw new Error(`createTestUser login failed: ${JSON.stringify(login.data)}`);
    }
    token = login.data.token;
    userId = login.data.user?.id || login.data.id || '';
  }

  // Skip onboarding
  await apiCall('PATCH', '/users/me/complete-onboarding', undefined, token);

  return { id: userId, email, password, token, firstName, lastName };
}

export async function loginUI(page: Page, user: TestUser): Promise<void> {
  // Set token directly in localStorage to bypass login form
  await page.goto('/');
  await page.evaluate(({ token, user: u }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('termsAgreed', '1');
    localStorage.setItem('mooza_tour_done', '1');
    // Persist Zustand auth-storage
    const authState = {
      state: { user: u, token },
      version: 0,
    };
    localStorage.setItem('auth-storage', JSON.stringify(authState));
  }, { token: user.token, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
  await page.reload();
  // Wait for the mobile bottom nav (fixed bottom) to appear — authenticated state.
  // The desktop sidebar also has a <nav>, so use the fixed-bottom one specifically.
  // Try nav.fixed first (mobile bottom nav), fall back to any nav for resilience.
  try {
    await page.waitForSelector('nav.fixed', { timeout: 20_000 });
  } catch {
    // On slower connections or if viewport triggers desktop mode, just wait for any nav
    await page.waitForSelector('nav', { timeout: 10_000 });
  }
  // Dismiss cookie/consent dialogs if present so they don't block clicks.
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
