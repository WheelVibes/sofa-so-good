# Chrome interactive audit — 2026-08

A progressive visual + interactive audit of the whole app, driven through a **real
Chrome tab** (Claude-in-Chrome MCP) rather than the headless puppeteer harness, so
findings reflect a real GPU, real fonts and the real compositor.

- Harness: `scripts/lib/chrome-audit/driver.js` (in-page step engine + audit probes)
- Scenarios: `scripts/scenarios/chrome/ca-*.json`
- How to run: [docs/chrome-interactive-audit.md](../chrome-interactive-audit.md)

Severity: **P1** breaks or badly degrades a core flow · **P2** clear defect, flow still
works · **P3** polish / enhancement.

---

## Status of the existing puppeteer scenario corpus

Checked before porting anything, so the audit builds on what is actually current:

- **465 scenario files**, referencing **209 distinct store actions** — **0** of those
  actions are missing from the live store. The corpus is API-current.
- Of 196 distinct expected UI label strings, 21 do not appear literally in `src/` — all
  21 are **dynamic or composed** strings (fixture names like `Zqxtest`, counts like
  `2 selected`, or label+sub pairs such as `City — Daytime HDB skyline`, which the DOM
  composes from two nodes). None indicate drift.
- Conclusion: **no evidence of broad staleness**; nothing was deleted wholesale. Stale
  scenarios are removed individually as a run proves them wrong.

---

## Pass 1 — cold start (`ca-01-coldstart`), 30/30 steps

### P1 · A cold start after dark opens to a pitch-black flat

**What happens.** `timeMode` defaults to `'system'`, so the sun follows the real local
clock. Booting at 20:00 renders the flat almost entirely black — through the whole
onboarding modal, the whole 9-step guided tour, and the location prompt. `lightsMode` is
`'off'` at boot, so no interior light compensates.

**Why it matters.** The state is otherwise correct — `items.length === 87`, the flat is
fully furnished — the user simply cannot see any of it. A first-time visitor at night is
taught the app against an unreadable black canvas, and the move-in demo (the product's
main hook) is invisible.

**Evidence.** Same tab, same scene, nothing changed but the hour:
`timeMode:'system'` @ sysHour 20 → black shell; `setTimeMode('manual'); setManualHour(13)`
→ fully lit, furnished flat.

**Suggested fix.** On first run, open at a daylight hour (or clamp the initial hour into
daylight when the computed sun is below the horizon), and/or default `lightsMode` on when
the sun is down. Let `system` take over only once the user has seen the flat.

### P2 · Tour step numbering contradicts itself

The tour header reads **"STEP 2 OF 9"** while the title on the same card reads
**"1 · Look around"** — the welcome card is counted in the header but not in the titles,
so every content step is off by one against its own progress indicator.

### P2 · The primary CTA on the "Where would you like to start?" step is unlabelled ambiguity

The five choices are explicit (`Take the guided tour`, `Smart Start`, `Browse the catalog`,
`Move-in demo`, `Start empty`), but the visually dominant accent button says
**"Enter sandbox"**, which is bound to `choose('demo')` — i.e. it silently duplicates the
"Move-in demo" row under a different, developer-flavoured name. On a screen whose only job
is choosing, the loudest control is the one whose destination the user cannot predict.
Suggest labelling it for what it does, or binding it to the highlighted choice.

### P3 · Two onboarding systems run at once

The "Get started" 5-item checklist is mounted and visible (behind the scrim, then in front)
during the onboarding carousel *and* during the 9-step tour — 0/5 progress while a separate
9-step tour is mid-flight. Consider deferring the checklist until onboarding/tour completes.

### P3 · The onboarding card resizes between steps

Card height jumps step to step (hero → list → 5 choices), so the dialog visibly grows and
the footer controls move under the cursor. A `min-height` across the three steps would
steady it.

### Not defects (checked and cleared)

- **Latitude/Longitude inputs** were flagged by the first probe run as having no accessible
  name. **False positive** — they use implicit wrapping labels
  (`<label><span>Latitude</span><input/></label>`), which is a valid association. The probe
  was fixed to honour wrapping and `for=` labels.
- **All 13 background controls "covered"** during a modal — expected (that is what a scrim
  does). The probe now scopes itself to the open modal.
- **"Save coordinates" is not disabled** on empty input, but it does surface `manualError`
  rather than failing silently. Nit, not a defect.

---

## Pass 2 — Simple-mode core loop (`ca-02-simple-coreloop`), 46/46 steps, 0 failures

Overview, room editor, inspector, finish picker, walk mode and share all probed **clean**
for console errors, overflow, clipped text, accessible naming, broken assets, duplicate ids
and covered controls. Defects below are the exceptions.

### ~~P1 · The floor-lamp shade disappears at the `quality` quality tier~~ — RETRACTED

**There is no `quality` tier.** The real tiers are `performance | medium | high | maximum`.
`setQualityTier('quality')` stored an unknown value, `resolveQuality` found no preset and
spread `undefined`, so `geometryDetail` was `undefined` → `seg(28, undefined)` =
`Math.round(NaN)` = **NaN**, and a `CylinderGeometry` with NaN radial segments renders
nothing. The shade was never missing at any real tier — measured segment counts are
`performance 20 → medium 28 → high 39 → maximum 50`, exactly tracking `geometryDetail`
0.7/1/1.4/1.8. My invented tier caused it, exactly like the invented finish id below.

**What was real underneath it, and is now fixed:** `qualityTier` is **persisted**, so a tier
written by an older build (or any tier later renamed) would hit the same path and silently
render NaN geometry — invisible parts across the whole scene, no error anywhere.
`resolveQuality` now falls back to a real preset for an unrecognised tier (4 unit tests).

### P2 · The catalog's category rail hides 15 of its 17 categories with no affordance

`.cat-rail` holds **1738 px** of chips inside a **319 px** viewport — `overflow-x: auto`,
**no** gradient mask (`maskImage: none`), no chevron, no wrap. Only "Beds" and "Seating" are
readable; the third chip is clipped mid-glyph. Every other category (Tables, Storage,
Kitchen, Bathroom, Appliances, Lighting, Decor, Textiles, Outdoor, Electronics, Baby & Kids,
Pets, Laundry) is reachable only by a horizontal scroll the UI never advertises. This is the
catalog's primary navigation.

