# Refresh Imported Asset — Implementation Plan

> **For agentic workers:** implement task-by-task; each task ends with a passing test.

**Goal:** a refresh (re-download) control on imported `source:'ikea'` catalog cards that rebuilds their GLB + thumbnail from R2 in place, keeping placed instances — shown only when re-downloadable.

**Architecture:** reuse `addSharedGroup(group)` (→ `registerSharedGroup` → `replaceUserFurniture`, which keeps placements + rebuilds blobs). New pure `sharedGroupForDef` maps a def's `groupKey` → manifest folder slug; CatalogDrawer gates the control on admin + `sharedLibrary` + backend + a matching manifest item.

## Global Constraints

- Biome: 2-space, 100-col, single-quote, no-semicolons. No hardcoded colour (token classes only).
- DOM tests start with `// @vitest-environment happy-dom`. Targeted tests while iterating; full suite once before commit; never pipe test output through `tail`/`head` (redirect to a log, grep the file).
- No new feature flag — gate on existing `sharedLibrary` + admin + backend + matching item.
- Version: bump `build` in `src/version.ts` + CHANGELOG; keep `package.json` first-three in sync. Commit only when asked; branch `fix/070726`.
- Visual verification required (app change).

---

### Task 1: `sharedGroupForDef` pure helper

**Files:** Create `src/ui/catalog/sharedGroupForDef.ts`, Test `src/ui/catalog/sharedGroupForDef.test.ts`

- [ ] **Step 1: failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { FurnitureDef, IkeaGltfDef } from '../../furniture/types'
import { sharedGroupForDef } from './sharedGroupForDef'

const item = (group: string, groupKey: string): SharedLibraryItem => ({
  group, groupKey, name: 'x', type: '', category: 'seating', size: '', series: '',
  variants: 1, thumbnail: null, price: null, currency: null,
})
const ikea = (groupKey: string): IkeaGltfDef => ({
  id: `ikea-${groupKey}`, name: 'X', category: 'seating', kind: 'gltf', source: 'ikea',
  groupKey, activeVariant: 'a', variants: [], defaultFootprint: { w: 1, d: 1, h: 1 },
  uploadedAt: '', license: 'IKEA', attribution: '',
})
const builtin: FurnitureDef = {
  id: 'sofa', name: 'Sofa', category: 'seating', kind: 'gltf', source: 'builtin',
  url: '/m.glb', license: 'CC0', defaultFootprint: { w: 1, d: 1, h: 1 },
}

describe('sharedGroupForDef', () => {
  it('returns the folder slug when a manifest item groupKey matches', () => {
    expect(sharedGroupForDef(ikea('agen'), [item('agen-folder', 'agen')])).toBe('agen-folder')
  })
  it('returns null when no manifest item matches', () => {
    expect(sharedGroupForDef(ikea('agen'), [item('malm-folder', 'malm')])).toBeNull()
  })
  it('returns null for a non-ikea def', () => {
    expect(sharedGroupForDef(builtin, [item('sofa', 'sofa')])).toBeNull()
  })
})
```

- [ ] **Step 2: run → fails** (`npx vitest --run src/ui/catalog/sharedGroupForDef.test.ts`)
- [ ] **Step 3: implement**

```ts
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { FurnitureDef } from '../../furniture/types'

/** The shared-library folder slug to re-download an imported def from, or null if
 *  the def isn't a shared/ikea import or no manifest item matches its group. */
export function sharedGroupForDef(def: FurnitureDef, items: SharedLibraryItem[]): string | null {
  if (def.source !== 'ikea') return null
  const groupKey = (def as { groupKey?: string }).groupKey
  if (!groupKey) return null
  return items.find((it) => it.groupKey === groupKey)?.group ?? null
}
```

- [ ] **Step 4: run → passes**

---

### Task 2: `Icon.Refresh` glyph

**Files:** Modify `src/ui/toolbar/icons.tsx`

- [ ] **Step 1:** add after `Redo` (circular-arrow refresh):

```tsx
  Refresh: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </Svg>
  ),
```

- [ ] **Step 2:** `npx tsc --noEmit` clean.

---

### Task 3: CatalogCard refresh button

**Files:** Modify `src/ui/catalog/CatalogCard.tsx`, Test `src/ui/catalog/CatalogCard.test.tsx`

**Interfaces:** Consumes `isIkea` (already computed). Adds props `onRefresh?: () => void`, `refreshing?: boolean`.

- [ ] **Step 1: failing tests** (append in `describe('CatalogCard', …)`)

```tsx
  it('shows a refresh button when onRefresh is provided', () => {
    render(<CatalogCard def={IKEA_DEF} onRefresh={() => {}} />)
    expect(screen.getByLabelText('Re-download asset from library')).toBeTruthy()
  })

  it('has no refresh button without onRefresh', () => {
    render(<CatalogCard def={IKEA_DEF} />)
    expect(screen.queryByLabelText('Re-download asset from library')).toBeNull()
  })

  it('calls onRefresh (and not card placement) when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    setActiveDefId_spy() // no-op placeholder if needed; otherwise assert store.activeDefId unchanged
    render(<CatalogCard def={IKEA_DEF} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByLabelText('Re-download asset from library'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
```

(Drop the `setActiveDefId_spy` line; assert only `onRefresh` fired. Import `vi` from vitest — already imported? add if missing.)

- [ ] **Step 2: run → fails**
- [ ] **Step 3: implement** — add to the `CatalogCardProps` type: `onRefresh?: () => void` and `refreshing?: boolean`; destructure them; render beside the `×` block:

```tsx
      {onRefresh ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRefresh()
          }}
          className="coll-refresh"
          aria-label="Re-download asset from library"
          aria-busy={refreshing || undefined}
          disabled={refreshing}
        >
          <Icon.Refresh width={12} height={12} />
        </button>
      ) : null}
