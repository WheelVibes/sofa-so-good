# Move material browsing into the Finish Picker

Date: 2026-05-01
Branch: `phase-1/apartment-shell`

## Problem

`CatalogDrawer` currently hosts a `Browse materials` tab alongside `Browse furniture`. Materials are conceptually a property of a room's surfaces (floor / wall finishes), not of the furniture catalog. Users select a room → `FinishPicker` opens on the right; the natural place to discover and download a material is right there, where it will be applied. Today they must close the inspector flow, open the catalog drawer, switch tabs, resolve a remote material, then re-select the room and pick the material from the swatch grid.

## Goal

1. Remove `browse-materials` from `CatalogDrawer`. Catalog is furniture-only.
2. Add an inline "Browse online…" affordance in `FinishPicker` that mounts the existing `RemoteBrowseTab` with `kind="material"`.
3. Resolved (downloaded) remote materials are already merged into `useMaterials()` via `resolvedRemoteMaterials` — verify they continue to appear in the swatch grid and gain a small provider badge so users can identify them.
4. Both panels should display content cleanly without blocking too much of the canvas.

## Design

### CatalogDrawer

- Drop the `browse-materials` mode. `Mode` becomes `'builtin' | 'browse'` (rename `browse-furniture` → `browse` since it's the only browse mode now).
- Tabs collapse to `Built-in` / `Browse`.
- Width unchanged (`w-80`); already constrained to `max-h-[85vh]`.

### FinishPicker

- Add view state: `'swatch' | 'browse'`.
- Swatch view (default): current floor/wall groups + `Upload material…` button + new `Browse online…` button.
- Browse view: header with back arrow + title "Browse materials", body mounts `<RemoteBrowseTab kind="material" onResolved={handleResolved} />`. `handleResolved(id)` applies the material to the **last-edited surface** (track which group the user last clicked: floor or wall, default floor) and returns to swatch view. The newly-applied material is now active and visible in the swatch grid.
- Width: `w-64` for swatch view (current); widen to `w-80` in browse view to fit the 2-column remote card grid. Same `max-h-[80vh]`.
- Add a tiny provider tag (`PH` / `ACG`) to swatches whose `def.source === 'polyhaven' | 'ambientcg'`, mirroring the existing `user` tag. Keep it unobtrusive (corner pill, ~8px).

### Canvas real-estate

- CatalogDrawer: `w-80` left, `max-h-[85vh]` — unchanged.
- FinishPicker: `w-64` default → `w-80` when browsing. Both have `max-h` caps already. No floating modal added.

## Files touched

- [src/ui/catalog/CatalogDrawer.tsx](src/ui/catalog/CatalogDrawer.tsx) — remove `browse-materials` mode + tab.
- [src/ui/FinishPicker.tsx](src/ui/FinishPicker.tsx) — add view state, browse button, conditional width, swatch provider badge, last-edited surface tracking.
- [src/ui/catalog/RemoteBrowseTab.tsx](src/ui/catalog/RemoteBrowseTab.tsx) — no behavioural changes; reused as-is.

## Out of scope

- Search-by-category inside the materials browse (current global search remains).
- Filtering swatch grid by provider — only a visual badge.
- Persisting "last-edited surface" across sessions.

## Verification

- Manual: select a room → click `Browse online…` → search/resolve a material → verify it applies and the panel returns to swatch view with the new material selected and visible in the grid.
- `npm run build` and existing tests still pass.
