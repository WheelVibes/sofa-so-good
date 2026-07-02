# Shared Library Catalog Auto-Populate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make R2-hosted IKEA library products auto-appear as browsable, lazily-loaded cards in the main catalog grid for any signed-in user, replacing the manual per-item "Add" browser in the Packs tab.

**Architecture:** A dedicated shared-library store slice fetches the R2 manifest once (guarded on backend + sign-in + `sharedLibrary` flag). `useUnifiedCatalog` merges its items as a new `GridItem` kind into category tabs, mapping category client-side and deduping against already-imported IKEA defs. A lean `SharedCard` lazy-loads its thumbnail through the auth-gated proxy and, on click, runs the existing `registerSharedGroup` → `importGroup` import. Pagination is inherited from the existing 12-per-page grid pager.

**Tech Stack:** React + TypeScript, Zustand (sliced store), Vitest + @testing-library/react, Vite. Node scripts in ESM (`.mjs`).

## Global Constraints

- Biome formatting: 2-space indent, 100-col, single quotes, no semicolons.
- No hardcoded colour — use the CSS token class vocabulary (`.cat-card`, `.badge`, `var(--…)`), never Tailwind colour utilities or hex literals.
- Python 3.10+ / `python3` rule is N/A here (no Python touched).
- Feature gating: the `sharedLibrary` flag stays **pro-tier, default on, not devOnly** (unchanged). Anything mode-dependent is unit-tested in **both** Simple and Pro.
- While iterating, run only targeted tests (`npx vitest --run <path>`); run the full suite + `tsc` + `biome` once before any commit.
- Every commit bumps the `build` in `src/version.ts`. Current version is `0.10.0.2`; this plan ships `0.10.0.3`. `package.json` mirrors the first three parts (`0.10.0`, unchanged for a build bump).
- Commit only where a step says to (repo rule: commit when the work unit is green).

---

### Task 1: Manifest carries `groupKey` (dedup key)

The client dedups a library card against an already-imported IKEA def by the stable id `ikea-${group_key}`. The manifest must therefore expose each product's `group_key`. Also refactor the build script so the entry-shaping logic is a pure, unit-testable function (it currently runs `main()` on import, so it can't be imported by a test).

**Files:**
- Modify: `scripts/build-library-index.mjs`
- Modify: `src/catalog/packs/sharedLibrary.ts` (add `groupKey` to `SharedLibraryItem`)
- Test: `scripts/build-library-index.test.mjs` (create)

**Interfaces:**
- Produces: `SharedLibraryItem` now has `groupKey: string`. Manifest entries include `groupKey` (falling back to the directory `group` when `group_key` is absent).
- Produces: `entryFromMeta(group: string, meta: object): (SharedLibraryItem-shaped object) | null` exported from `scripts/build-library-index.mjs`.

- [ ] **Step 1: Write the failing test**

Create `scripts/build-library-index.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { entryFromMeta } from './build-library-index.mjs'

const meta = {
  group_key: 'alex-desk-100x48',
  product_name: 'ALEX Desk',
  type_name: 'Desk',
  design: { category: 'desk' },
  size: '100x48',
  series: 'ALEX',
  variants: [{ glb: 'white.glb', main_image: 'white.jpg', price_numeral: 199, currency: 'SGD' }],
}

describe('entryFromMeta', () => {
  it('carries group_key as groupKey', () => {
    const entry = entryFromMeta('alex-desk-100x48', meta)
    expect(entry).not.toBeNull()
    expect(entry.groupKey).toBe('alex-desk-100x48')
    expect(entry.variants).toBe(1)
    expect(entry.thumbnail).toBe('white.jpg')
  })

  it('falls back to the directory group when group_key is missing', () => {
    const { group_key, ...noKey } = meta
    const entry = entryFromMeta('fallback-dir', noKey)
    expect(entry.groupKey).toBe('fallback-dir')
  })

  it('returns null when no variant has a GLB', () => {
    expect(entryFromMeta('x', { ...meta, variants: [{ main_image: 'a.jpg' }] })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run scripts/build-library-index.test.mjs`
Expected: FAIL — `entryFromMeta` is not exported.

- [ ] **Step 3: Refactor the script to export a pure `entryFromMeta` and add `groupKey`**

In `scripts/build-library-index.mjs`, replace the `buildEntry` function (currently lines ~37-56) with an exported pure `entryFromMeta` plus a thin disk-reading `buildEntry`, and guard `main()` so importing the module doesn't execute it:

