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

**P3 SHIPPED** 2026-07-17. Six new `pets` defs (all keyworded `dog`): `dog-crate`
(`DogCrate` — a `size` enum XXS/XS/S/M driving researched dims via the exported
`CRATE_SIZES` table, XXS 41×28×23 → M 61×46×51 cm; `style` enum `wire` — bright metal
bars on all four sides + roof over a moulded plastic tray, a barred front door + latch,
via `metalLeg` — or `furniture`, a wood-top side-table crate with an overhanging timber
top, corner posts, vertical wood slats and a slatted front door + knob; `frontClearance`
for access); `dog-bed-orthopedic` (`DogBedOrthopedic` — **a distinct def, not a pet-bed
shape**: a low chamfered memory-foam mattress slab in matte fabric with a back-headrest or
three-side U bolster, `width`/`depth` footprint params — see the bed-variant judgment
below); `pet-feeding-station` (`FeedingStation` — a timber stand on four legs carrying 1–2
recessed stainless bowls via `getMetalMaterial`, `standHeight` small→medium dog,
`frontClearance` 0.4); `dog-ramp` (`DogRamp` — a `style` enum ramp/steps, `height` 0.4–0.7
for sofa/bed access, carpet-read `getFabricMaterial` tread, optional side rails; `ramp` is
an inclined board on side skirts + a high-end support, `steps` are carpeted box steps at a
~16 cm rise; footprint tracks `width`/`length`); `pet-cooling-mat` (`CoolingMat` — a
`noClip` flat gel pad mirroring the rug's flat-covering placement, ~8 mm thick, S/M sizes,
gel-blue/grey colour, quilted channel seams, smooth low-roughness `getSolidMaterial` gel
read); `pet-toy-bin` (`PetToyBin` — a small open woven basket, round or rectangular, woven
read via the shared `getFabricMaterial` weave — no bespoke texture art — with an optional
lid, `width`/`depth`/`height` params). Prices in `furniturePrices.ts`. Tests:
`defs/pets.test.ts` (P3 dog line-up, crate size enum + `CRATE_SIZES` envelope, noClip mat,
orthopedic-vs-pet-bed distinctness, feeding-station/ramp schema). Visual:
`scripts/scenarios/pets-p3.json` (the dog corner — furniture + wire crate, orthopedic bed,
double feeder, ramp reaching a sofa seat, cooling mat, toy bin; corner-wide + crate-closeup
+ ramp-to-sofa + mat/feeder/bin frames).

**Bed-variant judgment:** added a **new `dog-bed-orthopedic` def** rather than extending
`pet-bed`'s `shape` enum. Two reasons: (1) the pet-fittings append-only constraint for this
stage forbids editing the existing `pet-bed` def; (2) an orthopedic bed's silhouette — a
thick, low, matte memory-foam mattress with a single/U bolster — is genuinely distinct from
`pet-bed`'s round basket and 3-side plush mat, so a dedicated `DogBedOrthopedic` primitive
reads cleaner than overloading `PetBed`'s if/else, and it is not a near-duplicate (different
material read, proportions and bolster axis).

## Stage P4 — Other pets
Bird cage + stand, play gym; rabbit hutch (135×60×90 default); guinea/hamster enclosure
(≥100×50); aquarium/terrarium stand (steel+MDF look, load-rating descriptive metadata,
tank-size params).

