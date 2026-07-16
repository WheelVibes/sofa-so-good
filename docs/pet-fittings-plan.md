# Pet fittings & furniture — Singapore compliance + comfort program

**Goal (user, 2026-07-17):** exhaustive pet fittings for HDB/condo homes — regulation
compliance (SG), annoyance-fixers (room exclusion etc.), and pet furniture; presets
categorized by pet type; procedural items realistic, high-fidelity, to scale,
physically sound, fully customizable.

**Research base (2026-07-17, cited in the session reports):**
- **Cat Management Framework** (live 1 Sep 2024; transition ends 31 Aug 2026): ≤2 cats/HDB
  flat, licensing/microchip via PALS, and a **containment mandate — mesh/screen all windows,
  grilles, balconies and service yards** (aperture ≤5 cm — cat-head rule; must withstand
  running impact; INTERNAL mounting only per HDB/BCA façade rules). SPCA high-rise-syndrome
  data (~5 falls/week) motivates the same fitting.
- **HDB dog rules**: 1 dog/flat from 62 approved SMALL breeds (Project ADORE exception) →
  only small/medium crates & beds matter for HDB.
- Real dimension tables gathered per item (cat tree 90–180 cm, base 40–60 cm; wall shelves
  24–30 cm deep, ≤60 cm jump spacing, stud/concrete anchors; litter boxes 46×36 → 56×46×41 cm
  covered; crates XXS-M for SG; rabbit hutch 135×60×90; hamster ≥100×50 floor; aquarium
  stands = load-rated steel/MDF).
- **CC0 verdict: inadequate** (one usable cat tree, scattered odds) → **procedural
  generation** is the route; fits the app's parametric machinery and the customizability
  requirement.

**Vehicles (from the codebase survey):**
| Class | Vehicle |
|---|---|
| Freestanding furniture | Catalog parametric primitives (PetBed.tsx pattern), `frontClearance` for access space |
| Wall-mounted (cat shelves/steps) | `mounted: true` + `mountHeight` param (decor wall-shelf pattern) |
| Window fittings (mesh screen, perch) | `windowBound: true` (curtain/blind machinery, zero new plumbing) |
| Doorway fittings (pet gate, pet-door insert) | **NEW `doorBound` flag + `snapToNearestDoor`** (clone of windowSnap; the only new placement plumbing) |
| Modular premium (cat tree with selectable modules) | Slot-configurator product |

**Category decision:** new **`pets` FurnitureCategory** (headline program, own tab; ~15
type-checker-guided edit sites, modelled on `kids`). Pet-type presets = `keywords`
('cat' | 'dog' | 'bird' | 'small-pet' | 'fish') + curated names; search + the tab give
the grouping with no new taxonomy.

**Flags:** `petFittings` (simple tier — placing pet furniture is core-loop) gating the
category tab content; `petCompliance` (simple) for the window-mesh/gate fittings if a
separate surface emerges. Both-modes tests per the hard rule.

**Program rules:** primitives pure + real metres + structurally sound; every def
paramSchema-customizable; visual verification per playbook (incl. one frame per item,
placement snapping proven for window/door fittings); docs + CHANGELOG + version bump per
commit; adversarial review at stage end.

---

## Stage P1 — Foundations + compliance fittings (the SG-differentiating stage)
- `pets` category across all ~15 Record sites + tests; `petFittings` flag.
- **Window/balcony mesh screen** (`windowBound`): parametric frame + fine mesh fill
  (visible ≤5 cm grid read), colour/frame finish params; snaps to any window like curtains.
- **Doorway pet gate** (NEW `doorBound` plumbing: `snapToNearestDoor` + flag threaded
  through usePlacementController/PlacementGhost/plan ghost): spans the door opening,
  height/style params (mesh/bars), walk-through door section optional param.
- **Pet-door insert** (doorBound variant at sill height, flap panel).
- Playpen (freestanding multi-panel, S→L presets).

