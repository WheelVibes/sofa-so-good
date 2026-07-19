# Blank-slate journey gap analysis (2026-07-19)

> **Goal (product owner):** the app serves **new home buyers of Singapore HDB flats
> and condominiums** as a comprehensive tool to design their home **fully from a blank
> slate, without an interior designer.** This pass walks the complete real-world journey
> from bare handover to a fully designed, ready-to-build home and finds what the app still
> **cannot model / plan / decide** at each stage.
>
> **Method.** Every stage below was verified two ways: (1) 2025-26 SG sources
> (Qanvast, HDB Group Reno, RCS, 9creation, aircon/reno guides — cited inline + in
> `REFERENCES.md`) for what a real owner *needs*; (2) the code — the ~230-entry flag
> registry (`src/features/flags/registry.ts`), the `analysis/`, `floorplan/`,
> `furniture/defs/` modules, and the catalog def-id list — for what the app *has*, before
> anything is called a gap. **No feature is proposed that a targeted grep found present.**
>
> **Headline.** The app is remarkably complete on the *design/finish/furnish/document*
> surface (R1-R4 shipped a deep SG-advisory layer). The residual gaps that still block the
> "no interior designer" promise cluster in **whole-home systems planning + money**: the
> owner can furnish and finish beautifully, but cannot yet (a) budget the whole renovation
> by trade, (b) plan the aircon *system* (not just per-room BTU), (c) produce a
> lighting/switching schematic an electrician can wire from, or (d) start from anything but
> the OCS handover state. These, plus the designed→ordered per-trade handoff, are the queue.

---

## Per-stage coverage verdicts

### 1. Bare unit intake — **PARTIAL**
- **HAS.** `ocsStarter.ts` + `resetSlice.applyOcsStarter` + the "New BTO (with OCS)"
  starting point in `SmartStartWizard.tsx` (`ocsStarter` flag, simple) seed the OCS
  handover state (vinyl bedrooms / porcelain living + a bath fitting kit). The furnished
  4-room move-in default (RM4) is the other starting point.
- **NEEDS.** Most buyers are **not** on OCS, and a huge cohort buys **resale**. A bare BTO
  is handed over with **cement-screed floors, no floor finish, no internal door leaves, bare
  plastered walls**; a resale flat comes **with the previous owner's finishes** that the
  buyer either keeps or strips out (hacking is a real cost line — $2,000-$5,000, plus old
  wiring/plumbing replacement $3,000-$8,000; 9creation/RCS). Condo hand-over is a developer
  fit-out (tiled, some carpentry) — a third starting state.
- **GAP → BSJ-4.** Only ONE intake state (OCS) exists. There is no bare-BTO (screed, no
  finishes/doors) start and no resale "as-is / strip to bare" start. The owner who did not
  opt into OCS, or who bought resale, cannot model their actual starting point.

### 2. Wet works & surfaces — **PARTIAL**
- **HAS.** Per-room floor finish + per-room/per-wall wall finish + accent walls + ceiling
  finish (`finishes` slice, `materialComposer`, `wallAccentPicker`, `ceilingFinish`);
  per-wall skirting (`wallBaseboard`); floor-texture scale/angle (`floorTexture`); the
  finish schedule (`finishSchedule.ts`) + setting-out / tile start points (`settingOutDims`);
  waterproofing as an **advisory** (`hdbCompliance.ts` wet-area rule + `renoTimeline.ts`
  "Tiling & waterproofing" phase + the `renoRulesPack` 3-year tile rule).
- **NEEDS.** Wet-area **waterproofing membrane extent** (floor + wall upturn height) is a
  real spec line a tiler/waterproofer builds from; **floor build-up / screed level** per room
  drives door undercut, threshold transitions between finishes, and the bathroom kerb/step-
  down; **transition strips** between two floor finishes are a purchased item.
- **GAP → BSJ-7 (waterproofing zones), BSJ-8 (floor build-up + transitions).** Waterproofing
  is text-only, never a modeled zone; there is no floor-level/screed model, so transitions,
  kerbs and thresholds are unrepresentable. (Surfaces/finishes themselves are well covered —
  not a gap.)

### 3. Ceiling & lighting systems — **PARTIAL**
- **HAS.** False-ceiling / tray / coffered / dropped ceilings per room (`ceilingDesign`);
  perimeter **cove light** (`PlanRoom.coveLight`/`coveColor` + the `cove-light` def);
  ceiling clearance validator (`ceilingClearance.ts`); the **RCP sheet** (`rcpSheet` —
  false-ceiling zones + ceiling-fixture positions dimensioned off walls + aircon marks);
  downlights/ceiling lights/fans as placeable fixtures feeding the lighting plan.