```

- [ ] **Step 4: run → passes** (`npx vitest --run src/ui/catalog/CatalogCard.test.tsx`)

Note: add a minimal `.coll-refresh` style mirroring `.coll-x` positioning (offset so the two buttons don't overlap) in the same CSS file `.coll-x` lives in; grep for `.coll-x` to find it. Verify visually in Task 6.

---

### Task 4: CatalogDrawer wiring + gating + feedback

**Files:** Modify `src/ui/catalog/CatalogDrawer.tsx`

**Interfaces:** Consumes `sharedGroupForDef` (Task 1), `addSharedGroup`, `sharedLibrary.items`/`.resolving`, `sharedOn`, `hasBackend`, `notify`.

- [ ] **Step 1: imports + selectors** — add `import { sharedGroupForDef } from './sharedGroupForDef'`; add:

```tsx
  const addSharedGroup = useStore((s) => s.addSharedGroup)
  const sharedItems = useStore(useShallow((s) => s.sharedLibrary.items))
  const sharedResolving = useStore(useShallow((s) => s.sharedLibrary.resolving))
```

(`useShallow` is already imported in this file — verify; if not, add `import { useShallow } from 'zustand/react/shallow'`.)

- [ ] **Step 2: handler** — near `handleRemoveDef`/`renderCard`:

```tsx
  const handleRefresh = async (slug: string, name: string) => {
    const id = await addSharedGroup(slug)
    const notify = useStore.getState().notify
    if (id) notify.start({ title: `Refreshed ${name}`, kind: 'success' })
    else notify.start({ title: `Couldn't refresh ${name} — check your connection`, kind: 'error' })
  }
```

- [ ] **Step 3: wire into the `local` card** — in `renderCard`, for `it.kind === 'local'`, compute and pass:

```tsx
      const refreshSlug =
        sharedOn && hasBackend() ? sharedGroupForDef(it.def, sharedItems) : null
      return (
        <CatalogCard
          key={gridItemId(it)}
          def={it.def}
          staggerIndex={staggerIndex}
          onDelete={() => /* existing confirmAndRemoveDef call */}
          onRefresh={refreshSlug ? () => void handleRefresh(refreshSlug, it.def.name) : undefined}
          refreshing={refreshSlug ? sharedResolving[refreshSlug] === 'adding' : undefined}
          roomRects={fFits ? roomFreeRects : null}
        />
      )
```

(Keep the existing `onDelete` expression intact — only add the two new props. `renderCard`'s `local` branch is an arrow returning JSX; convert to a block body to hold the `refreshSlug` const.)

- [ ] **Step 4:** `npx tsc --noEmit` + `npx vitest --run src/ui/catalog/CatalogDrawer.test.tsx src/ui/catalog/CatalogDrawer.roomFit.test.tsx src/ui/catalog/CatalogDrawer.planFurnish.test.tsx` → pass.

---

### Task 5: docs + version + changelog

**Files:** `src/version.ts`, `CHANGELOG.md`, `src/ui/CLAUDE.md`

- [ ] Bump `build` (next after the branch's current APP_VERSION). CHANGELOG entry at top. Extend the `src/ui/CLAUDE.md` card-actions note with the refresh control (re-download in place via `addSharedGroup`, gated on admin + `sharedLibrary` + backend + matching manifest item).

---

### Task 6: verification gate

- [ ] Full suite once → log file → grep. `npx tsc --noEmit` + `npm run check` clean.
- [ ] Visual: scenario seeds an imported ikea def + a matching `sharedLibrary.items` entry (+ admin `currentUser` + `sharedLibrary` flag on + a mock `VITE_API_BASE` or stubbed `addSharedGroup`), screenshots the card showing both `×` and refresh controls; assert clicking refresh calls the store path / shows the spinner and placements survive. Visually review the two card buttons don't overlap/clip in light + dark.

## Self-Review
- Spec §1 helper → Task 1. §2 icon → Task 2. §3 card button → Task 3. §4 drawer wiring/gating/feedback → Task 4. §5 no-flag → folded into Task 4 gating. Tests → Tasks 1/3/4. Verification → Task 6. Docs/version → Task 5.
- No placeholders (the CSS `.coll-refresh` step names the exact file-find). Types consistent: `sharedGroupForDef(def, items): string|null`, `onRefresh?`/`refreshing?` identical across Tasks 3–4.
