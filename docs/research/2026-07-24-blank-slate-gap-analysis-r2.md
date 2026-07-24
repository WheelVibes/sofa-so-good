# Blank-slate journey gap analysis — round 2 (2026-07-24)

> Second-queue pass over the same product goal as
> [2026-07-19-blank-slate-gap-analysis.md](./2026-07-19-blank-slate-gap-analysis.md):
> serve **new Singapore HDB/condo home buyers designing a blank-slate home fully
> without an interior designer**. Round 1's BSJ-1..8 queue is fully shipped (incl.
> the two 3D follow-ups: floor levels v0.24.0.2, aircon trunking route — this
> round). This pass examines the three candidate areas round 1 scored lower, each
> verified two ways: 2025-26 SG sources (cited inline) for what a real owner needs,
> and the code (flag registry, `analysis/`, `furniture/intakeStates.ts`,
> `state/slices/commentsSlice.ts`, `floorplan/mepPoints.ts`) for what already
> exists. Nothing below was found present by a targeted grep.

---

## 1. Condo-specific fit-out flow — **GAP (largest cohort blocked)**

- **HAS.** `furniture/intakeStates.ts` ships exactly four intake states: `bto-bare`,
  `bto-ocs`, `resale-asis`, `resale-stripout`. The template library has a full condo
  plan line (studio → penthouse) and reno-rules/MCST permit paths are modeled — but a
  condo buyer's **starting state** does not exist: every intake state models an HDB
  handover.
