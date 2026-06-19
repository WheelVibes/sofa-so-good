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
- **`hydrate*.ts` re-resolve user/IKEA defs + their IDB blobs on boot** — a new persisted
  asset kind must be rehydrated there or it won't survive reload.
- In handlers read fresh state with `useStore.getState()`; push undo via `pushHistory` /
  `pushHistoryCoalesced` (coalesce streaming edits like slider drags into one step).
- `editing.ts` `canEditScene` is the single gate for all scene editing — don't bypass it.
