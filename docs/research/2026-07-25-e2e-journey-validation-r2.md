# End-to-end blank-slate journey validation — round 2 (2026-07-25)

> **Goal.** Re-run the adversarial no-designer journey (round 1:
> `2026-07-19-e2e-journey-validation.md`) with special attention to what shipped
> since: the four **intake states** (BSJ-4), **BSJ-8 real 3D floor levels**
> (v0.24.0.2), and the **BSJ-2 3D refrigerant-trunking route** (v0.24.0.4) —
> plus a regression pass over the round-1 chain (MEP → circuits → aircon →
> score/checks → budget → handover → drawing set → trade packs).
>
> **Method.** One chained GPU scenario on a **custom starter plan**
> (`tpl-hdb-4room`) — `scripts/scenarios/e2e-blank-slate-journey-r2.json`
> (110 steps, 19 screenshots, `SHOT_GPU=1`) — plus three adversarial probe
> scenarios (trunking edge cases, floor-level abuse, Simple-mode gate) and an
> intake-matrix probe on the default flat, with structured probe data POSTed to
> a local HTTP sink per the playbook. Every PNG reviewed. App build v0.24.0.4.
> Shots: `/tmp/r13-e2e-shots/{main,adv,simple}/`.

---

## Overall verdict on the "no interior designer" promise

**HOLDS, and the round-1 breaks are fixed** — but the new 3D legs are
**starter-template-starved**. The chain bare shell → furnish → floor levels →
MEP/circuits → aircon + trunking → score → budget → handover → drawings →
trade packs runs end-to-end on a custom plan with the data agreeing at every
hop (panel ↔ budget ↔ RCP sheet lengths match exactly). Round 1's P1
(0 circuits linked) is gone — `suggestSwitchCircuits` links on the custom plan
and the electrician pack no longer lists the switching-schematic exclusion;
the condenser-collision P2 is gone (Clearance 100/100); the aircon panel now
reads "Installed as planned".

Two structural weaknesses remain on the last mile:

1. **The shipped starter templates have almost no internal doors and unroomed
   corridors**, so the room-graph features shipped since round 1 quietly
   degrade on exactly the plans a new buyer starts from: 3 of 4 trunking runs
   stay unresolved (the budget prices 10.4 m of a realistically ~40 m job) and
   a bath FFL offset can never emit a doorway step marker / 3D riser (P2-2).
2. **One P1 was found and fixed inline**: the printed RCP sheet dropped the
   modeled trunking overlay entirely (a placeholder roomId in
   `ui/drawingSet.ts` made every run unresolved in the print path only). One-line
   fix, tests + tsc green, re-verified on GPU (dashed route + "≈ 10m total" now
   print).

**Counts:** P1 = 1 (fixed inline) · P2 = 4 · P3 = 6. 0 crashes, 0 dead ends.

---

## Stage-by-stage verdicts

