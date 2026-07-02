# src/state — Zustand store rules

Area rules for the store. Full slice list + persistence map in `docs/ARCHITECTURE.md`.

- **One concern per slice** (`slices/*`). Adding a slice = add it to the store
  composition + its initial state; keep it small and focused.
- **`sharedLibrarySlice`** fetches the R2 shared-library manifest once
  (`bootstrapSharedLibrary`, guarded on backend + sign-in + the `sharedLibrary` flag) and imports a
  group on demand (`addSharedGroup`). Session-only — **not persisted** (imported IKEA defs persist
  via the `hydrateIkea` path; the manifest is re-fetched each session), so it's out of the save
  schema + autosave watch-list.
- **Persistence lives in `storage/`**, not in the slice: `qualityPrefs`/`editorPrefs`/
  `appearancePrefs`/`floorPlanStore`/`budgetPrefs` (per-device prefs) + autosave. Some
  state is deliberately session-only / out of the save schema (recent items, favourites,
  hidden ids, user styles in `localStorage`) — don't add those to autosave. `recentSlice`
  and `favouritesSlice` both self-persist to localStorage (keys `hdb_recent_items`, `hdb_favourites`
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
  Do **not** add transient/non-persisted state (selection, open flags, hover ids) to the
  watch-list.
- **`hydrate*.ts` re-resolve user/IKEA defs + their IDB blobs on boot** — a new persisted
  asset kind must be rehydrated there or it won't survive reload. For **user materials**
  (`hydrateAssets.ts`) the def's identity/appearance (name/category/swatch/uvScale) is read
  back from the albedo channel's IDB `meta` (written by `materials/upload/persist.ts`); any
  new such field must be persisted there AND restored here **with a back-compat default** so
  legacy records that predate the field still load — the IDB `meta` bag is open-ended, so this
  needs no schema/version bump (BUG-003).
- In handlers read fresh state with `useStore.getState()`; push undo via `pushHistory` /
  `pushHistoryCoalesced` (coalesce streaming edits like slider drags into one step).
  **Undo granularity:** one logical action = one entry. Batch actions (array / align /
  distribute / mirror / set-drop) push **once**, then mutate many items via
  `moveItem`/`rotateItem`/`flipItem`/`setItems` (which never push) — so one undo reverts the
  whole batch. The keyboard nudge coalesces under the `'nudge'` key so a burst of taps and a
  long hold form one step; `refreshCoalesce(key)` keeps that window alive across a hold→re-tap
  without snapshotting and is a no-op for any other key (so a nudge can't merge with another
  action). A deliberate pause past `COALESCE_MS` starts a fresh step.
- **`schema.ts` is the import trust boundary — sanitize untrusted URLs here.** A `.sofa.json`
  import keeps `userFurniture` (incl. `source:'ikea'` defs + their URLs), so any URL field that
  later renders into an `href`/`src` (def `sourceUrl`, IKEA `productInfo.mainImageUrl` /
  `documents[].url`) is run through `safeUrl` (`src/utils/safeUrl.ts`) via a Zod transform —
  unsafe-scheme URLs (`javascript:`/`data:`/…) become `undefined`, the rest of the record is
  preserved (back-compatible, never rejects the whole import, SEC-001). When you add a new
  imported URL field, sanitize it here too (and at its render sink).
- `editing.ts` `canEditScene` is the single gate for all scene editing — don't bypass it.
