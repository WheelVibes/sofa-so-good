# UX walkthrough audit — first-time SG homeowner (2026-07-19)

Adversarial end-to-end walkthrough driving the **real app** on the GPU harness
(`SHOT_GPU=1`, dev server :5211), playing a first-time HDB/condo homeowner. Five stages:
cold start → Simple core loop → room categories → Pro surfaces → mobile. Findings are
classified **P1** (broken/blocking), **P2** (confusing/friction), **P3** (polish).

Scenarios authored for this audit (re-runnable):
`scripts/scenarios/ux-audit-0{1..5}*.json`. Screenshots in
`…/scratchpad/shots/ux-audit/` (filenames cited per finding).

**Counts: P1 = 0 · P2 = 3 · P3 = 7.** One P3 micro-fixed inline (tour step count).
Overall the app is in strong shape — every flow functioned, copy is mostly excellent,
panels are well-built and discoverable via the Tools menu. Findings are refinements, not
breakage.

---

## P2 — confusing / friction

### P2-1 · Plan-editor room labels collide with the socket-advisory text
`MepLayer.tsx:143-164` draws each room's "N/M sockets" advisory (R4-4) at
`y = toPx(wz) + 16`, i.e. 16px below the room's label anchor. But `RoomsLayer.tsx:206-254`
centres a **3-line** block (name / area / perimeter "P xx m") on that same anchor, so its
perimeter line lands at ~+16 too — the two **overlap** and are both unreadable. Every room
that shows both a perimeter and a socket count collides (Main Bedroom, Bedroom 2/3, the
renamed Living/Dining, Kitchen, Service Yard); rooms with no socket advisory (Corridor,
Household Shelter) read cleanly, which makes the collision obvious. **`showMep` defaults to
`true`** (`FloorPlanEditor.tsx:384`), so a Pro user sees this the instant the plan editor
opens — no toggle needed.
- Shots: `02-room-inspector-default.png`, `03-room-renamed-category.png`,
  `04-plan-mep-mode.png`, `05-plan-hackability.png`.
- Suggested fix: fold the socket count into the `RoomsLayer` label block as a 4th `tspan`
  (so it stacks under the perimeter line), OR offset the `MepLayer` socket text by the
  measured label-block height (`totalLines * lineH`) instead of a fixed `+16`. Needs a
  coordinated two-layer change — deliberately not micro-fixed here.

