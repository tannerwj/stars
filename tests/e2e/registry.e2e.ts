// Registry: filed figures appear in the Registry tab and persist in localStorage.
import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  dismissBriefing,
  ensureConsoleOpen,
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

async function fileFigure(browser: any): Promise<string> {
  const names = await browser.evaluate(PICK_THREE);
  expect(names).toHaveLength(3);
  for (const n of names) {
    // Single evaluate: toPx and handleClick must see the same frame's
    // projected positions, otherwise pickStar can grab a nearby field star.
    await browser.evaluate(
      `(nm) => { const s = TRIANGULUM.starByName(nm); const p = TRIANGULUM.toPx(s); TRIANGULUM.handleClick(p[0], p[1]); }`,
      n,
    );
  }
  const count = await browser.evaluate(`() => (TRIANGULUM.verts().filter(Boolean).length)`);
  expect(count, 'three vertices selected').toBe(3);
  return browser.evaluate(`() => (TRIANGULUM.registry().slice(-1)[0].id)`);
}

describe('registry', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await ensureConsoleOpen(screen, browser);
    await setSimMs(browser, NIGHT_MS);
  });

  test('filed figure lands in the registry tab with its Latin name', async ({
    screen,
    browser,
  }) => {
    const id = await fileFigure(browser);
    expect(id).toMatch(/^TRI-2026-\d{4}$/);

    // Standing-result plaque on the Instrument tab updates…
    await expect(screen.getByText(/1 figure filed to date/)).toBeVisible();
    // …and the Registry tab lists the filed figure.
    await screen.getByRole('tab', /Registry/).tap();
    await expect(screen.getByRole('tab', /Registry 1/)).toBeVisible();
    const entryId = await browser.evaluate(
      `() => document.querySelector('#registryList .r-id').textContent`,
    );
    expect(entryId).toBe(id);
    const name = await browser.evaluate(`() => (TRIANGULUM.registry()[0].name)`);
    const entryName = await browser.evaluate(
      `() => document.querySelector('#registryList .r-name').textContent`,
    );
    expect(entryName).toBe(name);

    // Backing store has the figure.
    const stored = await browser.evaluate(`() => (JSON.parse(localStorage.getItem('triangulum.registry.v1')).items.length)`,
    );
    expect(stored).toBe(1);
  });

  test('registry survives a page reload', async ({ app, screen, browser }) => {
    const id = await fileFigure(browser);
    await app.restart();
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await ensureConsoleOpen(screen, browser);

    const count = await browser.evaluate(`() => (TRIANGULUM.registry().length)`);
    expect(count).toBe(1);
    await screen.getByRole('tab', /Registry/).tap();
    await expect(screen.getByRole('tab', /Registry 1/)).toBeVisible();
    const entryId = await browser.evaluate(
      `() => document.querySelector('#registryList .r-id').textContent`,
    );
    expect(entryId).toBe(id);
  });

  test('Export card PNG triggers a download', async ({ screen, browser }) => {
    await fileFigure(browser);
    const id = await browser.evaluate(`() => (TRIANGULUM.registry().slice(-1)[0].id)`);
    const dl = await browser.waitForDownload(async () => {
      await screen.getByRole('button', 'Export card (PNG)').tap();
    });
    expect(dl.suggestedFilename).toMatch(/triangulum-TRI-2026-\d{4}\.png$/);
    expect(id).toMatch(/^TRI-/);
  });

  test('zero JS errors across registry flows', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
