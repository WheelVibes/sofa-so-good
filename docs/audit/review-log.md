# Standing review cycle — log

One entry per review pass of the rotation in `/tmp/photoreal-mobile/review-cycle.md`. Newest
first. Each entry records the date, the HEAD reviewed, the area, what was found, and which area
comes next.

## 2026-09-25 — round 7 (research sweep, product/UX audit, four shipped features, three rendering wins, doc hygiene)

- **HEAD reviewed:** round started at `2f621182` (v0.35.12.2, post-merge of PR #120
  `feat/photoreal-adaptive-fallback`) and ships through `57a141aa` (v0.35.17.0), branch
  `feat/photoreal-round7`, 17 commits by roughly ten parallel agents.
- **Area:** not a single numbered review area — a full round: a state-of-the-art research sweep,
  a product/UX gap analysis, five shipped product/UX items, one perf attribution + fix, one
  upstream rendering fix, one new rendering feature, a KTX2/Basis runtime, a visual-verification
  pass over the round's own UI surfaces, and (this entry) a documentation-hygiene pass.
- **Docs:** [`docs/research/sota-2026-09-25.md`](../research/sota-2026-09-25.md) (research sweep —
  recommends per-room specular probes, KTX2, POM tiling, AO/MSAA coexistence, cited Shapespark +
  Needle Engine, both now added to `REFERENCES.md`); [`docs/audit/product-ux-2026-09-25.md`](./product-ux-2026-09-25.md)
  (gap analysis, R7-C, findings U1–U9); [`docs/audit/visual-verify-r7-2026-09-25.md`](./visual-verify-r7-2026-09-25.md)
  (R7-G, findings V1–V14 over the four shipped UI features); [`docs/audit/perf-trace-2026-09-25.md`](./perf-trace-2026-09-25.md)
  (CDP-trace attribution of `perf-2026-09-19.md`'s P1); [`docs/audit/code-review-r7-2026-09-25.md`](./code-review-r7-2026-09-25.md)
  (R7-O, adversarial static review, landed after this pass started — see below);
  [`docs/developer/showroom-links.md`](../developer/showroom-links.md) and
  [`docs/developer/pwa-install.md`](../developer/pwa-install.md) (the two biggest features'
  developer docs); [`docs/developer/ktx2-textures.md`](../developer/ktx2-textures.md) (KTX2
  runtime).
- **Shipped, ranked by the product audit's own ordering:** **U1** read-only "showroom" share links
  gated at four chokepoints (`v0.35.12.5`) · **U4** in-app tri-state "Reduce motion" toggle
  (`v0.35.12.4`) · **U2** PWA install CTA + iOS coachmark (`v0.35.16.0`) · **U6** live room-name
  pill in orbit mode (`v0.35.12.6`) · **U3** "no account, no server" onboarding line (`v0.35.12.7`).
  **U5** (walk-mode comfort controls), **U7**–**U9**'s onboarding-hierarchy/copy items were **not**
  picked up this round and remain open in `docs/audit/product-ux-2026-09-25.md` (U9 itself was
  investigated and resolved as **V13** below, so it is no longer open in substance even though the
  audit row is unactioned).
- **Also shipped:** **P1** (`perf-2026-09-19.md`) attributed and mitigated by CDP trace
  (`v0.35.12.3`) — a synchronous `getImageData` GPU readback in the status-bar-tint sampler, not a
  GC pause as originally hypothesised; the residual 30 Hz under lights-on is now understood to be
  GPU fill-bound and stays a separate open item. **`z22`** MOBILE-BLACK-FLICKER
  (`docs/open-graphics-decisions.md`) root-caused and fixed upstream (`v0.35.13.0`,
  AO-DEPTH-ISOLATION) — a `postprocessing` depth-texture format mismatch, fixed by upgrading to
  `^6.39.5` rather than working around it; the `ao` veto that made `mobileMsaa` unreachable is
  removed, though the flag's **default stays OFF** pending real-device evidence against the
  separate, still-open `z21`/pmndrs#412 lead — this is a plumbing fix, not an "MSAA is now on"
  change. **R7-L** per-room box-projected specular probes (`v0.35.17.0`, the research sweep's
  recommendation #1), diffuse-leak-proof by construction (envMap stays null). **R7-H** KTX2/Basis
  runtime (`v0.35.14.0`) — fixes a real, previously-false
  doc claim (`decoders.ts` said drei auto-wires a `KTX2Loader`; it does not) and ships the 229
  baked lightmaps as KTX2/UASTC (40.11 MB → 10.03 MB VRAM).
- **Visual-verification findings V1–V14** (`visual-verify-r7-2026-09-25.md`): all of **V1–V13**
  closed within the round (contrast/live-region/framing-distance fixes at `v0.35.13.1`;
  geolocation-on-load at `v0.35.13.4`; showroom copy/CTA weight at `v0.35.13.5`; in-session hash
  re-gating at `v0.35.13.6`; V9's proposed reframing fix investigated, measured a 0.3% win, and
  **reverted** rather than shipped) plus **V10** (zero interaction-test ladders — closed by seven
  new ladders at `v0.35.15.0`) and **V14** (no phone orientation aid in walk mode at all — opened
  and closed in the same `v0.35.15.0` pass with a static room-name label, deliberately not a
  minimap or compass, backed by wayfinding literature). The one still-open thread: **V11**'s
  second half (Help lives in two different places on desktop vs. mobile) was not addressed.
- **Documentation-hygiene pass (this entry, R7-Q):** walked every `docs/user/` page against the
  code for this round's five surfaces (share, install, motion, orientation, renderer). Found and
  fixed one real gap — the new tri-state "Reduce motion" control in the Appearance popover had no
  user-doc mention at all (`docs/user/themes-and-appearance.md`, now has a section, written to NOT
  repeat the in-app popover's own "everywhere in the app" claim — see below). `navigating.md`'s
  phone nav-cluster/room-pill description and `design-tools.md`'s showroom share-link section
  matched the shipped UI verbatim. Annotated **V1–V13** and **P1**/**z22** as closed with their
  shipping commit (they were previously undated snapshots, several already stale by the round's
  own later commits). Added **Shapespark** and **Needle Engine** to `REFERENCES.md` (flagged as
  missing by the research sweep). Fixed a stale flag-count (114 → 115 authoring flags in the
  showroom denylist, grown by `pwaInstallPrompt` after `showroom-links.md`/`ARCHITECTURE.md` were
  written). Reconciled `CHANGELOG.md` against the 17-commit range — versions are monotonic through
  the round with no duplicates; a `v0.35.13.2`/`.13.3` gap exists (parallel agents claimed adjacent
  numbers and one side renumbered forward past a collision) but every heading in range has a
  matching commit and vice versa; the AO-DEPTH-ISOLATION and V9/reframe entries already correctly
  describe the MSAA default staying off and the bounding-box reframe being reverted rather than
  shipped, so no correction was needed there.
- **Two false doc claims found and fixed, both surfaced by R7-O's concurrent adversarial review
  (`code-review-r7-2026-09-25.md` finding C6), landing on the branch mid-pass:**
  1. `docs/developer/showroom-links.md` §4b and `docs/user/getting-started.md` both claimed a
     showroom visitor "inherits the sender's location" from the share payload. **False** —
     `designShare.ts:buildDesignSharePayload` hard-codes `location: null` into every link it
     builds, editable or view-only alike, and always has; a share-link visitor's sun has always
     defaulted to `FALLBACK_LOCATION` (Singapore), never the sender's. Both docs corrected. The
     brief for this pass had named "a showroom visitor inherits the sender's location" as one of
     two items that must stay listed as an open product call — it does not describe the code, so
     the item is **re-filed** in `TODO.md` as the real open question this uncovers: should a share
     link carry the sender's location at all (so the default sun is right for the sender's city
     instead of Singapore)? Nobody has decided that either way; the accidental current behaviour
     (no location ever leaves the browser via a link) may be worth keeping deliberately.
  2. My own first draft of the new `themes-and-appearance.md` "Reduce motion" section quoted the
     in-app popover's caption verbatim ("minimised everywhere in the app"). R7-O's C2 finding
     (independently, from source) establishes this is false in both directions: the toggle only
     reaches ~9 JS call sites, not the app-wide CSS `@media (prefers-reduced-motion)` block that
     actually suppresses sheet/popover/toast/card-entrance animation (`app.css:400`) — so "Reduce"
     does not reduce most of the app's motion, and "Full" cannot override an OS reduce-motion
     preference for that same CSS. Rewrote the doc section to describe only what the control
     verifiably does, without the "everywhere"/"overrides either way" claims. The in-app popover
     copy itself is `src/` (behaviour-adjacent product copy, not a docs file) and was left
     untouched, per this pass's brief not to fix code — C2 is the record of it for a maintainer.
- **Doc/code disagreements found where the CODE looks wrong, NOT fixed (flagging for a maintainer,
  not touching `src/`):** all from R7-O's `code-review-r7-2026-09-25.md`, landed after this pass
  was already underway — **C1** (HIGH) a room-probe material clone drops the baked-GI
  `onBeforeCompile` patch three's `Material.copy` doesn't carry, so a glossy material spanning two
  rooms loses its Cycles irradiance the moment it gets a room probe; **C2** (HIGH, detailed above)
  the Reduce-motion control not reaching the app's CSS motion suppressor; **C3** (HIGH) a failed
  KTX2 transcoder-wasm fetch (as opposed to "no loader bound") warns DEV-only and never falls back
  to the PNG sibling, silently dropping all 229 lightmaps in exactly the Electron/Capacitor/`file://`
  build `ktx2-textures.md` names as needing the fallback; plus lower-severity items (orbit room
  readout ships with no feature flag; `statusBarTint.ts`'s "never more than 1/50" docblock
  contradicted by its own 2000 ms clamp; an orphan "Load & reset" mobile-sheet header in showroom
  mode). The one prior-round item this doc-hygiene pass itself flagged — `decoders.ts` claiming
  drei auto-wires a `KTX2Loader` — was already fixed by round 7's own R7-H commit before this pass
  ran, so no live disagreement remained there.
- **Fixes applied:** docs only, all listed above — `src/` untouched, no behaviour changed.
- **Next:** area 6 — final gate + PR into `staging`, which needs C1/C2/C3 from
  `docs/audit/code-review-r7-2026-09-25.md` triaged first (C1 in particular: a shared glossy
  material silently losing its baked GI is a visible render regression, not a documentation
  matter); open items in `docs/open-graphics-decisions.md` plus this round's two open product
  calls in `TODO.md`; `z16`/`z21` remain open maintainer calls independent of this round.

## 2026-09-19 — area 5, performance pass

- **HEAD reviewed:** `2cdd6c4e` (v0.35.12.1), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 5 — performance pass: frame time (p50/p90/p99), draw calls, program churn, memory,
  boot, and phone DPR behaviour, on Metal (desktop 1200×900 `capable` pinned + phone 390×844
  DPR 3 `weak` pinned) with a SwiftShader desktop structural cross-check.
- **Coverage:** two tiers (`performance`/`realistic`) × five poses (orbit-boot-idle,
  orbit-slow-rotate, walk-kitchen-idle, walk-look-drag, walk-lights-on-21:00) on each of
  desktop-metal and phone-metal, plus program-churn snapshots at four events (boot→tier, first
  walk switch, lights-on, tier switch) and phone-only DPR-at-rest-vs-gesture + a 60 s thermal-
  drift proxy. One-off instrument `scripts/dev-probes/perf-audit-oneoff.mjs` (deleted after use);
  raw logs archived under `/tmp/review/perf/`. Full tables in
  `docs/audit/perf-2026-09-19.md`.
- **Method note carried into the doc:** every "idle" pose is camera-idle, not content-idle — the
  default flat's ceiling fan animates continuously and legitimately pulses the PERF-MAX-1 shadow-
  refresh signal every frame (a documented exception, not a freeze failure); the doc separates
  raw `rAF` tick spacing (display-cadence, not a cost) from the wrapped `gl.render` CPU-submit
  bucket (the real per-drawn-frame cost) throughout, per `frame-time.mjs`'s own documented trap.
- **Findings:** 3 (`P1`–`P3`), ranked by user-visible impact.
  `P1` (high, open) — `realistic` tier, walk mode, lights on at 21:00: desktop main-thread frame
  rate drops ~30% (60.2→42.3 Hz, raf p90/p99 50 ms) for several seconds after the switch although
  the GPU submit cost itself stays in budget (12.9–15.6 ms) and program churn is small (+3) —
  reproduces more mildly on phone (one 33 ms frame). Plausible GC pressure from the 19-light
  `FurnitureLights` mount (+35 MB heap in that one step); left open rather than shipping a
  speculative fix, since attributing the exact stalling call site needs a Chrome performance
  trace this pass didn't capture. `P2` (confirmed correct, not a defect) — `realistic`-tier drags
  halve the drawing buffer mid-gesture on both desktop and phone; verified as
  `InteractiveDprController`'s GPU-STARVE-1 degrade doing its documented job. `P3` (informational)
  — a quality-tier switch is now the single largest program-recompile event measured (+63
  desktop / +90 phone), bigger than the walk-switch or lights-switch z16 already documents;
  already covered by the shipped `TIER-CHANGE-VEIL`, no new mitigation needed.
- **Checked, no defect:** shadow-map resolution is structurally clamped to its tier cap
  (`shadowMapSizeForExtent`) and no live texture (shadow map or IBL probe) was found above its
  tier's resolution ceiling; the wrapped `gl.render` path shows no per-frame allocation drift
  within a 300-sample window.
- **Fixes applied:** none in `src/` for area 5 itself (every measured mechanism is either
  working as documented or left as an evidenced open row per the brief's "leave architectural
  items… as documented open rows"). **Bounded extra shipped:** `M6` from the area-4 mobile-UX
  audit (`docs/audit/mobile-ux-2026-09-19.md`) — a live toast could sit over the mobile menu
  sheet's lower rail icons in landscape (844×390), stealing the tap, because the toast
  (`--z-toast:70`) painted over the sheet (`--z-modal:65`). Extended M1's top-of-canvas
  relocation: `NotificationContainer` adds `.toast-host-rail` whenever `useAnyModalOpen()` is
  true (the existing cross-cutting "a modal is up" signal), and the CSS rule only takes effect
  under the landscape-phone media query — a no-op everywhere else. Shipped as `v0.35.12.2`.
- **Next area:** **6 — final gate + PR** (open items in `docs/open-graphics-decisions.md` plus
  every review area's residual findings, per `/tmp/photoreal-mobile/review-cycle.md`).

## 2026-09-19 — area 4, mobile UI/UX audit

- **HEAD reviewed:** `f563b03d` (v0.35.11.4), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 4 — mobile UI/UX audit: phone core loop in tab-like and standalone-like modes, both
  orientations, chrome-audit probes (overflow/clipped/tapTargets/covered/contrast) + screenshots
  + a sweep recording of the catalog-sheet drag and walk joystick.
- **Coverage:** 5 arms × 30 states (150 screenshots) — `tabP`/`stdP`/`tabL`/`stdL` on Metal
  (390×844 and 844×390, tab-like and standalone-with-safe-area-override) + a `swP` SwiftShader
  portrait spot-check — covering onboarding/cold-start, home/orbit, the full toolbar menu,
  time-of-day + weather, room editor, catalog sheet (open/scroll/drag/place), inspector,
  finishes picker, walk mode (entry/HUD/joystick/look/measure/exit), share/export, command
  palette, three update-flow seam states, and the get-started checklist — plus a separate cold
  run (onboarding carousel + start choices) and a sweep recording (360 + 313 frames on
  `phone-metal`). Every screenshot and every probe result was enumerated; the two recorded
  gestures were checked against the sweep's own frame-diff/pose metrics, not just eyeballed.
- **Findings:** 5 (`M1`–`M5`) — 2 high, 1 medium, 2 low. Full table with evidence paths,
  component file:line and fix hypotheses in `docs/audit/mobile-ux-2026-09-19.md`.
- **Top 5:** `M1` a bottom toast (update banner, or any `.toast`) fully hides the walk-mode
  joystick on portrait phone (both tab-like and standalone) because it stacks above it
  (`z-toast:70` vs `z-pop:40`) and is wide enough to reach the joystick's corner on a 390px
  viewport — landscape escapes only because the same toast width happens to leave that corner
  clear · `M2` landscape phone (844×390) never receives the mobile layout at all — `body.mobile`
  gates on `max-width:640px` only, so a phone held sideways renders the full desktop toolbar and
  floating catalog/inspector panels instead of bottom sheets, with tapTargets probe counts
  jumping from 0–14 (portrait) to 13–40 (landscape) across every state · `M3` the mobile 44px
  tap-target rule was applied to catalog chips (`responsive.css:564,584`) but not to the Scene
  menu's Lights/Photographic-look switches or the pet-backdrop chips, same menu, same phone width
  · `M4` onboarding progress dots are real 7×7px `<button>`s with no visible affordance · `M5` a
  Scene-menu sub-label clips by 6px even with an ellipsis.
- **Four false leads chased down and ruled out** (recorded in the doc so they aren't rechecked):
  a "camera stuck in first-person after exiting walk mode" signal that traced to the *harness's*
  fuzzy label matching hitting the always-present "Return to orbit mode" brand-dot instead of the
  real View-menu Orbit item (the real exit path works instantly, no confirmation needed; the
  brand-dot shortcut correctly shows a confirm dialog) — this also means states 21–25 in 4 of 5
  arm reports were captured mid-walk-mode rather than in their intended orbit/share/checklist
  context; two update-flow toasts appearing stacked, caused by the test script driving stages out
  of their real order (the real state machine replaces the toast in place); a budget-segment
  "offscreen" flag that is the toast's own indeterminate-progress slide animation; and catalog
  category chips flagged "offscreen" that are actually an intentional horizontal-scroll rail.
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **5 — performance pass** (frame time p50/p90 in walk+orbit, program counts, DPR
  behaviour, memory).

## 2026-09-19 — area 3, interaction sweep regression re-run

- **HEAD reviewed:** `af5a6729` (v0.35.11.0), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 3 — interaction sweep regression re-run (full clip catalogue, corrected recorder:
  per-rAF `clip.poses`/SWEEP-POP-GATE, `--wall-trace`, `--mask-selectors`, clock pinned 12:00).
- **Coverage:** 37/37 catalogue clips completed on every requested arm, 10 862 frames total —
  **desktop-metal** (23 clips, 5 227 frames), **phone-metal** (16 clips, 4 309 frames, DOM-masked)
  + **phone-metal-solo** (`orbit-phone-double-tap` standalone, 151 frames), **desktop-swiftshader**
  reduced set (10/10 clips this time, not 4/10 or 10-of-10-abandoned like the 09-18 passes,
  1 175 frames). Every sheet (37) and every flagged triptych (176) was looked at. Zero
  `BLACK_FRAME`, zero `GL_ERROR`, empty console everywhere.
- **Regressions:** 4 new findings (`R1`–`R4`) against the 09-18 baseline (full-catalogue tables
  + the `final2` 18-clip subset) — 2 high, 2 medium.
- **Top findings:** `R1` — `orbit-tier-change-mid-drag`'s first quality-tier compile burst now
  stalls the main thread for **3283 ms** (was a 950–983 ms ceiling every prior pass); the
  TIER-CHANGE-VEIL correctly covers it but can't animate through a stall that long. `R2` —
  `orbit-phone-orientation-mid-gesture` regressed from N6's zero-events closure to FLASH 7/POP 2:
  the camera teleports the instant a touch-drag starts just after a portrait↔landscape swap,
  ending 7.65 m from the orbit target in a frame with no scene geometry at all (flat grey/tan
  colour field, consistent with the shell's known S4/`(ag)` exterior-blowout residual). `R3` —
  `orbit-reversals` FLASH 0→9, plausibly tied to `af5a6729`'s own MITRE-SEAM-IN-REVEAL change
  (same subsystem as area 2's O1/O2) now sampled under fast motion for the first time; not
  A/B-proven this pass. `R4` — `walk-pitch-limits-phone` POP 0→46 (new gate; legacy gate reads 0
  on the same frames, so it is a real content change): a candle prop's region drives sustained
  near-full-range tile deltas at a static camera, alongside the already-accepted fan-driven POP.
  A harness-side note (not an app defect): the new per-rAF POP gate under-reads camera speed for
  dolly/twist phone gestures (`orbit-phone-pinch`/`-two-finger-rotate`/`-zoom-through-wall`),
  the mirror case of the aliasing `SWEEP-POP-GATE` was built to fix.
  Full tables, evidence paths and fix hypotheses in `docs/audit/interaction-sweep-2026-09-19.md`.
- **Not re-reported (already OPEN):** `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches,
  `(ag)` exterior-blowout residual (S4), `z20` SWIFTSHADER-FLOOR-DIVERGENCE, the `orbit-menu-mid-
  drag` `clickSelector`-releases-the-drag harness artefact (pre-existing, documented in the 09-18
  doc's "What could not be emulated"), and `O1`/`O2` from the orbit-dollhouse pass (fixed by
  MITRE-SEAM-IN-REVEAL, referenced above as R3's suspected mechanism).
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **4 — mobile UI/UX audit** (390×844 touch, standalone emulation via CDP
  safe-area override: layout, tap targets, overlays, update flow, boot/background resume).

## 2026-09-19 — area 2, orbit/dollhouse pass

- **HEAD reviewed:** `c2c752ce` (v0.35.10.3), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 2 — orbit/dollhouse pass (boot framing, all reveal states, section cut, estate,
  day/night) over the default 4-room flat.
- **Coverage:** 388 frames captured and looked at. Boot + 8 azimuths × 2 elevations (35°/60°) +
  top-down + 2 low-elevation section-cut poses + 2 close dolly poses, × hours 08:00/13:00/18:30/
  21:00 × lights off/on, on **desktop-metal** (1200×900, `capable` pinned, 184 frames) and
  **phone-metal** (390×844 touch, `weak`, 176 frames); a reduced **desktop-swiftshader** arm
  (13:00 + 21:00, 6 poses, 24 frames). Every frame was looked at (contact sheets, then suspicious
  originals at full resolution); numeric cross-checks via a temporary `sharp` probe
  (deleted after).
- **Findings:** 2 (`O1`, `O2`) — 1 high, 1 medium, same root cause. Full table with evidence
  paths, subsystem file:line and fix hypothesis in `docs/audit/orbit-dollhouse-2026-09-19.md`.
- **Top finding:** `O1` — the WALL-REVEAL-CORNER-SPREAD mechanism
  (`src/apartment/walls/wallRevealMath.ts`, `useWallReveal.ts`, `WallSegment.tsx`) renders every
  near-camera wall mitre as a hard-edged bright vertical seam (1.5–3× the adjacent wall's luma),
  growing into a large occluding wedge at the two close dolly poses (kitchen corner, living
  window). Confirmed on desktop-metal, phone-metal and desktop-swiftshader, both elevations,
  both lights states, all four hours — not lighting-dependent, not renderer-dependent.
- **Four false leads chased down and ruled out** (recorded in the doc so they aren't rechecked):
  a perceived global warm-tint on lights-on (interior-only, exterior pixels unchanged), a
  perceived phone-viewport framing crop at azimuths 90°/180° (thumbnail-scale illusion; full-res
  frames are correctly framed), a perceived checkerboard of neighbour lit windows (thumbnail
  illusion), and a perceived black seam in every top-down frame (a tree canopy tip seen from
  directly overhead, not a backdrop seam).
- **Not re-reported (already OPEN):** `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches,
  `z16` LIGHTS-TOGGLE-RECOMPILE, `z20` SWIFTSHADER-FLOOR-DIVERGENCE (visible again in the
  SwiftShader dolly-kitchen frames, consistent with the existing item), and the walk-mode pass's
  W1–W15 / interaction-sweep residuals.
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **3 — interaction sweep regression re-run** (full catalogue, corrected
  recorder, triage events).

## 2026-09-19 — area 1, walk-mode photoreal pass

- **HEAD reviewed:** `713151c2` (v0.35.9.0), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 1 — walk-mode photoreal pass over every room of the default 4-room Serangoon North
  Vista flat.
- **Coverage:** 306 frames captured and looked at (274 Metal + 32 SwiftShader). 8 rooms × 2 poses × 4 hours (08:00 / 13:00 / 18:30 / 21:00) × lights
  off/on, plus 8 glance-up poses, on **phone-metal** (390×844 touch, `weak`, 137 frames) and
  **desktop-metal** (1200×900, `capable` pinned, 137 frames); a reduced **phone-swiftshader** arm
  (13:00 + 21:00, 1 pose per room, 32 frames — slow, ~24 s per lights-on program compile). Every frame was looked at; suspicious ones were
  cross-checked with numeric luma patches.
- **Findings:** 15 (`W1`–`W15`) — 6 high, 6 medium, 3 low. Full table with evidence paths, probable
  subsystem and fix hypotheses in `docs/audit/walk-photoreal-2026-09-19.md`.
- **Top 5:** `W1` lights-on is one global hour-blind wash · `W2` the daytime band (08:00/13:00/
  18:30) produces almost no change in the interior and there is no sun patch anywhere ·
  `W3` the corridor gets no daylight at all (floor luma 16 at noon vs 150 in the bedroom next
  door, and brighter at 21:00 than at 13:00) · `W5` no ceiling luminaire is visible from below
  although lights-on paints a glow there · `W4` a hard 7.6× vertical lightmap seam across the
  bath2 wall.
- **Also worth a fix brief:** `W15` — the boot loader splash reappearing full-screen over a
  live desktop walk session after a lights-on toggle at 18:30 (1 frame in 254; almost certainly
  the `z16` lights-toggle recompile made user-visible).
- **Not re-reported (already OPEN):** `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches,
  `z16` LIGHTS-TOGGLE-RECOMPILE, `z20` SWIFTSHADER-FLOOR-DIVERGENCE, and the
  `docs/audit/interaction-sweep-2026-09-18.md` residuals (kitchen wing blowout, first-switch
  recompile, fan POPs).
- **Root causes surfaced by the in-session scene probe:** the scene's **one** directional light
  has `castShadow = false` at every hour (behind `W2`/`W3`), and 5 ceiling pendants are
  `visible = true` yet appear in none of the 306 frames (behind `W5`).
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **2 — orbit/dollhouse pass** (boot framing, all reveal states, section cut,
  estate, day/night).
