# Offline tooling

These scripts are **offline** — not part of the app build.

## `python/scripts/`

- `ikea_model_scraper.py` (Playwright) — IKEA SG → per-variant-group
  `metadata.json` + `<finish>.glb` + product images; `--out` redirects the
  output root, `--progress-ndjson` emits per-product phase events.
- `glb_analysis.py` (stdlib) — footprint + per-component material palette +
  segment map.
- `categorize.py` — breadcrumb/type → functional category + placement semantics.
- `compatibility.py` — local "complete with" resolver.
- `optimize_glb_lod.mjs` — the LOD pass (downscaled + decimated `-low`/`-medium`
  variants).

Python is 3.10+; use `python3`.

## `scripts/`

- `index-assets-cli.ts` (`npm run index-assets`) — regenerates
  `src/furniture/generatedCatalog.ts` + `public/assets/CREDITS.*` from bundled
  GLBs.
- `fetch-assets.ts` (`npm run fetch-assets`).
- `scraper-server.mjs` (`npm run scraper-server`) — local sidecar driving the
  IKEA live-scrape pack (SSE progress; default port 5174, `SCRAPER_PORT`).
- `price-server.mjs` (`npm run price-server`) — local sidecar for the Shopping
  panel's dev-only live-pricing toggle. Retailers (verified live 2026-07):
  **IKEA SG** (SIK search JSON API) and **Courts** (Magento GraphQL) return real
  SGD prices + links; **Castlery** now embeds its results as Algolia `hits` in the
  Next.js RSC payload (the old JSON-LD Product markup is gone — the parser reads
  the embedded hits with a JSON-LD fallback); **HipVan**'s public search endpoint
  was retired for an authenticated `api.communa.sg` gateway (session token +
  refresh), so that adapter degrades to "no match" until a public endpoint
  returns and stays dev-gated best-effort. Fuzzy top-hit matching throughout;
  disk-cached; default port 5175, `PRICE_PORT`. All parsers
  (`parseSikResponse`/`parseCourtsResponse`/`parseHipvanResponse`/
  `parseCastleryResponse` + `pickBestMatch`) are pure + unit-tested
  (`price-server.test.mjs`).
- `asset-pipeline/` — the bundled-GLB pipeline (drop a `<name>.glb` + optional
  sidecar JSON into `public/assets/furniture/`, then `npm run index-assets`).

## npm wrappers

`optimize:glb`, `compress:glb-textures`, `index-assets`, `fetch-assets`,
`scraper-server`, `price-server`. None are part of `npm run build`.
