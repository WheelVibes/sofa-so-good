# Remove Imported (IKEA/shared) Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user remove an imported `source:'ikea'` (dev-scrape IKEA or R2 shared-library) def from its catalog card — freeing its IndexedDB blobs and un-hiding the "Download" card so it can be re-fetched from R2.

**Architecture:** Reuse the existing `removeUserFurniture(id)` store action (already drops the def + placed items and deletes the IDB records, and already handles `source:'ikea'` variants). The work is UI-surfacing: widen the catalog card's delete "×" to imported defs, and route the delete through a small, testable `confirmAndRemoveDef` helper that prompts only when the def has placed instances.

**Tech Stack:** React + TypeScript, Zustand store, Vitest (+ happy-dom for DOM tests), Biome.

## Global Constraints

- No hardcoded colour — token class vocabulary only (`.coll-x` etc. already tokenised).
- Destructive irreversible actions gate on `confirmAction({...})` (promptSlice/ConfirmModal), never `window.confirm`.
- Biome style: 2-space, 100-col, single-quote, no-semicolons.
- Vitest defaults to node env; a DOM-touching test must start with `// @vitest-environment happy-dom`.
- While iterating run targeted tests only; run the full suite once right before commit; never pipe test output through `tail`/`head` — redirect to a log file and grep the file.
- Versioning `major.minor.patch.build`: this is a small fix → bump **build** only. `src/version.ts` `APP_VERSION` `0.16.1.0` → `0.16.1.1`; `package.json` `"version"` stays `0.16.1`.
- Commit/push only when the user asks (repo rule overrides the skill's per-task commit default). Steps below that say "commit" are gated on that ask.
- Visual verification required after the app change (not docs/tests-only).

---

### Task 1: Testable remove-with-confirm helper

**Files:**
- Create: `src/ui/catalog/removeImportedDef.ts`
- Test: `src/ui/catalog/removeImportedDef.test.ts`

**Interfaces:**
- Produces: `confirmAndRemoveDef(def: { id: string }, deps: RemoveDefDeps): Promise<boolean>` where
  `RemoveDefDeps = { placedCount: number; confirmAction: (req: ConfirmRequest) => Promise<boolean>; removeUserFurniture: (id: string) => void }`.
  Returns `true` if the def was removed, `false` if the user cancelled.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { confirmAndRemoveDef } from './removeImportedDef'

describe('confirmAndRemoveDef', () => {
  it('removes immediately without prompting when nothing is placed', async () => {
    const confirmAction = vi.fn()
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 0, confirmAction, removeUserFurniture },
    )
    expect(confirmAction).not.toHaveBeenCalled()
    expect(removeUserFurniture).toHaveBeenCalledWith('ikea-malm')
    expect(removed).toBe(true)
  })

  it('prompts and removes when the user confirms a placed def', async () => {
    const confirmAction = vi.fn().mockResolvedValue(true)
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 2, confirmAction, removeUserFurniture },
    )
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ danger: true, confirmLabel: 'Remove' }),
    )
    expect(confirmAction.mock.calls[0][0].message).toContain('2 placed items')
    expect(removeUserFurniture).toHaveBeenCalledWith('ikea-malm')
    expect(removed).toBe(true)
  })

  it('does not remove when the user cancels', async () => {
    const confirmAction = vi.fn().mockResolvedValue(false)
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 1, confirmAction, removeUserFurniture },
    )
    expect(confirmAction.mock.calls[0][0].message).toContain('1 placed item')
    expect(removeUserFurniture).not.toHaveBeenCalled()
    expect(removed).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/ui/catalog/removeImportedDef.test.ts`
Expected: FAIL — cannot resolve `./removeImportedDef`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ConfirmRequest } from '../../state/slices/promptSlice'

export interface RemoveDefDeps {
  /** How many placed instances of the def exist across the whole design. */
  placedCount: number
  confirmAction: (req: ConfirmRequest) => Promise<boolean>
  removeUserFurniture: (id: string) => void
}

/** Remove an uploaded/imported furniture def, prompting first only when it has
 *  placed instances (which get wiped with it). Returns true if removed. */
export async function confirmAndRemoveDef(
  def: { id: string },
  { placedCount, confirmAction, removeUserFurniture }: RemoveDefDeps,
): Promise<boolean> {
  if (placedCount > 0) {
    const ok = await confirmAction({
      title: 'Remove asset?',
      message: `${placedCount} placed item${placedCount === 1 ? '' : 's'} will also be removed.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return false
  }
  removeUserFurniture(def.id)
  return true
}
```

Verify `ConfirmRequest` is exported from `src/state/slices/promptSlice.ts` (it is, line 18). If not exported, add `export` to its `interface`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/ui/catalog/removeImportedDef.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (only when the user asks — otherwise leave staged)

```bash
git add src/ui/catalog/removeImportedDef.ts src/ui/catalog/removeImportedDef.test.ts
git commit -m "feat(catalog): confirm-if-placed helper for removing imported assets"
```

---

### Task 2: Surface the delete "×" on imported (ikea) cards

**Files:**
- Modify: `src/ui/catalog/CatalogCard.tsx:239-251`
- Test: `src/ui/catalog/CatalogCard.test.tsx` (add cases)

**Interfaces:**
- Consumes: `isUser`/`isIkea` already computed at `CatalogCard.tsx:54-55`; `onDelete?: () => void` prop.

- [ ] **Step 1: Write the failing test** (append inside `describe('CatalogCard', …)` in `CatalogCard.test.tsx`)

```ts
  it('shows a remove button for an imported IKEA def when onDelete is given', () => {
    render(<CatalogCard def={IKEA_DEF} onDelete={() => {}} />)
    expect(screen.getByLabelText('Remove downloaded asset')).toBeTruthy()
  })

  it('shows no remove button for a builtin def', () => {
    render(<CatalogCard def={SOFA_DEF} onDelete={() => {}} />)
    expect(screen.queryByLabelText(/Remove .* asset/)).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/ui/catalog/CatalogCard.test.tsx`
Expected: FAIL — `Remove downloaded asset` not found (button currently gated on `isUser` only).

- [ ] **Step 3: Write minimal implementation** — replace the block at `CatalogCard.tsx:239-251`:

```tsx
      {(isUser || isIkea) && onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="coll-x"
          aria-label={isIkea ? 'Remove downloaded asset' : 'Remove uploaded asset'}
        >
          <Icon.Close width={12} height={12} />
        </button>
      ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/ui/catalog/CatalogCard.test.tsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit** (when asked)

```bash
git add src/ui/catalog/CatalogCard.tsx src/ui/catalog/CatalogCard.test.tsx
git commit -m "feat(catalog): show remove button on imported IKEA/shared cards"
```

---

### Task 3: Wire the confirm-if-placed handler into CatalogDrawer

**Files:**
- Modify: `src/ui/catalog/CatalogDrawer.tsx` (imports; `removeUserFurniture` selector already at line 113; the `local` card render at line 326-333)

**Interfaces:**
- Consumes: `confirmAndRemoveDef` (Task 1); `useStore` `items` + `confirmAction`.

- [ ] **Step 1: Add imports** — near the other `./` imports (e.g. after line 17):

```tsx
import { confirmAndRemoveDef } from './removeImportedDef'
```

- [ ] **Step 2: Select `confirmAction`** — beside the existing `removeUserFurniture` selector (`CatalogDrawer.tsx:113`):

```tsx
  const confirmAction = useStore((s) => s.confirmAction)
```

- [ ] **Step 3: Replace the `local` card `onDelete`** — at `CatalogDrawer.tsx:330`:

```tsx
          onDelete={() =>
            void confirmAndRemoveDef(it.def, {
              placedCount: useStore
                .getState()
                .items.filter((i) => i.defId === it.def.id).length,
              confirmAction,
              removeUserFurniture,
            })
          }
```

- [ ] **Step 4: Typecheck + run the drawer tests**

Run: `npx tsc --noEmit && npx vitest --run src/ui/catalog/CatalogDrawer.test.tsx`
Expected: tsc clean; drawer tests PASS (behaviour for user uploads unchanged when unplaced).

- [ ] **Step 5: Commit** (when asked)

```bash
git add src/ui/catalog/CatalogDrawer.tsx
git commit -m "feat(catalog): route card removal through confirm-if-placed"
```

---

### Task 4: removeUserFurniture coverage for an ikea def

**Files:**
- Test: `src/state/slices/userAssetsSlice.test.ts` (create)

**Interfaces:**
- Consumes: real `useStore` (`__resetForTest`, `addUserFurniture`, `setItems`, `setSelectedItems`/`selectItem`, `removeUserFurniture`), `IdbAssetStore`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IkeaGltfDef } from '../../furniture/types'
import { IdbAssetStore } from '../storage/IdbAssetStore'
import { useStore } from '../store'

function ikeaDef(): IkeaGltfDef {
  return {
    id: 'ikea-agen',
    name: 'AGEN armchair',
    category: 'seating',
    kind: 'gltf',
    source: 'ikea',
    groupKey: 'agen',
    activeVariant: 'natural',
    variants: [
      { finish: 'natural', label: 'Natural', articleNumber: '1', url: 'https://x',
        assetId: 'asset-a', runtimeUrl: 'blob:a', glbMaterials: [] },
      { finish: 'black', label: 'Black', articleNumber: '2', url: 'https://x',
        assetId: 'asset-b', runtimeUrl: 'blob:b', glbMaterials: [] },
    ],
    defaultFootprint: { w: 0.8, d: 0.8, h: 0.9 },
    uploadedAt: '2026-07-07T00:00:00.000Z',
    license: 'IKEA',
    attribution: 'IKEA',
  }
}

describe('removeUserFurniture — ikea def', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('drops the def + its placed items, keeps others, and deletes each variant IDB blob', () => {
    const del = vi.spyOn(IdbAssetStore, 'delete').mockResolvedValue(undefined as never)
    const s = useStore.getState()
    s.addUserFurniture(ikeaDef())
    s.setItems([
      { id: 'i1', defId: 'ikea-agen', position: [0, 0], rotation: 0, props: {} },
      { id: 'i2', defId: 'ikea-agen', position: [1, 0], rotation: 0, props: {} },
      { id: 'i3', defId: 'dining-chair', position: [2, 0], rotation: 0, props: {} },
    ])

    useStore.getState().removeUserFurniture('ikea-agen')

    const after = useStore.getState()
    expect(after.userFurniture.find((d) => d.id === 'ikea-agen')).toBeUndefined()
    expect(after.items.map((i) => i.id)).toEqual(['i3'])
    // Both variants' IDB records deleted (base ids at minimum).
    const deleted = del.mock.calls.map((c) => c[0])
    expect(deleted).toContain('asset-a')
    expect(deleted).toContain('asset-b')
    del.mockRestore()
  })
})
```

Note: if `URL.revokeObjectURL` is undefined under happy-dom, add `vi.stubGlobal('URL', { ...URL, revokeObjectURL: vi.fn(), createObjectURL: vi.fn() })` in `beforeEach` — but happy-dom provides it, so try without first.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest --run src/state/slices/userAssetsSlice.test.ts`
Expected: PASS (this asserts existing behaviour — it is a regression guard for the ikea removal path the UI now exercises). If it fails on `URL.revokeObjectURL`, apply the stub note above and re-run.

- [ ] **Step 3: Commit** (when asked)

```bash
git add src/state/slices/userAssetsSlice.test.ts
git commit -m "test(state): cover removeUserFurniture for ikea defs"
```

---

### Task 5: Docs, version bump, changelog

**Files:**
- Modify: `src/version.ts` (`APP_VERSION`)
- Modify: `package.json` (unchanged version string — verify only)
- Modify: `CHANGELOG.md`
- Modify: `src/ui/CLAUDE.md` (one-line note under the catalog-card action-buttons bullet)

- [ ] **Step 1: Bump build in `src/version.ts`**

```ts
export const APP_VERSION = '0.16.1.1'
```

`package.json` `"version": "0.16.1"` stays (first three parts unchanged).

- [ ] **Step 2: CHANGELOG entry** — add under the top:

```md
## v0.16.1.1
- Catalog: imported IKEA / shared-library assets can now be removed from their catalog card (the "×"), freeing their IndexedDB storage and re-enabling the "Download" card so the group can be re-fetched from R2. Removing a def with placed instances now prompts for confirmation (applies to user uploads too).
```

- [ ] **Step 3: `src/ui/CLAUDE.md` note** — append to the "Catalog cards carry no per-card action buttons except the favourite ♥" bullet:

```md
  The card "×" (`.coll-x`) removes a `source:'user'` upload **or** a `source:'ikea'`
  imported/shared def (freeing its IndexedDB blobs and un-hiding its "Download" card);
  removal routes through `catalog/removeImportedDef.ts:confirmAndRemoveDef`, which prompts
  via `confirmAction` only when the def has placed instances (which get wiped with it).
```

- [ ] **Step 4: Update TODO.md** if it tracks this work (mark done / remove entry).

- [ ] **Step 5: Commit** (when asked)

```bash
git add src/version.ts CHANGELOG.md src/ui/CLAUDE.md TODO.md
git commit -m "docs: changelog + v0.16.1.1 for imported-asset removal"
```

---

### Task 6: Full verification gate

- [ ] **Step 1: Full test suite** (once, output to a log file — never `| tail`)

Run: `npm test > /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/*/scratchpad/vitest.log 2>&1; echo "exit: $?"`
Then grep the log for failures. Expected: all pass.

- [ ] **Step 2: Typecheck + Biome**

Run: `npx tsc --noEmit && npm run check`
Expected: clean.

- [ ] **Step 3: Visual verification** (per `docs/visual-verification-playbook.md`)

Drive the app via `window.__store` + `scripts/shot.mjs`:
1. Import/seed an ikea def + place an instance; screenshot the catalog card shows the "×".
2. Trigger removal (unplaced first: no prompt; placed: confirm prompt appears).
3. After removal, confirm the "Download" `SharedCard` reappears for that group (admin + `sharedLibrary` on) and the placed instance is gone.
4. Screenshot each and visually review for artifacts. Report what you saw.

---

## Self-Review

**Spec coverage:**
- Surface control (spec §1) → Task 2.
- Confirm-only-if-placed (spec §2), applied to user + ikea (both go through the `local` card `onDelete`) → Tasks 1 + 3.
- Re-add path, no code (spec §3) → verified in Task 6 step 3.
- No new flag (spec §4) → nothing added; control ungated, consistent with existing upload "×".
- Tests (spec §5) → Task 1 (handler), Task 2 (card visibility), Task 4 (slice removal).
- Verification (spec) → Task 6.
- Docs & version (spec) → Task 5.

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `confirmAndRemoveDef(def, deps)` signature identical across Tasks 1 & 3; `RemoveDefDeps` fields (`placedCount`, `confirmAction`, `removeUserFurniture`) consistent; `ConfirmRequest` imported from `promptSlice`. Card gate uses the pre-existing `isUser`/`isIkea` names.
