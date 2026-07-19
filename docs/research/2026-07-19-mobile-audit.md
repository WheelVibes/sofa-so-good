# Mobile-depth UX audit — first-time SG homeowner on a phone (2026-07-19)

Adversarial end-to-end walkthrough driving the **real app** headlessly at **390×844
with `SHOT_TOUCH=1`** (emulated touch device → `body.mobile` + `(pointer: coarse)`),
playing a first-time HDB/condo homeowner on a phone. Complements the desktop-focused
`2026-07-19-ux-walkthrough-audit.md` (which spot-checked mobile only).

Scenarios authored for this audit (re-runnable, dev server :5211):
`scripts/scenarios/mobile-audit-{coreloop,plan,pro,final}.json` +
`mobile-audit-verify-handover.json`, plus the reusable touch-target sweep
`scripts/scenarios/lib/touchSweep.mjs`. Screenshots in
`…/scratchpad/shots/mobile-audit/` (filenames cited per finding).

**The sweep measures the EFFECTIVE hit target**, not just the box: it reads each
control's `::after`/`::before` and, when an absolutely-positioned negative-inset
pseudo is present (the repo's `.panel-head .icon-btn::after { inset: -9px }`
hit-expander pattern), grows the measured size accordingly. This eliminated a large
crop of false positives — e.g. the inspector's minimized-header icon row measures
26×26 by box but is 44×44 by hit area, so it is **not** a defect.

**Counts: P1 = 0 · P2 = 3 · P3 = 4.** No breakage — every mobile flow functioned:
cold-start, mobile toolbar/accordion, catalog bottom-sheet + search, `placeConfirm`,
inspector sheet, finish picker, lighting/scene sheet, share, the 2D plan editor, and
all five Pro panels (Checks, Design score, Reno rules, Handover/DLP, Drawings). One
isolated micro-fix applied inline (handover checklist tap targets). **No horizontal
scroll leak on any surface** (doc width == 390 everywhere).

Notable improvements confirmed since the desktop audit (RM3/RM4 landed):
- **Design score 76/100 with Clearance & fit 100 and 0 BLOCKING** on the shipped
  move-in default (desktop audit saw **59/100**, Circulation 0, **1 BLOCKING** door
  swing). The desktop P2-3 "default fails the app's own metrics" is largely resolved;
  only Circulation (58) / Daylight (40) remain as advisories. (`04-33-design-score.png`,
  `01-30-checks.png`.)
- **Handover checklist is now tickable** — real checkboxes + a "0 of 79 checked" progress
  line (desktop P3-6 "un-tickable checklist" fixed). (`08-37-handover-dlp.png`.)
- **Clearance summary stat-tile labels are NOT clipped on mobile** ("OVERLAPS",
  "WALKWAYS", "BLOCKING", "IN WALL", "CLEAR" all fit) — desktop P3-2 not reproduced
  here. (`01-30-checks.png`.)

---

## P2 — confusing / friction

### P2-1 · Editing bottom-sheet tabs / chips / pagination stay ~27px on mobile
The mobile **menu sheet** (`.m-detail`) correctly lifts every segment/select/slider to
a 44px touch target (`responsive.css:258` `.m-detail .seg button { min-height: 44px }`),
verified in the Scene sheet (only its "System time" reset button trips the sweep at
282×30 — `04-53-sweep-lighting.png`). But the **editing bottom-sheets** — catalog
(`.catalog`) and finish picker (`.finish-picker`, a `.panel.inspector` sheet, **not**
`.m-detail`) — never get that lift, so their tabs/chips/pagination stay at desktop
density:
- **Catalog** (`01-50-sweep-catalog-corrected.png`): category chips 32px tall
  (Beds/Seating/Tables/Storage), Catalog/Layers/Packs tabs 36px, **pagination
  "← Prev" / "Next →" 25px**, footer "Custom size"/"Upload"/"Design a 3D asset" ~27px,
  search input 36px, card favourite hearts 32×32, "Fits-only" checkbox 13×13.
- **Finish picker** (`13-13-sweep-finish.png`): Floor/Walls/Ceiling tabs 27px,
  "Shade/Recolour" swatch buttons ~53–60×27, designer-pick swatches 40×40.
- **Share modal** (`18-18-sweep-share.png`): Post/Square/Story tabs ~27px.
- **Drawings panel** (`12-41-sweep-drawings.png`): Elevations/Lighting tabs + all 26
  "Wall N" chips at ~27px tall.

None is *untappable*, but all sit below the 44px minimum the app already applies to
icon-buttons (via `::after`) and menu-sheet segments — an internal inconsistency, and
the 25px pagination is the sharpest edge. **Suggested fix (a "mobile tap-target pass 2",
one coordinated change):** extend the `.m-detail`-style 44px lift to `.finish-picker`
and `.catalog` segmented tabs / category chips / pagination. **Deliberately NOT
micro-fixed** — it touches shared editing-panel layout across 5 themes + light/dark,
exactly the shared-CSS regression risk the desktop audit cited when leaving P3-2
unpatched.

### P2-2 · 2D plan-editor toolbar controls are all sub-44px on mobile
The plan editor's top toolbar is the only way a phone user drives the editor, and none
of its controls has a hit-expander (the plan toolbar is not `.panel-head`-scoped):
View/Edit/Done segmented ~27px tall, **Undo/Redo 36×26**, "Return to orbit" 32×32,
Floors level selector 114×27, the View/Edit toggle 96×33 (`05-54-sweep-plan-corrected.png`).
Undo/Redo at 26px tall, sitting adjacent to each other, are the most mis-hit-prone.
Suggested fix: lift the plan-header buttons to 44px on `body.mobile` (or add vertical
`::after` hit-expanders where controls are horizontally isolated). Filed, not fixed
(plan-header layout + adjacency need care — GLB-designer's mobile pass capped adjacent
expanders at −2px for exactly this reason).

