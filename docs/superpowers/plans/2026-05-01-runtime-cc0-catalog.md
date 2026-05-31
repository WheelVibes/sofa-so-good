# Runtime CC0 Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every CC0 furniture and material from Poly Haven and ambientCG as on-demand catalog options in the app, fetched in-browser and cached in IndexedDB.

**Architecture:** A new `src/catalog/remote/` module exposes provider-agnostic indexes and asset resolvers, backed by an IndexedDB cache with a localStorage cold-start shadow. Resolved entries flow into the existing furniture/material catalog merge layer; the static built-in pipeline is untouched. UI adds two browse tabs to the catalog drawer with virtualized grids, intersection-observed thumbnails, and a resolution toggle.

**Tech Stack:** React 18 + Zustand 5, Three.js GLTFLoader, `idb-keyval` (new), `fflate` (new) for ZIP extraction, `react-virtuoso` (new) for virtualized grids, `fake-indexeddb` (new, dev) for tests.

**Spec:** [docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md](../specs/2026-05-01-runtime-cc0-catalog-design.md)

---

## File Structure

```
src/catalog/remote/
  types.ts                       # RemoteEntry, RemoteProvider, Resolution
  cache/
    db.ts                        # IDB stores + meta + put/get/delete
    lru.ts                       # eviction policy
    shadow.ts                    # localStorage pointer
    db.test.ts
    lru.test.ts
  providers/
    polyhaven.ts                 # index/thumbs/asset
    polyhaven.test.ts
    ambientcg.ts
    ambientcg.test.ts
    index.ts                     # PROVIDERS registry
    fixtures/                    # fixture json/zip
  store.ts                       # remoteCatalogSlice
  store.test.ts
  hooks.ts                       # useRemoteIndex, useThumbnail, useResolveOnClick
  category-map.ts                # PH category → FurnitureCategory
  category-map.test.ts
  __tests__/
    integration.test.tsx         # smoke: click → resolve → render
src/furniture/types.ts           # add RemoteGltfDef variant
src/materials/types.ts           # add slug/resolution/provider fields
src/furniture/catalog.ts         # merge resolved remote furniture
src/materials/builtinCatalog.ts  # (no change — handled in catalog layer)
src/materials/cache.ts           # if exists, extend; else create merge helper
src/state/slices/remoteCatalogSlice.ts
src/state/store.ts               # register slice
src/ui/catalog/CatalogDrawer.tsx # add Browse tabs
src/ui/catalog/RemoteBrowseTab.tsx        # new
src/ui/catalog/RemoteCard.tsx             # new
src/ui/catalog/ResolutionPicker.tsx       # new
src/ui/catalog/CachePane.tsx              # new
TODO.md                                   # update
```

---

### Task 1: Add dependencies and skeleton

**Files:**
- Modify: `package.json`
- Create: `src/catalog/remote/types.ts`

- [ ] **Step 1: Install deps**

```bash
npm install idb-keyval fflate react-virtuoso
npm install -D fake-indexeddb
```

- [ ] **Step 2: Create types**

```ts
// src/catalog/remote/types.ts
import type { FurnitureCategory } from '../../furniture/types';
import type { MaterialCategory } from '../../materials/types';

export type ProviderId = 'polyhaven' | 'ambientcg';
export type Resolution = '1k' | '2k' | '4k';
export const RESOLUTIONS: readonly Resolution[] = ['1k', '2k', '4k'];

export type RemoteKind = 'furniture' | 'material';

export interface RemoteEntry {
  provider: ProviderId;
  slug: string;
  kind: RemoteKind;
  name: string;
  category: FurnitureCategory | MaterialCategory;
  thumbUrl: string;
  resolutions: Resolution[];
  attribution: string;
  sourceUrl: string;
  bytesEstimate?: Partial<Record<Resolution, number>>;
}

export type AssetBundle =
  | { kind: 'material'; channels: Record<string, Blob> }
  | {
      kind: 'furniture';
      gltfJson: object;
      bin?: Blob;
      textures: Record<string, Blob>;
      rootPath: string; // path within gltf to the .gltf file
    };

export interface RemoteProvider {
  id: ProviderId;
  fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]>;
  fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob>;
  fetchAsset(
    entry: RemoteEntry,
    resolution: Resolution,
    signal?: AbortSignal,
  ): Promise<AssetBundle>;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/catalog/remote/types.ts
git commit -m "Add deps and remote catalog types"
```

---

### Task 2: IndexedDB cache layer (TDD)

**Files:**
- Create: `src/catalog/remote/cache/db.ts`
- Create: `src/catalog/remote/cache/db.test.ts`
- Modify: `src/setupTests.ts` (load fake-indexeddb)

- [ ] **Step 1: Wire fake-indexeddb in tests**

```ts
// src/setupTests.ts
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
```

- [ ] **Step 2: Write failing tests**

```ts
// src/catalog/remote/cache/db.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  putAsset,
  getAsset,
  putThumb,
  getThumb,
  putIndex,
  getIndex,
  resetCacheForTest,
  getMeta,
} from './db';
import type { AssetBundle, RemoteEntry } from '../types';

const blob = (s: string) => new Blob([s]);

const sampleEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'a',
  kind: 'material',
  name: 'A',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: '',
  sourceUrl: '',
};

const sampleBundle: AssetBundle = {
  kind: 'material',
  channels: { albedo: blob('x') },
};

describe('cache/db', () => {
  beforeEach(async () => {
    await resetCacheForTest();
  });

  it('round-trips an asset', async () => {
    await putAsset('polyhaven:a:2k', sampleBundle);
    const got = await getAsset('polyhaven:a:2k');
    expect(got?.kind).toBe('material');
  });

  it('round-trips a thumbnail', async () => {
    await putThumb('polyhaven:a', blob('t'));
    const got = await getThumb('polyhaven:a');
    expect(got).toBeInstanceOf(Blob);
  });

  it('round-trips an index', async () => {
    await putIndex('polyhaven', [sampleEntry]);
    const got = await getIndex('polyhaven');
    expect(got?.entries).toHaveLength(1);
    expect(got?.fetchedAt).toBeTruthy();
  });

  it('tracks meta byte totals on asset writes', async () => {
    await putAsset('polyhaven:a:2k', sampleBundle);
    const meta = await getMeta();
    expect(meta.totalBytes).toBeGreaterThan(0);
    expect(meta.entries.find((e) => e.key === 'polyhaven:a:2k')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npx vitest run src/catalog/remote/cache/db.test.ts
```

- [ ] **Step 4: Implement**

