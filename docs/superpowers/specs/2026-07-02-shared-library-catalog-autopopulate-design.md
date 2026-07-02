# Shared library auto-populates the catalog grid

**Date:** 2026-07-02
**Status:** Approved (design)

## Problem

IKEA assets published to R2 (`ikea/<group>/…` + `library/index.json`) are served
through the auth-gated `/api/assets/*` Worker proxy, but they do **not**
automatically appear in the catalog. Today a signed-in user must open the Packs
tab and click "Add" on each product group individually (`SharedLibraryCard` in
`PacksTab.tsx`), which fetches that group's GLBs/images and imports it. There is
no automatic surfacing, no pagination beyond a hard `.slice(0, 60)`, and the
products never merge into the main catalog grid.

## Goal

For any signed-in user (backend present, `sharedLibrary` flag on), every library
product appears as a **browsable card in the main catalog grid**, grouped by
category, without any manual "Add" step. Thumbnails load lazily per visible card;
the GLB/images download only when the user places the item. Pagination is handled
by the existing 12-per-page grid pager.

Explicitly **out of scope** (decided during brainstorming): eager import of all
GLBs at boot; server-side/ranged index pagination (fetch-once is sufficient at
the expected scale of a few thousand products); admin-role gating (any signed-in
user keeps access, since accounts are admin-created only).

## Approach

A dedicated shared-library path that mirrors the existing remote-CC0 patterns
(lazy thumbnail via `IntersectionObserver`, download-on-use) **without** forcing
IKEA's multi-variant group import through the CC0 `RemoteProvider`/`RemoteEntry`
contract (which is built for single GLBs with resolution picking). The real IKEA
import path (`registerSharedGroup` → `importGroup` → `IkeaGltfDef`) is preserved.

## Data flow

1. Catalog opens → `CatalogDrawer` calls `bootstrapSharedLibrary()` (guarded).
2. Slice fetches the manifest once via `fetchSharedLibraryIndex()`; stores items.
3. `useUnifiedCatalog` merges items as a new `GridItem` kind into category tabs,
   mapping category client-side and deduping against already-imported defs.
4. `SharedCard` lazy-loads its thumbnail (same-origin `<img>` through the proxy;
   session cookie sent automatically).
5. Click → `addSharedGroup(group)` → `registerSharedGroup` → `importGroup` →
   real `IkeaGltfDef` committed → `onResolved(defId)` arms placement. The card
   then dedups out (the local def represents it).

## Components

### State — `src/state/slices/sharedLibrarySlice.ts` (new)

```ts
sharedLibrary: {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: SharedLibraryItem[]
  resolving: Record<string, 'adding' | 'error'> // keyed by group
}
bootstrapSharedLibrary(): Promise<void>
  // no-op unless hasBackend() && currentUser && isFeatureEnabled('sharedLibrary')
  //   && status === 'idle'; sets loading → ready|error.
addSharedGroup(group: string): Promise<string | null>
  // registerSharedGroup(group); on ok returns the new def id `ikea-<groupKey>`,
  //   else sets resolving[group]='error' and returns null.
```

One concern per slice (per `src/state/CLAUDE.md`). Self-guards so callers stay
dumb. Not persisted (the imported defs persist through the existing IKEA hydrate
path; the index is re-fetched each session).

### Manifest — `SharedLibraryItem` + `scripts/build-library-index.mjs`

Add a `groupKey` field to each entry, read from the product's `metadata.json`
`group_key`. This is the dedup key: an imported def has the stable id
`ikea-${group_key}`. If `groupKey` is missing on an older manifest, fall back to
the `group` directory name.

`SharedLibraryItem` (in `src/catalog/packs/sharedLibrary.ts`) gains
`groupKey: string`.

### Catalog merge — `src/ui/catalog/useUnifiedCatalog.ts`

- New `GridItem` variant: `{ kind: 'shared'; item: SharedLibraryItem }`.
- `gridItemId` for a shared item: `ikea-${item.groupKey}` (matches the imported
  def id, so favourite/dedup identity is stable across the add).
- Category derived client-side via `mapCategory(item.category)` (same mapping
  `importGroup` uses), so the card sits in the correct tab pre-import.
- Skip any shared item whose `ikea-${groupKey}` def is already in `userFurniture`
  (the local `CatalogCard` represents it instead — no duplicate).