- **NEEDS.** The one thing an owner must hand an electrician that the app cannot produce: a
  **switching / circuit schematic** — *which switch controls which light*, one-way vs two-way
  (staircase/bedroom), and how fixtures group onto lighting circuits. Fan points and cove
  detail are covered; the switch→fixture relationship is not.
- **GAP → BSJ-3.** `mepPoints.ts` has a `switch` electrical kind, but **no link from a switch
  to the fixtures it controls** — `socketAdvisory.ts`/`electricalSchedule.ts` both state
  outright they have "no notion of circuits". No lighting-control schematic exists.

### 4. Cooling & ventilation — **PARTIAL**
- **HAS.** Per-room cooling-load BTU + a single-unit size pick (9k/12k/18k/24k) + a
  whole-flat total (`airconSizing.ts`, R4-1); a placeable wall FCU (`aircon-unit`); the RCP
  marks aircon electrical points.
- **NEEDS.** The actual SG decision is the **system**: "System" = number of indoor units on
  one outdoor condenser (System 3 = 1 condenser + 3 FCUs, the 4-room norm; System 4 = 1+4 for
  5-room/condo; VD/FC Aircon). The owner must decide *which rooms share a condenser*, *how
  many condensers*, and whether they fit the **condenser ledge** (HDB limits ~110 kg per wall
  panel; a 3-room multi-split compressor can exceed 70 kg — aircons.sg), plus **trunking/
  refrigerant-pipe routes** from FCUs to the ledge. Mechanical ventilation (kitchen cooker-
  hood duct, toilet exhaust) is also unmodeled.
- **GAP → BSJ-2.** `airconSizing.ts` stops at per-room sizing (`SYSTEM_SIZES` are single-unit
  capacities); there is no condenser grouping, ledge-capacity check, condenser placement, or
  trunking. This is the second-biggest reno line-item decision after carpentry.

### 5. Electrical & smart home — **MOSTLY COVERED (one gap = BSJ-3)**
- **HAS.** Full MEP point placement (`mepEditor` — socket / socket-double / switch / data /
  tv-point / aircon / water-heater, with mount heights), Suggest-points heuristic, the
  electrical plan sheet (`electricalPlan`) + schedule (`electricalSchedule.ts`), per-room
  socket-count + DB-load advisory (`socketAdvisory.ts`, R4-4), **data points** (the `data`
  kind covers structured cabling / smart-home network drops).
- **NEEDS.** A DB / circuit schedule (which circuit, MCB rating) and the switch→light control
  map — the latter is the BSJ-3 lighting-control gap; the former is a nice-to-have (the socket
  advisory already gives the 40 A/63 A DB note). Discrete smart-switch / sensor catalog items
  are niche and not blocking.
- **VERDICT.** Point placement + counts + DB note are solid; the only real electrical gap is
  the switching schematic (folded into BSJ-3).

### 6. Carpentry & storage — **COVERED**
- **HAS.** Parametric kitchen cabinet run (`kitchenCabinets`) + standalone kitchen counter/
  island; wardrobes (`wardrobe-3door` + parametric `wardrobe` type, hinged/sliding);
  **TV feature wall** (`feature-wall`, `tv-wall`); study built-ins (parametric `desk`/
  `bookshelf`/`sideboard`); shelter/utility shelving (`utility-cabinet`, `cube-shelf`,
  `wall-shelf`); vanity (`vanity`); shoe cabinet, altar cabinet, banquette. Every parametric
  piece produces a **dimensioned carpentry elevation + section** sheet (`carpentrySheets`,
  `carpentryElevation.ts`) with material/hardware callouts — the single most-cited DIY handover
  gap, already closed.
- **VERDICT.** Matches typical SG carpentry quote lines. **Not a gap** — do not re-propose.

### 7. Wet-area fit-out — **PARTIAL (small catalog gaps = BSJ-6)**
- **HAS.** `toilet`, `bathroom-sink`, `shower`, `bathtub`, `vanity`, `bathroom-mirror`,
  `water-heater`, `towel-rail`, `towel-ladder`; kitchen `hob`/`sink` options on the counter,
  `range-hood`, `built-in-oven`, `stove`.
- **NEEDS.** Three common fittings are missing: a **shower screen / glass enclosure** (the
  `fluted-partition` is decor, not a bathroom screen), a **bidet spray** (near-universal in SG
  toilets), and a standalone **kitchen mixer tap** as a selectable fitting (only baked into the
  island faucet today).
- **GAP → BSJ-6.** Small catalog additions blocking a "complete" bathroom/kitchen fit-out.

