# TODO

Legacy deferred-work log. **`CHANGELOG.md` is the source of truth for what shipped** — when an
item ships it is removed from here entirely. Only genuinely-open work remains below; the bulk of
this file's historical audit-wave / reconciliation content has been pruned (it all shipped).

> **Maintainability refactors** (MOD-PLANINSPECTOR-SPLIT, MOD-MOBILETOOLBAR-SPLIT) are tracked in
> `TASKS.md` under "Open — client-doable".

## ⛔ Production-infra-blocked — need a DEPLOYED host/backend, not app code
The dev paths already work (Vite reverse proxy, dev-gated providers); only the *production*
proxy/mirror/host is missing, and standing one up is a deployment task, not a code change here:
- **Runtime catalog CORS proxy** (ambientCG prod) — ambientCG's API/CDN send no CORS headers; prod
  needs a Cloudflare Worker / Vercel edge / hosted reverse-proxy. Until then ambientCG is dev-gated
  (Poly Haven works direct in prod).
- **Kenney / Quaternius mirrors** — no CORS-friendly API, ship single ZIPs; need a build-time mirror
  or proxy worker + format conversion (FBX/OBJ → GLB) before adding to the runtime catalog.
- **Sketchfab** — REST + OAuth token + runtime fetch (auth/ToS friction).
- **Poly Haven model fetcher / Kenney zip extraction** — Poly Haven serves multi-file gltf+bin+tex
  bundles (not single GLBs); need a pipeline that downloads + repacks to a self-contained `.glb`.

## Assets — open pipeline deferrals
- **KTX2/DDS standalone-material decode** — needs a WebGL readback; the model importer handles
  embedded KTX2, but standalone KTX2/DDS material uploads aren't decoded yet
  (`src/materials/convert/decodeImage.ts`).
- **Drop-folder material auto-detection** — infer channels from filenames (`*_diff.*`, `*_nor.*`,
  …) for material folders lacking a sidecar (`scripts/asset-pipeline/index-assets.ts`).
- **Build-time KTX2 in the offline asset pipeline** — `@gltf-transform/functions` lacks a bundled
  KTX2 encoder; integrate `@gltf-transform/cli` (`toktx`) or `basisu` for the offline pipeline
  (`scripts/asset-pipeline/process-texture.ts`). (The *in-browser* encoder already ships.)
- **Standard asset set expansion** (~80 assets) + **per-LOD texture variants** + **lazy/streaming
  GLB loading** — manifest schema already supports these; expand when bundle size justifies it.

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin stable per-asset URLs,
  audit periodically.
- **Bbox-derived footprints** can be wrong for off-floor anchors / non-uniform scale — revisit if
  it bites users.

## Time-of-day — out-of-scope deferrals (from the spec)
Auto-advancing in-world clock; window-glass tinting affecting shadow colour; localized per-room IBL
probes; directional door-bleed weighting; real-time path-traced GI/RTX (revisit only with affordable
WebGPU path tracing).

## Proactive-research candidates — client-feasible + headless-verifiable (2026-06-30 audit)
Vetted next-iteration targets surfaced when the active backlog proved thin/GPU-or-backend-blocked.
Each is pure-client, unit/scenario-verifiable without a real GPU or network, and value-ranked.
Confirmed NOT already shipped at audit time (grep-checked); re-confirm before starting.
- **Toast auto-dismiss pause-on-hover/focus** (a11y, WCAG 2.2.1 "enough time"): `NotificationContainer`
  currently schedules dismissal purely from `createdAt`, so a toast can vanish mid-read. Track a
  paused-id set + per-toast remaining-ms ref; clear on `mouseenter`/`focusin`, resume on
  `mouseleave`/`focusout`. Unit-test with fake timers (pause stops the clock; resume uses remaining).
- **`livePrices` IXT scenario** — **DEFERRED (user, 2026-06-30).** The feature is dev-only +
  network/sidecar-bound (lower user value), and a headless scenario would need a new dev-only
  `window.__priceSidecarStub` lever in `livePrice.ts` purely for the test. The unit-level coverage
  added in v0.9.0.2 already exercises the client logic; revisit only if the sidecar path regresses.