```ts
// src/catalog/remote/cache/db.ts
import { createStore, get, set, del, clear, keys } from 'idb-keyval';
import type { AssetBundle, RemoteEntry, ProviderId } from '../types';

const DB = 'sofa-cache';
const SCHEMA_VERSION = 1;
const META_KEY = '__meta__';

export const indexStore = createStore(DB, 'index');
export const thumbsStore = createStore(DB, 'thumbs');
export const assetsStore = createStore(DB, 'assets');
export const metaStore = createStore(DB, 'meta');

export interface CacheMetaEntry {
  key: string;
  bytes: number;
  lastAccessedAt: number;
}
export interface CacheMeta {
  schemaVersion: number;
  totalBytes: number;
  entries: CacheMetaEntry[];
}

const EMPTY_META: CacheMeta = {
  schemaVersion: SCHEMA_VERSION,
  totalBytes: 0,
  entries: [],
};

export async function getMeta(): Promise<CacheMeta> {
  const m = (await get(META_KEY, metaStore)) as CacheMeta | undefined;
  if (!m) return { ...EMPTY_META };
  if (m.schemaVersion !== SCHEMA_VERSION) {
    await resetCacheForTest();
    return { ...EMPTY_META };
  }
  return m;
}

async function setMeta(m: CacheMeta): Promise<void> {
  await set(META_KEY, m, metaStore);
}

function bundleBytes(b: AssetBundle): number {
  if (b.kind === 'material') {
    return Object.values(b.channels).reduce((a, c) => a + c.size, 0);
  }
  let n = b.bin?.size ?? 0;
  for (const t of Object.values(b.textures)) n += t.size;
  n += JSON.stringify(b.gltfJson).length;
  return n;
}

export async function putAsset(key: string, bundle: AssetBundle): Promise<void> {
  await set(key, bundle, assetsStore);
  const meta = await getMeta();
  const bytes = bundleBytes(bundle);
  const idx = meta.entries.findIndex((e) => e.key === key);
  if (idx >= 0) meta.totalBytes -= meta.entries[idx].bytes;
  meta.totalBytes += bytes;
  const entry = { key, bytes, lastAccessedAt: Date.now() };
  if (idx >= 0) meta.entries[idx] = entry;
  else meta.entries.push(entry);
  await setMeta(meta);
}

export async function getAsset(key: string): Promise<AssetBundle | undefined> {
  const got = (await get(key, assetsStore)) as AssetBundle | undefined;
  if (got) {
    const meta = await getMeta();
    const e = meta.entries.find((x) => x.key === key);
    if (e) {
      e.lastAccessedAt = Date.now();
      await setMeta(meta);
    }
  }
  return got;
}

export async function deleteAsset(key: string): Promise<void> {
  const meta = await getMeta();
  const idx = meta.entries.findIndex((e) => e.key === key);
  if (idx >= 0) {
    meta.totalBytes -= meta.entries[idx].bytes;
    meta.entries.splice(idx, 1);
    await setMeta(meta);
  }
  await del(key, assetsStore);
}

export async function listAssetKeys(): Promise<string[]> {
  return (await keys(assetsStore)) as string[];
}

export async function putThumb(key: string, b: Blob): Promise<void> {
  await set(key, b, thumbsStore);
}
export async function getThumb(key: string): Promise<Blob | undefined> {
  return (await get(key, thumbsStore)) as Blob | undefined;
}

export interface IndexRecord {
  entries: RemoteEntry[];
  fetchedAt: string;
}
export async function putIndex(p: ProviderId, entries: RemoteEntry[]): Promise<void> {
  const rec: IndexRecord = { entries, fetchedAt: new Date().toISOString() };
  await set(p, rec, indexStore);
}
export async function getIndex(p: ProviderId): Promise<IndexRecord | undefined> {
  return (await get(p, indexStore)) as IndexRecord | undefined;
}

export async function resetCacheForTest(): Promise<void> {
  await clear(indexStore);
  await clear(thumbsStore);
  await clear(assetsStore);
  await clear(metaStore);
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
npx vitest run src/catalog/remote/cache/db.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/catalog/remote/cache/db.ts src/catalog/remote/cache/db.test.ts src/setupTests.ts
git commit -m "Add IndexedDB cache layer for remote catalog"
```

---

### Task 3: LRU eviction (TDD)

**Files:**
- Create: `src/catalog/remote/cache/lru.ts`
- Create: `src/catalog/remote/cache/lru.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/catalog/remote/cache/lru.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCacheForTest, putAsset, getMeta } from './db';
import { evictUntilUnder } from './lru';

const big = (n: number) => new Blob([new Uint8Array(n)]);

describe('lru.evictUntilUnder', () => {
  beforeEach(async () => {
    await resetCacheForTest();
  });

  it('drops oldest entries until total bytes <= cap', async () => {
    await putAsset('a', { kind: 'material', channels: { c: big(1000) } });
    await new Promise((r) => setTimeout(r, 5));
    await putAsset('b', { kind: 'material', channels: { c: big(1000) } });
    await new Promise((r) => setTimeout(r, 5));
    await putAsset('c', { kind: 'material', channels: { c: big(1000) } });

    await evictUntilUnder(2000);
    const meta = await getMeta();
    expect(meta.totalBytes).toBeLessThanOrEqual(2000);
    expect(meta.entries.find((e) => e.key === 'a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/catalog/remote/cache/lru.ts
import { getMeta, deleteAsset } from './db';

export const DEFAULT_ASSET_CAP_BYTES = 500 * 1024 * 1024;
export const DEFAULT_THUMB_CAP_BYTES = 50 * 1024 * 1024;

export async function evictUntilUnder(capBytes: number): Promise<void> {
  let meta = await getMeta();
  if (meta.totalBytes <= capBytes) return;
  const sorted = [...meta.entries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  for (const e of sorted) {
    if (meta.totalBytes <= capBytes) break;
    await deleteAsset(e.key);
    meta = await getMeta();
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/catalog/remote/cache/lru.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/cache/lru.ts src/catalog/remote/cache/lru.test.ts
git commit -m "Add LRU eviction for asset cache"
```

---

### Task 4: localStorage shadow pointer

**Files:**
- Create: `src/catalog/remote/cache/shadow.ts`

- [ ] **Step 1: Implement (no test — trivial wrapper)**

```ts
// src/catalog/remote/cache/shadow.ts
import type { ProviderId } from '../types';

const KEY = (p: ProviderId) => `sofa-cache:index-pointer:${p}`;

export interface ShadowPointer {
  count: number;
  fetchedAt: string;
}

export function readShadow(p: ProviderId): ShadowPointer | null {
  try {
    const raw = localStorage.getItem(KEY(p));
    return raw ? (JSON.parse(raw) as ShadowPointer) : null;
  } catch {
    return null;
  }
}

export function writeShadow(p: ProviderId, ptr: ShadowPointer): void {
  try {
    localStorage.setItem(KEY(p), JSON.stringify(ptr));
  } catch {
    // ignore quota
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/catalog/remote/cache/shadow.ts
git commit -m "Add localStorage shadow pointer for cold-start hints"
```

---

### Task 5: Category mapping (TDD)

**Files:**
- Create: `src/catalog/remote/category-map.ts`
- Create: `src/catalog/remote/category-map.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/catalog/remote/category-map.test.ts
import { describe, expect, it } from 'vitest';
import { mapPolyHavenFurnitureCategory } from './category-map';

describe('mapPolyHavenFurnitureCategory', () => {
  it('maps seating-related tags to seating', () => {
    expect(mapPolyHavenFurnitureCategory(['sofa', 'living'])).toBe('seating');
    expect(mapPolyHavenFurnitureCategory(['chair'])).toBe('seating');
  });
  it('maps tables', () => {
    expect(mapPolyHavenFurnitureCategory(['desk'])).toBe('tables');
  });
  it('falls back to decor', () => {
    expect(mapPolyHavenFurnitureCategory(['weird'])).toBe('decor');
    expect(mapPolyHavenFurnitureCategory([])).toBe('decor');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/catalog/remote/category-map.ts
import type { FurnitureCategory } from '../../furniture/types';

const RULES: { match: RegExp; cat: FurnitureCategory }[] = [
  { match: /\b(seating|sofa|chair|bench|stool|armchair)\b/i, cat: 'seating' },
  { match: /\bbed\b/i, cat: 'beds' },
  { match: /\b(table|desk)\b/i, cat: 'tables' },
  { match: /\b(cabinet|shelf|shelves|storage|wardrobe|drawer)\b/i, cat: 'storage' },
  { match: /\b(kitchen|appliance|fridge|stove|oven)\b/i, cat: 'kitchen' },
  { match: /\b(lamp|lighting|light)\b/i, cat: 'lighting' },
];

export function mapPolyHavenFurnitureCategory(
  categories: readonly string[],
): FurnitureCategory {
  for (const c of categories) {
    for (const r of RULES) if (r.match.test(c)) return r.cat;
  }
  return 'decor';
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/category-map.ts src/catalog/remote/category-map.test.ts
git commit -m "Add Poly Haven category → app-category mapping"
```