### ~~P2 · The catalog pager covers the last row of catalog cards~~ — RETRACTED

Measured and **false**. The last card's rect is `1114..1293`, the grid's visible area is
`175..812` and the pager is `812..850`: `rectsOverlap === false`. The cards were simply
scrolled out of a scrollable grid, and `elementFromPoint` at their centre returned whatever
*was* painted there. The bug was in the probe (now scroll-aware), not the app. The same
correction retracts the mobile "covered by `.cat-foot`" entries and every chip
"covered by canvas" / `offscreen-x` entry — all scroll-container artifacts.

### P3 · Catalog tile names truncate at 100 px

`L-shaped sectional` (103 px) and `Bay-window daybed` (112 px) ellipsise in a 100 px tile.

### P3 · `THREE.Clock` deprecation warning on entering walk mode

`THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` — emitted by
**dependencies** (`@react-three/fiber`, `three-stdlib`), not by anything in `src/`. Noted so
nobody hunts for it in app code; clears on a dep upgrade.

### Not defects (checked and cleared)

- **`quality` renders 53 fewer meshes than `performance`** (1072 vs 1125, deterministic).
  Those 53 are the fake contact-shadow planes (`MeshBasicMaterial` `PlaneGeometry` at
  y≈0.01) that the higher tier correctly replaces with real shadow maps.
- **Camera jumped to top-down while "typing" in catalog search.** Harness artifact: synthetic
  pointer events do not run the browser's native focus default action, so the keystrokes went
  to global shortcuts. With focus set explicitly, the query lands in the field and
  `cameraMode` stays `orbit` — **the app correctly suppresses shortcuts while a text input is
  focused.** The driver now focuses focusable click targets.
- **Top view is not a mode.** `setCameraMode('orbit')` does not restore framing after a
  top-view jump because top view is a one-shot camera move (`topViewNonce`), by design.
- **Searching "sofa" returns Dog ramp / Cat window perch / Console table.** Intentional
  keyword matching — `Dog ramp` really does carry `keywords: [… 'sofa' …]` (a ramp for sofa
  access), and the synonym pair `['sofa','lounge']` pulls in `Chaise lounge` /
  `Outdoor lounger`. Exact name matches do rank first. Ranking nuance, not a bug.

---

## Pass 3 — mobile layout (`ca-03-mobile-coreloop`)

Run at 606×701 (Chrome refuses to size the window to 390), which **does** cross the app's
mobile breakpoint: the toolbar collapses to a hamburger and the catalog becomes a bottom sheet.
Both rendered correctly, and the mobile home probed clean.

**Tap-target sizing could not be validly audited here** and nothing is reported from it.
Real desktop Chrome reports `pointer: coarse === false`, so the app's touch-only hit padding
legitimately does not apply, and the project's 44 px rule is deliberately **scoped to controls
isolated at a container edge** rather than global. A blanket list of "controls under 44 px"
(22 of them at one point) would have been wrong on both counts. That check belongs to
`SHOT_TOUCH=1` + a 390×844 viewport in the headless harness.

## Pass 4 — Pro panels (`ca-04-pro-panels`), 37/37 steps, 0 failures

Tier gating verified: with `uiMode: 'simple'`, `setClearancePanelOpen(true)` does **not**
render `#clearancePanel`. Checks, Design score, Elevations and Budget each probed clean for
overflow, clipped text, naming, coverage and contrast.

### P2 · A second dock panel floats on top of the first

Opening History while Shopping/Budget is open renders the History card **directly over** the
budget panel at the same anchor — not tiled, not offset, not tabbed. The budget panel's header,
tabs (`List · 87` / `Saved · 0`), total, budget-target input and all four preset chips
($10k/$25k/$50k/$100k) are unreachable, and the budget rows continue *below* the History card so
the two read as one broken panel. Confirmed visually and by 9 covered controls naming their
coverer.

### P2 · Elevation drawings collide their own labels

In the Drawings → Elevations output, item labels ("Nightstand", "Queen bed", "Three cushions")
overlap each other and the rotated AFFL dimension labels, leaving the drawing illegible at its
default scale. This is a deliverable artifact, so legibility is the feature.

### P2 · 37 anonymous "Wall 1 … Wall 37" buttons

The elevation wall picker is a grid of 37 generically-numbered buttons filling over half the
panel, with no room name, orientation or thumbnail. Choosing the right elevation is trial and
error.

### P3 · Score bars carry no severity colour

All five Design-score bars use the same accent hue, so 100/100 and 50/100 read identically;
the grade ring is green while the bars are red.

### Not a defect