- New `includeShared` param (mirrors `includeRemote`); shared items merge only
  when true. Shared items appended after local + remote within each category.

### Card — `src/ui/catalog/SharedCard.tsx` (new)

A lean sibling of `RemoteCard`:
- `IntersectionObserver` (rootMargin 200px) gates the thumbnail.
- Thumbnail: `<img src="/api/assets/ikea/<group>/<thumbnail>" loading="lazy">`
  built via `API_BASE`; category-icon fallback when absent/failed.
- Heart favourite button (favourite id = `ikea-${groupKey}`), gated by
  `catalogFavourites`.
- Click / Enter / Space → `addSharedGroup`; shows "Adding…" then on success
  `onResolved(defId)`, on failure "Retry".
- A small neutral "Library" badge (not "CC0"); no resolution picker.

### Search text — `CatalogDrawer.gridItemText`

Shared items contribute `[item.name, item.type, item.series]`.

### Bootstrap wiring — `src/ui/catalog/CatalogDrawer.tsx`

- Read `const fSharedLibrary = useFeature('sharedLibrary')`.
- `const unified = useUnifiedCatalog(fRemoteFurniture, fSharedLibrary)`.
- Effect: when `open && fSharedLibrary && hasBackend()` → `bootstrapSharedLibrary()`.
- `renderCard`: `it.kind === 'shared'` → `<SharedCard … onResolved={setActiveDefId} />`.

### Remove redundant Packs surface — `src/ui/catalog/PacksTab.tsx`

Delete `SharedLibraryCard` and its usage/imports (`fetchSharedLibraryIndex`,
`registerSharedGroup`, `SharedLibraryIndex`, `sharedLibraryOn` gate, the
`SharedLibraryCard` render). `sharedLibrary.ts` keeps `fetchSharedLibraryIndex` +
`registerSharedGroup` (now consumed by the slice) and its types.

## Gating

- `sharedLibrary` flag stays **pro-tier, default on, not devOnly** (unchanged).
  Forced off in Simple mode → `includeShared` false → no shared cards, no fetch.
- No backend / guest → slice never fetches (guard). No new network in Simple mode.

## Error handling

- Index fetch failure → `status:'error'`; grid shows no shared cards, no toast.
- Per-group add failure (incl. proxy 503 kill-switch) → `resolving[group]='error'`
  → card shows "Retry".
- Thumbnail load failure → category-icon fallback.

## Testing

Per the CLAUDE.md both-modes rule, anything mode-dependent is tested in Simple
AND Pro.

- **Slice** (`sharedLibrarySlice.test.ts`): bootstrap no-ops when guest / no
  backend / flag off / already loaded; loads → ready on success, → error on
  fetch failure; `addSharedGroup` returns def id on success and sets 'error' on
  failure (mock `registerSharedGroup`).
- **Merge** (`useUnifiedCatalog` test): shared item lands in the mapped category;
  deduped when `ikea-<groupKey>` def exists; **included when `includeShared` true
  (Pro), excluded when false (Simple)**.
- **Manifest** (`build-library-index` test or inline): entry carries `groupKey`.
- **Card** (`SharedCard.test.tsx`): renders the proxy thumbnail URL; click calls
  `addSharedGroup`.

## Docs & versioning

Update in the same change: `docs/developer/packs-and-remote-catalog.md` (shared
library now auto-surfaces in the grid, Packs card removed), `docs/ARCHITECTURE.md`,
`src/state/CLAUDE.md` + `src/ui/CLAUDE.md` (new slice + card), the shared-library
mention in `docs/deployment-cloudflare.md`, `CHANGELOG.md`. Bump `build` in
`src/version.ts` + mirror in `package.json`.

## Units at a glance

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `sharedLibrarySlice` | fetch index + drive per-group add, guarded | `sharedLibrary.ts`, `featureFlags`, `api/client` |
| `build-library-index.mjs` | emit `groupKey` in manifest | `metadata.json` `group_key` |
| `useUnifiedCatalog` merge | place shared items in category grid + dedup | slice, `mapCategory` |
| `SharedCard` | lazy thumbnail + click-to-add card | slice, `API_BASE` |
| `CatalogDrawer` wiring | bootstrap + render shared cards | slice, `useFeature` |