---

### Task 6: Poly Haven provider — index (TDD with mocked fetch)

**Files:**
- Create: `src/catalog/remote/providers/polyhaven.ts`
- Create: `src/catalog/remote/providers/polyhaven.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/catalog/remote/providers/polyhaven.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { polyhaven } from './polyhaven';

const mockFetch = (handlers: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    for (const [pat, body] of Object.entries(handlers)) {
      if (url.includes(pat)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response('not found', { status: 404 });
  });

describe('polyhaven.fetchIndex', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns furniture and material entries', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        't=models': {
          modern_arm_chair_01: {
            name: 'Modern Arm Chair 01',
            categories: ['chair', 'seating'],
            authors: { Bob: 'modeller' },
          },
        },
        't=textures': {
          wood_floor_diff: {
            name: 'Wood Floor',
            categories: ['floor', 'wood'],
            authors: { Alice: 'photog' },
          },
        },
      }),
    );

    const entries = await polyhaven.fetchIndex();
    expect(entries.find((e) => e.kind === 'furniture')?.slug).toBe('modern_arm_chair_01');
    expect(entries.find((e) => e.kind === 'material')?.slug).toBe('wood_floor_diff');
    expect(entries[0].attribution).toContain('Poly Haven');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/catalog/remote/providers/polyhaven.ts
import type {
  AssetBundle,
  RemoteEntry,
  RemoteProvider,
  Resolution,
} from '../types';
import { mapPolyHavenFurnitureCategory } from '../category-map';
import type { MaterialCategory } from '../../../materials/types';

const API = 'https://api.polyhaven.com';
const CDN_THUMB = (slug: string) =>
  `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png?height=150`;
const PAGE_URL = (slug: string) => `https://polyhaven.com/a/${slug}`;

interface PHAssetMeta {
  name: string;
  categories?: string[];
  authors?: Record<string, string>;
  tags?: string[];
}
type PHIndex = Record<string, PHAssetMeta>;

interface PHFiles {
  gltf?: Record<string, Record<string, { url: string; md5?: string; size?: number }>>;
}

const attrib = (a: PHAssetMeta) =>
  `Poly Haven — ${Object.keys(a.authors ?? { Unknown: '' }).join(', ')}`;

