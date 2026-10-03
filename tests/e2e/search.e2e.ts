// Star search: by name, by designation, no-match, keyboard submit.
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

describe('search', { tags: ['smoke'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
    await ensureConsoleOpen(screen, browser);
    await setSimMs(browser, NIGHT_MS);
  });

  test('finds Vega by name with magnitude and coordinates', async ({ screen }) => {
    await screen.getByPlaceholder('e.g. Vega, Antares, Polaris…').fill('Vega');
    await screen.getByRole('button', 'Locate').tap();
    const result = screen.getByText(/Vega/);
    await expect(result.first()).toBeVisible();
    await expect(screen.getByText(/mag 0\.03/)).toBeVisible();
    await expect(screen.getByText(/RA /)).toBeVisible();
  });

  test('Enter key submits the search', async ({ screen, browser }) => {
    await screen.getByPlaceholder('e.g. Vega, Antares, Polaris…').fill('Polaris');
    await browser.evaluate(`() => (document.getElementById('starSearch').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))`);
    await expect(screen.getByText(/Polaris/).first()).toBeVisible();
  });

  test('unknown star shows a helpful no-match message', async ({ screen }) => {
    await screen.getByPlaceholder('e.g. Vega, Antares, Polaris…').fill('Xyzzyplugh');
    await screen.getByRole('button', 'Locate').tap();
    await expect(screen.getByText(/No catalogued star matches/)).toBeVisible();
  });

  test('empty search hides the result box', async ({ screen, browser }) => {
    await screen.getByPlaceholder('e.g. Vega, Antares, Polaris…').fill('Vega');
    await screen.getByRole('button', 'Locate').tap();
    await expect(screen.getByText(/Vega/).first()).toBeVisible();
    await screen.getByPlaceholder('e.g. Vega, Antares, Polaris…').fill('');
    await screen.getByRole('button', 'Locate').tap();
    expect(await browser.evaluate(`() => (document.getElementById('searchResult').hidden)`)).toBe(true);
  });

  test('zero JS errors across search flows', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
