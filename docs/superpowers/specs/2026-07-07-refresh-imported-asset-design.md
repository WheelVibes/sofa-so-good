# Refresh an imported (IKEA / shared-library) asset from R2

**Date:** 2026-07-07
**Status:** Approved

## Problem

An imported `source:'ikea'` def renders its GLB + thumbnail from `blob:` URLs
rebuilt out of IndexedDB on boot (`resolveIkeaRuntimeUrls`). If a blob is missing
(storage eviction, private-mode wipe, a different browser), the thumbnail falls
back to the category icon and/or the model shows the placeholder box. The remove
`×` (shipped in v0.16.1.2) lets a user delete + re-add, but that loses placements
and is heavier than needed. Users want to **refresh in place** — re-download the
group from R2 and rebuild the blobs while keeping placed instances.

## Goal

A refresh (re-download) control on an imported `source:'ikea'` catalog card that
re-fetches metadata + GLB + thumbnail from R2 and rebuilds the def in place,
preserving placed instances. Shown only when the def is actually re-downloadable.

## Existing machinery reused (no store / fetch changes)

- `addSharedGroup(group)` (`sharedLibrarySlice`) → `registerSharedGroup(group)` →
  `importGroup(commit:true)` → `replaceUserFurniture`. For an already-imported def,
  `replaceUserFurniture` swaps it in place, **keeps placed instances**, rebuilds
  `runtimeUrl` + the downscaled thumbnail, and frees the old blobs the new def no
  longer references. `addSharedGroup` already sets `sharedLibrary.resolving[group]`
  to `'adding'`/`'error'` and returns the def id (or `null` on failure).
- So refresh == `addSharedGroup(item.group)` for an imported def. No changes to the
  slice, `registerSharedGroup`, or `importGroup`.

## The mapping gap

`registerSharedGroup` keys on the manifest **folder slug** (`group`), but a def
only stores `groupKey` (its id is `ikea-<groupKey>`). The manifest item carries
both. So refreshing a def requires the loaded manifest (`sharedLibrary.items`,
populated only for an admin + `sharedLibrary` flag + backend) to map
`groupKey → group`.

## Design

### 1. `sharedGroupForDef` — pure mapping helper (new)

`src/ui/catalog/sharedGroupForDef.ts`:

```ts
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { FurnitureDef } from '../../furniture/types'

/** The shared-library folder slug to re-download an imported def from, or null
 *  if the def isn't a shared/ikea import or no manifest item matches its group. */
export function sharedGroupForDef(
  def: FurnitureDef,
  items: SharedLibraryItem[],
): string | null {
  if (def.source !== 'ikea') return null
  const groupKey = (def as { groupKey?: string }).groupKey
  if (!groupKey) return null
  return items.find((it) => it.groupKey === groupKey)?.group ?? null
}
```

Pure + unit-tested.

### 2. `Icon.Refresh` — new glyph

Add a circular-arrow `Refresh` icon to `src/ui/toolbar/icons.tsx` (same `<Svg>`
wrapper pattern as `Redo`/`Rotate`). No refresh/reload glyph exists today.

### 3. CatalogCard — refresh button (new props)

Add `onRefresh?: () => void` and `refreshing?: boolean`. When `onRefresh` is
provided, render a reload-icon button beside the `×` (class `coll-refresh`,
aria-label "Re-download asset from library"); while `refreshing`, show a spinner
and disable it (`aria-busy`). Presentational only — the card knows nothing about
groups or the store. The button `stopPropagation`s like the `×`/fav buttons.

### 4. CatalogDrawer — wiring, gating, feedback

- Read the raw manifest: `const sharedItems = useStore(useShallow((s) =>
  s.sharedLibrary.items))` and the resolving map
  `useStore(useShallow((s) => s.sharedLibrary.resolving))`.
- For each `local` card, compute `refreshSlug = (sharedOn && hasBackend()) ?
  sharedGroupForDef(it.def, sharedItems) : null`. (`sharedOn = fSharedLibrary &&
  isAdmin` already exists.)
- When `refreshSlug` is non-null, pass
  `onRefresh={() => void handleRefresh(refreshSlug, it.def.name)}` and
  `refreshing={resolving[refreshSlug] === 'adding'}`; otherwise omit both (no
  button).
- `handleRefresh(slug, name)`: `const id = await addSharedGroup(slug)`, then
  `useStore.getState().notify.start(...)` — success ("Refreshed <name>") or, when
  `id` is null, `notify.error(...)` ("Couldn't refresh <name> — check your
  connection"). `addSharedGroup` already sets/clears the `resolving` spinner state.

### 5. No new feature flag

Gated by the existing `sharedLibrary` flag + admin + backend + a matching manifest
item (all folded into `refreshSlug !== null`) — consistent with the ungated remove
`×`; refresh cannot function without the shared library anyway.

## Tests

- `sharedGroupForDef`: returns the slug when a manifest item's `groupKey` matches;
  `null` for a `user`/`builtin` def, a def with no `groupKey`, or no matching item.
- `CatalogCard`: refresh button renders iff `onRefresh` is given; not for a card
  without it; spinner + `aria-busy` when `refreshing`; clicking calls `onRefresh`
  and does not trigger the card's placement click (stopPropagation).
- `CatalogDrawer`: `onRefresh` passed only when admin + `sharedLibrary` on + backend
  + matching manifest item; absent when the user is not admin (assert the admin vs
  non-admin split — `sharedLibrary` is simple-tier but admin-gated).

## Verification

Scenario `refresh-imported-asset-simple.json`: seed an imported ikea def whose
`groupKey` matches a seeded `sharedLibrary.items` entry, stub `addSharedGroup` (or
point `VITE_API_BASE` at a mock) — assert the refresh button renders, clicking it
calls `addSharedGroup(group)`, shows the spinner, and the placed instance survives.
Screenshot the card with the refresh control + the spinner state; visually review.
(Headless has no real R2 backend, so the re-fetch itself is asserted via the store
call / spinner, per the playbook's "assert the action fires" guidance.)

## Docs & versioning

- CHANGELOG entry + `build` version bump.
- `src/ui/CLAUDE.md`: extend the card-actions note — the card now also carries a
  **refresh** control for re-downloadable imported ikea/shared defs (rebuilds blobs
  in place via `addSharedGroup`, keeping placements), gated on admin + `sharedLibrary`
  + backend + a matching manifest item.

## Out of scope

- Refreshing dev-scrape IKEA defs (no R2 source) or non-shared user uploads.
- Auto-refresh on detected broken blobs (this is a manual, user-triggered control).
- Any change to `registerSharedGroup` / `importGroup` / `replaceUserFurniture`.