function materialCategoryFor(meta: PHAssetMeta): MaterialCategory {
  const cats = meta.categories ?? [];
  return cats.some((c) => /wall|brick|plaster|paint/i.test(c)) ? 'wall' : 'floor';
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Poly Haven ${res.status}: ${url}`);
  return (await res.json()) as T;
}

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  const [models, textures] = await Promise.all([
    fetchJson<PHIndex>(`${API}/assets?t=models`, signal),
    fetchJson<PHIndex>(`${API}/assets?t=textures`, signal),
  ]);
  const out: RemoteEntry[] = [];
  for (const [slug, meta] of Object.entries(models)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'furniture',
      name: meta.name,
      category: mapPolyHavenFurnitureCategory(meta.categories ?? []),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
    });
  }
  for (const [slug, meta] of Object.entries(textures)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'material',
      name: meta.name,
      category: materialCategoryFor(meta),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
    });
  }
  return out;
}

async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(entry.thumbUrl, { signal });
  if (!r.ok) throw new Error(`Thumb ${r.status}`);
  return r.blob();
}

async function fetchAsset(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal);
  if (entry.kind === 'material') {
    const channels: Record<string, Blob> = {};
    const want: Record<string, RegExp> = {
      albedo: /diff|color|albedo/i,
      normal: /nor_gl|normal/i,
      roughness: /rough/i,
      ao: /ao|ambient/i,
    };
    const variants = files.gltf?.[resolution] ?? {};
    for (const [path, file] of Object.entries(variants)) {
      for (const [ch, re] of Object.entries(want)) {
        if (re.test(path) && !channels[ch]) {
          const r = await fetch(file.url, { signal });
          if (!r.ok) throw new Error(`Texture ${r.status}`);
          channels[ch] = await r.blob();
        }
      }
    }
    if (!channels.albedo) throw new Error(`No albedo texture for ${entry.slug}`);
    return { kind: 'material', channels };
  }
  // furniture
  const variants = files.gltf?.[resolution] ?? {};
  let gltfPath = '';
  let bin: Blob | undefined;
  let gltfJson: object | undefined;
  const textures: Record<string, Blob> = {};
  for (const [path, file] of Object.entries(variants)) {
    const r = await fetch(file.url, { signal });
    if (!r.ok) throw new Error(`File ${r.status}: ${path}`);
    if (path.endsWith('.gltf')) {
      gltfPath = path;
      gltfJson = (await r.json()) as object;
    } else if (path.endsWith('.bin')) {
      bin = await r.blob();
    } else {
      textures[path] = await r.blob();
    }
  }
  if (!gltfJson) throw new Error(`No .gltf in variants for ${entry.slug}`);
  return { kind: 'furniture', gltfJson, bin, textures, rootPath: gltfPath };
}

export const polyhaven: RemoteProvider = {
  id: 'polyhaven',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
};
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/catalog/remote/providers/polyhaven.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/providers/polyhaven.ts src/catalog/remote/providers/polyhaven.test.ts
git commit -m "Add Poly Haven provider with index/thumb/asset fetchers"
```

---

### Task 7: ambientCG provider (TDD with mocked fetch)

**Files:**
- Create: `src/catalog/remote/providers/ambientcg.ts`
- Create: `src/catalog/remote/providers/ambientcg.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/catalog/remote/providers/ambientcg.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ambientcg } from './ambientcg';
import { zipSync } from 'fflate';

afterEach(() => vi.unstubAllGlobals());

describe('ambientcg', () => {
  it('parses index entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            foundAssets: [
              {
                assetId: 'Wood001',
                displayName: 'Wood 001',
                category: 'Wood',
                previewImage: { '128-PNG': 'https://acg.example/wood001-128.png' },
                downloadFolders: [
                  {
                    downloadFiletypeCategories: {
                      zip: {
                        downloads: [
                          { attribute: '2K-JPG', downloadLink: 'https://acg.example/wood001-2k.zip' },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const entries = await ambientcg.fetchIndex();
    expect(entries[0].slug).toBe('Wood001');
    expect(entries[0].kind).toBe('material');
  });

  it('extracts material channels from a zip', async () => {
    const zip = zipSync({
      'Wood001_2K_Color.jpg': new Uint8Array([1, 2, 3]),
      'Wood001_2K_NormalGL.jpg': new Uint8Array([4, 5]),
      'Wood001_2K_Roughness.jpg': new Uint8Array([6]),
      'Wood001_2K_AmbientOcclusion.jpg': new Uint8Array([7]),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('full_json')) {
          return new Response(
            JSON.stringify({
              foundAssets: [
                {
                  assetId: 'Wood001',
                  displayName: 'Wood 001',
                  category: 'Wood',
                  previewImage: { '128-PNG': 'https://x/p.png' },
                  downloadFolders: [
                    {
                      downloadFiletypeCategories: {
                        zip: {
                          downloads: [
                            { attribute: '2K-JPG', downloadLink: 'https://acg.example/w.zip' },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(zip, { status: 200 });
      }),
    );

    const [entry] = await ambientcg.fetchIndex();
    const bundle = await ambientcg.fetchAsset(entry, '2k');
    if (bundle.kind !== 'material') throw new Error('expected material');
    expect(bundle.channels.albedo).toBeInstanceOf(Blob);
    expect(bundle.channels.normal).toBeInstanceOf(Blob);
    expect(bundle.channels.roughness).toBeInstanceOf(Blob);
    expect(bundle.channels.ao).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/catalog/remote/providers/ambientcg.ts
import { unzipSync } from 'fflate';
import type {
  AssetBundle,
  RemoteEntry,
  RemoteProvider,
  Resolution,
} from '../types';
import type { MaterialCategory } from '../../../materials/types';

const API = 'https://ambientcg.com/api/v2/full_json';
const PAGE_URL = (slug: string) => `https://ambientcg.com/view?id=${slug}`;

interface AcgAsset {
  assetId: string;
  displayName: string;
  category?: string;
  previewImage?: Record<string, string>;
  downloadFolders?: Array<{
    downloadFiletypeCategories?: {
      zip?: { downloads?: Array<{ attribute: string; downloadLink: string }> };
    };
  }>;
}

function categoryFor(meta: AcgAsset): MaterialCategory {
  const c = (meta.category ?? '').toLowerCase();
  return /wall|brick|plaster|tile|wallpaper/.test(c) ? 'wall' : 'floor';
}

function thumbFor(meta: AcgAsset): string {
  return (
    meta.previewImage?.['128-PNG'] ??
    meta.previewImage?.['200-PNG'] ??
    Object.values(meta.previewImage ?? {})[0] ??
    ''
  );
}

function zipUrlFor(meta: AcgAsset, resolution: Resolution): string | undefined {
  const want = `${resolution.toUpperCase()}-JPG`;
  for (const f of meta.downloadFolders ?? []) {
    for (const d of f.downloadFiletypeCategories?.zip?.downloads ?? []) {
      if (d.attribute === want) return d.downloadLink;
    }
  }
  return undefined;
}

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  const url = `${API}?type=Material&include=imageData,downloadData`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ambientCG ${res.status}`);
  const json = (await res.json()) as { foundAssets: AcgAsset[] };
  return json.foundAssets.map((a) => ({
    provider: 'ambientcg' as const,
    slug: a.assetId,
    kind: 'material' as const,
    name: a.displayName,
    category: categoryFor(a),
    thumbUrl: thumbFor(a),
    resolutions: ['1k', '2k', '4k'] as Resolution[],
    attribution: 'ambientCG (CC0)',
    sourceUrl: PAGE_URL(a.assetId),
  }));
}

async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(entry.thumbUrl, { signal });
  if (!r.ok) throw new Error(`ambientCG thumb ${r.status}`);
  return r.blob();
}

async function fetchAsset(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  // Re-fetch this asset's metadata to discover the zip URL.
  const url = `${API}?id=${encodeURIComponent(entry.slug)}&include=downloadData`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ambientCG ${res.status}`);
  const json = (await res.json()) as { foundAssets: AcgAsset[] };
  const meta = json.foundAssets[0];
  if (!meta) throw new Error(`ambientCG asset ${entry.slug} not found`);
  const zipUrl = zipUrlFor(meta, resolution);
  if (!zipUrl) throw new Error(`No ${resolution} zip for ${entry.slug}`);
  const zipRes = await fetch(zipUrl, { signal });
  if (!zipRes.ok) throw new Error(`ambientCG zip ${zipRes.status}`);
  const buf = new Uint8Array(await zipRes.arrayBuffer());
  const files = unzipSync(buf);
  const channels: Record<string, Blob> = {};
  const want: { ch: string; re: RegExp; mime: string }[] = [
    { ch: 'albedo', re: /Color\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'normal', re: /NormalGL\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'roughness', re: /Roughness\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'ao', re: /AmbientOcclusion\.(jpg|png)$/i, mime: 'image/jpeg' },
  ];
  for (const [name, bytes] of Object.entries(files)) {
    for (const { ch, re, mime } of want) {
      if (re.test(name) && !channels[ch]) {
        channels[ch] = new Blob([bytes], { type: mime });
      }
    }
  }
  if (!channels.albedo) throw new Error(`No color channel in ${entry.slug} zip`);
  return { kind: 'material', channels };
}

export const ambientcg: RemoteProvider = {
  id: 'ambientcg',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
};
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/providers/ambientcg.ts src/catalog/remote/providers/ambientcg.test.ts
git commit -m "Add ambientCG provider with zip extraction"
```

---

### Task 8: Provider registry

**Files:**
- Create: `src/catalog/remote/providers/index.ts`

- [ ] **Step 1: Implement**

```ts
// src/catalog/remote/providers/index.ts
import type { ProviderId, RemoteProvider } from '../types';
import { polyhaven } from './polyhaven';
import { ambientcg } from './ambientcg';

export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/catalog/remote/providers/index.ts
git commit -m "Add remote provider registry"
```

---

### Task 9: Schema additions for resolved entries

**Files:**
- Modify: `src/furniture/types.ts`
- Modify: `src/materials/types.ts`

- [ ] **Step 1: Add `RemoteGltfDef` to furniture types**

In `src/furniture/types.ts`, after `UserGltfDef` add:

```ts
export interface RemoteGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'remote';
  provider: 'polyhaven';
  slug: string;
  resolution: '1k' | '2k' | '4k';
  /** Object URL for the .gltf root. Refreshed on resolve. */
  runtimeUrl: string;
  /** Map of every relative path in the gltf JSON → object URL. Used by
   *  GLTFLoader.LoadingManager.setURLModifier in GltfModel. */
  runtimeAssets: Record<string, string>;
  scale?: number;
  license: 'CC0';
  attribution: string;
  sourceUrl: string;
}
```

Update `GltfDef`:

```ts
export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef;
```

- [ ] **Step 2: Extend `TexturedMaterialDef` with resolution provenance**

In `src/materials/types.ts`, replace the `TexturedMaterialDef` `source` line area:

```ts
  source: 'polyhaven' | 'ambientcg' | 'user';
  /** Provider slug for re-resolution. Set for runtime-resolved entries. */
  slug?: string;
  resolution?: '1k' | '2k' | '4k';