- ~~Shareable "design card"~~ — **already shipped** as the **moodboard** (F19, `ui/moodboard.ts` +
  `openMoodboard.ts`; flag `moodboard` "Shareable style-board export"): hero snapshot + palette +
  materials strip + furniture tiles → print/share HTML. Not a gap.
- ~~Before/after staging reveal~~ — **shipped v0.9.0.4** (`stagingReveal` flag; `ui/staging/stagingReveal.ts`
  + `ui/StagingRevealModal.tsx`; empty room vs furnished on a divider slider). See `CHANGELOG.md`.

_First 2026-06-30 batch resolved (2 shipped, 1 deferred, 1 was already-shipped)._

### Next batch (2026-06-30, grep-confirmed unbuilt; value-ranked)
- ~~In-engine one-tap style transfer~~ — **shipped v0.9.0.5** (`styleTransfer`). See `CHANGELOG.md`.
- ~~Style/personality quiz~~ — **shipped v0.9.0.6** (`styleQuiz` flag; pure `ui/styling/styleQuiz.ts`
  `scoreQuiz` + `ui/StyleQuizModal.tsx`; recommends + applies a `STYLE_PRESETS` look). _Tail: deeper
  Smart Start integration (seed the wizard from the quiz result) remains optional._ See `CHANGELOG.md`.
- ~~Configurable price-rule library~~ — **shipped v0.9.0.8** (`priceRules` flag;
  `analysis/renovationCost.ts` `PriceRules`; editor in `QuoteTemplateModal`). Closed parity gap M#2.
