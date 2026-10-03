// Sky rendering: the canvas draws a real star field, readouts populate.
import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  dismissBriefing,
  expectNoJsErrors,
  installErrorCollector,
  setSimMs,
  NIGHT_MS,
} from './helpers.js';

describe('sky', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
  });

  test('page boots with title, brand, and a sized canvas', async ({ screen, browser }) => {
    await expect(browser).toHaveTitle(/Triangulum/);
    await expect(screen.getByRole('heading', 'Triangulum')).toBeVisible();
    const box = await browser.evaluate(`() => {
      const c = document.getElementById('sky');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, cw: c.width, ch: c.height };
    }`);
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
    expect(box.cw).toBeGreaterThan(0);
  });

  test('stars actually draw on a dark night sky', async ({ browser }) => {
    await setSimMs(browser, NIGHT_MS);
    const px = await browser.evaluate(`() => {
      const c = document.getElementById('sky');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let bright = 0, dark = 0;
      for (let i = 0; i < d.length; i += 16) {
        const lum = d[i] + d[i + 1] + d[i + 2];
        if (lum > 120) bright++;
        else if (lum < 45) dark++;
      }
      const n = d.length / 16;
      return { brightFrac: bright / n, darkFrac: dark / n };
    }`);
    // Night sky: mostly dark background with a real population of star pixels.
    expect(px.darkFrac).toBeGreaterThan(0.5);
    expect(px.brightFrac).toBeGreaterThan(0.0005);
  });

  test('readouts populate: local, UTC, sidereal, sun, moon, season', async ({ screen, browser }) => {
    await setSimMs(browser, NIGHT_MS);
    // Readouts refresh on a 500ms cadence; poll until the sun readout settles.
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('roSun').textContent)`), { timeout: 8000 })
      .not.toBe('—');
    for (const id of ['roLocal', 'roUTC', 'roLST', 'roSun', 'roMoon', 'roSeason']) {
      const t = await browser.evaluate(`() => (document.getElementById('${id}').textContent)`);
      expect(t, id).not.toBe('—');
      expect(t.length, id).toBeGreaterThan(0);
    }
    // At 1am in January the sun is far below the horizon.
    const sun = await browser.evaluate(`() => (document.getElementById('roSun').textContent)`);
    expect(sun).toMatch(/-\d+\.\d°/);
  });

  test('zero JS errors on boot and night render', async ({ browser }) => {
    await setSimMs(browser, NIGHT_MS);
    await expectNoJsErrors(browser);
  });
});
