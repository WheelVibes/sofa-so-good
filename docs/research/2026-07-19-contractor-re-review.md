# Contractor re-review of the handover package (2026-07-19)

> Second-pass review by a skeptical Singapore renovation contractor / HDB-registered
> builder, receiving the app's complete handover package for a 4-room BTO job. Follows the
> 2026-07-18 "ship it" review; re-runs the FULL package end-to-end after the substantial
> additions since then (style/material-aware D/W schedule marks, plan-wide mark numbering,
> MEP socket advisories + DB note, RCP ceiling-clearance notes, hackability data, floor-
> loading advisory, DLP tracker, reno-rules pack, new door styles in plans/DXF, roof on
> landed templates, RM4 default layout, OCS starter states).
>
> Method: generated the complete drawing set + DXF via the real app machinery (store +
> `openDrawingSet` window.open-intercept, `planToDxf`) on TWO non-default plans to stress the
> new paths — a single-storey **HDB 5-Room** (sliding + double doors, grille window, tray
> ceiling, authored MEP) and a **Landed Terrace** (multi-storey + gable roof + BCA permit
> path, sliding/double doors on kitchen/service-yard). Read every captured sheet page-by-page
> and spot-checked dimensions numerically against the live FloorPlan model.
>
> Capture harness: `scripts/_contractor_capture.mjs`, `scripts/_contractor_demo_capture.mjs`
> (scratch, not committed). Sheet PNGs + raw HTML/DXF/plan JSON under
> `scratchpad/shots/contractor-r2/` and `scratchpad/capture/`.

## Verdict: **SHIP IT** (with a short punch list, none blocking)

The package is genuinely buildable. The document set is complete and internally consistent:
the door/window schedule, the on-plan D/W callouts, and the DXF marks agree with each other on
BOTH a single-storey and a multi-storey plan — including the hard case (a same-spec door
repeated across floors collapses to one mark with the right quantity). Dimensions are in mm
with AFFL/sill heights, a real setting-out datum drives the dimensioned plan, MEP sheets carry
provenance + mount heights + an SG-accurate DB note, and the permit-note block branches
correctly across HDB / Condominium / Landed. One genuine defect was found and **fixed inline**
(see below); the remainder are polish, not build-blockers.

This is a clear step up from the 2026-07-18 pass: the new style/material schedule columns and
the plan-wide multi-storey numbering are the two things that previously would have forced me to
phone the designer, and both now hold up.

## Sheet inventory captured

- **HDB 5-Room** — 19 sheets: Cover · Floor plan · Wall elevations 1–8 · Lighting · RCP ·
  Dimensioned plan · Section A–A · Electrical · Plumbing · Finishes schedule · FF&E schedule ·
  Door & window schedule.
- **Landed Terrace** — 22 sheets: Cover · Floor plan (Ground + Upper) · Wall elevations 1–9 ·
  Lighting (Ground) · RCP (Ground + Upper) · Dimensioned plan (Ground + Upper) · Section A–A ·
  Electrical (Ground) · Finishes · FF&E · Door & window schedule.
- **Demolition sheet** — captured separately (needs a baseline diff; a fresh template has
  nothing to demolish), with walls classified rc-partition / drywall / load-bearing.

## Numeric spot-checks (computed from the FloorPlan model → schedule mm)

All verified against `capture/*-plan.json`:

| # | Item | Model | Schedule prints | ✓ |
|---|------|-------|-----------------|---|
| 1 | 5R D1 main door | w 0.9 m, head 2.1 − sill 0 | 900 × 2100 mm | ✓ |
| 2 | 5R W1 kitchen (grille) | w 1.8 m, head 2.1 − sill 0.95 | 1800 × 1150 mm, sill 950 | ✓ |
| 3 | 5R W4 living | w 2.2 m, 2.1 − 0.95 | 2200 × 1150 mm | ✓ |
| 4 | 5R D4 double | w 1.6 m | 1600 × 2100 mm | ✓ |
| 5 | 5R W3 master-side | w 1.6 m | 1600 × 1150 mm | ✓ |
| 6 | Terrace D5 upper bath doors | w 0.8 m | 800 × 2100 mm | ✓ |
| 7 | Terrace W1 living | w 2.0 m | 2000 × 1150 mm | ✓ |
| 8 | RCP tray clearance (5R living) | 2.60 m ceiling − 0.15 m drop | FFL→false ceiling 2450 mm | ✓ |

## Schedule ↔ plan ↔ DXF consistency (the headline result)

**Style/material grouping is correct.** Two same-size doors of different styles split into
separate marks: 5-Room D1 (Panel · Painted) vs D2 (Flush · Painted), both 900 × 2100, are
distinct rows; the grille window is its own mark vs the plain ones. The schedule prints a
"Style / material" column ("Sliding · Wood", "Double · Painted", "Grille", …) — enough to
order the actual products.

**Plan-wide multi-storey numbering holds.** On the Terrace, the ground powder-room door and the
three upper-storey bedroom doors are all the same spec (Panel · Painted, 900 × 2100) and
correctly collapse to **one mark D2 ×4** — visible as "D2" on the ground-floor plan AND on all
three upper-storey doors. Upper bath doors read D5 ×2. This is the H1-F fix working end-to-end:
an upper-floor opening continues the ground numbering instead of restarting.

