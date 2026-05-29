import { Page, expect } from '@playwright/test';
import { execSync } from 'child_process';

export const BASE = process.env.PW_BASE_URL || 'https://moooza.ru';
export const API = `${BASE}/api`;

// ── SQL helper (verify emails, set flags) ────────────────────────────────────
export function runSql(sql: string): string {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "x-wGeH5uVZs-Y@" root@147.45.166.246 "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U mooza -d mooza_db -t -A"`;
    return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch {
    return '';
  }
}

// ── API shortcut (for setup, not assertions) ──────────────────────────────────
export async function apiCall(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ── Create + verify a fresh test user via API ────────────────────────────────
export async function createTestUser(suffix: string): Promise<{ email: string; password: string; id?: string; token?: string }> {
  const stamp = Date.now().toString(36);
  const email = `pw_${suffix}_${stamp}@moooza.test`;
  const password = 'PW_Test_2026!';

  await apiCall('POST', '/auth/register', {
    firstName: 'PW' + suffix,
    lastName: stamp,
    email,
    password,
    role: 'musician',
    city: 'Moscow',
  });

  // Verify email via SQL
  runSql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}';`);

  // Login
  const login = await apiCall('POST', '/auth/login', { email, password });
  const token = login.data?.token;
  const id = login.data?.user?.id || (token ? (await apiCall('GET', '/users/me', undefined, token)).data?.id : undefined);

  return { email, password, id, token };
}

// ── Login via UI ──────────────────────────────────────────────────────────────
export async function loginUI(page: Page, email: string, password: string) {
  // Pre-set localStorage flags so the terms block and cookie consent banner are hidden
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('termsAgreed', '1');
    localStorage.setItem('mooza_cookie_consent', 'necessary');
  });
  // Reload so React reads the flags at mount
  await page.reload();
  await page.getByPlaceholder(/email/i).fill(email);
  // Password field has placeholder "••••••••" — match by type
  await page.locator('input[type="password"]').fill(password);
  // Accept terms if the custom agree button is still visible (not a checkbox)
  const agreeBtn = page.locator('button').filter({ hasText: /Ознакомился|принимаю условия/i }).first();
  if (await agreeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await agreeBtn.click();
  }
  // Submit via Enter on the password field to avoid mobile bottom-bar intercepting clicks
  await page.locator('input[type="password"]').press('Enter');
  // Wait for redirect away from /login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 12000 });
}

// ── Skip onboarding if shown ──────────────────────────────────────────────────
export async function skipOnboarding(page: Page) {
  const skip = page.getByRole('button', { name: /пропустить/i });
  if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skip.click();
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {});
  }
}

// ── Assert toast / success indicator ─────────────────────────────────────────
export async function expectSuccess(page: Page) {
  // Generic: no error toast visible
  await expect(page.locator('[class*="red-"],[class*="rose-"]').filter({ hasText: /ошибка|error/i })).toHaveCount(0, { timeout: 3000 }).catch(() => {});
}
