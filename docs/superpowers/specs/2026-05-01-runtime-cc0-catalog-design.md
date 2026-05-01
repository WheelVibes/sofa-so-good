# Runtime CC0 Catalog — Design

Date: 2026-05-01
Status: Draft

## Goal

Expose every CC0 furniture model and material from Poly Haven and ambientCG as catalog options inside the app, fetched on demand when the user clicks an entry, then cached for future sessions.

The existing build-time pipeline (`scripts/asset-pipeline/`) keeps producing the bundled "Starter" set; the runtime catalog is additive — it does not replace or rewrite the static catalog.

## Non-goals

- Kenney and Quaternius. They have no CORS-friendly API and ship single ZIPs that aren't worth proxying for v1. Tracked in TODO.md.
- HDRIs. The app has no scene-environment slot.
- Regenerating or replacing the built-in catalog at runtime.
- Server-side proxying. Runtime fetches go directly from the browser to provider CDNs.

## Architecture

A new `src/catalog/remote/` module mirrors the way `src/furniture/` and `src/materials/` already merge built-in + user defs. It owns:

- A common provider interface
- Two providers (`polyhaven`, `ambientcg`)
- An IndexedDB-backed cache with a small localStorage shadow for instant cold-start
- A Zustand slice that holds index entries, in-flight fetches, and resolved defs
- React hooks that the existing catalog UI consumes alongside built-ins

Furniture entries materialize as `BuiltinGltfDef` (with `source: 'builtin'` repurposed to `'remote'`, see schema change below) once fetched; material entries materialize as `TexturedMaterialDef` with the existing `'polyhaven' | 'ambientcg'` source values. The downstream renderer (`GltfModel`, `useMaterial`) does not need changes — it sees fully-formed defs.

### Module layout

```
src/catalog/remote/
  types.ts              # RemoteEntry, RemoteProvider, ProviderId, Resolution
  cache/
    db.ts               # idb-keyval wrapper, three stores: index, thumbs, assets
    lru.ts              # eviction policy, byte accounting
    shadow.ts           # localStorage pointer for cold-start hints
  providers/
    polyhaven.ts        # index, thumb, asset fetchers + GLTF loader bridge
    ambientcg.ts        # index, thumb, asset fetchers + zip extraction
    index.ts            # PROVIDERS registry
  store.ts              # Zustand slice: indexes, fetch state, resolved defs
  hooks.ts              # useRemoteIndex, useRemoteEntry, useResolvedDef
  __tests__/
```

## Data model

### Schema changes

`FurnitureDef` adds a third gltf variant for runtime-resolved entries:

```ts
export interface RemoteGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'remote';
  provider: 'polyhaven';
  slug: string;
  resolution: '1k' | '2k' | '4k';
  /** Object URL produced by the cache after resolution. */
  runtimeUrl: string;
  /** Channel sub-resources also under object URLs (consumed by URLModifier). */
  runtimeAssets: Record<string, string>;
  scale?: number;
  license: 'CC0';
  attribution: string;
  sourceUrl: string;
}

export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef;
```

For materials, the existing `TexturedMaterialDef` already supports `source: 'polyhaven' | 'ambientcg'`. We extend it with optional `slug` + `resolution` + `provider` fields so `useMaterial` can re-resolve from cache after reload. `runtimeUrls` is reused for the live blob URLs.

### Index entry

```ts
type RemoteEntry = {
  provider: 'polyhaven' | 'ambientcg';
  slug: string;                         // canonical id within provider
  kind: 'furniture' | 'material';
  name: string;
  category: FurnitureCategory | MaterialCategory;
  thumbUrl: string;                     // remote thumbnail URL
  resolutions: Resolution[];            // ['1k','2k','4k'] subset
  attribution: string;                  // "Poly Haven — author"
  sourceUrl: string;                    // public asset page
  bytesEstimate?: Record<Resolution, number>;
};
```

The `kind` field decides whether it ends up in furniture or material catalog. Poly Haven has both (`type=models` → furniture, `type=textures` → material). ambientCG only contributes materials.

### Furniture category mapping

Poly Haven model categories don't match ours. Mapping (best-effort, fallback to `decor`):

| Poly Haven category | Our category |
|---|---|
| seating, sofa, chair, bench, stool | seating |
| bed | beds |
| table, desk | tables |
| cabinet, shelves, storage, wardrobe | storage |
| kitchen, appliance | kitchen |
| lamp, lighting | lighting |
| (anything else) | decor |

