# SG-authentic presets, room categories & placement soundness — plan (2026-07-19)

> Design for the user directive: presets/defaults must reflect modern SG homes; placement must
> be sound (orientation, grouping, door/window non-obstruction); rooms get explicit
> USER-SETTABLE categories consumed by presets. Implement as RM1→RM4 (RM2/RM3 independent).
> Full citations in the research agent report (2026-07-19); key sources: D'Phenomenal 4-room
> BTO guide, Qanvast flat types, HomeMarket/Lemonfridge/Rezt+Relax/Arkee 2026 theme round-ups,
> Yuan Zhong Siu/Castlery/Home&Decor bed feng-shui norms, Nova Furnishing placement rules.

## Audit verdicts

- **No persisted room type.** Two parallel name-inference taxonomies: analysis `RoomKind`
  (suggestions.ts — living/dining/bedroom/kitchen/bath/study/balcony/other, `balcony` doubles
  as the non-habitable bucket) and autoArrange's narrower internal kind; furnishPlan layers its
  own regexes. Renamed rooms ("Ella's room") silently degrade. Fix: persisted
  `PlanRoom.category` + ONE `roomCategory(room)` helper (explicit wins → name inference →
  'other') + downmaps `toRoomKind`/arranger-kind so existing consumers stay byte-identical
  when category is absent.
- **Presets**: 15 `LayoutPreset`s restyle the fixed default flat by defId (no per-room
  dimension); `furnishPlanItems` has hardcoded per-kind KITS (no serviceYard/foyer/storeroom
  kits); palette presets disconnected from themes. Machinery (ParamProps hydration) is sound.
- **Placement**: door-swing keep-outs, windowless TV wall, walls-flush, CLEARANCE constants
  all exist in the ONE shared arranger path. Gaps: tall items can block windows (sill never
  checked), no full-height/balcony-slider keep-out, bed rules incomplete for SG norms
  (headboard-under-window, foot-to-door), armchairs snap to walls instead of grouping, no
  dining↔kitchen adjacency bias.

## RM1 — room categories (foundation)

- `ROOM_CATEGORIES`: living, dining, bedroom, masterBedroom, kitchen, bath, powder, study,
  serviceYard, storeroom, balcony, foyer, other. `PlanRoom.category?` additive (+PlanRoomZ).
- New pure `src/floorplan/roomCategory.ts`: `roomCategory(room)`, `roomCategoryFromName`
  (extended regexes: serviceYard yard/service/utility/laundry; storeroom store/shelter;
  foyer foyer/entry/entrance/corridor — `hall` stays living per HDB parlance; powder; master;
  balcony), `toRoomKind` downmap (masterBedroom→bedroom, powder→bath,
  serviceYard/storeroom→balcony, …) + arranger downmap.
- Editor UI: RoomInspector Select under Name — "Auto (from name) — <inferred>" first option,
  `updateRoom(id, {category})` (existing undoable action). WallInspector structure-select
  precedent.
- RM1 migrations: CatalogDrawer room-aware landing, roomStarters/EmptyRoomHint,
  furnishPlan.kitForRoom (regexes → switch on category), autoArrange room-kind resolution
  (explicit > name > items). Later: roomLux/handoverChecklist/planStatistics/
  electricalSchedule/suggestions (inference fallback keeps them correct meanwhile).
- Seed `category` in built-in templates (`templates/shared.ts room()` trailing param).

## RM2 — preset refresh

- `LayoutPreset` gains `categoryStyle?: Partial<Record<RoomCategory, Record<defId,
  ParamProps>>>` (applied after `style`; merge order: schema defaults < kit props < style <
  categoryStyle), `kits?: Partial<Record<RoomCategory, KitPiece[]>>`, `paletteId?` (links
  PALETTE_PRESETS to themes).
- 2025-26 SG theme gallery (8): Japandi (keep), Scandi Calm (keep), **Modern Luxe/Quiet
  Luxury (NEW — ivory/taupe/chocolate/brass, fluted+bouclé+marble-look)**, Warm
  Minimalist/Muji (retune `minimalist`), Modern Contemporary (retune `moveIn`, the default),
  Modern Industrial (keep `warmIndustrial`), Tropical Biophilic (retune `cozyTropical`),
  **Peranakan Accent (NEW — cream + emerald/coral/cobalt, patterned rug, dark tropical
  wood)**. Demote layout-variants (brokenPlan/socialLounge/wfhStudio/…) out of the theme
  gallery; coastal/modernMono fading per 2026 sources.
- KITS gain serviceYard (washer/drying rack/tall cabinet), storeroom (shelving), foyer (shoe
  cabinet/bench/mirror), masterBedroom kits. Pin-test every kit/style defId ∈ BUILTIN_CATALOG.

## RM3 — placement soundness (shared path only)

1. `CLEARANCE.windowSillTall = 0.95` + `windowFrontRects(plan)` beside doorSwingRects
   (project window 0.65 m into room); tryPlace rejects items taller than the sill overlapping
   the rect; sill-0 openings (balcony sliders) = hard keep-out for everything.
2. `arrangeBedroom` scores headboard edges: hard-reject windowed spans, penalise foot-to-door
   (door centreline crossing the bed), prefer bedSurround both sides. Seed-0 = scorer path
   (accepted snapshot churn).
3. Armchairs: sofa-adjacent at 90° facing the coffee-table centre, wall fallback.
4. Dining band biased toward the kitchen-adjacent edge (room-rect adjacency), fallback today's
   0.74 fraction.
5. Sync docs/interior-design-guidelines.md.
Property test: furnishPlanItems over every template ⇒ zero window-tall overlaps, zero
keep-out violations.

## RM4 — default layout refresh (modern SG 4-room BTO)

Living/dining (L-config or sofa+ottoman, 1.8 m console, curtains, main-door→kitchen path
≥0.9 m), master (queen + 2 nightstands + sliding wardrobe), bedroom2 kids/guest, bedroom3
study/flexi (+1), galley kitchen with washer relocated to the service yard, Modern
Contemporary restyle. Acceptance: the new defaults pass RM3's validators.

## Risks

- RM3 changes seed-0 layouts → snapshot review budget (defaultLayout/arrange tests).
- roomAwareCategories' balcony-bucket semantics preserved via downmap.
- Preset overlays are per-defId (prop names vary per def) — author accordingly.