| # | Stage | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Smart Start intake states | **PASS** | `main/01`: all four states (bare / OCS / resale as-is / strip-out) with blurbs. Matrix probe (default flat): as-is keeps 87 items + captures baseline + restores leaves; strip-out keeps exactly the wet/kitchen fittings (stove, hood, shower, WC, basin, mirror), screeds dry rooms, removes leaves; bare = 0 items + 4 plumbing provisions + screed + absent leaves; OCS = bath fittings + vinyl bedrooms/living (SNV spec-matched; blurb wording says "porcelain living" — P3-4). |
| 1b | Intake on a custom plan | **PASS** | `main/03`: `applyBareBto` on `tpl-hdb-4room` writes screed onto dry rooms' own `room.floor`, keeps wet-room tiles, seeds WC/basin provisions, marks the master-bedroom leaf absent, captures `baselinePlan`. |
| 2 | Theme furnish from bare (custom plan) | **PASS** | `main/04`: `applyLayoutPreset('japandi')` furnishes via `furnishPlanItems` (76 items, 9 rooms). Score 70/100 vs round 1's 42 — the v0.22.2.102 preset guard holds; Clearance 100/100. |
| 3 | BSJ-8 floor levels — data + 2D | **PASS** | mbath −50 / cbath −30: FFL −50/−30 tags + waterproofing hatch on the dimensioned plan (`main/16` lower sheet, `main/17`), FFL rows in the tiler pack (`main/18`), module probe `floorOffsetAtPoint = −0.05`. |
| 3b | BSJ-8 floor levels — 3D | **PASS (template-limited)** | `main/07`: lowered floor + plinth under walls in the room editor; fittings re-seat with the floor (`adv/01`: at −1000 the basin/WC ride the floor down, plinth fills the gap). **No threshold riser can appear on this template — its baths have no doors** (P2-2); walk-mode Y-follow verified at module level only (see "Not fully verified"). |
| 4 | MEP + circuits (round-1 P1 recheck) | **PASS — fixed** | Scenario gate `window.__circ.linked > 0` passed on the custom plan; electrician pack no longer prints "No switching schematic" (assert step `assert-pack-chain`). |
| 5 | Aircon planner + **3D trunking** | **PASS (1 of 4 runs)** | `planAircon` places 4 FCU + 2 condensers, no collisions (checks clean, `main/13`). Router resolves the living run (10.4 m via yard → shelter → living, probe A); ducts render at ceiling height; DaylightPanel shows "Installed as planned" + "Trunking ~10 m … (modeled route)" (`main/10`). Bedroom system falls back to the advisory — template room graph, P2-2. |
| 5b | Trunking → budget | **PASS (consistent)** | `main/11`: "Air-conditioning trunking (piping run) 10.43 lin.m @ $20 = $209" — matches the modeled `totalLengthM` exactly (scenario asserts the equality). Waterproofing, M&E, aircon-unit lines all present; no NaN. |
| 5c | Trunking → RCP sheet | **PASS after inline P1 fix** | `main/16`: dashed route + legend "Aircon trunking route × 1 run ≈ 10m total (modeled — confirm with installer)". Before the fix the sheet printed nothing (P1-1). |
| 6 | Score / Checks / Handover | **PASS** | `main/12`: 70/100, Clearance 100 (round-1 P2-1 condenser collisions fixed). `main/13`: checks panel clean of aircon overlaps. `main/14`: key date 12 Jul 2027 → DLP countdowns + checklist. |
| 7 | Drawing set + trade packs | **PASS (minus P3-5)** | `main/15–19`: cover, RCP with trunking, dimensioned plan with FFL/waterproofing, tiler pack with waterproofing-zones + FFL tables, aircon pack with systems table. Aircon pack still carries only the generic trunking *advisory* and omits the RCP sheet (P3-5). |
| 8 | Simple mode | **PASS** | Probe: `airconSystem/airconTrunking/floorLevels/switchCircuits/waterproofing/drawings` all `false`; "Floor level (mm)" absent from the room inspector; a stored `floorLevelMm` does not move the 3D floor (flag-gated at `roomFloorOffsetM`). Core loop works: place + inspect + finish + budget HUD + share (`simple/01–04`). `budget` flag is default-off by design — see P3-6. |

---

## Findings

### P1-1 — Printed RCP sheet silently dropped the modeled trunking route **(fixed inline)**

**Symptom.** With 4 FCUs + 2 condensers placed and the DaylightPanel/budget
showing a modeled 10.4 m route, the captured drawing-set HTML contained no
trunking overlay, legend row, or length — the one sheet an aircon installer
would be handed had none of the data the budget charges for.

**Root cause (verified).** `ui/drawingSet.ts` passed each placed aircon item
as `{ defId, roomId: it.id, position }` with a comment claiming the placeholder
roomId "is never actually used". But `buildAirconTrunkingPlan`
(`analysis/airconTrunking.ts:597`) matches input FCUs to a system's served room
**by that roomId** (`input.fcus.find((f) => f.roomId === fcu.roomId)`), and
`resolveAirconTrunkingInput`'s `locate()` only derives the room from position
when `roomId` is undefined (`it.roomId ?? roomIdNearest(...)`). An item UUID is
truthy, so no input FCU ever matched → every run `resolved: false` → empty
overlay, print path only (the 3D renderer passes raw `FurnitureItem`s, which
carry no roomId). `rcp.test.ts` passes real room ids, so it never caught the
caller.

**Fix applied** (one-liner + comment): drop the placeholder —
`.map((it) => ({ defId: it.defId, position: it.position }))`. Verified: 4 test
files / 85 tests green, `tsc` green, GPU re-run prints the dashed route +
"≈ 10m total" (`main/16`).

### P2-1 — Deleting the condensers doesn't clear the modeled trunking

