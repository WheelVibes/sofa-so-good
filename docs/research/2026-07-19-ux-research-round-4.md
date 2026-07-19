# UX research round 4 — next high-value client-side enhancements (2026-07-19)

> Fourth UX-research pass. Two thrusts: (1) a competitor sweep (Coohom, Planner 5D, IKEA
> Kreativ, Sweet Home 3D, Homestyler, Live Home 3D, Roomstyler, Foyr Neo, Floorplanner,
> RoomSketcher, Cedreo, Magicplan + 2025-26 entrants); (2) Singapore-specific gaps
> (Qanvast, HDB, PropertyGuru, contractor/homeowner guides). Every candidate was
> verified **absent** against the real code — the ~190-entry flag registry
> (`src/features/flags/registry.ts`) plus the relevant `analysis/`, `floorplan/`,
> `furniture/` modules — before being proposed. Rounds 2/3 found most candidates already
> shipped; this pass confirms that verdict for the **competitor** thrust (near-total
> parity, zero net-new) and concentrates the real value in **SG-authentic advisories**.

## Headline finding

The app is at or beyond parity with every benchmark planner on the client-feasible
column. The competitor sweep surfaced **no new client-doable feature** — each candidate
was already shipped (see near-misses). The genuine, high-value, pure-client frontier left
is **Singapore renovation-domain intelligence**: encode the SG-specific rules and sizing
maths homeowners repeatedly ask about (aircon BTU, ceiling clearance, floor loading, OCS
starter state, socket/DB targets, reno rules) as static advisories over data the app
already holds. These are cheap (pure logic + a panel/report section, no assets, no
backend), differentiating (no competitor does SG), and squarely on-mission (the app's
purpose is DIY design → contractor handover for HDB/condo homes).

---

## Ranked queue (value ÷ effort)

### R4-1 — SG aircon BTU sizing per room · S · pro · value: HIGH
**Scope.** A per-room cooling-load badge/advisory: estimate BTU from floor area
(~50-60 BTU/ft², the SG rule of thumb) with modifiers the app can already infer —
+10-15% for a west/east-facing room (via the `orientationDeg` compass the sun rig already
tracks), +20% for ceiling >3 m, +~4000 BTU for an open/no-door kitchen — and recommend a
system size (9k/12k/18k/24k) per room plus a whole-flat multi-split total. Pure formula
over existing room-area (`planTotalArea`/per-room polygon area) + orientation state,
shaped like `analysis/daylight.ts`. The single most-asked SG reno-planning question, and
nothing analogous exists in the field. **Pro tier** (an analytical advisory, alongside
`daylight`/`designScore`).
**Precedent.** silverbackaircon.sg/aircon-btu-calculation-guide · skyblueaircon.com/blog/what-size-btu-for-hdb-room
**Absent.** No `btu`/cooling-load anywhere (`grep -rli 'btu|cooling load'` → 0 product hits).

