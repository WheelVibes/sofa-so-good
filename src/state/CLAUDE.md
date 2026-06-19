# src/state — Zustand store rules

Area rules for the store. Full slice list + persistence map in `docs/ARCHITECTURE.md`.

- **One concern per slice** (`slices/*`). Adding a slice = add it to the store
  composition + its initial state; keep it small and focused.
- **Persistence lives in `storage/`**, not in the slice: `qualityPrefs`/`editorPrefs`/
  `appearancePrefs`/`floorPlanStore`/`budgetPrefs` (per-device prefs) + autosave. Some
  state is deliberately session-only / out of the save schema (recent items, favourites,
  hidden ids, user styles in `localStorage`) — don't add those to autosave. `recentSlice`
  and `favouritesSlice` both self-persist to localStorage (keys `hdb_recent_items` and
  `hdb_favourites`) — they are the pattern for per-device catalog convenience state.
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
  asset kind must be rehydrated there or it won't survive reload.
- In handlers read fresh state with `useStore.getState()`; push undo via `pushHistory` /
  `pushHistoryCoalesced` (coalesce streaming edits like slider drags into one step).
  **Undo granularity:** one logical action = one entry. Batch actions (array / align /
  distribute / mirror / set-drop) push **once**, then mutate many items via
  `moveItem`/`rotateItem`/`flipItem`/`setItems` (which never push) — so one undo reverts the
  whole batch. The keyboard nudge coalesces under the `'nudge'` key so a burst of taps and a
  long hold form one step; `refreshCoalesce(key)` keeps that window alive across a hold→re-tap
  without snapshotting and is a no-op for any other key (so a nudge can't merge with another
  action). A deliberate pause past `COALESCE_MS` starts a fresh step.
- `editing.ts` `canEditScene` is the single gate for all scene editing — don't bypass it.
