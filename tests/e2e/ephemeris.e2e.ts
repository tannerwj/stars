// Ephemeris sanity: Astro math gives physically sane Sun/Moon/planet positions.
import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  dismissBriefing,
  expectNoJsErrors,
  installErrorCollector,
  NIGHT_MS,
} from './helpers.js';

const PROVO = `{ lat: 40.2338, lon: -111.6585 }`;

describe('ephemeris', { tags: ['ephemeris'] }, () => {
  beforeEach(async ({ app, screen, browser }) => {
    await app.open('/');
    await installErrorCollector(browser);
    await dismissBriefing(screen);
  });

  test('sun: below horizon at Provo local midnight in July, high at local noon', async ({
    browser,
  }) => {
    const r = await browser.evaluate(`() => {
      const D2R = Math.PI / 180, R2D = 180 / Math.PI;
      const { lat, lon } = ${PROVO};
      const check = (ms) => {
        const d = new Date(ms);
        const s = Astro.sunPos(d);
        return Astro.altAz(s.ra, s.dec, lat * D2R, Astro.lst(d, lon)).alt * R2D;
      };
      return {
        midnight: check(Date.UTC(2026, 6, 15, 7, 27, 0)),
        noon: check(Date.UTC(2026, 6, 15, 19, 27, 0)),
      };
    }`);
    expect(r.midnight).toBeLessThan(-10); // deep night in July
    expect(r.noon).toBeGreaterThan(60); // near-zenith summer sun
  });

  test('sun: midnight sun at the north pole in June, polar night in December', async ({
    browser,
  }) => {
    const r = await browser.evaluate(`() => {
      const D2R = Math.PI / 180, R2D = 180 / Math.PI;
      const check = (ms, lat) => {
        const d = new Date(ms);
        const s = Astro.sunPos(d);
        return Astro.altAz(s.ra, s.dec, lat * D2R, Astro.lst(d, 0)).alt * R2D;
      };
      return {
        june: check(Date.UTC(2026, 5, 21, 12, 0, 0), 90),
        december: check(Date.UTC(2026, 11, 21, 12, 0, 0), 90),
      };
    }`);
    expect(r.june).toBeGreaterThan(20); // midnight sun
    expect(r.december).toBeLessThan(-20); // polar night
  });

  test('moon: finite position, illumination in [0,1]', async ({ browser }) => {
    const r = await browser.evaluate(`() => {
      const m = Astro.moonPos(new Date(${NIGHT_MS}));
      return { ra: m.ra, dec: m.dec, illum: m.illum };
    }`);
    expect(Number.isFinite(r.ra)).toBe(true);
    expect(Number.isFinite(r.dec)).toBe(true);
    expect(r.illum).toBeGreaterThanOrEqual(0);
    expect(r.illum).toBeLessThanOrEqual(1);
  });

  test('the five naked-eye planets: finite RA/Dec; outer planets unsupported', async ({
    browser,
  }) => {
    const r = await browser.evaluate(`() => {
      const out = {};
      for (const p of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
        const q = Astro.planetPos(p, new Date(${NIGHT_MS}));
        out[p] = Number.isFinite(q.ra) && Number.isFinite(q.dec);
      }
      out.Uranus = Astro.planetPos('Uranus', new Date(${NIGHT_MS}));
      return out;
    }`);
    for (const p of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) expect(r[p], p).toBe(true);
    // The app models naked-eye planets only; unknown names return null.
    expect(r.Uranus).toBeNull();
  });

  test('angular separation: zero for identical points, sane for Vega–Deneb', async ({
    browser,
  }) => {
    const r = await browser.evaluate(`() => {
      const R2D = 180 / Math.PI;
      const vega = TRIANGULUM.starByName('Vega');
      const deneb = TRIANGULUM.starByName('Deneb');
      return {
        self: Astro.angSep(vega.ra, vega.dec, vega.ra, vega.dec) * R2D,
        vegaDeneb: Astro.angSep(vega.ra, vega.dec, deneb.ra, deneb.dec) * R2D,
      };
    }`);
    expect(r.self).toBe(0);
    // Vega–Deneb are ~24° apart on the sky (Summer Triangle leg).
    expect(r.vegaDeneb).toBeGreaterThan(20);
    expect(r.vegaDeneb).toBeLessThan(28);
  });

  test('date bounds: 1800 and 2050 render without errors', async ({ browser }) => {
    const r = await browser.evaluate(`() => {
      const out = [];
      for (const ms of [Date.UTC(1800, 0, 1, 12), Date.UTC(2050, 11, 31, 12)]) {
        const d = new Date(ms);
        const s = Astro.sunPos(d);
        const m = Astro.moonPos(d);
        out.push(Number.isFinite(s.ra) && Number.isFinite(m.ra));
      }
      return out;
    }`);
    expect(r).toEqual([true, true]);
    await expectNoJsErrors(browser);
  });

  test('zero JS errors across ephemeris checks', async ({ browser }) => {
    await expectNoJsErrors(browser);
  });
});