- **NEEDS.** A new-launch condo is handed over **developer-fitted**: flooring
  (tiles/vinyl) everywhere, kitchen cabinets + hob/hood/oven, fully-fitted bathrooms,
  **bedroom wardrobes**, and **aircon pre-installed** — so the renovation is a
  *customisation* budget (feature walls, bespoke carpentry, lighting, countertop and
  wet-area upgrades), typically S$24.8k–48.2k for a 2-bedder, NOT a rebuild
  ([new-condo-launch.sg 2026 guide](https://new-condo-launch.sg/singapore-new-launch-condo-renovation-guide-2026-costs-timeline-tips/),
  [design-authority.com condo cost guide](https://design-authority.com/condo-renovation-cost-singapore-2026/),
  [speedydecor condo process 2025](https://www.speedydecor.com/services/condo-renovation-process-rules-singapore-2025-guide/)).
- **GAP → BSJ2-1: "Condo — developer fit-out" intake state + customisation budget
  posture.** Fifth `IntakeStateMeta`: seed tiled/vinyl floors per room category,
  wardrobes in bedrooms, kitchen cabinet run + appliances, complete bathrooms, wall
  FCUs + condenser placed (the BSJ-2 planner's own primitives). The renovation
  allocator should then read the intake baseline and **zero the developer-provided
  trades** (flooring, wardrobe carpentry, aircon install) unless the user explicitly
  replaces them — turning the budget into the customisation-vs-rebuild split every
  condo cost guide describes. Effort M · tier simple (intake gates the first step) ·
  pure client.

## 2. Defect-marking on the 3D model tied to the DLP checklist — **GAP (unique-differentiator)**

- **HAS.** `analysis/handoverChecklist.ts` (room-kind snag rules + generic handover
  group), `analysis/handoverDates.ts` (DLP + HDB Assure-3 warranty windows from the
  key-collection date), `HandoverPanel`, and a full **comment-pin system**
  (`commentsSlice.ts` `DesignComment` — floor-anchored XZ + `levelId`, popover,
  resolve/delete, `comments` flag) rendered by `scene/CommentPins.tsx`. The pieces
  exist but do not connect: a checklist row can't be pinned to a location, and a pin
  carries no defect semantics.
- **NEEDS.** Defect checking is a scripted, deadline-driven ritual for every SG
  buyer: 12-month DLP from TOP/key collection (report within ~30 days and before
  reno begins; HDB guidance is even tighter — within 7 days to 1 month), with
  categoried checks (hollow tiles by tapping, paint/wall cracks, door/window
  alignment, ponding, seepage) and a marked-up location list handed to the
  developer/BSC for joint inspection
  ([PropertyGuru defects checklist](https://www.propertyguru.com.sg/property-guides/defects-inspection-checklist-bto-ec-condo-28627),
  [A1 Inspection — what is the DLP](https://a1inspection.sg/what-is-the-defects-liability-period/),
  [Kelly Mark BTO checklist](https://kellymarkproperty.com/resources/bto-defect-checklist/)).
  A whole cottage industry (Easy Inspection, Defect Check SG, PropDefect) exists to
  produce exactly this artifact.
- **GAP → BSJ2-2: typed defect pins + DLP defect report.** Extend the proven pin
  pattern (a parallel `defectPins` slice or a `kind: 'defect'` extension) with
  defect category (from `handoverChecklist`'s room-kind rules), severity, status
  (open → reported → rectified → re-inspect), and room auto-attribution; a "Defect
  check" mode seeded per room from the checklist; export a **defect report** (plan
  markup via the existing SVG overlay pattern + numbered list + DLP/Assure-3
  deadlines from `handoverDates`) the owner hands to the developer. Effort M · tier
  pro · pure client. No photos in v1 (keep it storage-free).

## 3. Smart-home / data planning depth — **PARTIAL (advisory-shaped)**

- **HAS.** MEP `data` points (structured-cabling drops), socket/DB advisory,
  switch→light circuits (BSJ-3), electrician handover pack.
- **NEEDS.** The one irreversible pre-reno smart-home decision is **wiring**: run a
  **neutral wire to every switch point** (+ deeper mounting boxes) while walls are
  open — S$500–1,200 now vs near-impossible later; all work by an LEW; no conduits
  through structural walls
  ([contractorsg HDB smart-home wiring guide](https://www.contractorsg.com/blog/hdb-smart-home-wiring-guide-2026),
  [Maxsen wiring guide](https://www.maxsen.sg/ultimate-guide-wiring/)). Secondary:
  protocol posture (WiFi for cameras, Zigbee/Thread mesh for switches/sensors,
  Matter as the cross-brand layer —
  [SECONDS smart-home guide](https://seconds.sg/blogs/resources/smart-home-guides))
  and **AP/mesh-node coverage** (a wired AP point per zone, at the TV console and
  study at minimum).
- **GAP → BSJ2-3: smart-home pre-wire advisory + AP coverage points.** (a) A
  "Smart-home pre-wire" section in the electrical advisory: neutral-at-switch line
  (per switch count from the MEP layer, with the S$ band), deeper-box note, LEW
  reminder — folded into the Electrician handover pack; (b) an `ap` (wired access
  point) electrical kind or a data-point coverage advisory (≥1 wired drop per
  ~60–90 m² zone + TV/study), reusing the socket-advisory pattern. Effort S/M · tier
  pro · pure client. (A full DB circuit schedule remains a nice-to-have — unchanged
  verdict from round 1.)

---

## Ranked second queue

| # | Item | Effort | Tier | One-liner |
|---|------|--------|------|-----------|
| BSJ2-1 | Condo developer fit-out intake + customisation budget posture | M | simple | Fifth intake state seeding the developer-fitted unit (floors, wardrobes, kitchen, baths, aircon) and an allocator that zeroes provided trades — unblocks the condo half of the product promise. |
| BSJ2-2 | Defect pins on the 3D model + DLP defect report | M | pro | Typed, statused defect pins seeded from the handover checklist, exported as the plan-marked defect list every SG buyer hands their developer inside the DLP window. |
| BSJ2-3 | Smart-home pre-wire advisory + AP coverage | S/M | pro | Neutral-at-switch/deeper-box/LEW advisory with S$ band + wired-AP coverage points, folded into the electrician pack. |

**Ranking rationale.** BSJ2-1 gates the *first step* for the entire condo cohort
(the app's own tagline includes condominiums; today they must start from an HDB
fiction). BSJ2-2 is the highest-leverage differentiator — no competitor reference
app marks defects on a 3D model, the deadline is universal, and 90% of the plumbing
(pins, checklist, dates, SVG overlays) is already shipped. BSJ2-3 is a cheap,
high-regret-prevention advisory.

## Near-misses re-verified this pass (do NOT re-propose)

- Intake states for HDB (bare/OCS/resale ×2) — shipped (BSJ-4); only the condo state is the gap.
- Handover checklist + DLP/Assure-3 dates + HandoverPanel — shipped (R4-8); only the 3D
  pin/report link is the gap.
- Comment pins (`comments` flag) — shipped (F24); defect semantics are the gap.
- MEP `data` points + socket/DB advisory + switching (BSJ-3) — shipped; neutral-wire/AP
  guidance is the gap.
- Aircon system planner + 3D trunking route + condenser/ledge — shipped (BSJ-2 + this round).
- Floor levels 2D + 3D — shipped (BSJ-8 + v0.24.0.2).

## Sources (2025-26 SG)

- https://new-condo-launch.sg/singapore-new-launch-condo-renovation-guide-2026-costs-timeline-tips/
- https://design-authority.com/condo-renovation-cost-singapore-2026/
- https://www.speedydecor.com/services/condo-renovation-process-rules-singapore-2025-guide/
- https://www.propertyguru.com.sg/property-guides/defects-inspection-checklist-bto-ec-condo-28627
- https://a1inspection.sg/what-is-the-defects-liability-period/
- https://kellymarkproperty.com/resources/bto-defect-checklist/
- https://easyinspection.sg/ · https://defectcheck.sg/ · https://propdefect.com/what-we-check/ (defect-inspection reference tools)
- https://www.contractorsg.com/blog/hdb-smart-home-wiring-guide-2026
- https://www.maxsen.sg/ultimate-guide-wiring/
- https://seconds.sg/blogs/resources/smart-home-guides
