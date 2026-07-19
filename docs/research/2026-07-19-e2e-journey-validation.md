# End-to-end blank-slate journey validation (2026-07-19)

> **Goal.** Play a new SG BTO owner (no interior designer) and drive the ENTIRE
> journey — bare shell → surfaces → theme/furnish → systems (MEP/circuits/aircon)
> → decision support → outputs — as **one continuous GPU-harness session**, then
> judge whether the promise ("design your home fully without an interior
> designer") holds as a **connected flow**, not as isolated features.
>
> **Method.** One chained scenario (`scripts/scenarios/e2e-blank-slate-journey.json`,
> 99 steps, 16 screenshots, `SHOT_GPU=1`) drove the whole journey in a single
> browser session; print docs (drawing set + trade packs) were captured into
> window vars and rendered last (a `document.write` destroys the app). State
> assertions and root-cause probes were captured via three focused eval scenarios
> (`scratchpad/diag-*.json`). Every PNG was read and reviewed. App build v0.22.2.100.
> Shots: `…/scratchpad/shots/e2e/`.

---

## Overall verdict on the "no interior designer" promise

**HOLDS, with one broken bridge and one collision bug.** A first-time owner can
go bare → furnished → systems → budget → drawings → handover as a genuinely
connected flow: the money, waterproofing, floor levels, aircon and handover data
all chain correctly from stage to stage. Two connections are real gaps for the
"hand over directly to contractors" last mile:

1. **The switching schematic never materialises** — the one-click "Suggest
   circuits" links **0** switches to lights, so the electrician pack still tells
   the owner to do it themselves and the drawing set has no circuit tags (P1).
2. **The aircon planner drops condensers on top of existing outdoor furniture**,
   producing overlaps that also drag the design score (P2).

Neither blocks the overall journey; both undercut the professional-handover claim.

**Counts:** P1 = 1 · P2 = 2 · P3 = 3. **0 BLOCKING clearance issues.** No crashes,
no dead ends, no horizontal-scroll leaks. No inline fixes applied (see "Micro-fixes").

---

## Stage-by-stage verdicts

| # | Stage | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Wizard → intake | **PASS** | `01`: Smart Start shows 4 starting states (New BTO — bare / OCS / Resale as-is / strip-out) + a Design-themes gallery. Clean, self-explanatory. |
| 2 | Bare shell | **PASS** | `02`: grey screed shell, no furniture, no internal door leaves, main door leaf present. `applyBareBto` → 0 items, `mainBedroom` floor = `floor-screed`, `door-mainBedroom` leaf = `none`. |
| 3 | Surfaces | **PASS** | `03`: bedroom vinyl + living porcelain (`floor-tile-white`) + living feature wall (`wall-fluted-oak`) applied; bath floor level set to −50 mm via `updateRoom`. |
| 4 | Theme + furnish | **PASS (furnishing works from bare)** | `04`: bare → `applyLayoutPreset('japandi')` furnishes every room (sofa/TV/dining/beds/wardrobes/kitchen). Furnishing from the bare state works. *Caveat P3-1: theme overwrites the step-2 surfaces.* |
| 4b | Adjust a room | **PASS** | `05`: moved a living-room sofa; edit committed. |
| 5 | Systems — aircon | **PASS** | `06`: per-room cooling load + "Aircon system" proposal — 2 condensers / 4 FCU (Single-split Living + System-3 bedrooms), connected-load %, ~78 kg vs ~110 kg ledge check, trunking note, "Plan aircon" action. `planAircon` placed 4 FCU + 2 condensers. |
| 5 | Systems — MEP/circuits | **FAIL (P1)** | `07`,`15`,`16`: `suggestMepPoints` placed 29 electrical + 9 plumbing points, but `suggestSwitchCircuits` linked **0** circuits. No circuit tags anywhere downstream. |
| 6 | Decision — Design score | **PASS (reveals P2)** | `09`: 42/100 (F). The low score is legitimate signal — 3 overlaps + 1 in-wall are the aircon-condenser collisions (P2-1); lighting/daylight reflect the plan + preset. |
| 6 | Decision — Checks | **PASS** | `10`: 0 BLOCKING · 3 overlaps · 1 in-wall · 54 walkways · 82 clear. All overlaps/in-wall are aircon condenser vs outdoor furniture (P2-1). |
| 6 | Decision — Reno budget | **PASS (strong)** | `11`: $40,360 vs $60k target. Trade lines: masonry/tiling, **waterproofing membrane** (BSJ-7), flooring, carpentry, painting, M&E (48 pts), **Air-conditioning 4 units** (BSJ-2), plumbing fixtures, +10% contingency, SG reference bands. **No hacking line** (bare-BTO baseline = shell). Fully connected. |
| 6 | Decision — Reno timeline | **PASS** | ICS export present (File → Reno timeline). Not screenshot-meaningful headless. |
| 6 | Handover / DLP | **PASS** | `12`: key date 12 Jul 2027 drives DLP-end (12 Jul 2028), ceiling-leak (2032), spalling (2037) countdowns + tickable 81-item move-in checklist. |
| 7 | Output — master drawing set | **PASS (minus circuits)** | `13`,`14`,`15`: cover + dimensioned plan with **waterproofing hatch + "FFL −50" + "50 mm step + transition strip"** (BSJ-7/8), electrical/plumbing points sheets with mount heights, finish schedule, bare-BTO WC provisions on the plumbing sheet. Electrical sheet has **no circuit tags** (consequence of P1). |
| 7 | Output — trade packs | **PASS (minus circuits)** | `16`: Electrician pack = recipient cover + socket advisory + mount-height table + DB note + master sheet numbering. **But** "Not included": *"No switching schematic — link switches to the lights they control first (5 lights unlinked)"* — the exclusion the brief expected to be GONE after step 4 (P1). |

---

## Findings

### P1 — "Suggest circuits" links nothing; switching schematic never appears

**Symptom.** In the connected flow (bare → japandi → Pro → suggest MEP → suggest
circuits → plan aircon), `suggestSwitchCircuits()` returns `{ linked: 0 }` even
though the plan then holds **8 light switches** and **16 lights**. Downstream:

- Master drawing electrical sheet (`15`): no `S1`/`L1` circuit tags; the socket
  advisory prints *"5 lights have no switch assigned. 8 switches control no lights."*
- Electrician trade pack (`16`): *"Not included / to complete first — No switching
  schematic … (5 lights unlinked)."* This is exactly the exclusion the brief said
  should disappear after step 4.

**Root cause (verified).** `suggestCircuitLinks` (`src/floorplan/switchCircuits.ts`)
links, per room, the nearest-to-door switch to that room's lights — but only for
switches that pass `pointInRoom(room, s.x, s.z)`. `suggestMepPoints` derives its
switches from `src/furniture/mepSuggest.ts:57-72`, which places each switch at
`wall.start + u·(offset + width + 0.15)` — i.e. **exactly on the wall centreline,
with no perpendicular nudge into a room** (the code comment claims "just inside
each door, nudged off the centreline", but the nudge is only *along* the wall).
Diagnostic (`scratchpad/diag-circuits.json`) confirms: `perRoom` shows `sw: 0` for
**every** room while lights ARE in rooms (Main Bedroom 6, Living 4, …), so no room
ever contains both a switch and a light → `linkMap.size === 0`.

The seeded scenario `switch-circuits-bsj3.json` passes only because it hand-places
its switch *inside* a room; the realistic auto-suggest path never does.

**Why not fixed inline.** The fix needs a room-side heuristic (which of the door's
two rooms owns the switch, or a boundary tolerance in `suggestCircuitLinks`) — a
design decision, and `src/furniture/mepSuggest.test.ts:69` explicitly asserts the
on-wall placement (`{ x: 1.95, z: 0, kind: 'switch' }`). Filed for a focused change,
not a validation-pass drive-by.

**Recommended fix (either):** (a) in `mepSuggest`, nudge the switch ~0.2 m
perpendicular into the room the door serves (prefer the non-circulation side),
updating the test; or (b) in `suggestCircuitLinks`, match a switch to a lit room
when it is within a small margin of the room boundary (only lit rooms are linked,
so a corridor switch attaches to the adjacent lit room). Shots: `15`, `16`.

### P2-1 — Aircon planner drops condensers onto existing outdoor furniture

`planAircon` (BSJ-2, `analysis/airconPlacement.ts`) placed 2 condensers on the AC
ledge / service yard where outdoor furniture already sat, producing **3 overlaps**
("Outdoor table/chair overlaps Aircon condenser (outdoor)") and **1 "Outdoor table
is inside a wall"** in Clearance checks (`10`). Placement is not collision-aware.
Recommend clearing/collision-checking the condenser footprint on the ledge. Shots:
`10`, and it is the sole driver of the score's clearance penalty below.

### P2-2 — Smart-Start theme furnishing fails the app's own checks (42/100, F)

The bare→japandi→systems result scores **42/100** (`09`): Clearance 40 (the P2-1
condenser overlaps + in-wall), Circulation 0 (4 impassable pinch-points < 0.5 m +
advisory gaps), Daylight 40, Lighting coverage 40 ("6 rooms without a light
fixture"). This is the same class as the already-fixed **UXW-P2-3** — which only
hardened the `moveIn` default; **other gallery presets (japandi) still furnish
below the app's own bar** and under-light most rooms. 0 BLOCKING, so it degrades
credibility rather than function. Recommend running preset furnishings through the
arranger's clearance/lighting pass (or asserting each preset's score in a test).

### P3-1 — Theme apply silently overwrites user-set surfaces

Setting surfaces (step 2) then applying a theme (step 3) overwrites `finishes.floor`
and `finishes.walls` for the 5 `PRESET_ROOMS` to the theme's palette (verified:
`floor-screed`/user-vinyl → `floor-wood-oak`; walls → `wall-paint-warm`). This is
arguably intended (the wizard says "we'll finish the walls & floors to match"), but
a user who deliberately set surfaces first loses them with **no warning**. The
task's stage ordering (surfaces → theme) is the "wrong" order for the app; the
natural order is theme-first. Recommend either a note in the wizard or a
non-destructive merge that keeps user-touched rooms.

### P3-2 — Aircon panel shows "Proposed" after the units are placed

After `planAircon` places 4 FCU + 2 condensers, the Daylight panel's Aircon section
still reads "Proposed multi-split systems" with a "Plan aircon" button (`06`) — no
indication the units are already in the scene. Data IS connected (the budget line
correctly reads 4 placed FCUs); only the panel's label doesn't reflect applied
state. Minor.

### P3-3 — Cooling load lists non-cooled rooms with a 9,000 BTU size

Household Shelter and Service Yard each show a 9,000 BTU sizing badge (`06`) though
they're (correctly) excluded from the actual system proposal, so "Whole home ≈
102,000 BTU installed capacity" overstates what will be installed. Cosmetic.

---

## What the connected flow gets RIGHT (positives)

- **Bare → furnished works** (`02`→`04`): furnishing runs cleanly from the bare shell.
- **Reno budget is the strongest bridge** (`11`): waterproofing membrane (BSJ-7),
  Air-conditioning 4 units (BSJ-2), M&E 48 points (from suggest), flooring/painting
  from finishes — all derived from the design's own quantities, with the hacking
  line correctly **omitted** for a bare BTO (baseline = shell).
- **FFL + waterproofing chain into the master set** (`14`): the dimensioned plan
  carries the wet-area hatch, "FFL −50", and the "50 mm step + transition strip"
  doorway marker.
- **Intake → drawings**: bare-BTO WC/basin provisions appear on the plumbing sheet (`15`).
- **Handover date → warranty math** (`12`): one date drives DLP/ceiling-leak/spalling
  countdowns.
- No stale-data desyncs beyond the P3-2 label; the aircon *quantities* propagate to
  the budget correctly.

---

## Micro-fixes applied

**None.** Every finding is larger than the "stale-data wiring / broken label" bar the
brief scoped inline fixes to. P1 in particular needs a room-ownership heuristic that a
shipped unit test pins against (on-wall switch placement), so it belongs in a focused
change, not a validation pass.

## Gates

No product source was modified, so `tsc`/tests/biome are unaffected. The one added
artifact is the reusable interaction scenario
`scripts/scenarios/e2e-blank-slate-journey.json` (valid JSON; ran green, 99/99 steps).
Diagnostic scenarios live in the session scratchpad (temporary).
