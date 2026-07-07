# Remove imported (IKEA / shared-library) assets from the catalog

**Date:** 2026-07-07
**Status:** Approved (pending spec review)

## Problem

An imported shared-library / IKEA product becomes a `userFurniture` def with
`source: 'ikea'` and id `ikea-<groupKey>`. Its GLB blob is copied into IndexedDB
at import time; a placed instance re-renders on reload by rebuilding a `blob:`
`runtimeUrl` from that IDB record (`resolveIkeaRuntimeUrls`), **not** from R2.

If the IDB blob is gone (storage eviction, private-mode wipe, a different
browser/machine), the def still restores from the autosave but has no
resolvable `runtimeUrl`, so the item renders the placeholder box and logs
`[Furniture] no renderable model url for "<id>" …`.

The user is then trapped:

- The catalog card's delete "×" (`.coll-x`) is gated on `isUser`
  (`source: 'user'` uploads only) — an `ikea`/shared def gets **no** delete
  control (`src/ui/catalog/CatalogCard.tsx:239`).
- The "Download" `SharedCard` for that group is deduped away the moment a local
  `ikea-<groupKey>` def exists (`src/ui/catalog/useUnifiedCatalog.ts:110`), so
  the stale def hides its own re-download card.

Net: the asset can be neither removed (to free space) nor re-added (to recover).

## Goal

Let a user remove an imported `source: 'ikea'` def (dev-scrape IKEA **or** R2
shared-library) directly from its catalog card. Removal frees the IndexedDB
blobs and un-hides the "Download" card so the group can be re-fetched from R2.

## Existing machinery reused (no new plumbing)

`removeUserFurniture(id)` (`src/state/slices/userAssetsSlice.ts:80`) already:

- drops the def from `userFurniture`,
- drops every placed instance of it from `items` (across the whole design / all
  rooms — `items` is the global placed-furniture list),
- clears those ids from the selection,
- calls `freeResource` per resource, which evicts the GLTF cache, revokes blob
  URLs (incl. LOD variants) and **deletes the IDB records** (incl. `<id>:lod-*`
  siblings).

`defResources` already handles `source: 'ikea'` by iterating every variant's
`{ runtimeUrl, assetId }`. So the store action needs **no change**.

## Design

### 1. Surface the delete control — `CatalogCard.tsx`

Widen the "×" gate from `isUser` to `isUser || isIkeaDef(def)` (both helpers are
already imported at the top of the file). Make the `aria-label` source-aware:

- `source: 'user'` → `"Remove uploaded asset"` (unchanged)
- `source: 'ikea'` → `"Remove downloaded asset"`

No new markup. `isIkeaDef` (`source === 'ikea'`) covers both the dev IKEA scrape
and the prod shared-library import, since both go through `importGroup`.

### 2. Confirm-only-if-placed — `CatalogDrawer.tsx`

Today the `local` card is rendered with
`onDelete={() => removeUserFurniture(it.def.id)}` (immediate, no prompt).
Replace with a shared `handleRemoveDef(def)`:

```
const placed = useStore.getState().items.filter((it) => it.defId === def.id).length
if (placed > 0) {
  const ok = await confirmAction({
    title: 'Remove asset?',
    message: `${placed} placed item${placed === 1 ? '' : 's'} will also be removed.`,
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
}
removeUserFurniture(def.id)
```

- Uses the repo's `promptSlice` / `ConfirmModal` path (`confirmAction`), per the
  `src/ui/CLAUDE.md` destructive-action policy — never `window.confirm`.
- Applied to **both** user and ikea cards (the same control, the same
  "silently wipes placed instances" footgun). This is a deliberate, minor
  behavior change to existing user-upload deletion: it now prompts when the
  upload is placed somewhere, instead of deleting silently. Unplaced removal
  stays immediate for both.
- "at least one instance in any room" == `items` count > 0, since `items` is the
  whole-design placed list (not room-scoped).

### 3. Re-add path — no code

Once the local def is removed, `useUnifiedCatalog`'s dedup no longer hides the
`SharedCard`, so the "Download" card reappears and re-downloads from R2 on click
(`registerSharedGroup` → `importGroup` → fresh IDB blob + `runtimeUrl`). Seeing
shared cards still requires an admin session + the `sharedLibrary` flag —
unchanged, and that is how the group was imported in the first place.

### 4. No new feature flag

The card "×" already ships **unflagged** for uploads. Removal is recovery /
asset-management that must stay available regardless of whether
`sharedLibrary` / `ikeaLive` is currently on (e.g. a non-admin left holding a
stale ikea def must still be able to remove it). So: no `FEATURE_FLAGS` entry
and no Simple/Pro tier gating for the control itself. (This is consistent with
the existing unflagged upload-delete affordance.)

## Testing

- `userAssetsSlice` (currently uncovered): `removeUserFurniture` on an `ikea`
  def frees **every** variant's `assetId`/blob (assert IDB `delete` per variant
  + URL revoke) and drops all placed instances + clears selection.
- `CatalogCard`: renders the "×" for `user` and `ikea` defs, and **not** for a
  `builtin` def.
- `handleRemoveDef`:
  - unplaced def → `removeUserFurniture` called, `confirmAction` **not** called;
  - placed def, confirm accepted → prompt shown, then removed;
  - placed def, confirm cancelled → nothing removed.
- Mode note: the control is ungated, so its visibility is not Simple/Pro
  dependent. The shared-library re-add remains admin-gated (existing coverage).

## Verification

Visual-verification pass (`docs/visual-verification-playbook.md`): place the
armchair → remove via the card "×" → confirm the "Download" card reappears →
re-download and confirm it renders (not the placeholder box). Screenshot each
step.

## Docs & versioning

- `CHANGELOG.md` entry.
- `build` version bump in `src/version.ts` + `package.json` (small fix).
- One-line note in `src/ui/CLAUDE.md`: the catalog card "×" now removes imported
  `ikea`/shared defs too (freeing their IDB blobs), and removal prompts when the
  def has placed instances.

## Out of scope

- A dedicated storage-manager panel listing all downloaded assets with sizes
  (a larger future feature; this spec is the minimal recovery path).
- Any change to how `runtimeUrl` is rehydrated or to R2 fetching.