```

(Keep the existing `runtimeUrls` field — the resolver populates it.)

- [ ] **Step 3: Run typecheck — expect existing tests still PASS**

```bash
npm run build -- --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/furniture/types.ts src/materials/types.ts
git commit -m "Add RemoteGltfDef and runtime fields to material def"
```

---

### Task 10: GltfModel URLModifier support (TDD)

**Files:**
- Modify: `src/furniture/GltfModel.tsx`

- [ ] **Step 1: Read existing implementation**

```bash
sed -n '1,200p' src/furniture/GltfModel.tsx
```

- [ ] **Step 2: Find the GLTFLoader instantiation and inject URL modifier**

The change: when the def is a `RemoteGltfDef`, attach a `LoadingManager` whose `setURLModifier` returns the matching object URL from `def.runtimeAssets`. Replace the loader instantiation site:

```tsx
// Inside GltfModel where GLTFLoader is created:
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const isRemote = (def as { source?: string }).source === 'remote';
const manager = new LoadingManager();
if (isRemote) {
  const remote = def as RemoteGltfDef;
  manager.setURLModifier((url) => {
    // GLTFLoader passes resolved URLs (relative to runtimeUrl). We rewrite
    // back to object URLs by stripping the runtimeUrl prefix.
    if (remote.runtimeAssets[url]) return remote.runtimeAssets[url];
    // Try last path segment match (handles loader's URL resolution).
    for (const [path, obj] of Object.entries(remote.runtimeAssets)) {
      if (url.endsWith(path)) return obj;
    }
    return url;
  });
}
const loader = new GLTFLoader(manager);
loader.load(def.runtimeUrl ?? def.url, ...);
```

(Adjust to match the file's existing structure — leave non-remote paths untouched.)

- [ ] **Step 3: Run existing GltfModel/builtin tests**

```bash
npx vitest run src/furniture
```

- [ ] **Step 4: Commit**

```bash
git add src/furniture/GltfModel.tsx
git commit -m "GltfModel: route RemoteGltfDef through URLModifier"
```

---

### Task 11: Resolver — bundle → def (TDD)

**Files:**
- Create: `src/catalog/remote/resolver.ts`
- Create: `src/catalog/remote/resolver.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/catalog/remote/resolver.test.ts
import { describe, expect, it } from 'vitest';
import { bundleToFurnitureDef, bundleToMaterialDef } from './resolver';
import type { AssetBundle, RemoteEntry } from './types';

const matEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'wood',
  kind: 'material',
  name: 'Wood',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
};

const furnEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'chair',
  kind: 'furniture',
  name: 'Chair',
  category: 'seating',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
};