```js
/** Shape one manifest entry from already-parsed metadata. Pure + testable. */
export function entryFromMeta(group, meta) {
  if (!meta) return null
  const variants = Array.isArray(meta.variants) ? meta.variants : []
  const usable = variants.filter((v) => v && typeof v.glb === 'string')
  if (usable.length === 0) return null // nothing renderable — skip
  const primary = primaryVariant(variants)
  return {
    group,
    groupKey: meta.group_key ?? group,
    name: meta.product_name ?? group,
    type: meta.type_name ?? '',
    category: meta.design?.category ?? '',
    size: meta.size ?? '',
    series: meta.series ?? '',
    variants: usable.length,
    thumbnail: primary?.main_image ?? null,
    price: primary?.price_numeral ?? null,
    currency: primary?.currency ?? null,
  }
}

async function buildEntry(group, dir) {
  return entryFromMeta(group, await readMetadata(dir))
}
```

Then change the bottom of the file so `main()` only runs when the file is executed directly (replace the final `main().catch(...)` block):

```js
import { fileURLToPath } from 'node:url'

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('[build-library-index] failed:', err)
    process.exit(1)
  })
}
```

Add `import { fileURLToPath } from 'node:url'` to the top with the other `node:` imports (keep it top-level per repo rules).

- [ ] **Step 4: Add `groupKey` to the `SharedLibraryItem` type**

In `src/catalog/packs/sharedLibrary.ts`, add the field to the interface (after `group`):

```ts
export interface SharedLibraryItem {
  group: string
  groupKey: string
  name: string
  type: string
  category: string
  size: string
  series: string
  variants: number
  thumbnail: string | null
  price: number | null
  currency: string | null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest --run scripts/build-library-index.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/build-library-index.mjs scripts/build-library-index.test.mjs src/catalog/packs/sharedLibrary.ts
git commit -m "feat: expose group_key in the shared-library manifest"
```

---

### Task 2: `sharedLibrarySlice` — fetch index + add-to-catalog

A store slice holding the fetched manifest and per-group add status, plus a guarded bootstrap and an `addSharedGroup` action that runs the existing import path.

**Files:**
- Create: `src/state/slices/sharedLibrarySlice.ts`
- Modify: `src/state/store.ts` (compose the slice + initial state)
- Test: `src/state/slices/sharedLibrarySlice.test.ts` (create)

**Interfaces:**
- Consumes (from Task 1): `SharedLibraryItem` (with `groupKey`), `fetchSharedLibraryIndex(): Promise<SharedLibraryIndex | null>`, `registerSharedGroup(group: string): Promise<boolean>` — all from `src/catalog/packs/sharedLibrary.ts`.
- Produces:
  - State: `sharedLibrary: { status: 'idle' | 'loading' | 'ready' | 'error'; items: SharedLibraryItem[]; resolving: Record<string, 'adding' | 'error'> }`.
  - `bootstrapSharedLibrary(): Promise<void>` — no-op unless `hasBackend()` && signed-in && `isFeatureEnabled('sharedLibrary')` && `status === 'idle'`.
  - `addSharedGroup(group: string): Promise<string | null>` — returns `ikea-${…}` def id on success (the imported def id) or null on failure; sets `resolving[group]`.

- [ ] **Step 1: Write the failing test**

