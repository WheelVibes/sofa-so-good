# State management

State is a single **Zustand** store composed from slices in
`src/state/slices/*`. Each slice owns one concern and is merged in
`src/state/store.ts`.

## Slices

- **items** / **selection** — placed furniture + selection (`selectedItemId`,
  `selectedItemIds`, `selectRoom`, `selectItemGrouped`).
- **finishes** — per-room wall/floor finishes + wall accents.
- **doors**, **time** (SunCalc-driven), **location**, **camera**
  (`cameraMode`, `autoRotate`, `touring`, view nonces, `focusOn`).
- **ui** — quality (`qualityTier`/`assetTier`), snap grid, `loading`/`bootPhase`,
  `recording`, room editor, notifications.
- **placement** (`draggingItemId` + drag preview), **clipboard**, **history**
  (undo/redo), **measurements**, **orientation**, **reset**.
- **userAssets** — user-uploaded GLBs + imported `IkeaGltfDef`s.
- **floorPlan** — editable apartment shell + editor state + saved-plan library.
- **appearance** — theme + light/dark/auto mode.
- **features** — command palette, layers mode, context menu, onboarding,
  share/clearance/versions, **smartStartOpen**, collections.

## Persistence + migrations (`src/state/storage/`)

- Layout **autosave**; `qualityPrefs.ts` (graphics), `editorPrefs.ts`
  (snap/grid), `appearancePrefs.ts` (theme/mode → `[data-theme]`/`[data-mode]`
  on `<html>`, applied pre-paint by an inline script in `index.html`).
- `floorPlanStore.ts` — plan library + active custom plan.
- `hydrate.ts` / `hydrateAssets.ts` / `hydratePacks.ts` — re-resolve user/IKEA
  defs + their IDB blobs on boot.
- `bootstrap.ts` — the async boot orchestration (`runBootstrap`).

## Save/load serializer

`src/state/schema.ts` round-trips parametric items, user GLBs, and IKEA defs.
Save schema is **v2** (`groupId` optional; v1→v2 migration is a no-op on items).

Reach for `useStore.getState()` in event handlers/effects to avoid re-renders;
use selector hooks (`useStore(s => …)`) in render. Catalog consumers in the R3F
tree use `useCatalogGetter` (a non-rendering subscription) so catalog churn
never re-renders the scene.