### R4-2 — Ceiling-height & false-ceiling clearance validator · S · pro · value: HIGH
**Scope.** An advisory that reads the design's false-ceiling / bulkhead drops
(`ceilingDesign`, the RCP sheet's zone drop-heights) and warns against SG norms: 2.6 m
standard slab-to-slab, keep ≥2.4 m finished clearance under a dropped ceiling, cornices
down to ~2.1 m acceptable. Flags a zone whose drop leaves headroom below the comfort/
statutory threshold, and reports remaining clearance per zone. Pure logic over ceiling
data already modelled for the RCP; mirrors `accessibility.ts`. **Pro tier.**
**Precedent.** qanvast.com/sg/articles/standard-hdb-ceiling-heights-what-you-cancannot-do-to-alter-them-3527 · ifix.sg/hdb-ceiling-height-explained-standard-measurements-and-practical-insights/
**Absent.** No ceiling-clearance check (`grep -rli 'ceiling clearance|2\.4.?m clearance'` → 0).

### R4-3 — BTO Optional Component Scheme (OCS) starter state · S/M · simple · value: HIGH
**Scope.** A "New BTO (OCS)" starting point that pre-seeds the finishes + fittings HDB
actually hands a BTO owner who opted into OCS — internal doors, vinyl/porcelain floor
finishes, and sanitary/bathroom fittings — so a BTO owner designs *from what they'll
receive*, not a blank shell. Pure data (an OCS component manifest) seeding the existing
finish + opening + fixture state; no new geometry. High reach — the majority of new SG
homes are BTO — and it makes the "authentic modern SG home" default (RM4) even truer to
handover reality. **Simple tier** (a core onboarding/default-state choice).
**Precedent.** qanvast.com/sg/articles/hdb-optional-component-scheme-ocs-is-it-worth-opting-in-1873 · dollarsandsense.sg/complete-guide-hdbs-optional-components-scheme-ocs/
**Absent.** No OCS reference anywhere (`grep -rli 'optional component|\bOCS\b'` → 0).

### R4-4 — Electrical points & DB-load advisory · S · pro · value: MED-HIGH
**Scope.** Extends the **existing** MEP electrical layer with a *target/gap advisory* (not
point placement, which already ships): recommended socket + data-point counts per room
kind (a 4-room flat ≈ 25-40 sockets total) compared against the electrical points the user
has actually placed, with a per-room shortfall cue and a DB-box note (40 A vs 63 A supply,
circuit-count guidance). Reuses `mepEditor` point data + room categories. **Pro tier**
(analytical, sits beside the electrical plan sheet).
**Precedent.** goldberg-home.com/blogs/blogs/how-many-electrical-sockets-do-i-need-for-hdb-bto-singapore · homegenie.com.sg/blogs/news/hdb-electrical-renovation-guide-singapore
**Absent (partial overlap checked).** `mepEditor`/`electricalPlan`/`plumbingPlan` PLACE and
draw points, but there is no count-target or DB-load advisory — this is the net-new slice.

### R4-5 — Floor-loading / raised-platform advisory · S · pro · value: MED
**Scope.** Warns when a raised-floor platform, thick concrete screed, or heavy item cluster
risks the HDB 150 kg/m² imposed-load limit; states the ≤50 mm concrete-raise rule and
suggests lightweight timber-joist platforms as the compliant alternative. A cited advisory
keyed to floor-finish choice + declared platforms/heavy fixtures. **Pro tier.**
**Precedent.** homeanddecor.com.sg/design/renovation-guidelines-hdb-singapore/ · floorrich.com/an-easy-to-understand-guide-to-hdb-flooring-guidelines/
**Absent.** No floor-load/platform logic (`grep -rli 'floor load|150.?kg|raised platform'` → 0).

### R4-6 — SG renovation-rules reference pack · S · pro · value: MED
**Scope.** One static, cited advisory surface (a panel + report section) bundling the
smaller compliance rules that don't each merit a feature: the **wet-area 3-year
tile-hacking rule** (waterproofing membrane — no bathroom-tile hacking in the first 3 years
post-completion), **window & grille compliance** (BCA-approved AWC contractor, 304-grade
rivets, HDB-approved invisible-grille designs — slots beside `OpeningInspector`), **reno
working-hours / noise limits** (Mon-Sat 9-6, noisy work weekdays 9-5 only, fine amounts),
and the **HDB DRC contractor + permit paperwork checklist** (static slice only — the live
DRC directory is backend and excluded). Consolidates four low-individual-value but
frequently-cited rules into a single trustworthy reference. **Pro tier.**
**Precedent.** elementsid.com.sg/can-you-hack-hdb-walls/ · degrille.com.sg/article/are-invisible-grilles-approved-by-the-hdb/ · renovationcontractorsingapore.com/blogs/news/hdb-renovation-noise-rules-working-hours-2026 · propertyguru.com.sg/property-guides/hdb-renovation-permits-in-singapore-16702
**Absent.** No wet-area/grille/working-hours/DRC advisory (verified against `analysis/`, `ui/`).

### R4-7 — Live hackability overlay in the 2D plan editor · S · pro · value: MED
**Scope.** A red/green wall tint + inline "NOT PERMITTED / permit required" warning shown
*live in the 2D editor* as the user marks walls, driven by the **existing**
`PlanWall.structure` classification — surfacing the hack rules (RC/load-bearing/shelter
never hackable; ≥150 mm RC structural; ≤100 mm partition removable with permit) at edit
time, not only on the exported demolition sheet. A small UX layer over data + a demolition
sheet the app already computes. **Pro tier** (matches `wallStructure`/`drawings`).
**Precedent.** elementsid.com.sg/can-you-hack-hdb-walls/ · hdb.gov.sg/residential/living-in-an-hdb-flat/renovation/important-information
**Absent (partial overlap checked).** `PlanWall.structure` + `WallInspector` (set the tag) +
`floorplan/demolitionPlan.ts` + the demolition SHEET already exist; the live editor
tint/warning overlay is the net-new UX (the classification currently only reaches the
exported sheet).

### R4-8 — DLP / warranty date tracker · S · pro · value: LOW-MED
**Scope.** Small extension to the **existing** move-in/handover checklist
(`analysis/handoverChecklist.ts`): given a key-collection / TOP date, compute the concrete
deadline dates the checklist currently only names in prose — the 1-year Defects Liability
Period end, the 5-year ceiling-leak and 10-year structural-spalling warranty windows
(HDB), and the "report defects before starting renovation" cut-off. Pure date math added to
the checklist output. **Pro tier** (rides the handover checklist).
**Precedent.** homematch.sg/renovation-guides/bto-defect-checklist-defect-liability-period · hdb.gov.sg/residential/living-in-an-hdb-flat/moving-in/rectification-work-for-new-flats
**Absent (partial overlap checked).** `handoverChecklist.ts` lists defect-liability as a prose
line but has **no date math** — this adds the computed dates only.

---

## Near-misses — verified already-shipped / covered (do NOT re-propose)

**Competitor thrust (near-total parity confirmed):**
- **Parametric K&B cabinets** (Coohom) = `kitchenCabinets` + `parametricFurniture`.
- **720°/multi-room linked tour** (Coohom) = `panoTour` (+ `panorama`).
- **Custom-furniture / construction module** (Coohom) = `glbDesigner` (shapes + CSG/boolean).
- **Camera-path video walkthrough** (Live Home 3D) = `walkthrough` + `ui/recordViewTour.ts`
  + `suggestedViews` + `dayNightClip` + `presentation`. A manual keyframe-waypoint editor
  would be incremental over this stack, not a gap.
- **360° walkthrough** (Planner 5D) = `panorama`/`panoTour`/`vrWalkthrough`.
- **Smart Wizard auto-furnish** (Planner 5D) = `smartStart` + `layoutReroll` + `aiLayout`.
- **4K–16K photoreal render** (Coohom) = local progressive path tracer (`hqRender` +
  `hqAiDenoise`); cloud GPU farm is out of scope by design.
- **Orthographic / parallel-projection & two-point-perspective** (SketchUp/D5) =
  `parallelProjection` + `twoPointPerspective`.
- **Gallery / photo / feature wall** (Coohom, Homestyler push this heavily) = the `wall-art`
  def's "Gallery (wide)" variant + the `photo-frame-cluster` def already cover the casual
  need; a separate multi-frame salon-layout *generator* is not worth a feature over these.
- **Imperial/metric units** = `measurementsSlice` `UnitSystem`. **Cover sheet + general
  notes + sheet index + legend** = `ui/drawingSet.ts`. **Finishes / FF&E / door-window
  schedules** = drawing set. **Curtains / roller / roman / zebra blinds / drapery** =
  `furniture/defs/textiles.ts` + primitives.

**SG thrust (the SG agent's ranked items #1, #2, #4, #7, #12 are mostly shipped):**
- **Renovation timeline / Gantt (+ ICS export)** = `analysis/renoTimeline.ts` +
  `ui/openRenoIcs.ts` — SG item #7 fully shipped, excluded.
- **BTO defect-inspection checklist** = `analysis/handoverChecklist.ts` — SG item #1 core
  shipped (only the DLP *date* math is net-new → R4-8).
- **Structural wall classification + demolition/hacking plan** = `PlanWall.structure`
  (`floorplan/types.ts:87`) + `wallStructure` flag + `floorplan/demolitionPlan.ts` + the
  demolition sheet — SG item #2 data + sheet shipped (only the *live editor overlay* is
  net-new → R4-7).
- **Electrical/plumbing points plan** = `mepEditor` + `electricalPlan` + `plumbingPlan` —
  SG item #4 point placement shipped (only the *count-target / DB-load advisory* is net-new
  → R4-4).
- **HDB / MCST / BCA permit paths** = v0.22.2.60 — SG item #12 permit paths shipped (only
  the static contractor/paperwork *reference card* is net-new → folded into R4-6).

---

## New references added
No net-new *reference app* surfaced (the competitor field is fully catalogued in
`REFERENCES.md`). Added a round-4 **Singapore renovation-domain source** group to
`REFERENCES.md` (aircon BTU calculators, HDB ceiling/floor guidelines, OCS guides, reno
rules) — the citation base for the SG advisories above.

## Method notes
- Absence verified against `src/features/flags/registry.ts` (read in full, ~190 flags) plus
  targeted greps of `analysis/`, `floorplan/`, `furniture/defs/`, `ui/`, `state/`.
- Competitor sweep: WebSearch across 2025-26 Coohom/Planner 5D/Homestyler/Live Home 3D
  comparison + feature pages.
- SG thrust: 12 WebSearches across HDB official, Qanvast, PropertyGuru, and SG contractor/
  homeowner guides (delegated; full citations inline above).
- Constraint honoured: pure client-side, no backend. Backend-only SG items excluded (live
  DRC directory, BTO ballot data, live pricing, e-permit submission).
</content>
</invoke>