**P4 SHIPPED** 2026-07-17. Six new `pets` defs, each keyworded by pet type: `bird-cage`
(`BirdCage` — a wire cage on a `mount` enum stand/tabletop; `shape` enum `dome` — a cylinder
of vertical bars + hoops capped by a clean domed roof of bars converging to a finial — or
`rect` — 4 barred sides under a flat roof; `size` S/M via the exported `BIRD_CAGE_SIZES` table;
a moulded seed tray + interior perch dowels, tripod pedestal; wire via `metalLeg`);
`bird-play-gym` (`BirdPlayGym` — a small tabletop playstand: tray base, two uprights carrying a
wood top perch, a diagonal ladder + two hanging rings); `rabbit-hutch` (`RabbitHutch` — a raised
two-zone hutch, default 135×60×90, `width`/`depth`/`height` clamped; an enclosed timber sleeping
box with a pitched roof beside an open wire run on four legs — "solid box + wire cage" reads from
any angle; wood carcass + `metalLeg` bars); `small-pet-pen` (`SmallPetPen` — an open-top C&C grid
pen, `gridsX`×`gridsY` integers 2–6 over the exported `CC_GRID_CELL` 0.36 m cell, ≥2×3 min ≈
41×27 in; grid-lattice walls + a coloured coroplast liner tray); `hamster-tank` (`HamsterTank` —
a glass tank ≥100×50 at Medium via `HAMSTER_TANK_SIZES`, `size` S/M + `base` floor/stand; a black
frame, a wire-mesh lid, a bedding line + an interior wheel & dome hideout; transparent glass shell
like the decor `Aquarium`); `aquarium-stand` (`AquariumStand` — a steel-frame + MDF-cabinet stand
carrying a water-filled glass tank over a gravel bed with planted stems; `tankLength` enum
0.6/0.9/1.2 m via `AQUARIUM_TANK_DIMS` drives the stand dims, `doors` toggles the cabinet leaves;
**load rating surfaced descriptively** via a new optional `FurnitureDefBase.description` field
rendered as a muted line atop the inspector's `ParametricBody`). Prices in `furniturePrices.ts`.
Tests: `defs/pets.test.ts` (P4 line-up, per-pet keywords, cage shape/mount, hutch 135×60×90
envelope, C&C 2×3 min, hamster ≥100×50, aquarium load-note + tank-length dims). Visual:
`scripts/scenarios/pets-p4.json` (the small-pets room — bird cage on stand + play gym, rabbit
hutch, C&C pen, hamster tank on a stand, aquarium against a wall; room-wide + aquarium/cage/hutch
closeups). New `description` field: `FurnitureDefBase.description?` (types.ts) + a muted inspector
line (`ParametricBody.tsx`).

## Stage P5 — Presets, integration & polish
Pet-type keyword curation + catalog tab ordering; room-aware mapping (service yard/
balcony → pets surfaced); user docs page; showcase scenario (a pet-ready 4-room flat:
meshed windows, gated kitchen, cat wall run, litter in service yard); stage-end review.

**P5 SHIPPED** 2026-07-17 — presets, integration & polish (the final stage). **Keyword
curation:** every `pets` def now carries ≥1 pet-type keyword (`dog`/`cat`/`bird`/`rabbit`/
`guinea-pig`/`hamster`/`fish`/`small-pet`) plus functional descriptors; the compliance
fittings match EVERY pet type they serve (the window mesh screen now keywords `cat`+`dog`+
`bird` — CMF cat containment but also dog/bird fall-safety — and the playpen adds `rabbit`+
`small-pet`), so a search for any served pet surfaces the compliance item. **Within-tab
ordering:** `PETS_DEFS` is reordered so the catalog tab reads compliance/safety fittings first
(mesh screen → gate → door insert → playpen), then per-pet clusters (dog set incl. the shared
dog/cat pieces → cat set → birds → small pets → fish); the built-in catalog preserves object
key order so the array order IS the tab order. **Room-aware mapping:** `roomAwareCategories.ts`
surfaces `pets` prominently (2nd, after `outdoor`) for the `balcony` RoomKind — the classifier's
bucket for BOTH balconies AND service/utility yards (no distinct service-yard RoomKind exists,
and inventing one is forbidden, so the closest existing kind is mapped + the limitation noted in
code). **User docs:** new `docs/user/pet-fittings.md` (SG compliance context — CMF meshing, ≤5 cm
aperture, 31 Aug 2026 transition, HDB 1 dog/≤2 cats; how window mesh snaps to windows, gate/insert
snap to doors; a per-pet-type tour), registered in the VitePress sidebar under "Designing".
Tests: `defs/pets.test.ts` (keyword-coverage matrix — every def has a pet-type keyword, each
pet-type search returns its expected set, functional litter/mesh/gate searches, cluster ordering)
+ `ui/catalog/roomAwareCategories.test.ts` (balcony/service-yard surfaces pets prominently, full
ordering stays a duplicate-free permutation). Visual: `scripts/scenarios/pets-showcase.json` (a
pet-ready 4-room flat: CMF mesh on every window, a mesh pet gate spanning the kitchen/service-yard
doorway, a cat wall run + tree in the living room, a litter cabinet + covered box in the service
yard, dog bed + raised feeder; frames — whole-flat orbit wide, living cat-run + tree, kitchen
doorway gate, service-yard litter). No new module (docs page + scenario only); root/area docs
unchanged (no new system).

**Status:** planned 2026-07-17. **P1 SHIPPED** 2026-07-17 — `pets` category across all
exhaustive Record sites + paw `CategoryIcon` + plan-cat colour; `petFittings` flag (simple
tier, gates the tab via `useUnifiedCatalog`'s `includePets`); pet-bed migrated decor→pets (id
unchanged); window/balcony mesh screen (`windowBound`, alpha-mapped canvas grid texture in
`primitives/meshGridTexture.ts` reading as ≤5 cm safety mesh); NEW `doorBound` plumbing
(`placement/doorSnap.ts:snapToNearestDoor`/`doorFixtureProps` + threaded through
usePlacementController/PlacementGhost/FloorPlanEditor); doorway pet gate + pet-door insert
(`doorBound`); freestanding playpen (4–8 panels). Tests: `doorSnap.test.ts`,
`defs/pets.test.ts`, `flags/petFittings.test.ts`, updated `categories`/`windowSnap` tests.
**P2 SHIPPED** + **P3 SHIPPED** 2026-07-17 (see the per-stage notes above).
