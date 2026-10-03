// Console controls: site, layers, tabs, console drawer, briefing, chart export.
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

describe('controls', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await ensureConsoleOpen(screen, browser);
    await setSimMs(browser, NIGHT_MS);
  });

  test('site change updates readouts and persists to localStorage', async ({
    screen,
    browser,
  }) => {
    const before = await browser.evaluate(`() => (document.getElementById('roLST').textContent)`);
    await screen.getByRole('tab', 'About').tap();
    await screen.getByLabel(/latitude/i).fill('51.4772');
    await screen.getByLabel(/longitude/i).fill('0.0');
    await screen.getByLabel(/site name/i).fill('Greenwich');
    await screen.getByRole('button', 'Set', { exact: true }).tap();
    await expect
      .poll(() => browser.evaluate(`() => (document.getElementById('roLST').textContent)`), { timeout: 8000 })
      .not.toBe(before);
    const stored = await browser.evaluate(`() => (JSON.parse(localStorage.getItem('triangulum.site.v1')))`,
    );
    expect(stored.lat).toBeCloseTo(51.4772, 3);
    expect(stored.name).toBe('Greenwich');
  });

  test('layer toggles flip aria-pressed and survive a re-toggle', async ({ screen, browser }) => {
    const grid = screen.getByRole('button', 'Grid', { exact: true });
    const was = await browser.evaluate(`() => (document.querySelector('#layers button[data-layer="grid"]').getAttribute('aria-pressed'))`,
    );
    await grid.tap();
    await expect
      .poll(
        () =>
          browser.evaluate(`() => (document.querySelector('#layers button[data-layer="grid"]').getAttribute('aria-pressed'))`,
          ),
        { timeout: 8000 },
      )
      .not.toBe(was);
    await grid.tap();
    await expect
      .poll(
        () =>
          browser.evaluate(`() => (document.querySelector('#layers button[data-layer="grid"]').getAttribute('aria-pressed'))`,
          ),
        { timeout: 8000 },
      )
      .toBe(was);
  });

  test('tabs switch panels: Instrument, Registry, About', async ({ screen }) => {
    await screen.getByRole('tab', 'About').tap();
    await expect(screen.getByText(/HYG/i).first()).toBeVisible();
    await screen.getByRole('tab', /Registry/).tap();
    await expect(screen.getByText(/no figures filed yet/i)).toBeVisible();
    await screen.getByRole('tab', 'Instrument').tap();
    await expect(screen.getByPlaceholder('e.g. Vega, Antares, Polaris…')).toBeVisible();
  });

  test('console drawer toggle opens and closes', async ({ screen, browser }) => {
    const toggle = screen.getByRole('button', 'Toggle console');
    if (!(await toggle.isVisible())) {
      // Desktop (>900px): no drawer; the console is permanently docked open.
      const open = await browser.evaluate(
        `() => (document.getElementById('console').classList.contains('open'))`,
      );
      expect(open).toBe(true);
      return;
    }
    const isOpen = () =>
      browser.evaluate(`() => (document.getElementById('console').classList.contains('open'))`);
    const initially = await isOpen();
    await toggle.tap();
    await expect.poll(isOpen, { timeout: 8000 }).toBe(!initially);
    // The toggle hides itself while the drawer is open; read aria via DOM.
    const expanded = await browser.evaluate(
      `() => (document.getElementById('consoleToggle').getAttribute('aria-expanded'))`,
    );
    expect(expanded).toBe(String(!initially));
  });

  test('briefing reopens from the header button and dismisses', async ({ screen, browser }) => {
    await screen.getByRole('tab', 'About').tap();
    await screen.getByRole('button', 'Replay briefing').tap();
    await expect(screen.getByRole('dialog', 'The Stellar Triangulation Survey')).toBeVisible();
    await screen.getByRole('button', 'Begin the survey').tap();
    await expect(screen.getByRole('dialog', 'The Stellar Triangulation Survey')).toBeHidden();
    // Dismissal is remembered.
    const seen = await browser.evaluate(`() => (localStorage.getItem('triangulum.seen.v1'))`);
    expect(seen).toBe('1');
  });

  test('export chart PNG triggers a download even with no figure filed', async ({
    screen,
    browser,
  }) => {
    await screen.getByRole('tab', 'About').tap();
    const dl = await browser.waitForDownload(async () => {
      await screen.getByRole('button', 'Export chart (PNG)').tap();
    });
    expect(dl.suggestedFilename).toMatch(/triangulum-chart\.png$/);
  });

  test('zero JS errors across control flows', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
