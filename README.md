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
- `tests/` — Playwright UI smoke tests

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