describe('resolver', () => {
  it('produces a TexturedMaterialDef from a material bundle', () => {
    const bundle: AssetBundle = {
      kind: 'material',
      channels: { albedo: new Blob(['a']), normal: new Blob(['n']) },
    };
    const def = bundleToMaterialDef(matEntry, '2k', bundle);
    expect(def.kind).toBe('textured');
    expect(def.source).toBe('polyhaven');
    expect(def.runtimeUrls?.albedo).toMatch(/^blob:/);
    expect(def.runtimeUrls?.normal).toMatch(/^blob:/);
  });

  it('produces a RemoteGltfDef from a furniture bundle', () => {
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: {},
      bin: new Blob(['b']),
      textures: { 'textures/wood.jpg': new Blob(['t']) },
      rootPath: 'asset.gltf',
    };
    const def = bundleToFurnitureDef(furnEntry, '2k', bundle);
    expect(def.kind).toBe('gltf');
    expect(def.source).toBe('remote');
    expect(def.runtimeUrl).toMatch(/^blob:/);
    expect(Object.keys(def.runtimeAssets)).toEqual(
      expect.arrayContaining(['textures/wood.jpg']),
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/catalog/remote/resolver.ts
import type { AssetBundle, RemoteEntry, Resolution } from './types';
import type { TexturedMaterialDef } from '../../materials/types';
import type { RemoteGltfDef } from '../../furniture/types';

const blobUrl = (b: Blob) => URL.createObjectURL(b);

export function bundleToMaterialDef(
  entry: RemoteEntry,
  resolution: Resolution,
  bundle: AssetBundle,
): TexturedMaterialDef {
  if (bundle.kind !== 'material') throw new Error('not a material bundle');
  const c = bundle.channels;
  const albedoUrl = c.albedo ? blobUrl(c.albedo) : undefined;
  if (!albedoUrl) throw new Error('material bundle missing albedo');
  return {
    id: `${entry.provider}:${entry.slug}:${resolution}`,
    name: entry.name,
    category: entry.category as 'floor' | 'wall',
    swatch: '#cccccc',
    kind: 'textured',
    source: entry.provider as 'polyhaven' | 'ambientcg',
    slug: entry.slug,
    resolution,
    sourceUrl: entry.sourceUrl,
    textures: {
      albedo: albedoUrl,
      normal: c.normal ? blobUrl(c.normal) : undefined,
      roughness: c.roughness ? blobUrl(c.roughness) : undefined,
      ao: c.ao ? blobUrl(c.ao) : undefined,
    },
    uvScale: [1, 1],
    runtimeUrls: {
      albedo: albedoUrl,
      normal: c.normal ? blobUrl(c.normal) : undefined,
      roughness: c.roughness ? blobUrl(c.roughness) : undefined,
      ao: c.ao ? blobUrl(c.ao) : undefined,
    },
  };
}

export function bundleToFurnitureDef(
  entry: RemoteEntry,
  resolution: Resolution,
  bundle: AssetBundle,
): RemoteGltfDef {
  if (bundle.kind !== 'furniture') throw new Error('not a furniture bundle');
  const runtimeAssets: Record<string, string> = {};
  for (const [path, blob] of Object.entries(bundle.textures)) {
    runtimeAssets[path] = blobUrl(blob);
  }
  if (bundle.bin) {
    // The .gltf file references the bin under a path; we don't know the
    // exact path here, so we register both 'scene.bin' as a default and
    // walk the gltf JSON for `buffers[].uri`.
    const json = bundle.gltfJson as { buffers?: { uri?: string }[] };
    const binUri = json.buffers?.[0]?.uri ?? 'scene.bin';
    runtimeAssets[binUri] = blobUrl(bundle.bin);
  }
  const gltfBlob = new Blob([JSON.stringify(bundle.gltfJson)], {
    type: 'model/gltf+json',
  });
  const runtimeUrl = blobUrl(gltfBlob);
  return {
    id: `${entry.provider}:${entry.slug}:${resolution}`,
    name: entry.name,
    category: entry.category as RemoteGltfDef['category'],
    defaultFootprint: { w: 1, d: 1, h: 1 },
    kind: 'gltf',
    source: 'remote',
    provider: 'polyhaven',
    slug: entry.slug,
    resolution,
    runtimeUrl,
    runtimeAssets,
    license: 'CC0',
    attribution: entry.attribution,
    sourceUrl: entry.sourceUrl,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/catalog/remote/resolver.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/resolver.ts src/catalog/remote/resolver.test.ts
git commit -m "Add bundle→def resolver for remote entries"
```

---

### Task 12: Remote catalog Zustand slice (TDD)

**Files:**
- Create: `src/state/slices/remoteCatalogSlice.ts`
- Create: `src/state/slices/remoteCatalogSlice.test.ts`
- Modify: `src/state/store.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/state/slices/remoteCatalogSlice.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import {
  createRemoteCatalogSlice,
  REMOTE_CATALOG_INITIAL,
  type RemoteCatalogSlice,
} from './remoteCatalogSlice';
import { resetCacheForTest } from '../../catalog/remote/cache/db';
import type { RemoteEntry } from '../../catalog/remote/types';

const fakeEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 's',
  kind: 'material',
  name: 'S',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: '',
  sourceUrl: '',
};

vi.mock('../../catalog/remote/providers', () => ({
  PROVIDERS: {
    polyhaven: {
      id: 'polyhaven',
      fetchIndex: vi.fn(async () => [fakeEntry]),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
    ambientcg: {
      id: 'ambientcg',
      fetchIndex: vi.fn(async () => []),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
  },
}));

describe('remoteCatalogSlice', () => {
  beforeEach(async () => {
    await resetCacheForTest();
  });

  it('bootstraps and loads provider indexes', async () => {
    const useStore = create<RemoteCatalogSlice>()((set, get, api) => ({
      ...REMOTE_CATALOG_INITIAL,
      ...createRemoteCatalogSlice(set, get, api),
    }));
    await useStore.getState().bootstrapRemoteCatalog();
    expect(useStore.getState().remoteIndexes.polyhaven.status).toBe('ready');
    expect(useStore.getState().remoteIndexes.polyhaven.entries[0].slug).toBe('s');
  });

  it('resolveRemoteAsset registers a resolved def', async () => {
    const useStore = create<RemoteCatalogSlice>()((set, get, api) => ({
      ...REMOTE_CATALOG_INITIAL,
      ...createRemoteCatalogSlice(set, get, api),
    }));
    await useStore.getState().bootstrapRemoteCatalog();
    await useStore.getState().resolveRemoteAsset(fakeEntry, '2k');
    const key = 'polyhaven:s:2k';
    expect(useStore.getState().resolvedRemoteMaterials[key]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/state/slices/remoteCatalogSlice.ts
import type { StateCreator } from 'zustand';
import type {
  ProviderId,
  RemoteEntry,
  Resolution,
} from '../../catalog/remote/types';
import { PROVIDERS } from '../../catalog/remote/providers';
import {
  getIndex,
  putIndex,
  getAsset,
  putAsset,
  getMeta,
  resetCacheForTest,
} from '../../catalog/remote/cache/db';
import {
  evictUntilUnder,
  DEFAULT_ASSET_CAP_BYTES,
} from '../../catalog/remote/cache/lru';
import { readShadow, writeShadow } from '../../catalog/remote/cache/shadow';
import {
  bundleToFurnitureDef,
  bundleToMaterialDef,
} from '../../catalog/remote/resolver';
import type { RemoteGltfDef } from '../../furniture/types';
import type { TexturedMaterialDef } from '../../materials/types';

const ONE_DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER = 7 * ONE_DAY;

export type RemoteIndexState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: RemoteEntry[];
  fetchedAt?: string;
  error?: string;
};

export interface RemoteCatalogSlice {
  remoteIndexes: Record<ProviderId, RemoteIndexState>;
  remoteFetches: Record<string, 'fetching' | 'error'>;
  resolvedRemoteFurniture: Record<string, RemoteGltfDef>;
  resolvedRemoteMaterials: Record<string, TexturedMaterialDef>;
  remoteCacheBytes: number;
  preferredResolution: Resolution;
  setPreferredResolution(r: Resolution): void;
  bootstrapRemoteCatalog(): Promise<void>;
  refreshProviderIndex(p: ProviderId): Promise<void>;
  resolveRemoteAsset(entry: RemoteEntry, r: Resolution): Promise<void>;
  clearRemoteCache(): Promise<void>;
}

const emptyIdx = (): RemoteIndexState => ({ status: 'idle', entries: [] });

export const REMOTE_CATALOG_INITIAL: Omit<
  RemoteCatalogSlice,
  | 'setPreferredResolution'
  | 'bootstrapRemoteCatalog'
  | 'refreshProviderIndex'
  | 'resolveRemoteAsset'
  | 'clearRemoteCache'
> = {
  remoteIndexes: { polyhaven: emptyIdx(), ambientcg: emptyIdx() },
  remoteFetches: {},
  resolvedRemoteFurniture: {},
  resolvedRemoteMaterials: {},
  remoteCacheBytes: 0,
  preferredResolution: '2k',
};

const inFlight = new Map<string, Promise<void>>();

export const createRemoteCatalogSlice: StateCreator<
  RemoteCatalogSlice,
  [],
  [],
  RemoteCatalogSlice
> = (set, get) => ({
  ...REMOTE_CATALOG_INITIAL,

  setPreferredResolution(r) {
    set({ preferredResolution: r });
  },

  async bootstrapRemoteCatalog() {
    const meta = await getMeta();
    set({ remoteCacheBytes: meta.totalBytes });
    await Promise.all(
      (Object.keys(PROVIDERS) as ProviderId[]).map(async (p) => {
        const cached = await getIndex(p);
        if (cached) {
          set((s) => ({
            remoteIndexes: {
              ...s.remoteIndexes,
              [p]: {
                status: 'ready',
                entries: cached.entries,
                fetchedAt: cached.fetchedAt,
              },
            },
          }));
          const age = Date.now() - new Date(cached.fetchedAt).getTime();
          if (age < STALE_AFTER) return;
        }
        await get().refreshProviderIndex(p);
      }),
    );
  },

  async refreshProviderIndex(p) {
    set((s) => ({
      remoteIndexes: {
        ...s.remoteIndexes,
        [p]: { ...s.remoteIndexes[p], status: 'loading' },
      },
    }));
    try {
      const entries = await PROVIDERS[p].fetchIndex();
      await putIndex(p, entries);
      writeShadow(p, { count: entries.length, fetchedAt: new Date().toISOString() });
      set((s) => ({
        remoteIndexes: {
          ...s.remoteIndexes,
          [p]: {
            status: 'ready',
            entries,
            fetchedAt: new Date().toISOString(),
          },
        },
      }));
    } catch (e) {
      set((s) => ({
        remoteIndexes: {
          ...s.remoteIndexes,
          [p]: { ...s.remoteIndexes[p], status: 'error', error: String(e) },
        },
      }));
    }
  },

  async resolveRemoteAsset(entry, resolution) {
    const key = `${entry.provider}:${entry.slug}:${resolution}`;
    if (
      get().resolvedRemoteFurniture[key] ||
      get().resolvedRemoteMaterials[key]
    ) {
      return;
    }
    const existing = inFlight.get(key);
    if (existing) return existing;

    const run = (async () => {
      set((s) => ({ remoteFetches: { ...s.remoteFetches, [key]: 'fetching' } }));
      try {
        let bundle = await getAsset(key);
        if (!bundle) {
          bundle = await PROVIDERS[entry.provider].fetchAsset(entry, resolution);
          await putAsset(key, bundle);
          await evictUntilUnder(DEFAULT_ASSET_CAP_BYTES);
          const meta = await getMeta();
          set({ remoteCacheBytes: meta.totalBytes });
        }
        if (bundle.kind === 'material') {
          const def = bundleToMaterialDef(entry, resolution, bundle);
          set((s) => ({
            resolvedRemoteMaterials: { ...s.resolvedRemoteMaterials, [key]: def },
            remoteFetches: { ...s.remoteFetches, [key]: undefined as never },
          }));
        } else {
          const def = bundleToFurnitureDef(entry, resolution, bundle);
          set((s) => ({
            resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, [key]: def },
            remoteFetches: { ...s.remoteFetches, [key]: undefined as never },
          }));
        }
      } catch (e) {
        set((s) => ({ remoteFetches: { ...s.remoteFetches, [key]: 'error' } }));
        throw e;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, run);
    return run;
  },

  async clearRemoteCache() {
    await resetCacheForTest();
    set({
      resolvedRemoteFurniture: {},
      resolvedRemoteMaterials: {},
      remoteCacheBytes: 0,
    });
  },
});
```

- [ ] **Step 4: Wire into root store**

In `src/state/store.ts`, add the slice alongside the others:

```ts
import {
  createRemoteCatalogSlice,
  REMOTE_CATALOG_INITIAL,
  type RemoteCatalogSlice,
} from './slices/remoteCatalogSlice';

// Add to RootState extends list: ..., RemoteCatalogSlice
// Add to INITIAL: ...REMOTE_CATALOG_INITIAL,
// In the create() body: ...createRemoteCatalogSlice(set, get, api),
```

(Read the file first to find exact insertion points.)

- [ ] **Step 5: Run — expect PASS for new tests; existing tests still PASS**

```bash
npx vitest run src/state src/catalog/remote
```

- [ ] **Step 6: Commit**

```bash
git add src/state/slices/remoteCatalogSlice.ts src/state/slices/remoteCatalogSlice.test.ts src/state/store.ts
git commit -m "Add remoteCatalogSlice with bootstrap and resolveAsset"
```

---

### Task 13: Merge resolved entries into existing catalog hooks

**Files:**
- Modify: `src/furniture/catalog.ts`
- Create: `src/materials/remoteMerge.ts`

- [ ] **Step 1: Furniture merge**

In `src/furniture/catalog.ts`, extend `useCatalog` and `useCatalogByCategory` to also pull from `s.resolvedRemoteFurniture`:

```ts
export function useCatalog(): Record<FurnitureType, FurnitureDef> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture));
  const remote = useStore(useShallow((s) => s.resolvedRemoteFurniture));
  const merged: Record<FurnitureType, FurnitureDef> = { ...BUILTIN_CATALOG };
  for (const def of GENERATED_FURNITURE) merged[def.id] = def;
  for (const def of userFurniture) merged[def.id] = def;
  for (const def of Object.values(remote)) merged[def.id] = def;
  return merged;
}
```

(Mirror the change in `useCatalogByCategory`.)

- [ ] **Step 2: Material merge helper**

```ts
// src/materials/remoteMerge.ts
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import type { MaterialDef } from './types';

export function useResolvedRemoteMaterials(): MaterialDef[] {
  return useStore(useShallow((s) => Object.values(s.resolvedRemoteMaterials)));
}
```

Wherever the materials catalog is consumed (search for `BUILTIN_MATERIALS` / `useMaterial`), append the result of this hook.

```bash
grep -rn 'BUILTIN_MATERIALS\|generatedCatalog\b' src/materials src/ui
```

Patch the consumer(s) to spread `useResolvedRemoteMaterials()` into the list.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/furniture/catalog.ts src/materials/remoteMerge.ts
git commit -m "Merge resolved remote entries into furniture/material catalogs"
```

---

### Task 14: Hooks for UI consumption

**Files:**
- Create: `src/catalog/remote/hooks.ts`

- [ ] **Step 1: Implement**

```ts
// src/catalog/remote/hooks.ts
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { getThumb, putThumb } from './cache/db';
import { PROVIDERS } from './providers';
import type { ProviderId, RemoteEntry, RemoteKind } from './types';

const limiter = (() => {
  let inFlight = 0;
  const queue: (() => void)[] = [];
  const tick = () => {
    while (inFlight < 8 && queue.length) {
      const job = queue.shift()!;
      inFlight++;
      job();
    }
  };
  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        const job = () =>
          fn()
            .then(resolve, reject)
            .finally(() => {
              inFlight--;
              tick();
            });
        queue.push(job);
        tick();
      });
    },
  };
})();

export function useRemoteEntries(kind: RemoteKind): RemoteEntry[] {
  return useStore(
    useShallow((s) => {
      const all: RemoteEntry[] = [];
      for (const p of Object.keys(s.remoteIndexes) as ProviderId[]) {
        for (const e of s.remoteIndexes[p].entries) {
          if (e.kind === kind) all.push(e);
        }
      }
      return all;
    }),
  );
}

export function useThumbnail(entry: RemoteEntry, visible: boolean): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    if (!visible || url) return;
    const key = `${entry.provider}:${entry.slug}`;
    (async () => {
      let blob = await getThumb(key);
      if (!blob) {
        blob = await limiter.schedule(() =>
          PROVIDERS[entry.provider].fetchThumbnail(entry),
        );
        await putThumb(key, blob);
      }
      if (!cancelled.current) setUrl(URL.createObjectURL(blob));
    })().catch(() => {
      // swallow; card stays placeholder
    });
    return () => {
      cancelled.current = true;
    };
  }, [entry.provider, entry.slug, visible, url, entry]);
  return url;
}

export function useResolveStatus(key: string): 'idle' | 'fetching' | 'ready' | 'error' {
  return useStore((s) => {
    if (s.resolvedRemoteFurniture[key] || s.resolvedRemoteMaterials[key]) return 'ready';
    return s.remoteFetches[key] ?? 'idle';
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/catalog/remote/hooks.ts
git commit -m "Add hooks for remote entries and thumbnails"
```

---

### Task 15: Resolution picker + cache pane UI

**Files:**
- Create: `src/ui/catalog/ResolutionPicker.tsx`
- Create: `src/ui/catalog/CachePane.tsx`

- [ ] **Step 1: ResolutionPicker**

```tsx
// src/ui/catalog/ResolutionPicker.tsx
import { useStore } from '../../state/store';
import { RESOLUTIONS } from '../../catalog/remote/types';

export function ResolutionPicker() {
  const value = useStore((s) => s.preferredResolution);
  const set = useStore((s) => s.setPreferredResolution);
  return (
    <div className="flex gap-1 text-[10px]">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          onClick={() => set(r)}
          className={`rounded px-1.5 py-0.5 ${
            value === r ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-neutral-700'
          }`}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: CachePane**

```tsx
// src/ui/catalog/CachePane.tsx
import { useStore } from '../../state/store';

const fmt = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function CachePane() {
  const bytes = useStore((s) => s.remoteCacheBytes);
  const clear = useStore((s) => s.clearRemoteCache);
  return (
    <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-500">
      <span>Cache: {fmt(bytes)}</span>
      <button
        onClick={clear}
        className="rounded bg-neutral-200 px-2 py-0.5 hover:bg-neutral-300"
      >
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/catalog/ResolutionPicker.tsx src/ui/catalog/CachePane.tsx
git commit -m "Add resolution picker and cache pane"
```

---

### Task 16: Remote browse tab UI

**Files:**
- Create: `src/ui/catalog/RemoteCard.tsx`
- Create: `src/ui/catalog/RemoteBrowseTab.tsx`
- Modify: `src/ui/catalog/CatalogDrawer.tsx`

- [ ] **Step 1: RemoteCard**

```tsx
// src/ui/catalog/RemoteCard.tsx
import { useState } from 'react';
import { useStore } from '../../state/store';
import { useThumbnail, useResolveStatus } from '../../catalog/remote/hooks';
import type { RemoteEntry } from '../../catalog/remote/types';

export function RemoteCard({
  entry,
  onResolved,
}: {
  entry: RemoteEntry;
  onResolved: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const thumb = useThumbnail(entry, visible);
  const resolution = useStore((s) => s.preferredResolution);
  const resolve = useStore((s) => s.resolveRemoteAsset);
  const key = `${entry.provider}:${entry.slug}:${resolution}`;
  const status = useResolveStatus(key);

  return (
    <div
      ref={(el) => {
        if (!el || visible) return;
        const obs = new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting) {
              setVisible(true);
              obs.disconnect();
            }
          },
          { rootMargin: '100px' },
        );
        obs.observe(el);
      }}
      className="relative flex flex-col gap-1 rounded border border-neutral-200 p-2 text-[10px]"
    >
      <div className="aspect-square w-full bg-neutral-100">
        {thumb && <img src={thumb} alt={entry.name} className="h-full w-full object-cover" />}
      </div>
      <div className="truncate font-medium text-neutral-800">{entry.name}</div>
      <div className="truncate text-[9px] text-neutral-400">{entry.attribution}</div>
      <button
        onClick={async () => {
          await resolve(entry, resolution);
          onResolved(key);
        }}
        disabled={status === 'fetching'}
        className="rounded bg-blue-600 px-2 py-0.5 text-white disabled:bg-neutral-300"
      >
        {status === 'ready'
          ? 'Place'
          : status === 'fetching'
            ? 'Loading…'
            : status === 'error'
              ? 'Retry'
              : 'Add'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: RemoteBrowseTab**

```tsx
// src/ui/catalog/RemoteBrowseTab.tsx
import { useMemo, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { RemoteCard } from './RemoteCard';
import { ResolutionPicker } from './ResolutionPicker';
import { CachePane } from './CachePane';
import { useRemoteEntries } from '../../catalog/remote/hooks';
import type { RemoteKind } from '../../catalog/remote/types';

export function RemoteBrowseTab({
  kind,
  onResolved,
}: {
  kind: RemoteKind;
  onResolved: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const all = useRemoteEntries(kind);
  const filtered = useMemo(
    () =>
      q
        ? all.filter(
            (e) =>
              e.name.toLowerCase().includes(q.toLowerCase()) ||
              e.slug.toLowerCase().includes(q.toLowerCase()),
          )
        : all,
    [all, q],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
        />
        <ResolutionPicker />
      </div>
      <div className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">
            Loading catalog…
          </p>
        ) : (
          <VirtuosoGrid
            style={{ height: '100%' }}
            data={filtered}
            listClassName="grid grid-cols-2 gap-2 p-3"
            itemContent={(_, entry) => (
              <RemoteCard entry={entry} onResolved={onResolved} />
            )}
          />
        )}
      </div>
      <CachePane />
    </div>
  );
}
```

- [ ] **Step 3: Wire tabs into CatalogDrawer**

Read the current drawer, then add a top-level mode tab `'builtin' | 'browse-furniture' | 'browse-materials'`, default `'builtin'`. When `browse-*` is active, render `<RemoteBrowseTab kind="furniture" />` or `<RemoteBrowseTab kind="material" />`. The existing `CategoryTabs` + grid stays as-is for `'builtin'`.

Also call `bootstrapRemoteCatalog()` from a `useEffect` inside CatalogDrawer when `open` is true and indexes are still `idle`.

```tsx
// inside CatalogDrawer
const bootstrap = useStore((s) => s.bootstrapRemoteCatalog);
const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status);
useEffect(() => {
  if (open && phStatus === 'idle') void bootstrap();
}, [open, phStatus, bootstrap]);
```

- [ ] **Step 4: Manual run + commit**

```bash
npm run dev
# Open browser, open catalog, switch to "Browse — Furniture", scroll, click an item.
```

```bash
git add src/ui/catalog/
git commit -m "Add remote browse tabs with virtualized grid"
```

---

### Task 17: Integration smoke test

**Files:**
- Create: `src/catalog/remote/__tests__/integration.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/catalog/remote/__tests__/integration.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { useStore } from '../../../state/store';
import { resetCacheForTest } from '../cache/db';
import type { RemoteEntry } from '../types';

const sample: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'wood',
  kind: 'material',
  name: 'Wood',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
};

vi.mock('../providers', () => ({
  PROVIDERS: {
    polyhaven: {
      id: 'polyhaven',
      fetchIndex: vi.fn(async () => [sample]),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
    ambientcg: {
      id: 'ambientcg',
      fetchIndex: vi.fn(async () => []),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
  },
}));

describe('remote catalog integration', () => {
  it('bootstraps, resolves, and registers in catalog', async () => {
    await resetCacheForTest();
    await useStore.getState().bootstrapRemoteCatalog();
    await useStore.getState().resolveRemoteAsset(sample, '2k');
    const def = useStore.getState().resolvedRemoteMaterials['polyhaven:wood:2k'];
    expect(def).toBeDefined();
    expect(def.kind).toBe('textured');
  });
});
```

- [ ] **Step 2: Run — expect PASS**

```bash
npx vitest run src/catalog/remote/__tests__/integration.test.tsx
```

- [ ] **Step 3: Run full suite + typecheck**

```bash
npx vitest run
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/catalog/remote/__tests__/integration.test.tsx
git commit -m "Add remote catalog integration smoke test"
```

---

### Task 18: TODO.md update

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Add Runtime CC0 catalog entries (deferred work)**

Append under `## Assets`:

```md
- **Runtime catalog: Kenney support** — Kenney has no CORS-friendly API and ships single ZIPs. Add a build-time mirror (or proxy worker) before extending the runtime catalog to Kenney. See [runtime CC0 catalog spec](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md).
- **Runtime catalog: Quaternius support** — same rationale as Kenney. See spec above.
- **Runtime catalog: per-asset bytes estimate** — Poly Haven `/files` endpoint returns size; surface it on cards before clicking so users can avoid 50 MB downloads. See [src/catalog/remote/providers/polyhaven.ts](src/catalog/remote/providers/polyhaven.ts).
- **Runtime catalog: HDRI environment** — Poly Haven has 700+ HDRIs but the app has no environment slot. Reconsider when scene lighting is exposed. See [runtime CC0 catalog spec — Non-goals](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md#non-goals).
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "TODO: track deferred work for runtime CC0 catalog"
```

---

## Self-Review

1. **Spec coverage:** Architecture (Task 1, 12, 13, 14) ✓; cache layer (Tasks 2–4) ✓; providers (Tasks 6–8) ✓; resolver / loader bridge (Tasks 9–11) ✓; UI (Tasks 15–16) ✓; error handling — quota eviction in Task 12, retry button in Task 16, fetch error captured in slice ✓; testing (Tasks 2, 3, 5, 6, 7, 11, 12, 17) ✓; out-of-scope tracking (Task 18) ✓.
2. **Placeholder scan:** No "TBD" / "implement later" / "appropriate handling" placeholders remain. Code blocks present where steps modify code.
3. **Type consistency:** `RemoteEntry`, `AssetBundle`, `RemoteGltfDef`, `TexturedMaterialDef.{slug,resolution}` consistent across tasks. Slice property names (`resolvedRemoteFurniture`, `resolvedRemoteMaterials`, `bootstrapRemoteCatalog`, `resolveRemoteAsset`, `clearRemoteCache`, `preferredResolution`) match between definition (Task 12), consumers (Tasks 13–16), and integration test (Task 17).
4. **Ambiguity:** Task 10 says "adjust to match the file's existing structure" — acceptable because the integration is mechanical and the example shows the URL-modifier pattern. Task 13 step 2 says to grep for material consumers — acceptable since the project's exact wiring location is best discovered with grep rather than guessed.