### P2-2 · Smart Start "Styles" list conflates palette themes with room-layout remodels
The Smart Start gallery lists, under one ungrouped **"Styles"** heading, two conceptually
different things: whole-flat **palette/visual themes** (Modern Contemporary, Scandi Calm,
Warm Industrial, Tropical Biophilic, Japandi, Modern Luxe, …) and **room-layout remodels**
whose descriptions all start "Re-modelled L/D: …" or "Hotel-style main bedroom" (Open-Concept
Lounge, Entertainer's Lounge, Broken-Plan Living, Work-From-Home, Social Lounge, Boutique
Suite, Family Nursery). A newcomer can't tell whether "Work-From-Home" changes the colours or
the furniture layout. They read as peers but do different jobs.
- Shots: `01-smartstart-gallery-top.png`, `02-smartstart-gallery-bottom.png`.
- Suggested fix: split into two labelled sub-sections (e.g. "Whole-flat styles" vs "Room
  layouts") or add a one-line tag/badge distinguishing palette-only from layout-changing
  presets.

### P2-3 · The shipped default / Smart-Start furnishing scores poorly on the app's own metrics
Opening **Checks** and **Design score** right after Smart Start (or on the move-in default)
shows the app grading its own starter layout harshly: Design score **59/100** with
**Circulation 0/100** ("14 walkway pinch-points under 0.6 m, 29 gaps under the ideal 0.9 m"),
and Clearance checks flags **1 BLOCKING — "Basin blocks a door swing"** plus dozens of
narrow/tight walkways. For a pro user this undermines the "accurate starter plans" promise:
the default the app ships and the layout Smart Start produces both fail the app's own
soundness advisories. (RM3/RM4 placement-soundness shipped recently — this suggests the
clearance/score thresholds and the default layout aren't yet reconciled.)
- Shots: `01-pro-checks-clearance.png`, `02-pro-design-score.png`.
- Suggested follow-up: audit whether the default move-in flat + `moveIn` preset can be nudged
  to clear the BLOCKING door-swing and lift Circulation off 0, or whether the metric
  thresholds are too strict for a real furnished flat. (Product decision, not a quick fix.)

---

## P3 — polish

### P3-1 · Onboarding→tour step-count mismatch — FIXED INLINE
Onboarding "Take the guided tour" advertised "A **7-step** walkthrough of the essentials"
(`Onboarding.tsx:160`) but the tour renders **"STEP 1 OF 9"** (`TOUR_STEPS` = welcome + 7
numbered + "You're all set" = 9). Changed the copy to "A **9-step** walkthrough…" to match
the counter the user actually sees.
- Shots: `03-onboarding-choices.png`, `04-tour-step1.png`.

### P3-2 · Clearance-checks summary stat-tile labels are clipped
The 5 summary tiles (`.clr-stat .l`, `ClearancePanel.tsx:138-158`) are too narrow at the
panel's 340px width: "Overlapping" (11 chars) clips to "OVERLAPP"/"OVERLAPPI" and "Walkways"
loses its final "S" ("WALKWAY"). Persists (slightly worse) on mobile.
- Shots: `01-pro-checks-clearance.png`, `07-pro-checks-mobile.png`.
- Suggested fix: allow the label to wrap to 2 lines, drop the font a step, or shorten
  ("Overlapping"→"Overlaps"). Left unpatched — touches shared `.clr-stat` CSS (theme/mobile
  regression risk).

### P3-3 · Light MOOD control doesn't fit its 5 labels
The mood segmented row ("Normal · Reading · Movie night · Entertaining · Romantic") overflows
its width: the desktop Scene menu wraps "Romantic" to a 2nd line; the mobile Scene sheet
truncates with ellipsis ("Movie n…", "Entertai…", "Romant…"). Also the desktop options read as
plain text (low click-affordance) rather than chips.
- Shots: `05-scene-menu-moods.png` (desktop), `02-mobile-scene-moods2.png` (mobile).
- Suggested fix: shorter labels ("Movie", "Party") or a 2-row / scrollable segmented layout;
  give the desktop options the same chip styling as mobile.

### P3-4 · Scene-menu single-button state labels are ambiguous (desktop only)
Desktop Scene menu shows "Ceiling fixtures: **Hidden**" and "Motion: **On**" as single
buttons — unclear whether the word is the current state or the action. The **mobile** Scene
sheet handles this better: it adds a clarifying subtext ("3D geometry; illumination stays on",
"Animate fan blades and other moving furniture") + an "ON" badge. Desktop should adopt the
same treatment (or use a 2-state toggle per `ui/CLAUDE.md`).
- Shots: `05-scene-menu-moods.png` vs `02-mobile-scene-moods2.png`.

### P3-5 · Elevation/Drawings in-panel preview has cramped dimension labels
The `#elevationPanel` per-wall preview renders its dimension chain ("0.30m 0.45m 1.52m …") so
tightly under the furniture at the small preview size that labels overlap. (The full print
drawing set is the real deliverable; this is the in-app thumbnail.)
- Shot: `03-pro-elevation-drawings.png`.

### P3-6 · Handover & DLP: native US date input + un-tickable checklist
The "Key collection / TOP date" field is a native `<input type=date>` rendering **mm/dd/yyyy**
(US order) — an SG app should present dd/mm/yyyy, and `ui/CLAUDE.md` says form controls should
be the custom `Select`/controls, not native. Separately, the 79-item "Move-in checklist"
renders as plain text lines with no visible tick/checkbox affordance, yet reads as a checklist
a user would want to tick off on collection day.
- Shot: `04-pro-handover-dlp.png`.
- Suggested fix: locale-aware / custom date control; either add checkboxes or reframe the copy
  as a reference list ("Things to check on collection").

### P3-7 · Smart Start footer leaks a raw palette token
The gallery footer reads "Applies to the current apartment shell. Theme: **clay**." — the
internal lowercase palette id surfaces verbatim. Should be a human label ("Clay") or dropped.
- Shot: `02-smartstart-gallery-bottom.png`.

---

## Observations (not filed as actionable)

- **Catalog thumbnails blank on first open, populate lazily.** On opening the catalog most
  cards show empty placeholders; they render in over the next moment (confirmed populated in
  the very next shot). Not a bug — thumbnail render latency — but the first impression is poor
  on a slow device. (`07-catalog-drawer.png` → `08-finish-picker.png`.)
- **Plan-editor and mobile room-editor entry are slow on this GPU harness** (~18s "Opening
  floor plan…", ~13-15s "Entering room…"). Likely SwiftShader/ANGLE-harness-specific (thumbnail
  + lazy-chunk warmup), but worth a real-device timing check.
- **Center aux panels are mutually exclusive** — opening a second (Design score over Reno
  rules) showed only one, so no messy overlap. Good. (`06-pro-two-panels-overlap.png`.)
- **Cold-start onboarding, tour, location prompt, and first-paint furnished flat all look
  clean and coherent.** A newcomer is well-oriented. (`01-onboarding-welcome.png` …
  `08-final-scene-first-paint.png`.)
- **Room-category flow (rename + Room type) is coherent** — rename "Living/Dining"→"Reading
  Nook" and type→"Study" both reflect live on the plan and inspector.
  (`02-room-inspector-default.png` → `03-room-renamed-category.png`.)

## Micro-fixes applied
- `src/ui/Onboarding.tsx:160` — "7-step" → "9-step" (P3-1). Verified: `tsc` clean, `biome`
  clean, `ProductTour.test.tsx` 3/3 pass.