### 8. Soft furnishing & appliances — **COVERED**
- **HAS.** Curtains + roller / roman / zebra blinds + drapery fabrics/opacity
  (`textiles.ts`); appliances: `refrigerator`, `washing-machine`, `dishwasher`,
  `built-in-oven`, `microwave`, `range-hood`, `stove`, `wine-cooler`, `water-heater`,
  `aircon-unit`; TV `flatscreen-tv` with a 43"-75" size enum, `tv-console`, `soundbar`.
- **VERDICT.** Matches a typical new-home appliance/soft-furnishing list. **Not a gap.**
  (Minor: no distinct dryer / washer-dryer combo, but the washer covers the need.)

### 9. Decision support — **PARTIAL (big gap = BSJ-1)**
- **HAS.** Furniture budget (`budget`, simple, default-off); a finishes-only cost estimate
  (`renovationCost.ts` — floors + walls $/m² only); the BOQ quote (`boq`, pro, default-off) +
  editable price rules (`priceRules`); renovation **sequencing** (`renoTimeline.ts` + ICS
  export) — what-to-decide-when is well handled.
- **NEEDS.** A blank-slate owner's #1 anxiety is **money allocation across the whole
  renovation**. The real SG budget is by trade/stage: hacking, masonry/tiling & wet works,
  carpentry (25-40% — the biggest line), ceiling & partition, plumbing, electrical, painting,
  glass & aluminium, then fixtures & appliances (a sound allocation is ~40% carpentry / 25%
  tiling+wet works / 15% M&E / 20% fixtures+appliances — 9creation/Qanvast/RCS 2025-26).
- **GAP → BSJ-1.** `renovationCost.ts` explicitly **excludes** "hacking/disposal, false
  ceilings, carpentry, M&E, and contractor margin". There is no stage/trade budget template.
  The owner gets a floor+wall finish estimate and a furniture total, but no whole-reno budget
  broken down the way every SG cost guide and contractor quote is.

### 10. Designed → ordered (per-trade lists) — **PARTIAL (gap = BSJ-5)**
- **HAS.** A rich drawing set organised **by drawing type**: GA plan, dimensioned plan,
  finish schedule, door/window schedule, elevations, electrical plan, plumbing plan, RCP,
  demolition plan, carpentry sheets, setting-out; plus DXF export, the BOQ, a shopping-list
  export (`shopExport`), and per-item notes/links/spec (`itemMeta` → FF&E).
- **NEEDS.** The owner hands work to **separate trades** (tiler, electrician, carpenter,
  aircon installer, curtain/blind vendor, plumber). Each needs *their* slice bundled: the tiler
  wants the finish schedule + setting-out + wet-area extents; the electrician wants the
  electrical plan + socket advisory + switching schematic + DB note; the carpenter wants the
  carpentry sheets + FF&E; the aircon installer wants the BTU + system plan; the curtain vendor
  wants the window schedule + curtain specs + quantities.
- **GAP → BSJ-5.** The output exists but is sliced by *drawing type*, not *trade recipient*.
  There is no per-trade handover pack that re-bundles the already-computed sheets + quantities
  + spec for one recipient. A DIY owner has to know which of ~12 sheets each trade needs.

---

## Ranked blank-slate queue (by how badly it blocks "no interior designer needed")

| # | Item | Effort | Tier | Feasible pure-client? | One-liner |
|---|------|--------|------|----------------------|-----------|
| BSJ-1 | Whole-reno budget allocator (by trade/stage) | M | simple | Yes | Extend the cost model past floors+walls into a full SG trade breakdown (hacking, tiling/wet works, carpentry, ceiling, M&E, painting, glass/alu, fixtures) derived from the design's own quantities. |
| BSJ-2 | Aircon **system** planner (condenser grouping + ledge + FCU) | M | pro | Yes | Group rooms into System-2/3/4 sets, sum FCU load per condenser, check the ~110 kg ledge limit, place condenser(s) + FCUs — the decision `airconSizing` stops short of. |
| BSJ-3 | Lighting & switching schematic (which switch → which light) | M | pro | Yes | Link a `switch` point to the fixtures it controls (one/two-way), emit a lighting-control schedule + schematic for the electrician. |
| BSJ-4 | Bare-BTO & resale starting states | M | simple | Yes | Add "New BTO (bare — screed, no finishes/doors)" and "Resale (as-is / strip to bare)" intake states beside OCS, so non-OCS and resale buyers model their real start. |
| BSJ-5 | Per-trade handover packs | M | pro | Yes | Re-bundle the existing sheets/schedules/BOQ into per-recipient packs (Tiler / Electrician / Carpenter / Aircon / Curtain vendor) — the designed→ordered bridge. |
| BSJ-6 | Wet-area & kitchen fit-out catalog: shower screen, bidet spray, kitchen mixer tap | S | simple | Yes | Three missing but near-universal SG fittings that block a "complete" bathroom/kitchen. |
| BSJ-7 | Waterproofing-zone model (membrane extent + wall upturn) | S/M | pro | Yes | Turn the wet-area waterproofing advisory into a modeled zone per wet room (floor + upturn height) feeding the finish schedule + tiler pack. |
| BSJ-8 | Floor build-up / level & transition-strip model | S/M | pro | Yes | Per-room floor finish thickness/level so transitions, door undercut, and the bathroom kerb/step-down are representable + a transitions schedule. |