- **Bare `$` in the budget total.** The panel does disclose SGD ("Approx. mid-market retail
  (SGD)" plus `aria-label="Budget target (SGD)"`), so this is a nit, not a localisation bug.

## Pass 5 — 2D plan editor (`ca-05-plan-editor`), 23/23 steps, 0 failures

### P1 · `Done` — the only way out of the plan editor — is off-screen at 1200 px  ✅ FIXED

The desktop header is `flex-nowrap overflow-x-auto`, so at a 1200 px viewport it scrolls:
`scrollWidth 1584` vs `clientWidth 1200`. Everything past 1200 px was unreachable and
unadvertised (no fade, no chevron, no visible scrollbar — the bar just stops after
"Grid 0.50 m"): the zoom stepper (`1222..1338`), `View ▾` (`1346..1395`), the area readout
(`1403..1516`) and **`Done` (`1524..1568`)**.

**Fix:** the trailing cluster is now `position: sticky; right: 0` (`.plan-header-end`) with a
short fade on its leading edge. `Done` measures `1140..1184` — on screen and hit-testable at
1200 px — and the middle of the bar still scrolls underneath.

### P2 · The ceiling-style control pushed its last option off-screen  ✅ FIXED

The plan properties panel is 256 px wide but its ceiling-shape segmented control measured
301 px (`945..1246`) with `overflow: visible`, so **"Sloped" (`1183..1243`) sat past the
viewport edge** and could not be clicked.

**Fix:** segmented controls inside panel bodies wrap (`.plan-props .seg, .panel-body .seg`).
"Sloped" now measures `1020..1081` and hit-tests. Deliberately **scoped** — a global
`.seg { flex-wrap: wrap }` also wrapped the plan toolbar's `View/Edit`, `Wall/Split` and zoom
segs into vertical stacks, a regression caught by looking at the screenshot.

### P2 · Small-room labels overflow their rooms

Room labels render at a fixed size regardless of room area, so in the tight rooms the
name/area/perimeter/socket block spills over walls and door swings — "Service Yard" (3.1 m²),
"Bath/WC 1" (4.1 m²) and "Corridor" all collide with the plan geometry.

### P2 · `setState` during render

`Cannot update a component (RenderPump) while rendering a different component (Textured)`
fires on entering the plan editor. Real React violation. It is **not** a store write in the
material-build path (`useTexturedMaterial` / `buildMaterial` / the material cache contain
none) — `RenderPump` subscribes to the whole store via `useStore.subscribe(markDirty)`, so the
writer is elsewhere in the `Textured` render path. Left unfixed rather than guessed at.

## Pass 6 — menus (`ca-06-menus-themes`)

The **TOOLBAR-MENU-VOID stagger bug has not regressed**: probed at open with no settle, every
child of the `.pop-panel` is fully opaque. The View menu is well grouped (CAMERA / STRUCTURE /
FRAMING) with keyboard hints.

### P3 · Orbit and Walk advertise the same shortcut

Both rows show a `V` badge, implying `V` selects that specific mode rather than toggling
between them.

---

---

## Pass 7 — every theme, light and dark (`ca-07-themes-contrast`), 47/47 steps

All five themes × light/dark, measured over dense panel chrome (catalog + inspector +
toolbar + info callout), not an empty canvas: **zero contrast failures in all ten
combinations.** The theme system meets the hard rule. The only finding repeated in every
combination was the catalog tile truncation — since fixed.

### P3 · "Good" and "bad" were the same colour in the default theme  ✅ FIXED

The Design-score bars *did* encode severity (`score >= 80 ? --accent : --danger`), but in
**clay** — the default theme — `--accent` and `--danger` sit only **22° apart in hue** at
similar lightness (estate: 40°), so 100/100 and 50/100 rendered as the same terracotta and
the encoding was invisible. Now uses `--ok`, which is ≥120° from `--danger` in all five
themes and matches the green grade ring already shown above.

## Pass 8 — daylight, moods and finishes (`ca-08-walk-lighting-finishes`)

Daylight across 07:00 / 13:00 / 19:00 / 22:00 all render plausibly (dawn, full day, dusk,
night). Light moods work — "movie" correctly drops the ceiling lights and leaves the floor
lamp and TV. Applying floor and wall finishes works end-to-end and the render updates.

**Recommendation (better than the shipped first-paint fix).** At 22:00 with `lightsMode: 'on'`
the flat is *lovely* — warm, legible, more inviting than the daytime view. A stronger fix for
the P1 below would be to keep the real clock and switch the interior lights on after dark,
rather than moving the clock to 13:00. That changes a user-facing default (`lightsMode` is
persisted state), so it is left as a product call rather than shipped unilaterally.

### P3 · Unknown finish ids are accepted silently

`setFloorFinish('livingDining', 'walnut-planks')` — an id I invented — was stored and rendered
as a fallback material with no warning; the real id is `floor-wood-walnut`. Users cannot hit
this (the picker only ever sends real ids), but it is a live hazard for **store-injected
scenarios**, which is exactly how the playbook's "fixtures must match the real types" warning
starts. Same class as the quality-tier retraction above.

## Pass 9 — Pro tools sweep (`ca-09-pro-tools-sweep`), 21/21 steps, 0 findings

Tools menu (clean at open — no stagger void), measure/tape, versions, accessibility and
credits all probed clean. The Tools menu is genuinely good: grouped under ANALYSE with a
one-line description per entry.

### P2 · The command palette could not find "measure"  ✅ FIXED

Typing `measure` returned **"No commands match"** — while the Tools menu offered "Measure
distance" and a `measure` command was registered and enabled. Cause: the filter was
`c.label.toLowerCase().includes(q)` — **label-only** — and that command's label is "Toggle
dimension labels", which shares no word with "measure". (The code comment above it promised
"fuzzy search".)

**Fix:** `matchesQuery()` now searches the label, the command **id**, and a new optional
`keywords[]`; the measure command carries `['measure','dimensions','ruler','size','distance']`.
Verified live: `measure`, `ruler`, `distance`, `dimension` and `smart-start` all resolve, and
an unrelated query still returns nothing. 5 unit tests.

### P2 · Analysis panels list problems you cannot locate

A repeated pattern across three panels, worth treating as one design issue:
- **Drawings → Elevations**: 37 buttons labelled `Wall 1 … Wall 37`, no room, orientation or
  thumbnail — over half the panel, and picking the right one is trial and error.
- **Accessibility**: seven identical rows reading `Door · 0.80 m — Widen to ≥ 0.85 m`, with
  nothing to say *which* door.
- **Checks**: names the pair ("Wardrobe ↔ Single bed"), which is the right pattern.

The finding is actionable only if the user can find the object. Suggest naming rows by room
and/or click-to-highlight in the 3D view.

### ~~P2 · A second dock panel floats on top of the first~~ — partly retracted, real cause FIXED

