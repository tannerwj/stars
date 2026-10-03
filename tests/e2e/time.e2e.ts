// Chronometer: date picker, day stepping, day/night behavior.
import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  dismissBriefing,
  ensureConsoleOpen,
  expectNoJsErrors,
  installErrorCollector,
  setSimMs,
  NIGHT_MS,
  DAY_MS,
} from './helpers.js';

// Provo local midnight on 2026-07-15: lon −111.6585° → UTC = 00:00 + 7h26.6m.
const PROVO_MIDNIGHT_MS = Date.UTC(2026, 6, 15, 7, 27, 0);
// Provo local noon on 2026-07-15.
const PROVO_NOON_MS = Date.UTC(2026, 6, 15, 19, 27, 0);

describe('time', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await ensureConsoleOpen(screen, browser);
    await setSimMs(browser, NIGHT_MS);
  });

  test('date picker moves the simulated date, keeping time of day', async ({
    screen,
    browser,
  }) => {
    await screen.getByLabel('Choose a date').fill('2026-03-10');
    await expect
      .poll(() => browser.evaluate(`() => (new Date(TRIANGULUM.getSimMs()).getUTCDate())`), {
        timeout: 8000,
      })
      .toBe(10);
    const d = await browser.evaluate(`() => (TRIANGULUM.getSimMs())`);
    const dt = new Date(d);
    expect(dt.getUTCFullYear()).toBe(2026);
    expect(dt.getUTCMonth()).toBe(2);
    expect(dt.getUTCDate()).toBe(10);
    expect(dt.getUTCHours()).toBe(8); // NIGHT_MS is 08:00 UTC; time of day kept
  });

  test('leap day 2024-02-29 is accepted', async ({ screen, browser }) => {
    await screen.getByLabel('Choose a date').fill('2024-02-29');
    await expect
      .poll(() => browser.evaluate(`() => (new Date(TRIANGULUM.getSimMs()).getUTCDate())`), {
        timeout: 8000,
      })
      .toBe(29);
    const dt = new Date(await browser.evaluate(`() => (TRIANGULUM.getSimMs())`));
    expect([dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()]).toEqual([2024, 1, 29]);
    await expectNoJsErrors(browser);
  });

  test('±1 day buttons step the calendar', async ({ screen, browser }) => {
    // The day steppers are hidden on phones (≤600px) by design; the date
    // picker covers day changes there.
    if (!(await screen.getByRole('button', 'Next day').isVisible())) {
      const dp = await browser.evaluate(
        `() => (getComputedStyle(document.getElementById('btnDayPlus')).display)`,
      );
      expect(dp).toBe('none');
      return;
    }
    const day = () =>
      browser.evaluate(`() => (new Date(TRIANGULUM.getSimMs()).getUTCDate())`);
    await screen.getByRole('button', 'Next day').tap();
    await expect.poll(day, { timeout: 8000 }).toBe(16);
    await screen.getByRole('button', 'Previous day').tap();
    await expect.poll(day, { timeout: 8000 }).toBe(15);
  });

  test('sun is below the horizon at local midnight, up at local noon', async ({
    browser,
  }) => {
    await setSimMs(browser, PROVO_MIDNIGHT_MS);
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('roSun').textContent)`), { timeout: 8000 })
      .toMatch(/-\d/);
    const night = await browser.evaluate(`() => (document.getElementById('roSun').textContent)`);
    expect(night).toMatch(/-\d+\.\d°/);

    await setSimMs(browser, PROVO_NOON_MS);
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('roSun').textContent)`), { timeout: 8000 })
      .toMatch(/\+\d/);
  });

  test('daytime shows the day notice; nightfall button scrubs to darkness', async ({
    screen,
    browser,
  }) => {
    await setSimMs(browser, DAY_MS);
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('dayNotice').hidden)`), { timeout: 8000 })
      .toBe(false);
    await screen.getByRole('button', 'Scrub to nightfall').tap();
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('dayNotice').hidden)`), { timeout: 8000 })
      .toBe(true);
    const sun = await browser.evaluate(`() => (document.getElementById('roSun').textContent)`);
    expect(sun).toMatch(/-\d/);
  });

  test('zero JS errors across time flows', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