### P2-3 · Handover/DLP move-in checklist rows are too tight to tick with a thumb — FIXED INLINE
Each of the 79 checklist rows is a `<label className="ho-check">` (the whole row is the
tap target, good) but at desktop density each row is only ~20px tall with ~4px gaps
(`features.css:240`), and the checkbox is a 15×15 native input — cramped and mis-hit-prone
on a phone, on the one surface built to be tapped item-by-item on collection day.
- Shots: `08-37-handover-dlp.png`, `09-38-sweep-handover.png` (18× "15×15 INPUT").
- **Micro-fix applied** (`responsive.css`, inside `body.mobile`): `.ho-check { min-height:
  44px; padding: 5px 0 }` + `.ho-check input { width: 22px; height: 22px }`. Scoped to one
  component, zero desktop impact (nested in the `body.mobile {}` block), follows the repo's
  lift-to-44px mobile pattern. Verified: `60-handover-checklist-44px.png`.

---

## P3 — polish

### P3-1 · Light MOOD row still truncates "Romantic" → "Roman…" on mobile
The Scene sheet mood segmented row shortened its labels since the desktop audit
("Movie night"→"Movie", "Entertaining"→"Party") but 5 equal-flex segments still can't
fit "Romantic" at 390px, so it clips to "Roman…" (`03-52-lighting-moods.png`). The
segments themselves are 44px-tall (touch-fine) — this is purely a label-width clip.
Suggested fix: let the mood `.seg` scroll horizontally on mobile (`flex: 0 0 auto` +
`overflow-x: auto`, the GLB-designer over-wide-seg pattern) or wrap to 2 rows. Left
unpatched — same shared-`.seg` risk as P2-1, and the desktop audit already filed the
equivalent P3-3 without fixing.

### P3-2 · MEP socket marker overlaps the room label at phone zoom
Adding a socket-double drops a "2" count circle that lands on top of the room's
area/perimeter label text (Main Bedroom: the marker sits over "15.4 m²"), and the
"N/M sockets" advisory line stacks tightly under the 3-line room label
(`06-25-plan-mep-point.png`). This is the desktop audit's P2-1 (MepLayer `+16` offset vs
the RoomsLayer 3-line block) confirmed on mobile — needs the same coordinated two-layer
fix. Socket **captions themselves are legible** at the phone's fit-to-plan zoom
(`01-20-plan-default.png`); only the marker↔label overlap is the issue.

### P3-3 · Drawings in-panel elevation preview: dimension chain cramped at phone width
The per-wall elevation thumbnail renders its dimension chain ("0.30m 0.45m 1.52m 8.95m")
so tightly under the furniture at 390px that labels overlap (`11-40-drawings.png`) —
the desktop audit's P3-5 confirmed on mobile. The real deliverable is the print set; this
is the in-app preview. A phone user CAN navigate all 26 walls + Elevations/Lighting tabs;
there is no in-panel "export PDF" visible (export lives in Share → "Shoppable PDF").

### P3-4 · Handover "Key collection / TOP date" is still a native `<input type=date>`
Renders US **mm/dd/yyyy** in a US-locale browser (`08-37-handover-dlp.png`). Mitigated
since the desktop audit by a "Format: day / month / year" helper caption, but still a
native control (ui/CLAUDE.md wants the custom `Select`/controls) and still shows US order
in the field itself. Low priority (SG users mostly on device locale). Desktop P3-6.

---

## Coverage notes / headless limitations (not defects)

- **Paint visualizer modal not captured** — its trigger ("Try on my wall photo") lives
  only under the finish picker's **Walls** tab, and `PaintVizModal` is `React.lazy` and
  NOT in `preloadOnIdle.ts`'s `PRELOAD_ORDER`, so it never resolves headlessly (documented
  playbook limitation). Covered by `PaintVizModal.test.tsx`. The trigger is a full-width
  `btn-block` (touch-fine).
- **Hackability overlay toggle not located on mobile** — it is not in the Plan tools sheet
  (`06-55-plan-tools-menu.png`: Templates/Reset/AI/Mirror/Snap/guides/Chain dims/Suggest
  MEP/Reference photo/Scale). It is `hackabilityOverlay`-flag-gated and likely lives under
  the plan sheet's eye/visibility rail section (not drilled into here). Desktop audit
  confirmed the overlay renders. **Needs a mobile discoverability check** — flag if a Pro
  phone user can't reach it.
- **Floor-loading section (Checks) not captured** — the `setClearancePanelOpen` panel's
  inner scroll container differs from the selector used; floor loading (`floorLoading` flag)
  may be a distinct section/panel. Re-drive with the correct scroll target if needed.
- **Room "category" set produces no visible plan change** — `updateRoom(id,{category})`
  is metadata (drives furnishing/room-kind), not a plan relabel; expected.
- **`over-wide: SVGAnimatedString=1354`** flagged by the sweep in the plan editor is the
  pannable plan `<svg>` inside an overflow-clip container — horizontal leak stays 0px, so
  it is not a real overflow.

## Micro-fixes applied
- `src/styles/responsive.css` (P2-3) — `body.mobile .ho-check` → 44px min-height rows +
  22px checkbox for the Handover/DLP checklist. Verified `60-handover-checklist-44px.png`;
  biome clean; CSS-only (no tsc/test surface).
