# Packs & remote catalog

## Packs registry (`catalog/packs/`)

The Packs tab is a **declarative registry** (`registry.ts`, `AVAILABLE_PACKS`).
Each `Pack` carries a `kind` discriminator, an `assetType`
(`furniture`/`material`), and a `devOnly` flag. `visiblePacks(import.meta.env.DEV)`
hides every `devOnly` pack from production; `PacksTab.renderCard` switches on
`kind`.

**Gating rule:** a source that can be downloaded programmatically in-browser
(CORS-friendly) is visible in dev **and** prod; one that needs a dev
proxy/sidecar/hand-download is `devOnly`.

`kind`s:

- **`poly-pizza`** (prod) — the general-purpose furniture source that downloads
  at runtime in production (`polyPizza.ts` API client; user's `x-auth-token`,
  never bundled; `install.ts` routes through the shared `buildEntry`/`commit`
  pipeline). CC0 + CC-BY (credited per model).
- **`zip`** (Kenney, dev-only) — hosted-archive install via a dev Vite proxy.
- **`ikea-live`** (dev-only) — the live-scrape pack driven by
  `scripts/scraper-server.mjs`.
- **`manual`** (dev-only) — link-out cards for no-CORS sources.

## Remote material providers

`catalog/remote/providers/` — Poly Haven (CORS, prod) + ambientCG (dev-proxy).
`activeProviderIds(isDev)` / `PROD_PROVIDER_IDS` gate which bootstrap; only
CORS-capable ones run in production (`remoteCatalogSlice.bootstrapRemoteCatalog`).

## Adding a source

- Furniture/material via API/CORS → a `poly-pizza`-style client reusing
  `buildEntry`/`commit`, or a new `RemoteProvider` in `PROVIDERS` (+
  `PROD_PROVIDER_IDS` if CORS-capable).
- Otherwise → a `manual` registry entry.

Relevant specs: the DLC-packs / runtime-CC0 / multi-provider specs under
`docs/superpowers/specs/`.
