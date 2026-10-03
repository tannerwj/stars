// Triangulation: select three stars, get a classified figure with a Latin name.
import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  dismissBriefing,
  expectNoJsErrors,
  installErrorCollector,
  setSimMs,
  NIGHT_MS,
} from './helpers.js';

const PICK_THREE = `() => {
  const D2R = Math.PI / 180;
  const lat = 40.2338 * D2R, lon = -111.6585;
  const d = new Date(TRIANGULUM.getSimMs());
  const lst = Astro.lst(d, lon);
  const pool = ['Vega', 'Deneb', 'Altair', 'Polaris', 'Capella', 'Rigel',
    'Betelgeuse', 'Sirius', 'Procyon', 'Arcturus', 'Aldebaran', 'Spica'];
  const out = [];
  for (const n of pool) {
    const s = TRIANGULUM.starByName(n);
    if (!s) continue;
    if (Astro.altAz(s.ra, s.dec, lat, lst).alt > 15 * D2R) out.push(n);
    if (out.length === 3) break;
  }
  return out;
}`;

async function clickStar(browser: any, name: string): Promise<void> {
  // Single evaluate: toPx and handleClick must see the same frame's
  // projected positions, otherwise pickStar can grab a nearby field star.
  await browser.evaluate(
    `(n) => { const s = TRIANGULUM.starByName(n); const p = TRIANGULUM.toPx(s); TRIANGULUM.handleClick(p[0], p[1]); }`,
    name,
  );
}

describe('triangulation', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await setSimMs(browser, NIGHT_MS);
    await browser.evaluate(`() => (TRIANGULUM.clearVerts())`);
  });

  test('three star clicks produce a classified figure with a Latin name', async ({
    screen,
    browser,
  }) => {
    const names = await browser.evaluate(PICK_THREE);
    expect(names).toHaveLength(3);
    for (const n of names) await clickStar(browser, n);

    // Vertices listed in the console.
    await expect(screen.getByText(new RegExp(names[0])).first()).toBeVisible();
    const filled = await browser.evaluate(`() => (document.querySelectorAll('#vertices li.filled').length)`,
    );
    expect(filled).toBe(3);

    // Analysis panel appears with the verdict.
    expect(await browser.evaluate(`() => (document.getElementById('analysis').hidden)`)).toBe(false);
    await expect(screen.getByText('■ figure resolved — classification complete')).toBeVisible();
    await expect(screen.getByText('△ Triangle')).toBeVisible();
    const latin = await browser.evaluate(`() => (TRIANGULUM.registry().slice(-1)[0].name)`);
    expect(latin).toMatch(/^TRIANGULUM [A-Z]+$/);
    await expect(screen.getByRole('heading', latin)).toBeVisible();

    // The filed figure is geometrically sane.
    const t = await browser.evaluate(`() => (TRIANGULUM.registry().slice(-1)[0])`);
    expect(t.sides.every((s: number) => s > 0)).toBe(true);
    expect(t.angleSum).toBeGreaterThan(170);
    expect(t.angleSum).toBeLessThan(190);
    expect(t.id).toMatch(/^TRI-2026-\d{4}$/);
  });

  test('clicking a selected star deselects it; Clear empties all', async ({ browser }) => {
    const names = await browser.evaluate(PICK_THREE);
    for (const n of names) await clickStar(browser, n);
    expect(await browser.evaluate(`() => (TRIANGULUM.verts().filter(Boolean).length)`)).toBe(3);

    await clickStar(browser, names[0]); // toggle off
    expect(await browser.evaluate(`() => (TRIANGULUM.verts().filter(Boolean).length)`)).toBe(2);

    await browser.evaluate(`() => (TRIANGULUM.clearVerts())`);
    expect(await browser.evaluate(`() => (TRIANGULUM.verts().filter(Boolean).length)`)).toBe(0);
    expect(await browser.evaluate(`() => (document.getElementById('analysis').hidden)`)).toBe(true);
  });

  test('a fourth distinct click starts a fresh figure', async ({ browser }) => {
    const names = await browser.evaluate(PICK_THREE.replace('out.length === 3', 'out.length === 6'));
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const n of names.slice(0, 3)) await clickStar(browser, n);
    expect(await browser.evaluate(`() => (TRIANGULUM.registry().length)`)).toBe(1);

    // A fourth *distinct* star resets the selection to just that star…
    await clickStar(browser, names[3]);
    expect(await browser.evaluate(`() => (TRIANGULUM.verts().filter(Boolean).length)`)).toBe(1);
    // …and two more complete a second figure.
    await clickStar(browser, names[4]);
    await clickStar(browser, names[5]);
    expect(await browser.evaluate(`() => (TRIANGULUM.registry().length)`)).toBe(2);
  });

  test('zero JS errors across triangulation flows', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
