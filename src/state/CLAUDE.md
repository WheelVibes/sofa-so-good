# src/state — Zustand store rules

Area rules for the store. Full slice list + persistence map in `docs/ARCHITECTURE.md`.

- **One concern per slice** (`slices/*`). Adding a slice = add it to the store
  composition + its initial state; keep it small and focused.
- **`windowFixtureSlice`** (WINDOW-FIXTURE-INTERACT) is the door-adjacent example of a slice that
  needs **no new persisted field**: a curtain/blind's open/closed value already lives on the placed
  item's own `props` (`drawAmount`/`lower`), so `toggleWindowFixture` just patches `items` — that
  already round-trips through `serialize()`/the autosave watch-list, so there's nothing new to add
  to either. Only `nearbyFixtureId` (which item the walk-mode reticle is aimed at) is slice-local
  session state, mirroring `doorsSlice.nearbyDoorId` — never persisted. Contrast with `doorsSlice`,
  which DOES need its own persisted `doors: Record<id, {open}>` because doors aren't `PlacedItem`s.
- **`screenInteractSlice`/`lightInteractSlice`** (WALK-SCREEN-INTERACT/WALK-LIGHT-INTERACT) follow
  the exact same `windowFixtureSlice` shape — each just `nearby*Id` (session-only, set by
  `FirstPersonCamera`'s aim loop, cleared on leaving walk mode) + a single toggle action
  (`cycleScreenContent`/`toggleLightPower`) that patches an existing item-props field
  (`screenContent`/`lightOn`) already covered by `items` persistence — no new persisted field for
  either. Unlike `windowFixtureSlice` (builtin-only lookup via `BUILTIN_CATALOG`, justified since
  `windowBound` fixtures are builtin parametric-only), `screenInteractSlice.cycleScreenContent`
  ALSO only needs `BUILTIN_CATALOG` — `isInteractableScreen` requires a *parametric* def (a
  `paramSchema` field), and GLB/IKEA/user/remote defs never carry a `paramSchema`, so a screen can
  only ever be builtin. `lightInteractSlice.toggleLightPower` needs no def lookup at all — the
  eligibility/toggle logic in `furniture/lightInteract.ts` only reads `defId` + `props`, since an
  interactable light can be ANY item kind (a registered builtin fixture OR a GLB/IKEA/user import
  the player already flagged via the `itemAsLight` override).
- **`isolateSlice`** (FEAT-C, isolate/solo the selection) is a one-field session-only slice:
  `isolateActive: boolean` + `toggleIsolateSelection`/`setIsolateActive`. Unlike the
  `windowFixtureSlice`-family sessions above, it stores no per-item state at all (no
  `Record<id, …>`, not even a snapshot of which ids were isolated) — "which items are dimmed"
  is re-derived on every render from the LIVE `selectedItemIds` via the pure
  `furniture/isolateSelection.ts:computeDimmedItemIds`, so isolate always tracks the current
  selection instead of a stale one. Rendering is a pure opacity override in `Furniture.tsx`
  (`FurnitureLayer` computes the dimmed set once, passes `dimmed` down) — it deliberately does
  **not** reuse the persisted per-item `item.props.opacity` (CUSTOMIZE-OPACITY) field; that one
  is user-authored and round-trips through `serialize()`, so writing a temporary solo-dim value
  into it would risk autosaving a stray opacity if the timing ever raced a save. The two compose
  at render time instead (`Math.min(itemOpacity, SOLO_DIM_OPACITY)` when dimmed). **Auto-clear**
  (selection change OR room-editor exit must drop isolate) is wired as a single `useStore.subscribe`
  in `store.ts` watching `selectedItemIds` by CONTENT (not reference, so a re-click of the same
  selected item doesn't spuriously clear it) — exiting/entering the room editor already clears
  selection itself (`uiSlice`), so one watcher covers both triggers without coupling
  `selectionSlice`/`uiSlice` to isolate state. Mirrors this file's wall-thickness module-level
  `useStore.subscribe` a few lines below it in `store.ts` — that's the established pattern for a
  cross-slice reactive side effect that doesn't belong inside either slice's own actions.
- **`editorPrefs` also persists per-device UI convenience state** (out of the save schema):
  the left-dock tab (`leftMode`), the collapsed layer-group map (`layersCollapsed`, lifted from
  `LayersPanel` into `featuresSlice`), `catalogOpen` — the last restored **desktop-only**
  (`matchMedia('(min-width:641px)')`, SSR/jsdom-safe with a `false` fallback) so the mobile
  bottom-sheet catalog never auto-reopens — and `roomOrder` (manual per-room-editor room order;
  `[]` = alphabetical, applied by `state/rooms.ts` `editableRooms`; the simple-tier `roomReorder`
  flag gates only the reorder UI, the saved order always applies). All load with back-compat defaults.
- **`sharedLibrarySlice`** fetches the R2 shared-library manifest once
  (`bootstrapSharedLibrary`, guarded on backend + **admin session** (`isAdminUser`) + the
  `sharedLibrary` flag — simple tier, so the role is the gate, not Simple/Pro) and imports a
  group on demand (`addSharedGroup`). Session-only — **not persisted** (imported IKEA defs persist
  via the `hydrateIkea` path; the manifest is re-fetched each session), so it's out of the save
  schema + autosave watch-list.
- **Persistence lives in `storage/`**, not in the slice: `qualityPrefs`/`editorPrefs`/
  `appearancePrefs`/`floorPlanStore`/`budgetPrefs` (per-device prefs) + autosave. `editorPrefs`
  also persists `density` (P38, `Density = 'comfortable' | 'compact'`, back-compat default
  `'comfortable'` for pre-existing records); `applyDensity(density)` mirrors
  `appearancePrefs.applyAppearance` — it writes `[data-density]` on `<html>` (driving the
  `--row-pad-*` token overrides in `styles/tokens.css`) and is called from both
  `loadEditorPrefs` and `watchEditorPrefs`, jsdom-safe (guards `document`). Density applies only
  while the `densityMode` flag is enabled (pro): in Simple the persisted value is retained but
  the DOM attribute falls back to `'comfortable'` (`applyDensity` reads
  `useStore.getState().featureFlags.densityMode` at call time; `watchEditorPrefs` folds it into
  its change-detection key — but not the persisted JSON — so a Simple↔Pro flip re-applies it).
  Some
  state is deliberately session-only / out of the save schema (recent items, favourites,
  hidden ids, user styles in `localStorage`) — don't add those to autosave. `recentSlice`
  and `favouritesSlice` both self-persist to localStorage (keys `hdb_recent_items`, `hdb_favourites`; `calloutsSlice`/`badgesSlice` likewise (`hdb_dismissed_callouts`, `hdb_seen_badges`)
  for furniture, and `hdb_fav_finishes` for finish/material favourites — a **separate** list so the
  catalog "Favourites" tab never shows un-renderable finish ids) — the pattern for per-device catalog
  convenience state.
- **`schema.ts` is the save/load serializer.** Any new *persisted* item/design field must
  round-trip there — keep it optional + back-compat; bump the version + add a migration for
  a breaking change (the v1→v2 `groupId` migration is the pattern).
- **Autosave ⊇ serialize() (lock-step invariant).** Every field `serialize()` writes MUST
  also be in the autosave watch-list (`PERSISTENT_WATCH_KEYS` / `pickPersistent` /
  `shallowEqual` in `storage/autosave.ts`), or editing *only* that field never schedules a
  save and the edit is lost on reload (BUG-001). When you add a persisted field to
  `serialize()`, add it to the watch-list too — and ensure its slice replaces the
  array/object on each mutation so the reference compare detects the change. The guard test in
  `storage/autosave.test.ts` derives serialize()'s emitted keys and fails if any isn't watched.
- **`HistorySnapshot` (`historySlice.ts`) ⊇ every field an action pushes history for.** If a
  slice's action calls `pushHistory()`/`pushHistoryCoalesced()` while mutating a field — or
  changes that field in the SAME push as an already-snapshotted field (e.g. `applyHomeStyle`
  changing `finishes`+`floorPlan`+`masterPalette` under one `pushHistory()`, on the promise
  that "one undo reverts the whole style") — that field MUST be in `snapshot()` /
  `HistorySnapshot` / `snapshotMatchesState()`, or `undo`/`redo`/`jumpHistory` silently leave it
  out of sync with the fields that DID get restored (BUG-3: `baselinePlan` changed in lockstep
  with `floorPlan` only on a plan load, but was missing from the snapshot — undoing a load
  reverted `floorPlan` while `baselinePlan` stayed on the just-undone plan, so the
  hacking/demolition-plan `diffWalls` compared two unrelated plans and reported phantom
  demolished/added walls; `masterPalette`/`roomPalettes` had the identical gap). Selection
  (`selectedItemId(s)`) and `pendingEdit` are the deliberate exceptions — view-only state,
  explicitly excluded and cleared by history nav instead. There's no `HistorySnapshot`-derived
  guard test analogous to `autosave.test.ts`'s (a `pushHistory()` call site doesn't name its
  fields the way `serialize()` does) — audit by hand when adding a new `pushHistory()` call.
  Do **not** add transient/non-persisted state (selection, open flags, hover ids) to the
  watch-list.
- **`hydrate*.ts` re-resolve user/IKEA defs + their IDB blobs on boot** — a new persisted
  asset kind must be rehydrated there or it won't survive reload. For **user materials**
  (`hydrateAssets.ts`) the def's identity/appearance (name/category/swatch/uvScale) is read
  back from the albedo channel's IDB `meta` (written by `materials/upload/persist.ts`); any
  new such field must be persisted there AND restored here **with a back-compat default** so
  legacy records that predate the field still load — the IDB `meta` bag is open-ended, so this
  needs no schema/version bump (BUG-003).
- **An unresolvable `defId` on restore must never silently become a permanent deletion
  (BUG-2).** `applySerialized` (`schema.ts`) drops any item whose `defId` isn't in the caller's
  `knownDefIds` — correct for a load that's explicitly about a DIFFERENT design (file import,
  a saved version/slot, a plan/design share link: the def genuinely doesn't exist here, and
  each of those callers already toasts a dropped count). It is **wrong** for restoring the
  user's OWN autosave (`hydrate.ts`, `cloudBoot.ts`): there, an unresolvable def can only mean
  its IndexedDB blob is temporarily/permanently gone (browser storage eviction under pressure,
  a private-mode wipe, a corrupt/missing IDB record, or — for `cloudBoot.ts` — the documented
  cross-device limit that uploaded blobs never leave this browser's IDB), never that the user
  asked for the furniture to be deleted. If that dropped state were applied as-is, the very
  next debounced autosave (`storage/autosave.ts`) would persist it and make the loss permanent
  without the user ever consenting. Both callers call `preserveUnresolvedItems(saved, known,
  patch)` right after `applySerialized` to put those items back into `patch.items` (using
  `hasFiniteItemTransform` so a genuinely corrupt NaN/Infinity transform stays dropped). A
  restored-but-unresolved item renders as nothing until its def resolves again —
  `FurnitureLayer`/`LayersPanel`/etc. already treat an unknown `defId` as inert rather than
  crashing (every consumer that reads `catalog[defId]` guards the `undefined` case) — so this
  costs a little save-file size, never correctness. There is no in-app code path that evicts an
  IDB blob still referenced by a live item on quota pressure (only `removeUserFurniture`'s
  explicit user-triggered delete frees a def's blob, and it drops the def's items in the SAME
  action) — the eviction this guards against is the browser's own storage-pressure/private-mode
  behaviour, outside app control.
- In handlers read fresh state with `useStore.getState()`; push undo via `pushHistory` /
  `pushHistoryCoalesced` (coalesce streaming edits like slider drags into one step).
  **Undo granularity:** one logical action = one entry. Batch actions (array / align /
  distribute / mirror / set-drop) push **once**, then mutate many items via
  `moveItem`/`rotateItem`/`flipItem`/`setItems` (which never push) — so one undo reverts the
  whole batch. The keyboard nudge coalesces under the `'nudge'` key so a burst of taps and a
  long hold form one step; `refreshCoalesce(key)` keeps that window alive across a hold→re-tap
  without snapshotting and is a no-op for any other key (so a nudge can't merge with another
  action). A deliberate pause past `COALESCE_MS` starts a fresh step.
- **A per-action Undo toast is a SEPARATE concern from history-step granularity (BUG-4).**
  `deleteItem`'s "Item deleted" toast de-dupes with any other same-kind+title+message toast
  (`notify.start`'s generic de-dupe, `src/ui/CLAUDE.md`'s P32 note) — but a delete more than
  `COALESCE_MS` after the previous one still pushes its OWN fresh `past` entry even though its
  toast merges into the still-showing one. A plain `onAction: () => get().undo()` on that merged
  toast would only pop the newest entry, silently stranding the earlier delete. `deleteItem`
  instead passes `notify.start({ ..., undoRepeat })`, computing `undoRepeat` itself by checking,
  right after its own `pushHistoryCoalesced('delete')` call, whether this push (a) actually
  created a new entry (vs. merging into the last one) AND (b) immediately followed another
  `'delete'`-keyed push (`get()._lastPushKey === 'delete'` going in) with nothing else in between
  — only then does it read the still-live toast's current `undoRepeat` and add one; otherwise it
  starts a fresh count of 1. This keeps the chain from reaching across an unrelated action sitting
  between two deletes, or across a toast that already auto-dismissed. Any future action with the
  same "one undo-toast, but N independently-undoable history steps behind it" shape should reuse
  `undoRepeat` rather than inventing its own chain-tracking.
- **`schema.ts` is the import trust boundary — sanitize untrusted URLs here.** A `.sofa.json`
  import keeps `userFurniture` (incl. `source:'ikea'` defs + their URLs), so any URL field that
  later renders into an `href`/`src` (def `sourceUrl`, IKEA `productInfo.mainImageUrl` /
  `documents[].url`) is run through `safeUrl` (`src/utils/safeUrl.ts`) via a Zod transform —
  unsafe-scheme URLs (`javascript:`/`data:`/…) become `undefined`, the rest of the record is
  preserved (back-compatible, never rejects the whole import, SEC-001). When you add a new
  imported URL field, sanitize it here too (and at its render sink).
- `editing.ts` `canEditScene` is the single gate for all scene editing — don't bypass it.