Create `src/state/slices/sharedLibrarySlice.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../features/featureFlags'
import { useStore } from '../store'

vi.mock('../../features/api/client', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, hasBackend: () => true }
})

const fetchIndex = vi.fn()
const registerGroup = vi.fn()
vi.mock('../../catalog/packs/sharedLibrary', () => ({
  fetchSharedLibraryIndex: () => fetchIndex(),
  registerSharedGroup: (g: string) => registerGroup(g),
}))

const item = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX',
  type: 'Desk',
  category: 'desk',
  size: '',
  series: 'ALEX',
  variants: 1,
  thumbnail: 'a.jpg',
  price: 199,
  currency: 'SGD',
}

describe('sharedLibrarySlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    fetchIndex.mockReset()
    registerGroup.mockReset()
    setResolvedFlags(resolveFlags(false, {}, false, 'pro')) // sharedLibrary on
    useStore.setState({ currentUser: { id: 'u1', email: 'a@b.c', name: 'A', role: 'admin' } } as never)
  })

  it('bootstrap is a no-op when signed out', async () => {
    useStore.setState({ currentUser: null } as never)
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).not.toHaveBeenCalled()
    expect(useStore.getState().sharedLibrary.status).toBe('idle')
  })

  it('bootstrap is a no-op when the flag is off (Simple mode)', async () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'simple')) // sharedLibrary off
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).not.toHaveBeenCalled()
  })

  it('loads the index → ready', async () => {
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 1, items: [item] })
    await useStore.getState().bootstrapSharedLibrary()
    expect(useStore.getState().sharedLibrary.status).toBe('ready')
    expect(useStore.getState().sharedLibrary.items).toHaveLength(1)
  })

  it('sets error when the fetch yields nothing', async () => {
    fetchIndex.mockResolvedValue(null)
    await useStore.getState().bootstrapSharedLibrary()
    expect(useStore.getState().sharedLibrary.status).toBe('error')
  })

  it('does not refetch once loaded', async () => {
    fetchIndex.mockResolvedValue({ version: 1, generatedAt: '', count: 0, items: [] })
    await useStore.getState().bootstrapSharedLibrary()
    await useStore.getState().bootstrapSharedLibrary()
    expect(fetchIndex).toHaveBeenCalledTimes(1)
  })

  it('addSharedGroup returns the def id on success', async () => {
    registerGroup.mockResolvedValue(true)
    const id = await useStore.getState().addSharedGroup('alex')
    expect(id).toBe('ikea-alex')
    expect(registerGroup).toHaveBeenCalledWith('alex')
  })

  it('addSharedGroup returns null and flags error on failure', async () => {
    registerGroup.mockResolvedValue(false)
    const id = await useStore.getState().addSharedGroup('alex')
    expect(id).toBeNull()
    expect(useStore.getState().sharedLibrary.resolving.alex).toBe('error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/state/slices/sharedLibrarySlice.test.ts`
Expected: FAIL — `bootstrapSharedLibrary`/`addSharedGroup` not defined.

- [ ] **Step 3: Write the slice**

Create `src/state/slices/sharedLibrarySlice.ts`:

```ts
import {
  fetchSharedLibraryIndex,
  registerSharedGroup,
  type SharedLibraryItem,
} from '../../catalog/packs/sharedLibrary'
import { hasBackend } from '../../features/api/client'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface SharedLibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: SharedLibraryItem[]
  /** Per-group add state, keyed by the manifest `group`. */
  resolving: Record<string, 'adding' | 'error'>
}

export interface SharedLibrarySlice {
  sharedLibrary: SharedLibraryState
  /** Fetch the R2 manifest once. No-op unless backend + signed-in + flag on. */
  bootstrapSharedLibrary(): Promise<void>
  /** Import one library group; returns its def id (`ikea-<groupKey>`) or null. */
  addSharedGroup(group: string): Promise<string | null>
}

export const SHARED_LIBRARY_INITIAL: Pick<SharedLibrarySlice, 'sharedLibrary'> = {
  sharedLibrary: { status: 'idle', items: [], resolving: {} },
}

export const createSharedLibrarySlice: SliceCreator<SharedLibrarySlice, RootState> = (set, get) => ({
  ...SHARED_LIBRARY_INITIAL,

  async bootstrapSharedLibrary() {
    if (get().sharedLibrary.status !== 'idle') return
    if (!hasBackend() || !get().currentUser || !isFeatureEnabled('sharedLibrary')) return
    set((s) => ({ sharedLibrary: { ...s.sharedLibrary, status: 'loading' } }))
    const index = await fetchSharedLibraryIndex().catch(() => null)
    set((s) => ({
      sharedLibrary: index
        ? { ...s.sharedLibrary, status: 'ready', items: index.items }
        : { ...s.sharedLibrary, status: 'error' },
    }))
  },

  async addSharedGroup(group) {
    const item = get().sharedLibrary.items.find((i) => i.group === group)
    set((s) => ({
      sharedLibrary: { ...s.sharedLibrary, resolving: { ...s.sharedLibrary.resolving, [group]: 'adding' } },
    }))
    const ok = await registerSharedGroup(group).catch(() => false)
    set((s) => {
      const resolving = { ...s.sharedLibrary.resolving }
      if (ok) delete resolving[group]
      else resolving[group] = 'error'
      return { sharedLibrary: { ...s.sharedLibrary, resolving } }
    })
    return ok && item ? `ikea-${item.groupKey}` : null
  },
})
```

- [ ] **Step 4: Compose the slice into the store**

In `src/state/store.ts`:

1. Add the import (alongside the other slice imports, alphabetical-ish near `savedMaterialsSlice`):

```ts
import {
  createSharedLibrarySlice,
  SHARED_LIBRARY_INITIAL,
  type SharedLibrarySlice,
} from './slices/sharedLibrarySlice'
```

2. Add `SharedLibrarySlice` to the `RootState extends …` list (e.g. after `RemoteCatalogSlice`).

3. Add `...SHARED_LIBRARY_INITIAL,` to the `INITIAL` object (e.g. after `...REMOTE_CATALOG_INITIAL,`).

4. Add `...createSharedLibrarySlice(set, get, api),` to the `create<RootState>` body (e.g. after `...createRemoteCatalogSlice(set, get, api),`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest --run src/state/slices/sharedLibrarySlice.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/state/slices/sharedLibrarySlice.ts src/state/slices/sharedLibrarySlice.test.ts src/state/store.ts
git commit -m "feat: add sharedLibrary store slice (fetch index + import group)"
```

---

### Task 3: Merge shared items into `useUnifiedCatalog`

Add a third `GridItem` kind, map each library item's category with the same `mapCategory` the importer uses, dedup against already-imported `ikea-<groupKey>` defs, and gate the merge behind an `includeShared` param (mirrors `includeRemote`).

**Files:**
- Modify: `src/ui/catalog/useUnifiedCatalog.ts`
- Test: `src/ui/catalog/sharedLibraryCatalog.test.tsx` (create)

**Interfaces:**
- Consumes (from Task 2): `s.sharedLibrary.items` (`SharedLibraryItem[]`).
- Produces: `GridItem` union gains `{ kind: 'shared'; item: SharedLibraryItem }`; `gridItemId` returns `ikea-${item.groupKey}` for it; `useUnifiedCatalog(includeRemote = true, includeShared = true)`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/catalog/sharedLibraryCatalog.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { RemoteGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { useUnifiedCatalog } from './useUnifiedCatalog'

const item: SharedLibraryItem = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX Desk',
  type: 'Desk',
  category: 'desk',
  size: '',
  series: 'ALEX',
  variants: 2,
  thumbnail: 'a.jpg',
  price: 199,
  currency: 'SGD',
}

function seedShared(items: SharedLibraryItem[]) {
  useStore.setState((s) => ({ sharedLibrary: { ...s.sharedLibrary, status: 'ready', items } }))
}

const sharedCards = (cat: ReturnType<typeof useUnifiedCatalog>) =>
  cat.all.filter((it) => it.kind === 'shared')

describe('shared-library catalog merge', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('Pro (includeShared=true): the library item surfaces in its mapped category', () => {
    seedShared([item])
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(sharedCards(result.current).length).toBe(1)
    expect(
      result.current.byCategory.desk.some(
        (it) => it.kind === 'shared' && it.item.groupKey === 'alex',
      ),
    ).toBe(true)
  })

  it('Simple (includeShared=false): no library item surfaces', () => {
    seedShared([item])
    const { result } = renderHook(() => useUnifiedCatalog(true, false))
    expect(sharedCards(result.current).length).toBe(0)
    expect(result.current.all.some((it) => it.kind === 'local')).toBe(true)
  })

  it('dedups a library item whose ikea-<groupKey> def is already imported', () => {
    seedShared([item])
    // A resolved def with the imported id appears as a local card (see remote
    // gating test): the shared card must not duplicate it.
    const def = { id: 'ikea-alex', category: 'desk', name: 'ALEX Desk' } as unknown as RemoteGltfDef
    useStore.setState((s) => ({
      resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, 'ikea-alex': def },
    }))
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(sharedCards(result.current).length).toBe(0)
    expect(
      result.current.byCategory.desk.some((it) => it.kind === 'local' && it.def.id === 'ikea-alex'),
    ).toBe(true)
  })

  it('an unknown category maps to "others"', () => {
    seedShared([{ ...item, groupKey: 'x', group: 'x', category: 'nonsense' }])
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(
      result.current.byCategory.others.some((it) => it.kind === 'shared' && it.item.groupKey === 'x'),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/ui/catalog/sharedLibraryCatalog.test.tsx`
Expected: FAIL — `useUnifiedCatalog` ignores the 2nd arg / no `shared` kind.

- [ ] **Step 3: Extend `useUnifiedCatalog`**

In `src/ui/catalog/useUnifiedCatalog.ts`:

1. Add imports near the top:

```ts
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { mapCategory } from '../../furniture/ikea/translate'
```

2. Extend the `GridItem` union:

```ts
export type GridItem =
  | { kind: 'local'; def: FurnitureDef }
  | { kind: 'remote'; entry: RemoteEntry }
  | { kind: 'shared'; item: SharedLibraryItem }
```

3. Extend `gridItemId`:

```ts
export function gridItemId(it: GridItem): string {
  if (it.kind === 'local') return it.def.id
  if (it.kind === 'remote') return `${it.entry.provider}:${it.entry.slug}`
  return `ikea-${it.item.groupKey}`
}
```

4. Add a stable empty array beside `EMPTY_REMOTE`:

```ts
const EMPTY_SHARED: SharedLibraryItem[] = []
```

5. Change the signature + read the shared items:

```ts
export function useUnifiedCatalog(includeRemote = true, includeShared = true): UnifiedCatalog {
  const localByCategory = useCatalogByCategory()
  const remoteEntriesAll = useRemoteEntries('furniture')
  const remoteEntries = includeRemote ? remoteEntriesAll : EMPTY_REMOTE
  const sharedItemsAll = useStore(useShallow((s) => s.sharedLibrary.items))
  const sharedItems = includeShared ? sharedItemsAll : EMPTY_SHARED
  const resolvedKeys = useStore(useShallow((s) => Object.keys(s.resolvedRemoteFurniture)))
  const collections = useStore(useShallow((s) => s.favouriteDefIds))
  const recentDefIds = useStore(useShallow((s) => s.recentDefIds))
```

6. Inside the `useMemo`, after the remote-entries loop (which builds `remoteByBase` and pushes remote cards) and BEFORE the `all`/`counts` loop, add the shared merge. Also declare a `sharedById` map for favourite resolution:

```ts
    // Shared-library (R2) cards: map category the same way the importer does,
    // and hide any group already imported (its local `ikea-<groupKey>` def
    // represents it). Deduped by predicted def id.
    const localIds = new Set<string>()
    for (const c of FURNITURE_CATEGORIES)
      for (const it of byCategory[c]) if (it.kind === 'local') localIds.add(it.def.id)

    const sharedById = new Map<string, SharedLibraryItem>()
    for (const item of sharedItems) {
      const id = `ikea-${item.groupKey}`
      if (localIds.has(id) || sharedById.has(id)) continue
      sharedById.set(id, item)
      byCategory[mapCategory(item.category).category].push({ kind: 'shared', item })
    }
```

7. In the favourites resolution loop, add a shared fallback after the remote lookup:

```ts
    for (const id of collections) {
      const def = localById.get(id)
      if (def) {
        favourites.push({ kind: 'local', def })
        continue
      }
      const entry = remoteByBase.get(id)
      if (entry) {
        favourites.push({ kind: 'remote', entry })
        continue
      }
      const item = sharedById.get(id)
      if (item) favourites.push({ kind: 'shared', item })
    }
```

8. Add `sharedItems` to the `useMemo` dependency array:

```ts
  }, [localByCategory, remoteEntries, sharedItems, resolvedKeys, collections, recentDefIds])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/ui/catalog/sharedLibraryCatalog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Guard the existing remote-gating test still passes**

Run: `npx vitest --run src/ui/catalog/remoteFurnitureGating.test.tsx`
Expected: PASS (unchanged — the new 2nd param defaults to `true`).

- [ ] **Step 6: Commit**

```bash
git add src/ui/catalog/useUnifiedCatalog.ts src/ui/catalog/sharedLibraryCatalog.test.tsx
git commit -m "feat: merge shared-library items into the unified catalog grid"
```

---

### Task 4: `SharedCard` component

A lean card mirroring `RemoteCard` styling: a lazily-loaded proxy thumbnail (native `loading="lazy"` — the proxy is same-origin so the session cookie is sent automatically, no blob fetch needed), a "Library" badge, a heart favourite keyed on the predicted def id, and a click handler that runs `addSharedGroup` then arms placement.

**Files:**
- Create: `src/ui/catalog/SharedCard.tsx`
- Test: `src/ui/catalog/SharedCard.test.tsx` (create)

**Interfaces:**
- Consumes (Task 2): `addSharedGroup(group): Promise<string | null>`, `s.sharedLibrary.resolving`.
- Consumes: `assetUrl(key: string): string` from `src/features/api/client.ts` (`assetUrl('ikea/<group>/<file>')`).
- Consumes (Task 3): `SharedLibraryItem`.
- Produces: `SharedCard({ item, onResolved }: { item: SharedLibraryItem; onResolved: (id: string) => void })`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/catalog/SharedCard.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { useStore } from '../../state/store'
import { SharedCard } from './SharedCard'

const item: SharedLibraryItem = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX Desk',
  type: 'Desk',
  category: 'desk',
  size: '',
  series: 'ALEX',
  variants: 2,
  thumbnail: 'white.jpg',
  price: 199,
  currency: 'SGD',
}

describe('SharedCard', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders the proxy thumbnail URL', () => {
    render(<SharedCard item={item} onResolved={() => {}} />)
    const img = screen.getByRole('img', { name: /ALEX Desk/ }) as HTMLImageElement
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.src).toContain('/assets/ikea/alex/white.jpg')
  })

  it('adds the group on click and reports the resolved id', async () => {
    const add = vi.fn(async () => 'ikea-alex')
    const onResolved = vi.fn()
    useStore.setState({ addSharedGroup: add } as never)
    render(<SharedCard item={item} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: /Add ALEX Desk/ }))
    await waitFor(() => expect(add).toHaveBeenCalledWith('alex'))
    expect(onResolved).toHaveBeenCalledWith('ikea-alex')
  })

  it('does not call onResolved when the add fails', async () => {
    const add = vi.fn(async () => null)
    const onResolved = vi.fn()
    useStore.setState({ addSharedGroup: add } as never)
    render(<SharedCard item={item} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: /Add ALEX Desk/ }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect(onResolved).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/ui/catalog/SharedCard.test.tsx`
Expected: FAIL — `./SharedCard` does not exist.

- [ ] **Step 3: Write the component**

Create `src/ui/catalog/SharedCard.tsx`:

```tsx
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { assetUrl } from '../../features/api/client'
import { useFeature } from '../../features/useFeature'
import type { FurnitureCategory } from '../../furniture/types'
import { mapCategory } from '../../furniture/ikea/translate'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

interface Props {
  item: SharedLibraryItem
  /** Called with the imported def id (`ikea-<groupKey>`) once the group is added. */
  onResolved: (id: string) => void
}

/** A browsable card for one R2 shared-library product, styled like {@link CatalogCard}.
 *  Clicking imports the group (if needed) then hands the resolved def id back so the
 *  drawer can arm placement. The thumbnail loads lazily through the auth-gated proxy. */
export function SharedCard({ item, onResolved }: Props) {
  const category = mapCategory(item.category).category as FurnitureCategory
  const favId = `ikea-${item.groupKey}`
  const state = useStore((s) => s.sharedLibrary.resolving[item.group])
  const addSharedGroup = useStore((s) => s.addSharedGroup)
  const favOn = useFeature('catalogFavourites')
  const saved = useStore((s) => s.favouriteDefIds.includes(favId))
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const thumb = item.thumbnail ? assetUrl(`ikea/${item.group}/${item.thumbnail}`) : null

  const onClick = async () => {
    if (state === 'adding') return
    const id = await addSharedGroup(item.group)
    if (id) onResolved(id)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> can't host the nested fav button (invalid HTML); role=button + key handling gives the same a11y.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Add ${item.name}`}
      onClick={() => void onClick()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void onClick()
        }
      }}
      className="cat-card group"
    >
      {favOn ? (
        <button
          type="button"
          className={`fav-btn${saved ? ' on' : ''}`}
          aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavourite(favId)
          }}
        >
          <Icon.Heart width={14} height={14} />
        </button>
      ) : null}
      <div className="card-thumb">
        {thumb ? (
          <img src={thumb} alt={item.name} loading="lazy" />
        ) : (
          <CategoryIcon category={category} width={40} height={40} />
        )}
        {state === 'adding' ? (
          <span className="thumb-status">Adding…</span>
        ) : state === 'error' ? (
          <span className="thumb-status err">Retry</span>
        ) : null}
      </div>
      <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CategoryIcon category={category} width={14} height={14} style={{ flex: 'none' }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={item.name}
        >
          {item.name}
        </span>
      </div>
      <span
        className="pr"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={item.type}
      >
        {item.variants > 1 ? `${item.variants} finishes · tap` : 'tap to add'}
      </span>
      <span className="badge neutral" style={{ position: 'absolute', top: 6, left: 6 }}>
        Library
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/ui/catalog/SharedCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/catalog/SharedCard.tsx src/ui/catalog/SharedCard.test.tsx
git commit -m "feat: add SharedCard for R2 shared-library catalog items"
```

---

### Task 5: Wire the drawer + remove the redundant Packs surface

Bootstrap the library when the catalog opens for a signed-in user, render shared cards, make them searchable, and delete the now-redundant `SharedLibraryCard` from the Packs tab.

**Files:**
- Modify: `src/ui/catalog/CatalogDrawer.tsx`
- Modify: `src/ui/catalog/PacksTab.tsx`

**Interfaces:**
- Consumes (Task 2): `bootstrapSharedLibrary()`. (Task 3): `useUnifiedCatalog(includeRemote, includeShared)`. (Task 4): `SharedCard`.

- [ ] **Step 1: Wire `CatalogDrawer`**

In `src/ui/catalog/CatalogDrawer.tsx`:

1. Add imports:

```ts
import { hasBackend } from '../../features/api/client'
import { SharedCard } from './SharedCard'
```

2. Add hooks near the other `useFeature`/store reads (after `fRemoteMaterials`):

```ts
  const fSharedLibrary = useFeature('sharedLibrary')
  const bootstrapShared = useStore((s) => s.bootstrapSharedLibrary)
```

3. Change the catalog read to pass `includeShared`:

```ts
  const unified = useUnifiedCatalog(fRemoteFurniture, fSharedLibrary)
```

4. Add a bootstrap effect after the existing remote bootstrap effect:

```ts
  useEffect(() => {
    if (open && fSharedLibrary && hasBackend()) void bootstrapShared()
  }, [open, fSharedLibrary, bootstrapShared])
```

5. Extend `gridItemText` (top of file) so shared cards are searchable:

```ts
function gridItemText(it: GridItem): string[] {
  if (it.kind === 'local') return [it.def.name, ...(it.def.keywords ?? [])]
  if (it.kind === 'remote') return [it.entry.name, it.entry.slug, ...(it.entry.tags ?? [])]
  return [it.item.name, it.item.type, it.item.series]
}
```

6. Extend `renderCard` to handle the shared kind:

```ts
  const renderCard = (it: GridItem) => {
    if (it.kind === 'local')
      return (
        <CatalogCard
          key={gridItemId(it)}
          def={it.def}
          onDelete={() => removeUserFurniture(it.def.id)}
        />
      )
    if (it.kind === 'remote')
      return (
        <RemoteCard key={gridItemId(it)} entry={it.entry} onResolved={(id) => setActiveDefId(id)} />
      )
    return <SharedCard key={gridItemId(it)} item={it.item} onResolved={(id) => setActiveDefId(id)} />
  }
```

- [ ] **Step 2: Remove `SharedLibraryCard` from the Packs tab**

In `src/ui/catalog/PacksTab.tsx`:

1. Delete the `SharedLibraryCard` function (the whole `function SharedLibraryCard() { … }` block, ~lines 321-426) and its imports:
   - Remove the `fetchSharedLibraryIndex, registerSharedGroup, type SharedLibraryIndex` import block from `'../../catalog/packs/sharedLibrary'`.
   - Remove `import { hasBackend } from '../../features/api/client'` **only if** it is no longer referenced elsewhere in the file (it is used solely by `SharedLibraryCard`'s render gate — remove it).
2. In `PacksTab`, remove the `const sharedLibraryOn = useFeature('sharedLibrary')` line and the `{sharedLibraryOn && hasBackend() ? <SharedLibraryCard /> : null}` render line.

- [ ] **Step 3: Verify nothing else imports the removed symbols**

Run: `rg -n "SharedLibraryCard|SharedLibraryIndex" src` (via the search tool)
Expected: no remaining references (the types `SharedLibraryIndex`/`SharedLibraryItem` stay defined in `sharedLibrary.ts`, but `SharedLibraryIndex` is no longer imported in UI).

- [ ] **Step 4: Typecheck + run the catalog test suites**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

Run: `npx vitest --run src/ui/catalog`
Expected: PASS (all catalog tests, including the new ones and the untouched remote/packs tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/catalog/CatalogDrawer.tsx src/ui/catalog/PacksTab.tsx
git commit -m "feat: auto-surface the shared library in the catalog grid; drop the Packs browser"
```

---

### Task 6: Visual verification, docs & version bump

Verify the render, update docs, bump the build.

**Files:**
- Modify: `docs/developer/packs-and-remote-catalog.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/deployment-cloudflare.md`
- Modify: `src/state/CLAUDE.md`, `src/ui/CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `src/version.ts`

- [ ] **Step 1: Visual verification (per the CLAUDE.md hard rule)**

Read `docs/visual-verification-playbook.md` first. Then run the app (`npm run dev`), sign in as the admin, open the catalog in the per-room editor, and confirm library cards appear in their category tabs, thumbnails lazy-load, and clicking one imports + arms placement. Because a real backend + a populated R2 library are required, if the local dev environment has no backend (`hasBackend()` false), instead drive the scenario by seeding `window.__store.setState` with a fake `sharedLibrary.items` array and a mock `addSharedGroup`, screenshot the grid via `node scripts/shot.mjs`, and visually review the card styling (thumbnail box, "Library" badge, name/finishes line) against `RemoteCard`. Report what you saw.

- [ ] **Step 2: Update developer docs**

In `docs/developer/packs-and-remote-catalog.md`, replace the `ikea-live` bullet's prod counterpart note: document that the R2 shared library now **auto-populates the main catalog grid** (via `sharedLibrarySlice` + `useUnifiedCatalog(…, includeShared)` + `SharedCard`) for any signed-in user when `sharedLibrary` (pro) is on, and that the old manual Packs-tab browser was removed. Note dedup by `ikea-<groupKey>` and that `build-library-index.mjs` emits `groupKey`.

- [ ] **Step 3: Update ARCHITECTURE + area CLAUDE docs**

- `docs/ARCHITECTURE.md`: add `sharedLibrarySlice` to the slice list and `SharedCard` to the catalog UI map.
- `src/state/CLAUDE.md`: one line noting `sharedLibrarySlice` is session-only (not persisted; imported defs persist via the IKEA hydrate path).
- `src/ui/CLAUDE.md`: one line noting shared-library cards merge into the grid via `useUnifiedCatalog(includeShared)` behind the `sharedLibrary` (pro) flag, `SharedCard` mirrors `RemoteCard`.
- `docs/deployment-cloudflare.md`: update the shared-library section to say products auto-surface in the catalog for signed-in users (no manual add step).

- [ ] **Step 4: Update CHANGELOG + version**

- Add a `CHANGELOG.md` entry under the current line describing the auto-populated shared library.
- Bump `src/version.ts`: `export const APP_VERSION = '0.10.0.3'`. (`package.json` stays `0.10.0` — a build bump doesn't change the first three parts.)

- [ ] **Step 5: Full pre-commit gate**

Run: `npm test`
Expected: PASS (full suite).

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run check`
Expected: PASS (Biome clean; run `npm run check:fix` if formatting differs).

- [ ] **Step 6: Commit**

```bash
git add docs CHANGELOG.md src/version.ts src/state/CLAUDE.md src/ui/CLAUDE.md
git commit -m "docs: document auto-populated shared library; bump to 0.10.0.3"
```

---

## Self-Review

**Spec coverage:**
- Auto-populate into main grid → Tasks 3 (merge) + 5 (bootstrap wiring). ✅
- Pagination → inherited from the existing grid pager (no code needed; noted in the plan intro). ✅
- Dynamic/lazy pulling → native `loading="lazy"` thumbnail (Task 4) + import-on-click (`addSharedGroup`, Task 2). ✅ (Deviation from the spec's "IntersectionObserver" wording: native lazy loading is simpler, avoids blob fetch since the proxy is same-origin credentialed, and needs no jsdom IO mock — functionally equivalent lazy per-visible loading.)
- Any signed-in user gating → `bootstrapSharedLibrary` guards on `currentUser` + `hasBackend` + flag; no admin-role check (matches the decision). ✅
- Fetch-once (no server pagination) → `bootstrapSharedLibrary` fetches the whole index once (Task 2). ✅
- Dedup key `ikea-<groupKey>` → Tasks 1 (manifest) + 3 (merge dedup). ✅
- Remove Packs `SharedLibraryCard` → Task 5. ✅
- Both-modes test → Task 2 (flag off) + Task 3 (includeShared true/false). ✅
- Docs + version → Task 6. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `SharedLibraryItem.groupKey` (Task 1) is read in Tasks 2/3/4; `addSharedGroup(group): Promise<string | null>` returns `ikea-${groupKey}`, consumed by `SharedCard.onResolved` and the merge's `gridItemId` (both `ikea-${groupKey}`); `useUnifiedCatalog(includeRemote, includeShared)` signature consistent between Tasks 3 and 5; `GridItem` shared kind consistent across Tasks 3/5. ✅