The Poly Haven asset metadata exposes a `categories` string array; we take the first match.

## Caching layer

One IndexedDB database `sofa-cache` (via `idb-keyval`) with three named stores:

- **`index`** — `${provider}` → `{ entries: RemoteEntry[], fetchedAt }`. Stale-while-revalidate, 7-day TTL. Background-refreshed when older.
- **`thumbs`** — `${provider}:${slug}` → `Blob`. Soft cap 50 MB, LRU.
- **`assets`** — `${provider}:${slug}:${resolution}` → AssetBundle. Configurable cap (default 500 MB), LRU.

```ts
type AssetBundle =
  | { kind: 'material'; channels: Record<string, Blob> }
  | { kind: 'furniture'; gltfJson: object; bin: Blob; textures: Record<string, Blob> };
```

A small `cache_meta` singleton tracks `{ totalBytes, entries: { key, bytes, lastAccessedAt }[] }` to drive LRU without enumerating blobs.

`localStorage` shadow:

- `sofa-cache:index-pointer:polyhaven` → `{ count, fetchedAt }` (≤ 100 bytes)
- `sofa-cache:index-pointer:ambientcg` → same

These let the catalog show "X items available, refreshing…" before IDB opens, avoiding a flash of empty state.

### Eviction

When a write would exceed the cap or hits a quota error, the LRU evicts oldest-accessed asset bundles until total falls under 80 % of cap. Thumbs evict independently. `clearCache()` truncates everything except the shadow pointers.

### Versioning

Top-level key `sofa-cache:schema-version` (in IDB). Bump triggers a wipe-and-rebuild on next load. Initial value `1`.

## Fetch flow

### Index load

1. On app mount, `RemoteCatalogStore.bootstrap()` reads localStorage shadow → emits "loading" state with hinted counts.
2. Reads each provider's `index` store from IDB. If hit and fresh, populates store.
3. If miss or stale, kicks off `provider.fetchIndex()`. On success, writes IDB + shadow + store.
4. UI re-renders as each provider resolves.

### Thumbnail load

Per-card intersection observer. On visible: check `thumbs` store → if miss, `fetch(entry.thumbUrl)` → blob → store + `URL.createObjectURL`. Concurrent fetches throttled to 8 in flight via a small queue.

### Asset resolution

`useResolvedDef(entry, resolution)` returns `{ status, def?, error? }`:

1. Synchronously check the in-memory resolved-defs map keyed by `${provider}:${slug}:${resolution}`. If present → `{ status: 'ready', def }`.
2. Else check IDB `assets` store. On hit: rebuild object URLs from blobs, install into the map, return ready.
3. Else mark `'fetching'`, call `provider.fetchAsset(entry, resolution)`. On success: write IDB → install → ready. On failure: `'error'` with retry available.

Single in-flight promise per key (deduped via a `Map<string, Promise>`).

### Provider details

**Poly Haven**

- Index: `GET https://api.polyhaven.com/assets?t=models` and `?t=textures`. Returns object keyed by slug; map to `RemoteEntry[]`.
- Files: `GET https://api.polyhaven.com/files/{slug}` returns `{ blend, fbx, gltf: { '2k': { 'asset.gltf': { url, md5 }, 'textures/wood.jpg': {...} }, ... }, ... }`. We use the `gltf` branch only.
- Loader bridge: GLTFLoader configured with `LoadingManager.setURLModifier((url) => objectUrlsByPath[url] ?? url)`. The map is built from the bundle's `gltfJson`/`bin`/`textures` blobs at resolve time.
- Thumbs: `https://cdn.polyhaven.com/asset_img/thumbs/{slug}.png?height=150` (no auth, CORS-enabled).

**ambientCG**

- Index: `GET https://ambientcg.com/api/v2/full_json?type=Material&include=imageData,downloadData,tagData`. Paginated; concatenate.
- Asset: pick the `2K-JPG` zip URL from `downloadFolders[*].downloadFiletypeCategories.zip.downloads[]`. Fetch as `arrayBuffer` → `fflate.unzipSync` → split files into channels (`*_Color.jpg` → albedo, `*_NormalGL.jpg` → normal, `*_Roughness.jpg` → roughness, `*_AmbientOcclusion.jpg` → ao). UV scale defaulted to `[1, 1]`.
- Thumbs: from the index's `previewImage.128.PNG` URL.

## Store and hooks

`RemoteCatalogState` (a slice on the existing `useStore`):