Aux panels *are* mutually exclusive by design (`closeAllAuxPanels`, "they all dock to the same
centred-top slot"), and every menu/palette path honours it — verified through the real UI:
opening Accessibility closed Design score. My original repro used direct store calls, which
bypass that contract.

**But one real entry point skipped it.** `BudgetHud` — the on-canvas spend pill — called
`toggleBudget()` directly. With the `budget` feature on and a target set, clicking it while
another aux panel was open left **two panels stacked in one slot**, the lower one's controls
unreachable. Confirmed through the real UI and in a screenshot, then fixed by routing the pill
through `closeAllAuxPanels` like every other entry point.

### P3 · Orbit and Walk advertised the same shortcut  ✅ FIXED

Both rows showed a `V` badge, implying `V` selects that row — but `V` *toggles*. The badge now
appears on the **inactive** row only, i.e. where the key actually takes you. Verified in both
states.

---

## Pass 10 — Smart Start, undo/redo, room switching (`ca-10`), 39/39 steps, 0 failures

**Undo/redo is correct**, asserted rather than eyeballed: delete an item → count drops by
exactly one → undo restores it → redo re-applies the delete → undo again. All four assertions
pass. Room switching follows the store (`livingDining → kitchen → mainBedroom`) and the
toolbar's room selector tracks it.

**Smart Start is a genuine strength** and probed completely clean. Its "starting state" options
are properly Singapore-specific — *New BTO — bare* ("cement-screed floors, no internal door
leaves, WC/basin pipe provisions only"), *New BTO — with OCS*, *Resale — as handed over*,
*Resale — after strip-out* — which is real HDB domain knowledge, not generic template copy.

### P3 · The kitchen reads as a grey box at the default tier (observation, not confirmed)

Switching to the kitchen shows cabinets, oven and fridge as flat near-black masses with little
material separation, against a warm floor. This is plausibly correct for stainless steel under
the Performance flat renderer rather than a defect, and I could not isolate the materials to
prove it either way — a raycast from this angle hits the faded front wall, not the appliances.
Flagged for review; the existing `brushed-metal-appliances` / `brushed-metal-flat` scenarios
are the right tool, since they can drive tiers headlessly.

## Pass 11 — File menu and export surfaces

31 entries, no stagger void at open, and after the fix below: **no clipped text, no overflow,
no covered controls, no contrast failures.** The export suite is a real differentiator — a
per-contractor trade pack for Tiler & wet works, Electrician, Plumber, Carpenter/joinery,
Aircon installer, Curtains & blinds vendor and Painter, plus DXF/SVG/GLB/USDZ/OBJ/STL, a reno
timeline `.ics`, and Sweet Home 3D import.

Download-triggering actions were deliberately **not** clicked — exports write files, which is
not something to do unattended.

### P3 · The longest trade-pack names were unreadable  ✅ FIXED

Each row is `[name flex-1 truncate] [Open / Print]` inside a fixed 256px menu, leaving ~108px
for the name — so "Carpenter / joinery" (116px) and "Curtains & blinds vendor" (150px)
ellipsised. The tooltip showed `p.scope`, not the recipient, so the truncated words were
readable nowhere. Menu widened to 304px and the tooltip now leads with the pack name.

---

## Pass 12 — remaining surfaces + walk interactions (`ca-11`, `ca-12`)

Moodboard, comments, saved views, staging reveal, time-of-day compare, the product
configurator and the GLB asset designer all open and probe **clean**. Walk-mode interactions
are correct and asserted: live measure, FOV (85°), eye height (1.2 m) and the light toggle all
apply, and the camera returns to orbit. 31/31 and 38/38 steps, 0 failures.

**A process fix these passes forced.** `ca-11`'s first run reported 30 "covered controls" — all
noise, because the pass inherited the plan editor and an Accessibility panel left open by
earlier manual testing. Audit scenarios now begin with an explicit `reset-baseline` step and an
assertion that the pass really starts from the 3D view. A scenario that trusts the state it
inherits measures the previous test, not the app.

### P3 · Three preview canvases asked for a deprecated shadow type  ✅ FIXED

`THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated` fired whenever the configurator
opened. The main scenes already map `pcf → PCFShadowMap` deliberately (r184 coerces the soft
variant and warns), but three secondary canvases — `ConfiguratorPreview`, `ParametricPreview`
and the GLB `DesignerViewport` — passed a bare `shadows`, and r3f's default for that is the
deprecated `PCFSoftShadowMap`. So they logged a warning *and* silently rendered plain PCF.
All three now state `shadows={{ type: PCFShadowMap }}`.

## Deferred items now closed

### P2 · Elevation drawings collided their own labels  ✅ FIXED

Item names are drawn centred in each silhouette, with the font size clamped to a 0.12 floor and
**nothing measuring the text against the box** — so "Three cushions" rendered ~0.9 m wide inside
a 0.5 m item and ran across its neighbours and the rotated AFFL dimensions. Labels are now
truncated to the silhouette (`LABEL_CHAR_RATIO`, a realistic 0.52 glyph advance — reusing
`approxTextWidth`'s deliberately conservative 0.62 rejected names that fit, e.g. a 7-character
"Cabinet" in a 1.0 m item). Truncating beats dropping: every piece stays identified, and the
full name is still in the schedule with its width dimension below. Verified: the drawing now
reads `Curtains` / `Queen bed` / `Night…` / `Throw…` with no overlaps.

### P2 · Analysis panels that don't identify the object  ✅ FIXED

Both lists now name what they are talking about, reusing the plan editor's own room→element
allocation (`assignRoomOpeningNames` / `assignRoomWallNames`) — the seeded default plan carries
no element names, because auto-naming only runs when a room is added or renamed, which is
exactly why these lists were anonymous.

- **Accessibility**: seven identical `Door · 0.80 m` rows → eight distinct rows
  (`Main Bedroom door 01 · 0.80 m`, `Living / Dining door 01 · 1.00 m`, …). "Widen this one" is
  now actionable.
- **Drawings → Elevations**: `Wall 1 … Wall 37` → 33 of 37 named (`Kitchen wall 04`,
  `Living / Dining wall 02`); the 4 walls on no room boundary keep the numbered fallback. The
  detail caption follows suit: `Main Bedroom wall 01 · 5.59 m × 2.60 m · 2 windows · 16 items`.

### P2 · Plan room labels in small rooms — PARTLY fixed, restated

`roomLabelDetail` decided detail purely from **area**, so a long thin room (HDB service yards,
bath/WCs) could clear the threshold while being far too narrow for `P 7.24 m` or
`0/2 sockets` — which, unlike the room name, are never wrapped. It now also takes the room's
on-screen width, and the socket line (the widest string) is gated to full detail. 5 unit tests.

**Restated honestly:** this guards a real class of spill, but it does not fully fix what I
originally photographed. Measured against the default plan, the labels mostly *do* sit inside
their rooms; what makes them look wrong is **collision with door swing arcs and wall strokes**
in tight rooms, which needs a proper label-placement pass (same family as the elevation fix
above). My original "labels overflow their rooms" framing was stronger than the evidence.

---

## Pass 13 — AI surfaces, multi-level, and the kitchen material question

Design chat, style quiz and style transfer all mount and probe **clean**; design chat is
honestly framed ("advice only, no edits") with grounded example prompts. Multi-level plans
work — `addLevel('Upper floor')` creates a storey at elevation 2.9 under `plan.upperLevels`
(ground is implicit in the root `walls`/`rooms`/`openings`); my first check read a
non-existent `plan.levels` and wrongly looked like a bug. That is the value-space lesson for
the third time.

### P2 · Metals rendered BLACK at the default tier  ✅ FIXED

The kitchen "grey box" from pass 10 is explained and fixed. The appliances were never dark:
the fridge is `#d8dade`, the stove and range hood `#cfd2d6` — all at `metalness 0.9`. A fully
metallic PBR surface has **no diffuse term**, so its entire appearance is reflected
environment, and the Performance tier (the default) runs `ibl: false`, leaving
`scene.environment === null`. With nothing to reflect they rendered as flat black silhouettes.

Measured: `scene.environment` is `set` at medium/high and `NULL` at performance.

**Fix:** `getMetalMaterial` caps metalness at `NO_IBL_METALNESS` (0.25) while no environment is
active, keyed into its cache so a tier switch rebuilds. The signal is a small module
(`materials/iblSignal.ts`) set by `SceneEnvironment` rather than a store read — importing the
Zustand store into the material layer dragged `resolveFlags` into 22 tests' module mocks and
broke them. Verified: fridge `metalness 0.9 → 0.25`, kitchen now reads as a kitchen; 5 tests.

**Partial, deliberately.** Some primitives set `metalness` inline in JSX (`Stove.tsx`,
`Refrigerator.tsx` handles) and still sit at 0.7–0.85 with no environment. Capping those needs
either a hook in each primitive or a runtime walk that mutates shared cached materials — too
broad to do safely at the end of an audit, so it is logged. The genuinely dark parts that
remain (hob glass `#1c1f24`, hood interior `#2b2e33`) are *correct* material design.

### P2 · A second `setState` during render  ✅ FIXED

`SceneReadySignal` had the same defect as `RenderPump`: it subscribed via `useProgress()` but
only read the value inside `useFrame`. Entering the plan editor produced
"Cannot update a component (SceneReadySignal) while rendering a different component
(Textured)". Now read imperatively. Verified over two plan-editor round trips (0 warnings) —
and, because this component is what lifts the boot loader, with a cold-boot check: boot
completes, `sceneReady` true, 87 items.

---

## Pass 14 — accounts (the last unaudited surface)

The dev backend was up all along (`/api/health` → 200 through Vite's proxy), so the sign-in
screen could finally be audited. It probes **completely clean** — no overflow, clipped text,
naming, coverage or contrast findings — and is fully keyboard-reachable (all four controls at
`tabIndex 0`). The fields are correctly wired for password managers:
`type=email autocomplete=username` and `type=password autocomplete=current-password`, each with
an `aria-label`. **No credentials were entered** — the audit covers the UI, not authentication.

Finding: it is a full-viewport `div.login-screen[role="dialog"]`, not a `.modal-overlay`, so the
`covered` probe reported all 13 controls behind it. Probe now treats any visible
`[role="dialog"]` as an overlay (last one wins). Retraction #8, same family as the others.

### P2 · Metals rendered black — second path closed

`applianceBodyMaterial` only routes a `steel` finish through the brushed-metal factory; every
other appliance finish goes to `getSolidMaterial`, which had no cap. It now applies the same
`NO_IBL_METALNESS` clamp, keyed into its cache. Non-metallic solids are untouched.

**Still partial, and this is the honest boundary:** many primitives build materials *inline* in
JSX (`<meshStandardMaterial metalness={0.7}/>` in `Stove`, `RangeHood`, and others), and 26
distinct metallic materials still bypass both factories. A one-shot runtime pass would not hold
— React recreates those instances as items mount — so the real fix is to route inline primitive
materials through the shared helpers. That is a refactor across many files, deliberately not
attempted at the end of an audit.

---

## Pass 15 — the black-metal bug, finished properly

The previous round's boundary ("26 materials bypass the factories") turned out to be the wrong
conclusion, reached by counting materials instead of measuring what they cover. Measuring the
world-space area of every metallic mesh found **8 surfaces over 0.4 m²** — and identified them:

- **Interior door leaves** — `0.8 × 2.1 m` at `metalness 0.85`. Large, everywhere, and rendering
  as black slabs.
- **Wardrobe frame panels** — `2.04 × 0.49 m` at `metalness 0.75` (`Wardrobe.tsx`, spread inline).

Everything else above 0.5 metalness is a small accent (legs, handles, rails, knobs, burners) or
an intentionally dark part (hob glass, hood interior), where reading dark is fine.

### The door leaves exposed an ordering flaw in my own fix

They are built during the **first mount**, before `SceneEnvironment`'s effect could set the IBL
signal — so they were cached UNCAPPED even after the factory fix landed. `isIblActive()`
defaulted to `true`, which is right for tests and any non-app consumer but wrong for the app,
which always boots at `performance` (ibl off).

Flipping the default to `false` was the obvious move and the wrong one: it broke four existing
tests that legitimately assert the physical presets (brushed brass at `metalness 0.95`). The
correct fix is to have the **store** push the real state — `syncIblFromTier()` in `uiSlice`,
seeded at module load and called from `setQualityTier` / `autoSetQualityTier`. Module init runs
long before React mounts anything, so the shell sees the right value when it builds.

`Wardrobe.tsx`'s inline frame now routes through `getSolidMaterial`, inheriting the cap.

**Result: large metallic surfaces on the default tier went 8 → 0**, verified on a fresh boot.
Door leaves measure `#9aa0a6@0.25` where they were `@0.85`.

---

## Pass 16 — plan room labels, measured rather than argued

I had been going back and forth on this one, so I measured it: intersect every room label's
bounding box against the plan's door-arc paths. **3 of 11 labels collided — the worst with 56%
of its label box over an arc** (Corridor; then Service Yard 38%, Bath/WC 1 22%). So the problem
was real, and my round-4 "mostly fine, just crowding" restatement had been too generous.

**What NOT to do:** a placement search. All three offenders are tight rooms (Corridor is 1.0 m
deep, Service Yard 1.42 m wide) where the label has nowhere to go — nudging would move the
collision, not remove it.

### P2 · Room labels had no halo  ✅ FIXED

Four other plan layers — `DimensionsLayer`, `FurnitureLayer`, `MepLayer`,
`DraftOverlayLayer` — already draw their text with
`paintOrder: 'stroke'; stroke: var(--surface); strokeWidth: 3`. Room labels were the **only**
layer without it. Adding it makes the glyphs punch a gap through whatever they cross, which is
the standard cartographic answer and needs no layout change at all.

Verified: 11/11 labels carry the halo, and in the screenshot the three colliding labels read
cleanly over their arcs.

**Harness note:** the Chrome extension disconnected mid-verification (collateral from an
out-of-memory kill when I chained `tsc` + `biome` + `vitest` in one command). This is exactly
the case CLAUDE.md's fallback rule covers, so verification ran through
`shot.mjs --scenario` instead — same step vocabulary, and it produced both the measurement and
the screenshot. Lesson for the harness doc: run the heavy phases separately.

---

## Pass 17 — the mobile half, with real touch (headless)

The check I had deferred all audit long, and the one place my stated reasoning was wrong.

**Correction first.** I had written that tap targets "cannot be audited in Chrome because
`pointer: coarse` is false". That is wrong for this codebase: every 44px `min-height` rule in
`responsive.css` sits inside `@media (max-width: 960px)` — gated on **width**, not pointer (the
only `(pointer: coarse)` query in the stylesheet hides a `kbd` hint). Chrome at a narrow window
*was* applying the touch sizing. Chrome's real limits are the **~606px window clamp** and
**coarse-pointer JS paths**. Both docs corrected.

That clamp still matters: at 606px the app renders desktop-ish controls, which is why a Chrome
run there flagged 22 "violations" where a real 390px run flags one.

### The headless harness was silently dropping touch emulation

`SHOT_TOUCH=1` sets `isMobile`/`hasTouch` at launch, but Puppeteer's `setViewport` **replaces**
the whole config and the scenario `viewport` step omitted them. So any scenario combining
`SHOT_TOUCH=1` with a `viewport` step lost `(pointer: coarse)` from that step onward — touch-gated
paths silently stopped being exercised while the run still reported green. This affects existing
mobile scenarios that switch viewport mid-run. Fixed in `interact.mjs`.

### P2 · "Nudge apart" was 81×27 on a phone  ✅ FIXED

The Clearance panel's primary action, ×24 down the list, at 27px tall. Now `min-height: 44px` —
lifting the height rather than adding `::after` expanders, which is the project's own precedent
for stacked rows (the plan header does the same for Undo/Redo).

### P3 · Three isolated controls under 44px  ✅ FIXED

The checklist dismiss ✕, the favourites chip (icon-only — it needed min-**width**; the existing
`.catalog .chip` rule only lifted height), and the bottom sheet's `.sheet-grab` drag handle.

**Two mistakes I made and caught here, both worth recording:**
- A `.catalog .insp-head-btns .icon-btn::after { inset: -9px 0 }` rule **overrode** the existing
  `.catalog .panel-head .icon-btn::after { inset: -9px }`, silently REMOVING the horizontal half
  of a hit area that was already correct. More specific is not always better.
- `.sheet-grab { position: relative }` overrode its existing `position: absolute` and shifted the
  drag handle off its anchor. The button was already positioned; the `::after` alone was enough.

### Probe bug: `content: ''` is falsy

Both harnesses guarded with `if (after.content && after.content !== 'none')`. `content: ''`
computes to the **empty string**, which is falsy in JS — so every hit-area expander built that way
was skipped, and compliant 26px icon buttons (26 + 2×9 = 44) were reported as violations. This is
what made the earlier Chrome tap-target list look so alarming. Fixed in the driver and the
scenario.

### Result at a true phone viewport, with touch

| Surface | Undersized targets |
|---|---|
| Home screen (390×844) | **0** |
| Catalog bottom sheet | **0** |
| Pro panel (Clearance checks) | **0** |

`documentElement.scrollWidth === clientWidth` at both **390px** and **320px**, and **zero**
off-screen elements at 320px — the responsive layout is genuinely solid.

---

## Pass 18 — the boot loader (found by accident, in a throttled tab)

Reconnecting to a restarted Chrome landed on a **hidden** tab, so the app sat throttled on its
boot screen — which handed me a surface no scenario can reach. The playbook says as much: the
harness waits out the boot before step 1, so `waitFor {css: "#boot-loader"}` always times out.

Probing it found the app's **first impression failing WCAG AA in both modes**:

| | colour | vs gradient outer | vs gradient inner |
|---|---|---|---|
| light (before) | `#8a7d68` | **3.07:1** | **3.46:1** |
| light (after) | `#6b6049` | 4.72:1 | 5.32:1 |
| dark (before) | `#9a8f7e` | 5.12:1 | **4.09:1** ← where the text sits |
| dark (after) | `#a89c88` | 6.03:1 | 4.82:1 |

The boot screen's only line of text ("Laying the floor tiles…", the cycling phrase) was below
4.5:1 — and dark mode failed too, against the *lighter centre* of its radial gradient, which is
exactly where the text is. Both now pass AA at both ends of both gradients.

These are colour literals rather than tokens, which is correct here and not a rule violation:
`index.html`'s boot styles are inline critical CSS that runs before any token stylesheet loads,
and the surrounding rules already use literals for the same reason.

Verified with the playbook's own boot-loader technique — snapshot the served HTML with the module
scripts stripped so the loader runs forever, then point a scenario at it over `file://` — and
reviewed in both modes: the subtitle is legible and still subordinate to the title.

---

## Pass 19 — closing every remaining open item

### P2 · Lights on after dark, replacing the hour override  ✅ FIXED

The original first-paint fix forced the clock to 13:00. It worked, but it silently disagreed
with the time shown in the Scene panel. The better behaviour — identified during pass 8 and
now shipped — keeps the **real** time and switches the interior lights on instead. Verified on
a genuine cold start at **01:00**: warm, legible, furniture clearly visible, and the toolbar's
light toggle reads ON so the state is discoverable and reversible. `timeMode` stays `'system'`.

### P3 · Inline-JSX metal accents  ✅ FIXED

The remaining ~65 sites that bypassed both shared factories. A hook per site was impossible —
many are inside `.map()` callbacks — so the answer was a **component**: `<MetalMaterial>`, which
subscribes to the IBL signal via `useSyncExternalStore` and caps a numeric `metalness` when
there is no environment. Components may be rendered in loops freely.

Converted in two passes: 52 single-line `<meshStandardMaterial …/>` sites, then 53 spreads whose
source object literal declares `metalness ≥ 0.4` (resolved per file rather than guessed).

| | before | after |
|---|---|---|
| metallic materials (>0.3) at the default tier | 133 | **44** |
| highest metalness with no environment | **0.9** | **0.4** |

Nothing renders black now: at 0.4 the diffuse term dominates. And it is genuinely reactive —
switching to `high` restores the full physical 0.9 and returning to `performance` re-caps to
0.4, with no remount.

### P3 · `THREE.Clock` deprecation — NOT fixable here, and now classified

Checked rather than assumed: `@react-three/fiber` constructs `new THREE.Clock()` for
`state.clock`, part of its documented public API. I installed **9.7.0 (latest)** in a temp dir
to confirm — it still does, so upgrading would not clear the warning. `three-stdlib` is the
same.

What *was* actionable: the warning appeared in every console probe and could bury a real one.
The probe now tags dependency-owned noise `upstream` and sorts it last. Verified: an app warning
and an app error both sort above the tagged `THREE.Clock` line.

---

## Pass 20 — the signed-in surfaces

Run against a session the **user** signed in; the audit never enters credentials. Signed in as
`admin` with a healthy API.

**Versions works properly with a real backend** — the autosave row appears with Restore /
Compare / Compare in 3D, and the local edit → undo round-trip is unaffected.

### P3 · Version thumbnails read as broken  ✅ FIXED

`saveThumb(captureThumb())` runs only on an **explicit** save, so the two most common rows — the
current working layout and the autosave — always rendered an empty 70×52 grey box next to rows
that can have a preview. Capturing a thumb on every autosave was the wrong fix: `captureThumb()`
is a GPU readback and autosave runs often. Instead `.ver-thumb:empty` now draws a faint centred
marker, so the absence reads as "no preview" rather than a failed image.

### P2 · A failed shared-library load was permanent  ✅ FIXED

`bootstrapSharedLibrary` guarded with `status !== 'idle'`, so once it errored **nothing could
retry it** — every later call returned immediately and the feature stayed dead for the session,
with no retry affordance. The guard now short-circuits only on `loading` / `ready`.

### P2 · …and it failed mutely  ✅ FIXED

Three different failure modes — a thrown fetch (wrong origin / CORS / server down), a non-2xx,
and an SPA fallback answering **200 text/html** — all collapsed into a bare `status: 'error'`
with nothing logged. Working out which one it was took a series of manual fetches. All three now
warn with the URL and the reason.

The actual cause here turned out to be **environmental, not a defect**:
`[sharedLibrary] /api/assets/library/index.json returned 404 — no library manifest here.`
The manifest is published to R2 by `build-library-index` and simply is not present in a local
dev environment. That is exactly the sort of thing the diagnostics now say out loud.

### Not audited

Cloud **sync** reconciliation still needs a design saved and re-fetched across sessions —
out of scope for a read-only audit pass.

---

## Fixes applied and verified

Each was verified in the live tab (measurement + pixels), not just by tests passing.

| # | Finding | Fix | Verification |
|---|---|---|---|
| 1 | **P1** `Done` off-screen in the plan editor at 1200px | `.plan-header-end` sticky + edge fade | 1524..1568 → **1140..1184**, hit-testable |
| 2 | **P1** black flat on a cold start after dark | `ensureDaylightFirstPaint()` in the bootstrap seed | fresh boot at 22:00 → lit flat in 1.5s; 5 tests |
| 3 | **P1** "Exit room" unclickable under the catalog | `.toolbar` clamped to the stage, not `100vw` | 202..238 (covered) → **393..429**, reachable |
| 4 | **P2** catalog rail hid 15 of 17 categories | right-edge fade mask on `.cat-rail` | fade visible; no mid-glyph cut |
| 5 | **P2** "Sloped" unclickable in plan properties | panel-scoped `.seg` wrap | 1183..1243 → **1020..1081** |
| 6 | **P2** `setState` during render (`RenderPump` ← `TexturedRoomFloor`) | drei progress read via `useProgress.getState()` in the rAF loop | warning gone over 3 finish swaps; `assetsActive` false at idle |
| 7 | **P2** command palette could not find "measure" | search id + `keywords[]`, not label alone | live queries resolve; 5 tests |
| 8 | **P2** two aux panels stacked in one slot | `BudgetHud` routes through `closeAllAuxPanels` | score open → pill click → only Budget remains |
| 9 | **P2** unknown quality tier → NaN geometry | `resolveQuality` falls back to a real preset | 4 tests; real tiers 20/28/39/50 segs |
| 10 | **P2** elevation drawings collided their labels | truncate item labels to the silhouette | drawing legible; 50 elevation tests pass |
| 11 | **P2** anonymous door rows in Accessibility | name doors via `assignRoomOpeningNames` | 7 identical rows → 8 distinct named rows |
| 12 | **P2** `Wall 1 … Wall 37` in Drawings | name walls via `assignRoomWallNames` + caption | 33/37 named, 4 fallbacks |
| 13 | **P2** narrow rooms forced unwrappable detail lines | width-aware `roomLabelDetail` + socket line at full only | 5 tests |
| 14 | **P3** catalog tile names truncated in every theme | two-line clamp on `.cat-card-name` | "L-shaped sectional" wraps; probe empty |
| 15 | **P3** tour numbering contradicted itself | dropped redundant `N · ` title prefixes | "Step 2 of 9" / "Look around" |
| 16 | **P3** Orbit + Walk shared a `V` badge | badge on the inactive row only | verified in both camera modes |
| 17 | **P3** pass/fail bars indistinguishable in clay | `--ok` instead of `--accent` for passing | bars now hue 150 vs 20 |
| 18 | **P3** longest trade-pack names unreadable | File menu 256 → 304px; tooltip leads with the name | File menu probes fully clean |
| 19 | **P3** deprecated shadow type on 3 preview canvases | explicit `PCFShadowMap` | warning gone; only dep warnings remain |
| 20 | **P2** metals rendered black at the default tier | cap metalness while no IBL (`iblSignal`) | fridge 0.9 → 0.25; kitchen reads correctly; 5 tests |
| 21 | **P2** `setState` during render (`SceneReadySignal` ← `Textured`) | read drei progress imperatively in `useFrame` | 0 warnings over 2 plan-editor round trips; cold boot still lifts |
| 22 | **P2** metals black via the second material path | same no-IBL cap in `getSolidMaterial` | fridge 0.9 → 0.25; kitchen reads correctly |
| 23 | **P2** door leaves + wardrobe frames still rendered black | store-level `syncIblFromTier` (seeded at module load) + wardrobe routed through the factory | large metallic surfaces **8 → 0** on a fresh boot |
| 24 | **P2** room labels unreadable over door arcs | text halo, matching the other four plan layers | 3/11 labels collided (worst 56%); 11/11 now haloed and legible |
| 25 | **P2** "Nudge apart" 81×27 on a phone (×24) | `min-height: 44px` on `.aux .clr-item .btn` | Pro panel 28 → **0** undersized targets at 390px |
| 26 | **P3** three isolated controls under 44px | `::after` expanders + min-width on the favourites chip | home + catalog **0** undersized at 390px |
| 27 | **harness** `viewport` step dropped touch emulation | repeat `isMobile`/`hasTouch` in `interact.mjs` | `(pointer: coarse) === true` after a viewport step |
| 28 | **harness** `content: ''` is falsy, so hit-expanders were ignored | test `!== 'none'` instead | compliant 26px icon buttons no longer flagged |
| 29 | **P2** boot-screen text failed WCAG AA in BOTH modes | `#6b6049` light / `#a89c88` dark | 3.07 → 4.72 (light), 4.09 → 4.82 (dark); reviewed in both modes |
| 30 | **P2** first paint after dark forced the clock to 13:00 | keep real time, switch interior lights on | verified at a real 01:00 cold boot; 7 tests |
| 31 | **P3** ~65 inline metal accents bypassed the factories | `<MetalMaterial>` component + 105 mechanical conversions | max metalness 0.9 → **0.4**; reactive across tier switches |
| 32 | **P3** `THREE.Clock` noise could bury real warnings | probe tags upstream noise and sorts it last | app warnings verified sorting above it |
| 33 | **P2** a failed shared-library load could never retry | guard only on `loading`/`ready` | retry re-attempts instead of returning; 2 tests |
| 34 | **P2** shared-library failures were silent | warn on throw / non-2xx / non-JSON | live warning names the URL + 404; 2 tests |
| 35 | **P3** version thumbnails read as broken | `.ver-thumb:empty` placeholder marker | verified in the panel, both rows |

## Still open

Nothing from the audit remains open. For the record, two items were **closed as not-fixable /
not-a-defect** rather than by a code change:

- **`THREE.Clock`** — dependency-owned (`@react-three/fiber` 9.7.0, the latest, still uses it for
  its public `state.clock`). Classified in the probe so it cannot bury a real warning.
- **Unknown finish ids are accepted silently** — deliberately given no runtime guard:
  user/remote/DLC materials resolve asynchronously, so a synchronous validity check would warn on
  legitimate ids. Documented in the harness instead, where the hazard actually bites.

Cloud **sync** behaviour is the one thing genuinely untested — it needs a real signed-in session,
and no credentials were entered (nor should they be).

## Method notes — eight retractions

Every one came from measuring wrong, or from driving the **store** instead of the **UI**:

1. **"Pager covers catalog cards"** — the probe hit-tested elements clipped by a scroll
   container; the rects never overlapped.
2. **"Shade disappears at quality tier"** — no such tier; the invalid value produced NaN
   geometry. (The robustness gap underneath was real and is fixed.)
3. **"Two panels overlap"** — the mutual-exclusion guard works; only one entry point skipped
   it. (That entry point was real and is fixed.)
4. **"Item deleted toast clipped to 1px"** — it is the app's screen-reader live region.
5. **"30 covered controls" in `ca-11`** — inherited state from a previous run, not the app.
6. **"GLB designer template buttons covered"** — they sit in a collapsed `<details>`.
7. **"addLevel does nothing"** — storeys live under `plan.upperLevels`; `plan.levels` does not
   exist.
8. **"13 controls covered" on the login screen** — it is a full-viewport `[role="dialog"]`, not
   a `.modal-overlay`.

Plus one non-finding: **22 "tap targets under 44px"**, invalid because desktop Chrome reports
`pointer: coarse === false` and the project's 44px rule is scoped to isolated controls.

The probes were hardened after each: scroll-aware, modal-aware, screen-reader-aware and
disclosure-aware. **Rules: reset to a known baseline, reproduce through the real UI, and check
the value space before asserting on it** — three of the seven were value-space mistakes
(`walnut-planks` vs `floor-wood-walnut`, a `quality` tier that does not exist, `plan.levels`
vs `plan.upperLevels`).