- **Fast rasterized "preview render" tier** (Coohom M) — local analog to the 10-s cloud render.
  Deferred under the direction change below (it's an analytics/deliverable, not core design UX).

## ⭐ DIRECTION CHANGE (2026-07-01, user) — focus on CORE INTERIOR-DESIGN UX
> "Instead of price and quotes, focus **solely on the core interior-design aspects and interactions**
> that make a good interior-design tool. Make it more **user-friendly, intuitive, easy to use,
> discoverable, customizable**, following modern UI/UX & design principles, curated for **both desktop
> and mobile**. Research the tools in `REFERENCES.md` for inspiration + best practices."

Next iterations target **the core design loop + its UX/discoverability/customizability** (furnish,
arrange, finish, view) on desktop **and** mobile — NOT pricing/quotes/analytics deliverables. Research
`REFERENCES.md` (Coohom, Planner 5D, IKEA Kreativ, Sweet Home 3D, …) before designing each change.

### Deeper core interactions (user 2026-07-01 #2: "granular collision, animations, realistic physics")
- ~~Granular shape-aware collision~~ — **shipped v0.9.0.9** (`footprintParts` convex decomposition +
  `itemFootprintParts`; any-part-vs-any-part SAT; L-sofa main-run+chaise). Infra reusable.
  Follow-ups: broadphase AABB unions parts (v0.9.0.11 fix); **selection + placement tint follows the
  granular polygon** (v0.9.0.13, `itemFootprintPartsLocal`) so the highlight matches the collision shape.
- **More composite footprints** — apply `footprintParts` to other non-rectangular pieces.
  Done: L-sofa (v0.9.0.9), corner base cabinet (v0.9.0.10) + the true spanning box drives the
  selection/resize handles (v0.9.0.14). Remaining candidates: **round/oval tables** — but note
  `footprintParts` is a **union** of OBBs, which can only *add* area, so it cannot carve the 4
  corners off a bounding square to make an octagon/disc. A round-table approx needs either (a) a
  new *intersection*/polygon footprint primitive, or (b) accepting a coarse cross/plus of inscribed
  rects (leaves diagonal gaps). Low priority + needs a design decision, not a quick decomposition.
  No U-sofa / corner desk / peninsula in the catalog today.
- **Animations** — door/drawer open-close easing (some exists: curtains/blinds ease in demand mode),
  smooth placement "drop-in" + selection transitions. Mostly pure state→transition; verify state
  transitions headless, smoothness by eye. M.
  - ~~Eased camera transitions~~ — **shipped v0.9.0.12** (`scene/cameras/cameraTween.ts`: smoothstep
    + distance-aware `flyDurationFor`; focus/top/home/saved-view all route through one `startFly`).
  - ~~Placement "drop-in" easing~~ — **shipped v0.9.0.15** (`scene/placementDrop.ts` central animator:
    `beginDrop` at commit + `registerDropGroup` per item + one mounted `<PlacementDropAnimator>`
    mutating only dropping groups' Y; no per-item `useFrame`). Pure timing unit-tested + verified live.
  - ~~Selection scale-in~~ — **shipped v0.9.0.16** (`scene/selection/selectionAppear.ts`; outline +
    tint ease 0.9→1 over 130 ms on select).
  - Door/drawer/cabinet open-close easing: **doors already animate** (linear swing 0.2 s in
    `Door.tsx`/`PlanDoorLeaf.tsx`) — could ease the curve, low value. Cabinet drawers/doors don't
    open at all (static fronts) — opening them would be a new feature, not just easing.
- **Realistic physics (light touch)** — gravity-settle on drop (rest on the surface below — partial via
  `surfaceDrop.ts`), drag inertia/easing, soft collision nudge (push-apart) rather than hard block.
  Scope carefully: a design tool wants *predictable* placement, so physics must aid, not fight, the
  user. Pure math core = verifiable; keep it opt-in/subtle. L.
  - ~~Soft push-apart on drop~~ — **shipped v0.9.0.17** (`obbMtv` MTV + `nudgeToValid`; invalid single-item
    drop nudges to the nearest valid spot, bounded ≤0.4 m, verified by `canPlace`). Wired in `DragController`.
  - Remaining (optional, higher-risk): **live** slide during drag (item hugs walls/furniture in real
    time, not just on release) — more invasive in `DragController`'s per-move snapping; drag inertia
    (skip — hurts precision). Gravity-settle already covered by `surfaceDrop.ts`.

> Audit note (2026-07-01): the core loop is already mature — align/distribute, apply-finish-to-all-rooms,
> numeric+90° rotate, saved cameras, smart-guides, height-aware collision all exist. Discoverability
> follow-ups: ~~keyboard cheat-sheet~~ **shipped v0.9.0.18** (`?` / ⌘K "Keyboard shortcuts"). ~~Silent
> synonym search~~ — smart synonym/intent search + "No matches" empty state were already shipped; the
> hidden **search-by-room** intent now shows a "Showing <room> furniture" caption (**v0.9.0.19**).
> ~~Inspector buttons don't advertise their hotkeys~~ — **shipped v0.9.0.20** (`title` tooltips
> w/ shortcut hints on Rotate/Flip/Duplicate/Delete). Remaining: one-time-only onboarding replay
> (lower priority).

### Vetted customizability / UX candidates (2026-07-01 Explore audit, source-verified absent)
Each grep-confirmed missing; re-confirm before starting. Ranked value×feasibility:
- **Live dimension readout during multi-select resize** (M) — the `ResizeGizmo` (2+ items only;
  single items resize via inspector sliders) has no live W×D feedback. `DragHud` is position-only
  (returns null for groups). Add a resize-drag signal + a HUD pill showing the group's live W×D.
  Flag `itemDimensionReadout` (simple). Note: single-item resize already shows metres in the
  inspector Size section, so scope this to the group-resize gizmo.
- **Unified room-customization panel** (M–L) — ceiling / baseboard / wall-accent finishes exist but
  are spread across separate pickers/modals (`ceilingFinish`, `wallBaseboard`, `wallAccentPicker`
  flags all present). A compact per-room panel (floor+wall+ceiling+baseboard+accent) would cut
  click-away friction. Needs a room-select signal on 3D wall/floor click (may not exist — verify).
  Flag `roomCustomizationPanel` (simple). Higher effort + risk (new panel + selection wiring).
- **2D-plan finish drag-and-drop** (S–M) — `finishDnd` drag-to-apply works in 3D
  (`scene/FinishDropSurface`) but NOT in the 2D plan editor. Add plan drop-zones reusing
  `finishDrop` + `setRoomFinish`/`setWallFinish`. Reuses the `finishDnd` flag (no new flag). Lower
  reach (many users never open the 2D editor); drag-drop is fiddly to verify headlessly.

## Process
- Update this file every time a plan is designed or work is implemented (MEMORY.md feedback rule).