```ts
{
  indexes: Record<ProviderId, { status: 'idle'|'loading'|'ready'|'error'; entries: RemoteEntry[]; fetchedAt?: string }>;
  fetches: Record<string, 'fetching' | 'error'>;     // assetKey → status
  resolved: Record<string, FurnitureDef | MaterialDef>;
  cacheBytes: number;
  preferredResolution: Resolution;                   // user setting
  bootstrap(): Promise<void>;
  resolveAsset(entry: RemoteEntry, res: Resolution): Promise<void>;
  clearCache(): Promise<void>;
}
```

Hooks:

- `useRemoteFurnitureEntries(filter)` — filtered + paged entries for the catalog grid.
- `useRemoteMaterialEntries(filter)` — same for materials.
- `useThumbnail(entry)` — returns blob URL or undefined.
- `useResolveOnClick(entry, res)` — returns `{ status, trigger }`.

The existing `useCatalog()` and material catalog merge layer stays unchanged — resolved remote defs flow into a new `s.resolvedRemoteFurniture` and `s.resolvedRemoteMaterials` map, which `useCatalog()` spreads after `userFurniture`.

## UI

The catalog drawer/modal grows two new tabs alongside built-in/user:

- **Browse — Furniture** (Poly Haven only)
- **Browse — Materials** (Poly Haven + ambientCG, with provider chip filter)

Each browse tab contains:

- Search input (substring match on `name` + `slug` + `tags` if present)
- Category chips (apartment categories for furniture; floor/wall for materials, both opt-in)
- Resolution selector — segmented control 1K / 2K / 4K, default 2K, persisted as a user setting
- Virtualized grid (CSS grid + `react-virtuoso` `VirtuosoGrid`) of cards

Each card shows: thumbnail, name, attribution, byte estimate. Click → spinner overlay → on success the card becomes "Place" and the entry is also added to the active session catalog so the user can reuse it from the built-in tab afterward. On error: shake + retry button.

A small **Cache** pane in the settings menu (or below the tabs) shows total bytes used, % of budget, and a "Clear cache" button.

## Error handling

- Index fetch fails: tab shows empty state + retry. Cached stale index, if any, is still used while retry is in flight.
- Asset fetch fails: card flips to error state with retry. Other cards unaffected.
- Quota exceeded mid-write: LRU evicts; if still failing after a single eviction pass, surface a non-blocking toast offering "Clear cache". Don't block the user.
- Offline (`navigator.onLine === false`): hide remote tabs entirely with a banner; cached resolved defs still work, only browse is disabled.
- Schema-version bump: silent wipe-and-rebuild; user sees a 1–2 s "loading" on next mount.

## Testing

- **Provider unit tests** — fixture JSON + `vi.fn()` fetch mock, asserting index parsing, file URL selection, channel mapping.
- **Cache tests** — `fake-indexeddb` + `idb-keyval`; verify LRU eviction order, byte accounting, schema-version migration, shadow pointer round-trip.
- **Hook tests** — RTL render with mocked providers; assert `'loading' → 'ready'` transition, dedup of concurrent calls, retry after failure.
- **Integration test** — smoke test that mocks both providers with 3 entries each, clicks one, asserts a `RemoteGltfDef` (or `TexturedMaterialDef`) appears in the merged catalog and renders without throwing.
- **No live network in CI.** A separate `pnpm test:remote-live` task can hit real APIs locally for spot checks.

## Risks

- **API drift** — Poly Haven and ambientCG could change endpoint shapes. Mitigation: parsers tolerate unknown fields; a single integration smoke against live APIs (run manually) catches breakage early.
- **CDN CORS regressions** — if either provider tightens CORS, the runtime fetch breaks. Mitigation: a `useRemoteHealth()` probe surfaces a clear error in the UI, and the static built-in catalog continues to work.
- **GLTF URLModifier subtleties** — GLTFLoader resolves relative URIs against the document URL or the loader's `setResourceURL`. We must ensure every relative path in the gltf JSON has a matching object URL in the modifier map. Mitigation: provider explicitly walks the gltf JSON and pre-creates object URLs for every `uri` reference; tests cover a multi-texture model fixture.
- **Cache size on small disks** — 500 MB default may be too aggressive. Mitigation: surface size in settings, default cap can be lowered without code change (stored in `cache_meta`).

## Open questions

None — answered during brainstorming.

## Out of scope (tracked in TODO.md after merge)

- Kenney bundle support (needs ZIP mirror).
- Quaternius pack support (no API).
- HDRI environment lighting.
- Server-side prefetch / SSR of the index.
- Per-LOD model variants.