**DXF agrees with the schedule.** The DXF exports the ground storey only and stamps the
ground openings with their plan-wide marks (Terrace DXF: D1, D2, D3, D4, W1 ×2, W2). D2 in the
DXF is the ground powder door — the same mark the schedule assigns it — so a fabricator opening
the DXF and a builder reading the PDF schedule see the same label on the same door. Upper-storey
marks (D5/W3/W4) correctly never appear in the ground-only DXF.

## New advisories judged as a contractor

- **Hackability overlay vs demolition sheet.** Both now derive from ONE classifier
  (`wallHackability.ts:isDemolitionRestricted`). A demolished **rc-partition** (reinforced-
  concrete partition) is flagged **NOT PERMITTED** on the demolition sheet, matching the
  overlay — this was a real mismatch before this review and is the inline fix below. Verified
  by capturing a demolition sheet with an rc-partition wall demolished: it renders red +
  "NOT PERMITTED — structural (load-bearing / RC)", the kept load-bearing wall renders heavy,
  and a demolished drywall renders as an ordinary (permit-only) partition. This is the document
  HDB reviews, so under-flagging an RC partition was safety-relevant.
- **DB note is accurate.** The electrical sheet's socket-advisory block ends with "DB load: 40 A
  single-phase supply is common in older HDB blocks; upgrading to 63 A requires SP Group
  approval." Correct for SG practice.
- **MEP provenance + heights.** Authored points print "Points as designed — heights in mm AFFL"
  with an "@1200"/"@2400" mount-height suffix per symbol; the plumbing sheet mirrors it. Invalid
  point kinds are silently dropped (a `kind:'sink'` I fed it was correctly ignored — valid
  plumbing kinds are water-point / drainage / floor-trap / soil-pipe / water-heater).
- **Permit paths / reno-rules pack.** `permitNotes()` branches HDB (written permit before ANY
  demolition, load-bearing off-limits, PE for RC, LEW, PUB, weekday hours) / Condominium (MCST
  approval + BCA/PE for structural) / Landed (no HDB/MCST — BCA-direct, PE for structural).
  Covers what I'd need to know before filing. The Landed cover sheet's general notes correctly
  state the BCA-direct path.

## Punch list (ranked by build-impact)

### P1 — fixed inline this pass
1. **Demolition sheet did not flag rc-partition demolition as NOT PERMITTED** (safety). Only
   `structure === 'load-bearing'` escalated; an `rc-partition` demolition rendered as a routine
   permitted partition removal, contradicting the hackability overlay + wall-delete guard (which
   both classify rc-partition as off-limits) and the module's own documented contract. **Fixed:**
   `demolitionPlanSvg.ts` now reuses `wallHackability.isDemolitionRestricted` (load-bearing OR
   rc-partition → structural), with legend/label wording updated to "structural (load-bearing /
   RC)" and a new regression test for the rc-partition case.

### P2 — not blocking, worth doing
2. **Main entrance door resolves to "Unassigned" (5-Room) / only "Service Yard" (Terrace).**
   The 5-Room main door opens into an un-roomed circulation gap so the schedule Rooms column
   reads "Unassigned"; the Terrace "ct-main" double door only borders the Service Yard (it sits
   on the rear wall). Both are template-data artefacts (no foyer room; a rear-placed "main"
   door), not schedule bugs — the probe is honest — but "Unassigned" on the front door reads
   oddly to a builder. Consider a foyer/entry room in the affected templates, or a schedule
   fallback label ("External / entry") when a door borders exactly one interior room + outside.
3. **Grouped door mark spans many rooms across storeys.** Terrace D2 ×4 lists six rooms
   (ground powder + three upper bedrooms + shared circulation). Correct by construction, but a
   ×N mark with no per-instance location leans entirely on the on-plan callouts. Acceptable;
   flagged only so it isn't mistaken for a bug.

### P3 — polish
4. **Floor-plan (GA) label/furniture overlap.** Room-name + area labels overlap indicative
   furniture in dense zones (e.g. 5-Room "Service Yard"/"Household Shelter" at the top). It's
   the indicative furniture plan so it's forgivable, but a label-collision nudge would read
   cleaner.
5. **MEP + RCP symbols are small at A4 1:100/1:125.** Legible when printed at true scale with a
   scale rule, but tight on screen. Non-blocking.
6. **Door swing arc drawn on wall elevations.** The internal-elevation sheets draw the plan
   swing arc on the elevation face; swing is a plan concept, minor convention nit.

## What I did NOT find wrong

- No dimensional contradictions between sheets.
- No mark that disagrees between plan, schedule, and DXF (single- or multi-storey).
- Units consistent (mm, with metres called out where used); scale + title block on every sheet;
  north point on plan-view sheets; setting-out datum on the dimensioned plan.
- Roof seeds correctly on the landed/multi-storey templates (Terrace gable, 30°).
