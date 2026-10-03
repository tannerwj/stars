// tests/e2e/helpers.ts — shared deterministic helpers for the Triangulum suite.
import type { Browser, Screen } from '@e2e-dev/web';
import { expect } from 'e2e';

const INSTALL_ERROR_COLLECTOR = `() => {
  window.__e2eErrors = [];
  window.addEventListener('error', (e) => {
    window.__e2eErrors.push('error: ' + (e.message || e.type));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    window.__e2eErrors.push('rejection: ' + (r && r.message ? r.message : String(r)));
  });
}`;

/** Install the JS-error collector. Call right after app.open(). */
export async function installErrorCollector(browser: Browser): Promise<void> {
  await browser.evaluate(INSTALL_ERROR_COLLECTOR);
}

/** Assert no JS errors or unhandled rejections were collected. */
export async function expectNoJsErrors(browser: Browser): Promise<void> {
  const errs = await browser.evaluate(`() => ((window.__e2eErrors || ['collector missing']))`);
  expect(errs, `JS errors: ${JSON.stringify(errs)}`).toEqual([]);
}

/** Dismiss the first-visit briefing modal if it is showing. */
export async function dismissBriefing(screen: Screen): Promise<void> {
  const begin = screen.getByRole('button', 'Begin the survey');
  if (await begin.isVisible()) {
    await begin.tap();
  }
  await expect(screen.getByRole('dialog', 'The Stellar Triangulation Survey')).toBeHidden();
}

/**
 * Open the console drawer on narrow viewports (tablet/mobile start with it
 * closed). No-op on desktop where the console is permanently docked.
 */
export async function ensureConsoleOpen(screen: Screen, browser: Browser): Promise<void> {
  const toggle = screen.getByRole('button', 'Toggle console');
  if (!(await toggle.isVisible())) return;
  const isOpen = () =>
    browser.evaluate(`() => (document.getElementById('console').classList.contains('open'))`);
  if (!(await isOpen())) {
    await toggle.tap();
    await expect.poll(isOpen, { timeout: 8000 }).toBe(true);
  }
}

/** Freeze the simulated clock (ms epoch) and wait for one rendered frame. */
export async function setSimMs(browser: Browser, ms: number): Promise<void> {
  await browser.evaluate(`() => (TRIANGULUM.setSimMs(${ms}))`);
  await browser.evaluate(`() => (new Promise((r) => requestAnimationFrame(() => r(1))))`);
  await browser.evaluate(`() => (new Promise((r) => requestAnimationFrame(() => r(1))))`);
}

/** A known night instant over Provo: 2026-01-15 08:00 UTC (1am MST). */
export const NIGHT_MS = Date.UTC(2026, 0, 15, 8, 0, 0);

/** A known midday instant over Provo: 2026-07-15 19:00 UTC (1pm MDT). */
export const DAY_MS = Date.UTC(2026, 6, 15, 19, 0, 0);
