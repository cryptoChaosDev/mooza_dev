/**
 * Soft-step journey runner shared by the smoke specs.
 * - every step is recorded OK / FAIL (with screenshot) / SKIP / NOT RUN;
 * - console errors, page errors, /api 4xx-5xx and failed requests are attributed
 *   to the step that was running when they happened;
 * - checkOverflow() records horizontal page scroll (scrollWidth > clientWidth).
 * Results go to test-results/smoke/<project>-<name>.json.
 */
import { Page, TestInfo, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export type StepStatus = 'OK' | 'FAIL' | 'SKIP' | 'NOT RUN';
export type StepResult = { step: string; status: StepStatus; error?: string; screenshot?: string; ms: number };
type Ev = { step: string; url: string; text: string };

export class Journey {
  steps: StepResult[] = [];
  consoleErrors: Ev[] = [];
  pageErrors: Ev[] = [];
  apiErrors: (Ev & { status: number; method: string })[] = [];
  requestFailures: Ev[] = [];
  overflow: { step: string; page: string; scrollWidth: number; clientWidth: number; offenders: string[] }[] = [];
  current = 'setup';
  readonly outDir = path.join('test-results', 'smoke');
  /** Expected API errors (regex on "METHOD /path STATUS") that should not be reported. */
  ignoreApi: RegExp[] = [];

  constructor(public page: Page, public info: TestInfo, public name: string) {
    fs.mkdirSync(this.outDir, { recursive: true });
    this.watch(page);
  }

  watch(page: Page) {
    const rel = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');
    page.on('console', (m) => {
      if (m.type() === 'error') this.consoleErrors.push({ step: this.current, url: rel(page.url()), text: m.text().slice(0, 400) });
    });
    page.on('pageerror', (e) => this.pageErrors.push({ step: this.current, url: rel(page.url()), text: String(e?.message || e).slice(0, 400) }));
    page.on('response', (r) => {
      const u = r.url();
      if (!u.includes('/api/') || r.status() < 400) return;
      const sig = `${r.request().method()} ${rel(u)} ${r.status()}`;
      if (this.ignoreApi.some((re) => re.test(sig))) return;
      this.apiErrors.push({ step: this.current, url: rel(page.url()), text: rel(u).slice(0, 200), status: r.status(), method: r.request().method() });
    });
    page.on('requestfailed', (r) => {
      const u = r.url();
      const err = r.failure()?.errorText || '';
      // Aborts caused by our own navigations are noise.
      if (/ABORTED|cancelled|NS_BINDING_ABORTED|Load request cancelled/i.test(err)) return;
      if (u.includes('/api/') || u.includes('/socket.io/') || u.includes('/uploads/')) {
        this.requestFailures.push({ step: this.current, url: rel(page.url()), text: `${rel(u).slice(0, 200)} :: ${err}` });
      }
    });
  }

  async step(name: string, fn: () => Promise<void>, opts: { page?: Page } = {}): Promise<boolean> {
    const p = opts.page || this.page;
    this.current = name;
    const t0 = Date.now();
    try {
      await fn();
      this.steps.push({ step: name, status: 'OK', ms: Date.now() - t0 });
      return true;
    } catch (e: any) {
      const shot = path.join(this.outDir, `${this.info.project.name}-${this.name}-${this.steps.length + 1}-${name.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 60)}.png`);
      await p.screenshot({ path: shot }).catch(() => {});
      const msg = String(e?.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 600);
      this.steps.push({ step: name, status: 'FAIL', error: msg, screenshot: shot, ms: Date.now() - t0 });
      return false;
    }
  }

  skip(name: string, why: string, status: StepStatus = 'SKIP') {
    this.steps.push({ step: name, status, error: why, ms: 0 });
  }

  async checkOverflow(label: string, page: Page = this.page) {
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const cw = de.clientWidth;
      const offenders: string[] = [];
      if (de.scrollWidth > cw + 1) {
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.right > cw + 1) {
            const h = el as HTMLElement;
            const cls = typeof h.className === 'string' ? h.className.slice(0, 80) : '';
            offenders.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(rect.right)} "${(h.innerText || '').slice(0, 30).replace(/\s+/g, ' ')}"`);
            if (offenders.length >= 5) break;
          }
        }
      }
      return { scrollWidth: de.scrollWidth, clientWidth: cw, offenders };
    }).catch(() => null);
    if (r && r.scrollWidth > r.clientWidth + 1) this.overflow.push({ step: this.current, page: label, ...r });
  }

  async finish(extra: Record<string, unknown> = {}) {
    const report = {
      project: this.info.project.name, journey: this.name, ...extra, steps: this.steps,
      consoleErrors: this.consoleErrors, pageErrors: this.pageErrors, apiErrors: this.apiErrors,
      requestFailures: this.requestFailures, overflow: this.overflow,
    };
    fs.writeFileSync(path.join(this.outDir, `${this.info.project.name}-${this.name}.json`), JSON.stringify(report, null, 2));
    await this.info.attach(`${this.name}-report`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    const failed = this.steps.filter((s) => s.status === 'FAIL');
    expect(failed.map((s) => `${s.step}: ${s.error}`), 'failed journey steps').toEqual([]);
  }
}

/** Put a token-authenticated session into a page (no UI login). */
export async function injectSession(page: Page, u: { id: string; email: string; firstName: string; lastName: string; token: string }) {
  await page.addInitScript(({ token, user }) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('termsAgreed', '1');
      localStorage.setItem('mooza_tour_done', '1');
      localStorage.setItem('mooza_cookie_consent', 'necessary');
      if (!localStorage.getItem('auth-storage')) {
        localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token }, version: 0 }));
      }
    } catch { /* ignore */ }
  }, { token: u.token, user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName } });
}