Probe C: with 4 FCUs placed and **both condensers deleted**,
`resolveAirconTrunkingInput` requires `placedFcus > 0 && placedCondensers > 0`
to use scene items, so it falls back to the **planner proposal for the whole
input** — the 3D ducts, RCP overlay and the $-carrying budget line keep showing
a route from condensers the user deliberately removed (probe C: still
`resolvedRuns: 1, total: 10.425`). The proposal fallback is right for the
nothing-planned-yet preview; it is wrong the moment the user has edited the
placed system. **Fix direction:** fall back only when NO aircon items are
placed at all; a partially-deleted system should drop to the advisory (or
surface "re-plan aircon"). Shot: `adv/01-adv-ducts-after-condenser-delete.png`.

### P2-2 — Starter templates starve the room-graph features (trunking + floor-level transitions)

The shipped `tpl-hdb-4room` has doors only on the entrance + master bedroom;
bedrooms/baths/kitchen have none, and the corridor is **unroomed** (`main/05`
shows the red unroomed overlay + door-less rooms). Consequences measured:

- Trunking: bedroom FCU runs can never path from the yard condenser (probe A —
  `h4-bed2/bed3/master` all `resolved: false`; only living resolves, 10.4 m via
  yard → shelter → living). The budget prices 10.43 lin.m of a realistically
  ~40 m job while *looking* exact ("10.43 lin.m @ $20").
- BSJ-8: `buildFloorTransitions` pairs rooms **via door openings**, so a bath
  FFL offset on this template emits FFL tags but **no step marker, no 3D
  threshold riser, and no kerb advisory anywhere** (probe L: `transitions: []`
  with mbath at +50 next to cbath at 0).

**Fix direction:** author full door sets (+ corridor rooms) into the starter
templates — they're data, not code — and/or teach the router + transition
builder to treat unroomed circulation space as a traversable pseudo-room.

### P2-3 — `planAircon` places 0 condensers with no advisory on a plan without a ledge/yard room