## Stage P2 — Cat set
Cat tree (tiers/height/base params, sisal posts + plush platforms), wall shelves + steps +
bridge (mounted, depth/spacing correct), scratching posts (vertical/angled/pad), litter box
(open/covered) + concealment cabinet (ventilation cut-outs), window perch (windowBound),
tunnel. Modular cat tree as a configurator product (base + tier/house/hammock slots).

**P2 SHIPPED** 2026-07-17. Nine new `pets` defs (all keyworded `cat`): `cat-tree` (parametric
`CatTree` — 2–5 staggered plush platforms on sisal-wrapped posts that connect base→platform,
optional house cube + top perch; a shared ring-striped `sisalTexture.ts` canvas texture gives
the rope read, no bespoke art); `cat-wall-shelf`/`cat-wall-steps`/`cat-wall-bridge` (mounted +
`mountHeight`, one `CatShelves.tsx` module — a single ledge, a 3–5 step diagonal run with
count/rise/run, and two anchors + a slatted bridge span); `scratching-post` (vertical/angled/pad,
shared sisal read); `litter-box` (open ~46×36×10 / covered ~56×46×41 / top-entry, real dims,
`frontClearance`); `litter-cabinet` (bench carcass with a side entry hole + rear vent slots +
front door, wood finishes, interior sized for a covered box); `cat-window-perch` (`windowBound` —
`windowSnap.ts:windowFixtureProps` sizes it to the opening width and anchors it AT the sill via a
new `sillY` prop so it never covers the glass, brackets angle down to the wall); `cat-tunnel`
(`TubeGeometry` straight/S-curve fabric tube with rib rings). Modular cat tree as a
`CONFIGURABLE_PRODUCTS` entry (`cat-tree-modular`, category `pets`): sisal-post base + 3 tier
slots (platform/house/hammock, top tier also a cup perch), with `requires` constraints so a
hammock forces a solid platform on the tier below. Prices in `furniturePrices.ts`. Tests:
`defs/pets.test.ts` (P2 line-up/schema/flags), `placement/windowSnap.test.ts` (perch sizing),
`configurator/configurator.test.ts` (cat-tree compose/clamp/constraints/registry). Visual:
`scripts/scenarios/pets-p2.json` (cat corner, wall run, snapped window perch, configurator swap).

## Stage P3 — Dog set
Crates XXS-M (SG small breeds; wire + wood-top styles), bed variants (extend pet-bed),
feeding station (raised, single/double), ramp/steps (sofa/bed access), cooling mat
(noClip floor covering), toy storage bin.

## Stage P4 — Other pets
Bird cage + stand, play gym; rabbit hutch (135×60×90 default); guinea/hamster enclosure
(≥100×50); aquarium/terrarium stand (steel+MDF look, load-rating descriptive metadata,
tank-size params).

## Stage P5 — Presets, integration & polish
Pet-type keyword curation + catalog tab ordering; room-aware mapping (service yard/
balcony → pets surfaced); user docs page; showcase scenario (a pet-ready 4-room flat:
meshed windows, gated kitchen, cat wall run, litter in service yard); stage-end review.

**Status:** planned 2026-07-17. **P1 SHIPPED** 2026-07-17 — `pets` category across all
exhaustive Record sites + paw `CategoryIcon` + plan-cat colour; `petFittings` flag (simple
tier, gates the tab via `useUnifiedCatalog`'s `includePets`); pet-bed migrated decor→pets (id
unchanged); window/balcony mesh screen (`windowBound`, alpha-mapped canvas grid texture in
`primitives/meshGridTexture.ts` reading as ≤5 cm safety mesh); NEW `doorBound` plumbing
(`placement/doorSnap.ts:snapToNearestDoor`/`doorFixtureProps` + threaded through
usePlacementController/PlacementGhost/FloorPlanEditor); doorway pet gate + pet-door insert
(`doorBound`); freestanding playpen (4–8 panels). Tests: `doorSnap.test.ts`,
`defs/pets.test.ts`, `flags/petFittings.test.ts`, updated `categories`/`windowSnap` tests.
