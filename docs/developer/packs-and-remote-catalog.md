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

## Shared library (R2, prod)

The Cloudflare R2 asset library **auto-populates the main catalog grid** for a
signed-in **admin** when the `sharedLibrary` flag (simple tier, default on) is on
— the admin role is the real gate (`isAdminUser`), not the Simple/Pro mode; the
prod counterpart to the dev-only `ikea-live` scrape. Flow:

- `scripts/build-library-index.mjs` scans `ikea_optimized/`, emits a flat
  `library-index.json` (uploaded to R2 as `library/index.json`). Each entry
  carries a `groupKey` (the product's `group_key`) — the dedup key. The
  entry-shaping is the pure, unit-tested `entryFromMeta`.
- `sharedLibrarySlice` (`state/slices/`) fetches the manifest **once** when the
  catalog opens (`bootstrapSharedLibrary`, guarded on `hasBackend()` + an admin
  session + flag), and imports a group on demand (`addSharedGroup` →
  `registerSharedGroup` → `importGroup`, producing a real `IkeaGltfDef`).
- `useUnifiedCatalog(includeRemote, includeShared)` merges items as a `shared`
  `GridItem` kind, mapping category via the importer's `mapCategory` and hiding
  any group already imported (its local `ikea-<groupKey>` def represents it).
- `SharedCard` (`ui/catalog/`) mirrors `RemoteCard`: a lazily-loaded (`loading=
  "lazy"`) thumbnail through the auth-gated proxy and download-on-click. The old
  manual Packs-tab `SharedLibraryCard` was removed.

## Remote material providers

`catalog/remote/providers/` — Poly Haven (CORS, prod) + ambientCG (our R2
mirror over the auth-gated `/api/assets` proxy; the live ambientcg.com
transport was removed 2026-08-25). `activeProviderIds()` / `PROD_PROVIDER_IDS`
gate which bootstrap (`remoteCatalogSlice.bootstrapRemoteCatalog`): Poly Haven
always, ambientCG whenever the `ambientcgLibrary` flag is on — same answer in
dev and prod, since ambientCG is same-origin now.

A provider may also implement `validateCached(entries)`. The index cache is
kept for a week, which outlives a transport change: entries written by an older
build can point at URLs the current provider cannot fetch, and a card built from
one shows a loading skeleton forever. Returning `false` forces a refetch.

## Adding a source

- Furniture/material via API/CORS → a `poly-pizza`-style client reusing
  `buildEntry`/`commit`, or a new `RemoteProvider` in `PROVIDERS` (+
  `PROD_PROVIDER_IDS` if CORS-capable).
- Otherwise → a `manual` registry entry.

Relevant specs: the DLC-packs / runtime-CC0 / multi-provider specs under
`docs/superpowers/specs/`.