Probe D (`tpl-hdb-2room`, which has no serviceYard/ledge room): the proposal
says 2 systems / 2 condensers, `planAircon` returns
`{ fcus: 2, condensers: 0, advisories: [] }` — FCUs appear, condensers silently
don't, and `ledgeWeightNote` still reads "2 condensers ≈ 60 kg total on one
ledge …" for a ledge that doesn't exist. All trunking unresolved. **Fix
direction:** when no condenser room resolves, push an advisory ("no AC
ledge/service yard on this plan — add one, or confirm external bracket
mounting") and suppress/reword the ledge weight note. Shot: `adv/02-adv-2room-aircon.png`.

### P2-4 — `floorLevelMm` accepts absurd values with no clamp or advisory

The RoomInspector field only rounds (`Math.round`, `RoomInspector.tsx:144`) and
`roomFloorOffsetM` divides raw mm by 1000 — `−1000` renders a clean-looking
1 m pit (fittings re-seat down, plinth fills the wall gap; walk mode would
smooth-step 1 m down "as a slope-free step"). A typo (−500 for −50) produces an
absurd but plausible-looking section with no warning, and the kerb/step
advisory can't fire on door-less templates (P2-2). **Fix direction:** clamp or
soft-warn outside a sane band (SG practice ≈ ±150 mm), in the inspector and/or
`floorLevels.ts`. Shot: `adv/01-adv-mbath-minus-1000mm.png` (vs
`adv/02-adv-mbath-plus-50mm.png` for the sane +50 case).

### P3-1 — Moving an FCU out of its served room silently zeroes the modeled route

Probe B: moving the living FCU into Bedroom 2 → **all** runs unresolved,
`totalLengthM: 0` — the trunking line vanishes from the budget and the panel
reverts to the advisory with no hint that the moved FCU no longer matches the
system plan. Consistent (no phantom data), but invisible. Suggest a per-run
"FCU is outside its served room — re-plan aircon" note.

### P3-2 — Three stale "doesn't move the 3D floor" copy sites contradict BSJ-8 3D

`RoomInspector.tsx:149-151` ("Documentation only … doesn't move the 3D floor"),
`floorplan/floorLevels.ts:4-6` module doc, and the `floorLevels` entry comment
in `features/flags/registry.ts:1792` all still describe the pre-v0.24.0.2
documentation-only behaviour. Shot `main/06` shows the wrong helper text under
the live field. One-line copy fixes.

### P3-3 — No FFL feedback in the interactive plan editor

After setting a floor level, the editor canvas shows nothing (`main/05` — the
Master Bath label shows provisions but no FFL pill); the tags exist only on the
printed dimensioned plan + tiler pack. A user can't see which rooms carry
offsets without selecting each room. Suggest reusing the print `FFL ±N` tag on
the editor room label (flag-gated like the field).

### P3-4 — OCS blurb promises "porcelain living"; the SNV default seeds vinyl

Deliberate spec-match (`ocsStarter.ts:52-55` — the SNV OCS photo shows vinyl
throughout; the generic category map keeps porcelain for other projects), but
the wizard blurb states the generic claim unconditionally. Reword per-plan or
generically ("project-spec floors in living/bedrooms").

### P3-5 — Aircon trade pack never carries the modeled trunking

`ui/tradePacks.ts:400` prints only `systems[0].trunkingNote` (the generic
advisory) and the pack's sheet list is Floor plan + Electrical plan — the RCP
sheet (A-11) with the actual dashed route + length isn't referenced even when
runs resolve (`main/19`). Also cosmetic: the tiler's "+ Tile setting-out point"
legend prints on the aircon pack's floor-plan sheet. Suggest adding the RCP
sheet to the aircon pack + per-run modeled lengths in its reference block.

### P3-6 — `budget` flag defaults off while docs call budget part of the Simple core loop

`registry.ts:37-43` (`default: false` — "not production-ready") means a Simple
user gets no budget surface at all on a clean boot (probe H: flag false, HUD
absent until the flag is forced). CLAUDE.md and the registry header both name
budget in the minimal core loop. Either flip the default when the surface is
ready or align the docs.

---

## Round-1 regression check (what got fixed and stayed fixed)

- **r1 P1 (circuits linked 0)** — fixed (v0.22.2.102 room-probe): linked > 0 on
  the custom plan; electrician pack exclusion gone.
- **r1 P2-1 (condenser collisions)** — fixed (collision-slide): Clearance
  100/100, checks clean (`main/12`, `main/13`).
- **r1 P2-2 (japandi scores 42/F)** — improved to 70/100 via the theme score
  guard; remaining low scores are Circulation 38 + Daylight 22, both largely
  template-window-driven, 0 blocking.
- **r1 P3-2 (panel says "Proposed" after placement)** — fixed: "Installed as
  planned — 2 condensers driving 4 indoor units" (`main/10`).
- **r1 P3-3 (non-cooled rooms inflate whole-home BTU)** — improved: non-cooled
  rooms are collapsed behind "Show all rooms (+5 non-cooled)" and the total now
  reads "installed capacity" of the proposal (90,000 BTU).
- Budget chain (waterproofing / M&E / aircon / contingency / SG bands) intact.

## Not fully verified (and why)

- **Walk-mode Y-follow across a threshold** — verified at the module level
  (`floorOffsetAtPoint` returns −1.0 in the sunken bath; `FirstPersonCamera`
  consumes it per-frame per v0.24.0.2) and walk mode itself works (camY 1.6 at
  spawn), but headless WASD path-driving into the door-less template bath was
  not deterministic, so no screenshot shows the camera dipping. Suggest a
  follow-up guard scenario on a door-ful custom plan.
- **OCS intake on a custom plan** (`buildOcsFloorFinishesForPlan` path) — only
  the default-flat OCS path was probed; bare/strip-out/as-is were probed on
  both.
- **Furniture re-seat asserted visually only** (fittings ride the floor in
  `adv/01`/`main/07`) — no scene-graph Y probe.

## Gates

`src/ui/drawingSet.ts` one-line fix: targeted vitest (drawingSet, rcp, rcpSvg,
renovationAllocator.airconTrunking — 85 tests) green, `tsc --noEmit` green,
Biome clean. New reusable scenario
`scripts/scenarios/e2e-blank-slate-journey-r2.json` ran green end-to-end
(110/110 steps) on GPU. Adversarial scenarios live in the session scratchpad
(`/tmp/r13-adv-*.json`, `/tmp/r13-simple-mode.json`, `/tmp/r13-intake-matrix.json`);
probe data in `/tmp/r13-probe.log`.