**Ranking rationale.** BSJ-1/2/3 are the three whole-home decisions a first-timer most needs
an ID for and currently can't self-serve (money, cooling system, wiring intent) — highest
blocking weight. BSJ-4 gates the very first step for the majority of buyers (non-OCS + resale).
BSJ-5 turns a complete design into orderable work — the last-mile of the promise. BSJ-6-8 are
completeness fixes (small catalog + two technical surface models) that matter but block fewer
owners.

---

## Near-misses — verified COVERED this pass (do NOT re-propose)

- **Appliance catalog** — fridge, washer, dishwasher, built-in oven, microwave, range hood,
  hob/stove, wine cooler, water heater, wall aircon FCU: all present (`furniture/defs/`).
- **TV sizing** — `flatscreen-tv` has a 43"-75" diagonal enum (+ `tv-console`, `soundbar`).
- **Curtains / roller / roman / zebra blinds / drapery fabrics + opacity** — `textiles.ts`.
- **Carpentry** — parametric kitchen run, wardrobes, TV feature wall, study built-ins,
  shelter/utility shelving, vanity + **dimensioned carpentry elevation/section sheets**.
- **Per-room aircon BTU sizing** (`airconSizing.ts`, R4-1) — covered; only *system grouping*
  is the gap (BSJ-2).
- **Electrical point placement + socket-count + DB-load advisory** (`mepEditor`,
  `socketAdvisory.ts`, R4-4) + data points — covered; only *switching* is the gap (BSJ-3).
- **False ceiling / cove light / ceiling clearance / RCP / fan+downlight fixtures** —
  `ceilingDesign`, `coveLight`, `ceilingClearance.ts`, `rcpSheet`.
- **OCS handover state** (`ocsStarter.ts`, R4-3) — covered; only *bare/resale* is the gap (BSJ-4).
- **Renovation sequencing + ICS** (`renoTimeline.ts`) — covered; only *budget by trade* is the
  gap (BSJ-1).
- **Finish / door-window / electrical / plumbing schedules, setting-out, DXF, BOQ, price
  rules, FF&E notes, shopping-list export** — all present; only *per-trade re-bundling* is the
  gap (BSJ-5).
- **Skirting (`wallBaseboard`), accent walls, floor-texture transform** — covered; only *floor
  build-up/level + transition strips* is the gap (BSJ-8).
- **Waterproofing as an advisory** (`hdbCompliance.ts` + `renoTimeline.ts` + `renoRulesPack`
  3-year tile rule) — covered; only the *modeled zone* is the gap (BSJ-7).
- **Floor loading, reno rules pack, hackability overlay, DLP/warranty dates, HDB/MCST/BCA
  permit paths** — all shipped (R4-5/6/7/8, v0.22.2.60).

---

## Sources (2025-26 SG)

- HDB Group Reno — BTO renovation cost & timeline 2025: https://hdbgroupreno.sg/services/hdb-bto-renovation-cost-timeline-in-singapore-2025-guide/
- 9creation — BTO renovation cost breakdown (by category): https://9creation.com.sg/hdb-bto-renovation-cost-breakdown/
- Qanvast — how much is a 3/4/5-room HDB renovation in 2025: https://qanvast.com/sg/articles/how-much-is-a-3-4-and-5-room-hdb-flat-renovation-in-2025-3384
- RCS — HDB renovation budget 2026: https://renovationcontractorsingapore.com/blogs/news/hdb-renovation-budget-2026-complete-cost-guide-real-pricing
- VD Aircon — System 2/3/4 aircon guide (SG HDB/condo): https://www.vdairconservices.com/aircon-system-2-3-4-singapore-guide/
- aircons.sg — System 3 vs 4 vs 5 + HDB ledge weight rules: https://aircons.sg/blog/system-3-vs-system-4-vs-system-5-which-aircon-system-fits-your-hdb
- FC Aircon — Aircon System 1-5 for HDB/condo: https://fcairconservicing.com/guide/aircon-system-1-2-3-4-5/
</content>
</invoke>
