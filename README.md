# Triangulum — Stellar Triangulation Observatory

A serious astronomical instrument for the examination and filing of stellar triangles.
Live at https://stars.tannerwj.com

## What it is

A full-sky observatory (HYG stellar catalog, real Sun/Moon/planet ephemerides,
true sidereal time) whose formal finding, without exception, is that any three
selected stars form a triangle.

## Structure

- `public/` — the observatory (static site: HTML, CSS, JS)
- `data/` — generated star catalogs (HYG-derived) and d3-celestial constellation data
- `scripts/` — catalog generation and astronomy test suite
- `tests/` — Playwright UI smoke tests, plus the deterministic e2e suite (`tests/e2e/`)

## End-to-end tests

Deterministic e2e suite via [`tester-army/e2e`](https://github.com/tester-army/e2e)
(`e2e` + `@e2e-dev/web`), no AI model involved: tests drive the page with
`app`/`screen`/`browser`/`expect` only, and assert ephemeris math through
`page.evaluate` against the app's own `Astro` module.

```sh
npm install
npm run test:e2e
```

`npm run test:e2e` first ensures the sandbox test browser is up
(`scripts/e2e-chrome.sh`: a dedicated headless Chromium on CDP :9223 routed
through a dedicated forward proxy on :8899 — sandbox Chromium can't reach
localhost or the public internet directly), then runs `e2e run` against
**production** (`https://stars.tannerwj.com`) on desktop (1440×900), tablet
(834×1112), and mobile (390×844) targets. Telemetry is disabled
(`E2E_TELEMETRY_DISABLED=1`).

Tests live in `tests/e2e/*.e2e.ts`: sky rendering, star search, triangulation +
Latin naming, registry persistence, chronometer, ephemeris sanity, console
controls. Every test asserts zero JS errors.

## Run locally

Serve `public/` over HTTP (module scripts require it):

```sh
cd public && python3 -m http.server 8080
```

Then open http://localhost:8080.

## Data sources

- HYG Stellar Database (Bell/Anderson) — star positions, magnitudes, colors
- d3-celestial (MIT) — constellation lines, names, boundaries; Milky Way outline

## License

MIT
