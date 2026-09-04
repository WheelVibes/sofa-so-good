# Visual verification playbook

> **Chrome first (2026-08-24).** When Claude-in-Chrome is connected, drive the **real tab**
> instead of this headless harness — see **[chrome-interactive-audit.md](chrome-interactive-audit.md)**.
> It runs the same step vocabulary against a real GPU, real fonts and the real compositor, and
> adds audit probes (overflow / clipped text / naming / contrast / covered / console).
> Everything below still applies and remains the **fallback** — use it when Chrome is not
> available, when the run must be non-interactive (CI/cron), or for the two things the Chrome
> path structurally cannot do: **touch / `pointer: coarse` gating** (`SHOT_TOUCH=1`) and
> **true phone viewports** (Chrome's `resize_window` clamps at ~606px, so 390×844 and 320px
> belong here).

How to actually drive this app, take useful screenshots, and review them — the
rules, the gotchas, and the fixes found the hard way. **Read this before doing
visual verification, and update it whenever you find a new solution to an
interaction problem** (see the rule in CLAUDE.md). Treat every entry below as a
landmine someone already stepped on so you don't have to.

---

## Interaction-test ladders (required policy, 2026-06-12)

Scenarios are not just debugging aids — they are the app's interaction-test suite,
kept in `scripts/scenarios/`.

- **Every feature gets a ladder of scenarios, simple → complex.** Simple: the feature
  opens, renders, and is correctly flag/tier-gated. Complex: full multi-step journeys
  through the feature AND its interactions with the rest of the app — overlay/modal
  layering and ordering, Simple↔Pro mode switches, mobile viewport (`viewport` step),
  and adjacent features that share screen space or state.
- **No new feature ships without its own ladder.** Build the scenarios alongside the
  feature and run them as part of visual verification. The motivating failure class:
  sequencing/layering bugs invisible to unit tests — e.g. a clean-profile boot where
  one first-run overlay (onboarding) could hide another (product tour).
- **Existing features** are being back-filled feature-by-feature down the
  `FEATURE_FLAGS` list — tracked as `IXT-SUITES` in `TASKS.md`. When you touch a
  feature that has no ladder yet, add at least its simple rungs in the same change.
- Name files `<feature>-<rung>.json` (e.g. `pano-tour-simple.json`,
  `pano-tour-journey.json`); keep each scenario focused and re-runnable on a clean
  profile (`first-run.json` is the worked example).

## Local prod-build smoke test (`vite preview` needs a matching `VITE_BASE`)

**`vite preview` must be given the same `VITE_BASE` the build used, or every asset
404s into the SPA index.html fallback and boot hangs on the loader.** `vite preview`
resolves its config with Vite's internal `command: "serve"` (not `"build"`), so
`vite.config.ts`'s base ternary (`command === 'build' ? '/sofa-so-good/' : '/'`)
silently reverts to `/` under preview — while `dist/` still references the sub-path
base (`/sofa-so-good/`, the default GH-Pages build). Symptoms: the boot loader stuck
on a random phrase ("Waiting for the lift…"), console full of resource 404s, and
`curl -I` on any asset under the base returning `200`/`text/html` (it's silently
serving `index.html`, Vite's SPA fallback). Correct invocations:

```bash
# GH-Pages-style build (default):
VITE_BASE=/sofa-so-good/ npx vite preview --port 5300 --strictPort
# → http://localhost:5300/sofa-so-good/
# Root-served build (Docker/nginx/Cloudflare parity):
VITE_BASE=/ npm run build && npx vite preview --port 5300 --strictPort
# → http://localhost:5300/
```

Real deploys are unaffected (static hosts serve real files; they never re-run the
command-aware config). `window.__store` does NOT exist in prod builds — drive
prod smoke tests with DOM waits (`waitFor {css: "canvas"}`), not store predicates;
a `502` on the `hasBackend()` health ping is expected/harmless with no local backend.

## Real-GPU mode (`SHOT_GPU=1`)

By default the harness renders with **SwiftShader** (software WebGL) — fine for
layout/geometry/UI checks but it cannot validate GPU-only effects. Set
**`SHOT_GPU=1`** to route WebGL to the **real hardware GPU** via ANGLE's `gl-egl`
backend over the WSL D3D12 passthrough (`/dev/dxg`). Confirmed renderer string:
`ANGLE (… D3D12 (Intel(R) UHD Graphics) …)`. Use it to verify anything that
SwiftShader can't show truthfully:

- depth-of-field bokeh, bloom thresholds/intensity, tone-mapping look
- soft/penumbra shadows (PCSS/VSM), contact/corner AO
- glass transmission/IOR, env-map reflections, HDRI IBL
- path-traced HQ render convergence + denoise

```
SHOT_GPU=1 node scripts/shot.mjs out.png 3000
SHOT_GPU=1 node scripts/shot.mjs --scenario scripts/scenarios/foo.json
```

**The ANGLE backend is platform-specific, and getting it wrong silently gives you
SwiftShader anyway** — i.e. `SHOT_GPU=1` becomes a no-op and every GPU-only check
you thought you ran was a software render. `shot.mjs` now picks it from
`process.platform`: **darwin → `metal`**, win32 → `d3d11`, linux/WSL → `gl-egl`
(the original D3D12-passthrough value, which does not exist on macOS; the
`--enable-features=Vulkan` flag isn't a macOS Chromium feature either and is
dropped there). Override with `SHOT_ANGLE=<backend>`. **Always confirm the
renderer string** before trusting a GPU-only result — on this Mac it must read
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, …)`:

```js
const gl = document.createElement('canvas').getContext('webgl2')
const d = gl.getExtension('WEBGL_debug_renderer_info')
gl.getParameter(d.UNMASKED_RENDERER_WEBGL)
```

## Measuring the render, not just eyeballing it (`scripts/dev-probes/`)

Some rendering bugs are invisible in a single screenshot — an intermittent
one-frame artifact, or a difference in exposure/contrast that reads as "hmm,
looks a bit off". These probes turn those into numbers. All drive a real orbit
gesture against a real GPU and need `npm run dev:web` running.

| Probe | Answers |
| --- | --- |
| `blank-cause.mjs` | How many orbit frames composite BLANK, plus three's own render counters and any drawing-buffer resize around each one. `TIER=`, `HOUR=`, `REPS=`, `OVERRIDE=key=value` (a `qualityOverrides` entry, to isolate one tier axis), `URL=` (for `?ff=flag:off`). |
| `tier-look.mjs` | Mean brightness, contrast (pixel σ) and **clipped-highlight fraction** per tier per hour — the exposure regression check. `HOURS=`, `TIERS=`. |
| `shadow-contribution.mjs` | Whether the sun shadow map changes anything visible, by diffing the same frame with `shadowMapSize` on vs 0. |
| `orbit-flash.mjs` | Broad multi-tier orbit sweep; writes any blank frame to disk. |
| `chroma-audit.mjs` | Which surfaces make the frame look CARTOON, ranked by coverage x saturation. Raycasts a 96x60 screen grid and attributes each hit to its material, then reports coverage %, HSV saturation, roughness/metalness and which maps are bound — plus the rendered frame's own chroma. `MODE=walk\|orbit`, `TIER=`, `HOUR=`, `TOP=`. |
| `warm-cast.mjs` | Whether a warm colour cast belongs to the ILLUMINANT or to the FINISH, as an A/B inside one run. Neutralises the light colours from inside a wrapped `renderer.render` (a `setInterval` loses the race against `Lighting`'s per-frame write and reports a byte-identical no-op) and repaints the living/dining wall via the app's own `setWallFinish`. |
| `wall-detail.mjs` | What each wall CHANNEL is worth: `normalScale` x6, normal removed, a subtle albedo mottle added, against a repeated-baseline noise floor. Use before authoring texture art for a surface. |
| `pick-surface.mjs` | "What IS that?" — resolves screen NDC points to a furniture `defId` plus the exact material values (albedo hex, saturation, roughness, metalness, bound maps, size, distance). Turns a visual review into something fixable. `POINTS=label:x,y;…`. |
| `surface-detail.mjs` | Measures ONE surface class wherever it lands on screen: casts a ray through `POINT=x,y` (NDC), groups every material sharing that one's map source, masks the cells they occupy, and reports chroma / >0.35-sat / mean / sigma / **microcontrast** over those pixels only. The generalisation of `wood-detail.mjs`'s masking half — use it for any "does this surface look right" question, and note microcontrast is the only one of these that can see an aliased normal map. |
| `wood-detail.mjs` | Per-channel sweep of the furniture wood, measured over WOOD PIXELS ONLY (raycast mask): tile `repeat`, albedo map, albedo contrast, base saturation, roughness, normal, tone operator, post saturation, lightness. Reports chroma, the >0.35-saturation fraction, mean, grain sigma and **microcontrast** — the last one because a cell-mean metric is blind to high-frequency speckle. |
| `tone-curve.mjs` | Whole-frame sweep of the view transform (filmic / agx / neutral) and the post-saturation dial across the day in either view mode: mean, contrast, clipped fraction, chroma. Use this — never one material's numbers — to judge a change that applies to the whole image. `HOURS=`, `TONES=`, `SATS=`. |
| `sky-tune.mjs` | Sweeps the orbit sky dome's LIVE shader uniforms (`rayleigh`, `turbidity`, `mieCoefficient`…) in one run and reports the ZENITH colour — the part that should be bluest. Finds the dome by looking for a material carrying a `rayleigh` uniform, so it needs no pose or defId. `SWEEP='rayleigh=1;rayleigh=3,turbidity=3'`. |
| `snv-response.mjs` | TONE-CALIBRATION guard: the mean RENDERED RGB of a masked SNV floor under each tone operator, plus the peak-normalised per-channel response and how far it drifts. Run before any lighting or tone-mapping change, since the five SNV swatches were solved against that response. |
| `bath-tile-size.mjs` | What resolution a WALL is actually drawn at: walks to each wet room, raycasts the walls and reads the map off `hit.object.material`, labelled by TEXTURE uuid against the cache's own builds. Use whenever a cache lookup and the picture disagree. |
| `floor-look.mjs` | The same for FLOORS — pitches the eye down (`__walkLook.setPitch`) in each room, since a 1.6 m eye at yaw-only never hits one. |
| `stale-gen.mjs` | WHICH textures change size across a tier change, named by def rather than bucketed by size — labels every bound texture against both `@512` and `@256` cache generations and diffs the two tiers. |
| `plan-shadow-texel.mjs` | Per-plan shadow-map size and world texel for every `PLAN_TEMPLATES` entry, plus synthetic large plans. Module math only, no rendering — the cheap way to find out whether a regime is reachable in shipped content at all. |
| `plan-swap-rehome.mjs` | How much furniture is left outside every room after a plan swap, using the app's own `itemFootprint`. Reports a BASELINE arm so the count has scale. |
| `hq-tone.mjs` | The HQ path-traced still vs the viewport's view transform, as two arms in one run (shipped policy vs forced `filmic`). Prints resolved tone + exposure + achieved samples. |
| `window-hours.mjs` | What the exterior looks like through a window across the clock — one plan-derived window pose, fixtures opened once, only the hour varying. |
| `tile-breakup.mjs` | A pro-flag A/B done correctly: both arms in Pro, one flag varied via `?ff=`, applied BEFORE boot because the floor bakes it. Prints `uiMode` + the flag's resolved value. |
| `reveal-step.mjs` | The wall-reveal opacity STEP across every shared corner, from the app's own `getWallOpacity` / `getWallOwnStrength` / `cornerNeighbors`, with `toward` per wall. |
| `light-units.mjs` | Live census of every light (type, intensity, decay) at day and night plus `toneMappingExposure` — the units sanity check before comparing anything to a real fixture. |
| `fade-clone.mjs` | Every mid-fade material at boot framing / mid-drag / after a drag, labelled by texture uuid — for "is this clone stale?". |
| `surface-coverage.mjs` | **What the walk-mode user actually SEES, ranked** — 11 rooms x 4 yaws x 1600 rays, grouped into surface CLASSES by drawn material + colour + bbox, reported as a coverage %. This is the table meta-rule (viii) prioritises from; re-run it after anything that adds or removes geometry. It labels a class only by its shape, so pair it with `class-id.mjs` before naming one. |
| `surface-coverage.mjs` `KEYBY=map` | The same census keyed by map SOURCE uuid instead of base colour. Use to test whether a class is one surface or several merged — the procedural branch bakes the tint into the albedo and leaves `m.color` white, so colour keying COULD collapse unrelated finishes. Measured: it does not (322 -> 323 classes). Opt-in so the default table stays comparable across rounds. |
| `class-id.mjs` | **"What IS that class?"** — enumerates every mesh carrying a given colour and prints world position, size, ancestor chain and nearest plan opening. `Group{itemId}` in the chain means FURNITURE; apartment components never carry one. This is what proved the biggest "door-like" class was actually the curtains. `COLOURS=aabbcc,ddeeff`. |
| `ceiling-id.mjs` | **What is actually drawn overhead, and what is in each room.** Teleports to every room's centroid (or `ROOMS=<ids>`) and raycasts STRAIGHT UP, reporting the hit's name/type/material colour/roughness/geometry params/world position/ancestor chain, then dumps that room's items with `defId`, position, `elevation` and `props`. Knobs: `PLAN`, `LEVEL`, `FURNISH=1`, `TIER`, `ROOMS`; **`FURNISH=1` with no `PLAN` re-furnishes the DEFAULT FLAT the same way, which is the one-variable control.** Written for MOUNTED-SEED, where a dark band that looked like a ceiling turned out to be a range hood 0.06 m from the lens. **Trap this probe taught, the hard way: filter items by `levelId`, not XZ alone** — `plan.rooms` is ground-only and upper storeys stack directly above, so an XZ-only filter reports upper bedrooms as ground-floor contents and manufactures a spectacular false finding. |
| `curtain-atten.mjs` | **Is the sun attenuation derived from the LOADED plan?** Places one curtain per window using the app's OWN `snapToNearestWindow`/`windowFixtureProps`, then reads the live `getWindowAttenuation()` with them driven fully open and then fully shut, printing each arm's `props` and the delta. Knobs: `PLAN`, `FURNISH=1`, `TIER`. **Two traps this probe was born from:** the shipped templates carry NO window treatments (`applyLayoutPreset('move-in')` gave the maisonette 138 items and ZERO curtains), so it must place them itself or it measures nothing and reports a confident `NO EFFECT`; and it must DRIVE both arms (`draw:0/style:'open'` then `draw:1/style:'closed'`) rather than trust placement defaults — trusting them read 0.5600 for open AND closed. **Read the NUMBER, not the verdict:** before SUN-CURTAIN-PLAN the maisonette still reported "CURTAINS DIM THE SUN" at 0.7526, computed from default-flat windows; after, 0.5600 from its own. |
| `door-aim-plan.mjs` | **Which doors the walker can actually OPEN.** Teleports to a stand-point in front of every door on the WALKED storey (derived from that level's own `openings`, not a guessed pose) and reads `nearbyDoorId`, printing OK/MISS per door plus `hit/total`. Knobs: `PLAN`, `LEVEL`, `FURNISH=1`, `TIER`. Written for WALK-AIM-PLAN (v0.31.5.99), which measured **0/5 -> 5/5** on the maisonette upper storey. NOTE the default flat reads **6/7**, identically before and after that fix: the derived stand-point for `door-bedroom2` aims nearer `door-bath2`. That is a POSE artefact of this probe, not an app defect — verified by running both arms — so treat 6/7 as this probe's default-flat baseline rather than a regression signal. |
| `door-look.mjs` / `door-ab.mjs` | The door leaf: its resolved material values, and a four-arm one-variable-each sweep (`roughness`, `normalScale`, grain `repeat`) mutating the DRAWN material in-probe. |
| `finish-apply.mjs` | Whether a wall/floor finish request reaches the drawn material, rather than only the store. |
> ⚠️ **No walk frame captured before v0.31.5.127 is evidence about the view THROUGH A WINDOW, at
> any tier.** Until then the glass took its day/night factor from the lamp switch rather than the
> sun (item (k2)), and the app boots the lamps on at every hour — so every walk showed night glass
> whatever the clock said. The severity varied by tier (pane p50 **49** on High, **132** on Medium),
> which is what made it look like a `TIER=auto` problem in `.124`/`.125`; **that framing was wrong
> and is corrected in item (k1)** — the tier only decided how badly the same wrong value showed.
> Interior conclusions from those walks never depended on the exterior and still stand. Fixed in
> `.127`; both tiers now read ~195 at 13:00.

| `walk-tour.mjs` | **The contact sheet** — a walk of every room at several yaws, written as frames to look at. Not a metric: this is the meta-rule (v) instrument, and it is what surfaced DEFAULT-GLOOM after the measured defect queue was empty. Run it whenever you think there is nothing left to find. |
| `tier-drift.mjs` | State-verification: prints resolved tier / IBL / exposure / hour+timeMode at intervals across a long run, to establish whether a surprising frame is the scene drifting or the scene genuinely looking like that. |
| `default-gloom.mjs` | Per-room mean brightness under the shipped defaults vs one default changed at a time (`lightsMode`, then curtains on top). Each arm prints its OWN `lightsMode` and tier beside its number. |
| `wall-mottle.mjs` | Why a wall surface looks wrong: four one-variable arms (baseline, AO off, normalMap off, roughnessMap off) over a raycast mask, reporting mean / sigma / **microcontrast** / corner-grounding, with a crop per arm. `SWEEP='intensity=1.5;aoRadius=0.35'` retunes the live `look.ts:AO` object; `REPEATS=1.2,0.6,0.3` sweeps metres-per-tile on the drawn texture. Prints the repeat read back off the DRAWN material, which is what caught a catalog edit that never reached the screen. |
| `wall-mottle.mjs` `PICK=x,y YAW=n` | **"What IS that pixel?"** — teleports to `ROOM=` at a yaw, raycasts one NDC point, and reports the DRAWN material plus world position, size, ancestor chain and nearest opening. Use when a frame shows something suspicious and you have no COLOUR to feed `class-id.mjs`. It prints what it actually hit, which is how a mis-aimed NDC point announces itself instead of silently answering about the wrong object. |

**`setManualHour(h)` is not a side-effect-free redraw nudge.** Probes use it to force a frame
under `frameloop="demand"`, but it also switches `timeMode` to manual and jumps the scene to
`manualHour` — so in a probe that never pinned the clock, the first capture is the LIVE local time
and a later one is daylight. That produced a diff of **98.97% of pixels / meanAbsDiff 96.37** which
looked like an enormous material effect and was a day/night flip (it also ticked the onboarding
checklist's "Scrub the time of day", which is the tell in the screenshot). Corrected, the same
measurement read 0.04% / 0.02. **Pin `setTimeMode('manual')` + `setManualHour(h)` before anything
else**, and treat an implausibly LARGE result with the same suspicion as a byte-identical one.

**Never quote an exposure or clipping number from the FULL CANVAS rect.** The toolbar, the
"Get started" card and the zoom/compass rail are DOM panels drawn over the canvas, and they are
translucent — their brightness tracks whatever the canvas puts behind them, so they differ per
tier and mimic a render regression exactly. This produced a fully-written-up phantom defect
("~7% of the midday frame is blown at the flat tiers", v0.31.5.6, corrected in v0.31.5.7): the
full-canvas clipped fraction read 6.78% on Performance/Medium against 0.03% on High/Maximum,
while the same frames measured over `lib.mjs:centerBox` clip **0.02–0.05% at every tier and
hour**. A 4x4 grid localised the blown pixels to the toolbar (22%), the card (54%) and the rail,
with every interior cell at 0.0%. Use `centerBox`, or a raycast mask; if you print the full-canvas
figure at all, label it as chrome.

**In WALK mode you cannot aim the camera — `FirstPersonCamera` owns the orientation.**
A programmatic `camera.lookAt(...)` in walk mode is silently discarded: the controller rewrites
the camera's rotation from its own yaw/pitch state every frame. Measured in
`snv-response.mjs`, five different requested pitches (forward vectors from
`0,-0.89,-0.45` to `0,-0.03,-1`) all came back as exactly `-0.07, 0, -1`. Only the POSITION
survives. This is silent and it does not look like a failure — a probe that asks for a
steep look at the floor gets a level view of whatever is at eye height, and its "floor"
sample is a grazing sliver plus a lot of curtain. Two safe patterns:

- **Measure from ORBIT.** `OrbitControls` derives its orientation from the camera position and
  `controls.target`, both of which you can set (`window.__three.controls`); call
  `controls.update()` afterwards. That is what `snv-response.mjs` does now, and it took the
  living/dining floor's usable sample from 69 to 1563 of 4000 cells.
- **Or don't depend on the pose at all** — identify the surface with a RAYCAST MASK
  (`wood-detail.mjs`) so whatever the controller happens to be pointing at is classified
  correctly. This is why the wood measurements were unaffected by the same bug.

Either way, **assert the pose held**: read the camera's world direction back after setting it
and compare with what you asked for. `snv-response.mjs` prints `POSE NOT HELD` with both
vectors, which is how this was found at all.

**Pin the port, and pass it via `SSG_URL`.** Every probe navigates through
`lib.mjs:appUrl()` (`SSG_URL` → `URL` → `localhost:5173`) rather than a hardcoded
host. Vite silently falls forward to 5174+ when 5173 is taken, so a stray dev
server from ANOTHER checkout answering on 5173 will serve a different branch's
code to every probe — the run still succeeds and the numbers look plausible, they
are just measuring the wrong tree. This actually happened mid-session: an orphaned
`sofa-so-good` dev server held 5173 while the work was in a worktree. Start the
server on a dedicated port and say so explicitly:

```bash
npx vite --port 5199 --strictPort &          # from the worktree
SSG_URL=http://localhost:5199/ node scripts/dev-probes/tier-fps.mjs
```

`--strictPort` is the load-bearing flag: it makes a port clash fail loudly
instead of quietly relocating.

**Run probes through `scripts/dev-probes/with-server.sh`.** It owns the dev
server's whole lifetime inside one invocation, which removes three separate
failure modes that all produce confident-looking wrong data:

```bash
scripts/dev-probes/with-server.sh frame-time.mjs DSF=2 SECONDS=10
```

- A backgrounded dev server does not reliably survive between shell invocations,
  so a probe in a later call hits `ERR_CONNECTION_REFUSED` — or, worse, connects
  to an orphaned server from the sibling checkout on 5173 and measures the wrong
  branch.
- It uses `vite.probe.config.ts`, which gives the probe server its own
  `cacheDir`. Because this worktree symlinks `node_modules` to the sibling
  checkout, the two share Vite's optimizer cache; when one re-optimizes the other
  answers **`504 (Outdated Optimize Dep)`** for the lazy `EffectsImpl` chunk,
  R3F's error boundary replaces the scene, and every screenshot silently captures
  a "Something went wrong in the 3D scene" card. A card is perfectly stable, so
  frame diffs then read **0.00 for every setting** — a whole shadow-resolution
  sweep "proved" 512 was identical to 4096 that way. `lib.mjs:assertSceneAlive`
  now throws on it; call it after every state change a probe makes.
- It prints the load average and warns above 3.0. **Millisecond numbers are
  meaningless on a busy machine** — the sibling checkout's `npm run dev` and test
  runs are the usual cause, and they are the user's, so wait rather than kill.
  Visual diffs are unaffected by load.

Two rules learned the hard way here:

- **Detect a blank frame by VARIANCE, not brightness.** A white flash is the page
  background through a cleared buffer — an almost featureless region. A
  brightness threshold also fires on a legitimately blown-out midday render,
  which is how a washed-out (but perfectly valid) frame got reported as "30/30
  blank frames". `lib.mjs:isBlank` keys on pixel σ.
- **Measure the CENTRE of the viewport, not the canvas rect.** The canvas is
  full-bleed and the toolbar / "Get started" card / zoom rail are drawn over it;
  those opaque panels contribute most of the variance and mask a genuinely blank
  canvas. `lib.mjs:centerBox` is the region to use.
- **Pin the clock and the light mode.** The app defaults to `timeMode: 'system'`,
  so an unpinned run renders whatever time it happens to be — a night capture has
  full-strength bloom and lit fixtures and is not comparable to a daylight one.
  Heavy GL instrumentation also perturbs timing enough to HIDE frame-level bugs:
  wrapping every `gl.clear`/`drawElements` made the orbit flash disappear
  entirely, so prefer three's own `gl.info.render` counters.

Notes: GPU mode uses Chromium's `--headless=new` (not `shell`) so the compositor
path is real; it is slower per frame than SwiftShader but renders truthfully.
Always GPU-verify items the backlog tags `[real-GPU verify]` before striking them.

GPU-session gotchas (2026-07-11 sweep):
- **The `three-gpu-pathtracer` HQ render does NOT run on this GPU path** (ANGLE D3D12 Intel UHD
  over the WSL `/dev/dxg` passthrough): the tracer's megakernel ShaderMaterial fails
  `VALIDATE_STATUS` (Shader Error 1282, empty info log) and every `renderSample` no-ops
  (`INVALID_OPERATION: useProgram/drawArrays`). Since PT-BLANK-GUARD this no longer completes
  silently blank: the session's one-shot pixel probe (`hqBlankProbe.ts` fed by
  `hqRenderSession.ts`, fired on the first tick when the GL error queue is dirty, else after
  the first full sample) detects the uniform white/black canvas (white with the denoise blit,
  black without), aborts with `HqBlankRenderError`, and the modal shows its error phase ("The
  render came back blank — this device's graphics driver may not support the high-quality
  renderer") with Save PNG disabled. The session force-loses its own context on dispose, and
  the early abort keeps the invalid-draw spam short enough that the MAIN canvas context
  restores promptly (verified: full-sample-late abort left the live canvas lost >180 s;
  first-tick abort → live scene renders normally right after). Verify PT convergence/lighting
  on **SwiftShader** instead (dev-tiny 192×108 · 64 spp ≈ 1 min BVH + ~4.5 min sampling); keep
  `SHOT_GPU=1` for raster-only effects — and for exercising the blank-guard end-to-end.
- **Whole-flat orbit close-ups: keep the camera clear of window walls.** Plan coords ≈ world
  coords with no recentring — a pose at z≈1.5 embeds the camera inside the north window (sill/
  grille fills the foreground). Aim by reading item positions from `__store.getState().items`
  and stand ~1–1.5 m INTO the room.
- **`focusOn([x,z])` is unreliable for framing SMALL rooms (bedrooms/baths).** It keeps the
  current view angle and dollies to ≤4.5 m, so from the boot overview angle the camera routinely
  ends inside a neighbouring wall or on top of the bed; a follow-up `wheel` zoom-out doesn't
  rescue it (still wall-filled close-ups — burned in the 2026-07-23 default-plan verification).
  For "is every item placed correctly in its room" checks, don't orbit at all: open the 2D plan
  editor and click **Furnish** (`setFloorPlanEditing(true)` → `click {"text": "Furnish"}`) — the
  furniture layer draws every footprint over the plan in one screenshot. Reserve orbit close-ups
  for rooms on the flat's outer edge framed from outside-in (living/dining, kitchen).
  For a clean 3D LOOK at a small interior room (finishes/fittings), use the per-room editor
  instead: `enterRoomEditor('<roomId>')` frames the room from a fixed 3/4 pose with the near
  walls faded — but give it a **≥5 s settle on GPU** (the "Entering room…" overlay lingers;
  2–2.5 s captures the loader, burned twice in the 2026-07-23 SNV verification), and do NOT
  mutate `items` (`setItems`) in the same scenario step-run before entering — that stalled the
  room-editor transition on the loader indefinitely.
- **Don't switch quality tiers repeatedly in one GPU session — A/B one tier per fresh session.**
  On this iGPU (ANGLE D3D12 Intel UHD), tearing down and rebuilding the shadow map + post stack on
  each `setQualityTier` — especially to/from Maximum's 4096² map — exhausts the WebGL context; after
  ~2 switches the context is lost and the app's 3D-scene **error boundary** trips ("Something went
  wrong in the 3D scene"), so the later frames capture the error card, not the scene (observed in the
  PR4/R-SSAO soft-shadow audit, 2026-07-15). For a per-tier pixel A/B, run **one scenario per tier**
  that sets that single tier and never switches (see `scripts/scenarios/softshadow-pen-{medium,high,
  maximum}.json`) rather than one scenario that cycles tiers. A single overview→interior camera move
  within one tier is fine; it's the tier remounts that accumulate the leak.
- **The demand-frameloop one-burst-late presentation is SwiftShader-only.** On real GPU a
  lighting-only store change (C275 curtain dim) is present in the immediately-captured frame
  (measured 94.5 → 64.4 mean luminance with no wait/nudge step) — keep the no-op-nudge trick
  only for software-WebGL runs.
- **Verify WebGL context-loss/restore logic on SwiftShader, not this GPU** (GPU-STARVE-2 sweep,
  2026-07-24). Force a loss deterministically with
  `__three.gl.getContext().getExtension('WEBGL_lose_context')` → `loseContext()` +
  `setTimeout(restoreContext, 800)` (guard scenario `context-restore-rebuild.json`, medium tier).
  On the real ANGLE D3D12 iGPU a restore at Maximum re-loses ~30 s later under the rebuild load
  (4096² shadow + probe re-bake + full program recompile) and a screenshot mid-re-loss captures a
  blank page-background frame — same class as the documented tier-switch context exhaustion. The
  restore *logic* (env re-bake, shadow pulse, pump hold) asserts cleanly on SwiftShader.
- **Getting structured probe data OUT of a scenario: POST it to a throwaway local HTTP sink.**
  `eval` step return values are not printed and page console is only dumped on step FAILURE — for
  per-frame instrumentation (DPR/luminance/context events sampled in a page rAF loop), run
  `node -e 'http server appending request bodies to a file'` on a spare port (CORS `*`) and end
  the scenario with an `eval` that `fetch(..., {method:'POST', body: JSON.stringify(summary)})`s
  the compressed result + a short `wait` so the request lands. Used to diagnose GPU-STARVE
  (white-flash) and verify the interactive-DPR degrade; keep summaries compressed (record only
  change points, not every frame).
- **Proving "no blank composite" (GPU-STARVE-3): a per-rAF probe is useless here — use the
  microtask-inside-a-wrapped-resize trick.** Two traps burned the 2026-07-24 white-flicker
  session: (a) in `--headless=new` GPU mode, rAF is starved down to render damage (~1-2 ticks/s
  under load), so a rAF sampling loop misses everything; (b) at post-stack tiers this iGPU's
  frames exceed `LONG_FRAME_MS` continuously, so the degrade pins at 0.5 and the restore edge
  never fires organically. Working recipe: wrap `__three.gl.setSize` (three's `setPixelRatio`
  funnels through it) recording `gl.info.render.frame` before the resize, then `queueMicrotask`
  to re-read it — microtasks run before that task's composite, so `frame advanced == fresh
  pixels at composite time`, exactly "no white flash". Record `new Error().stack` in the
  wrapper for any failing event — it names the culprit caller directly (this is how the r3f
  `configure()` DPR stomp was found). Force the toggle cycles deterministically: import
  `/src/scene/cameraMotionSignal.ts` (vite serves the app's own module instance) for
  begin/endCameraGesture, `/src/scene/interactiveDegrade.ts` → `__resetInteractiveDegrade()`
  to clear long-frame holds, and a store nudge (e.g. `setManualHour`) after each edge so
  demand-mode frames pump and the controller's rAF decision loop actually runs. Guard scenario:
  `scripts/scenarios/interactive-dpr-seamless.json` (assert every resize `sameTask: true`).

## A coverage census measures ONE POSE — say which, and re-shoot before trusting it

`surface-coverage.mjs` sweeps 11 rooms x 4 yaws at eye height with a slight downward tilt. That is
a defensible default, and it is also the reason two of this run's conclusions were built on numbers
that describe a pose rather than a product:

- **floors** barely appear in it, which is why `floor-look.mjs` exists at all (`.69`);
- **the ceiling** reads 1.45% — and **43.87% at `PITCH=0.75`**, a glance up at a fan. A 30x swing
  (`.70`). "You barely see it" was quoted for ten rounds off the level number.

Both probes now take `PITCH=` so the same rig answers "how much of this do I see when I actually
look at it". **When you quote a coverage figure, quote the pose with it**, and before dismissing a
surface as too small to matter, re-shoot at the pose a user would actually adopt to look at it.

**Set the pitch AFTER the teleport settles, in its own `page.evaluate`.** `requestWalkTeleport`
resets the look, so pitching in the same call is silently undone — and the tell was a census
byte-identical to the level one (ceiling 1.46 vs 1.45, every other row unchanged). That is
meta-rule (xxv) catching a probe bug rather than a product one: identical readings across a change
are a failed mutation until something else moves.

## Do not sum a TRUNCATED table — and never compare a per-class figure with an all-class total

`surface-coverage.mjs` prints its top 26 classes. Twice in this run that truncation produced a
wrong number that looked authoritative:

- `.70` quoted the ceiling as **1.45% at eye level**. That was ONE printed class — the largest
  single ceiling slab — not the ceiling. The real level total is **4.54%**.
- The same round quoted **43.87%** looking up, from `awk`-summing the printed rows. The real total
  is **45.81%**.

The headline ("the level census under-reports the ceiling") survived; the ratio quoted for it
(30x) did not — it is about 10x. **A per-class figure and an all-class total are different units.**
If a probe prints a ranked head, it must also print the aggregate you intend to quote, or you will
eventually sum the head and call it the whole.

`surface-coverage.mjs` now prints a per-ORIENTATION total over every class, and dumps
`classes.json` so multiple runs can be joined without re-shooting.

**Corollary for any coverage claim:** state (a) the pose, (b) whether the number is one class or a
sum, and (c) what the denominator is. The three-pose table in `src/apartment/CLAUDE.md` is written
that way.

## Measuring the HQ PATH-TRACED still — see the dedicated notes

The HQ still (`PT=1` in `light-distribution.mjs`) has its own family of traps, and they are severe enough to
have caused sixteen self-corrections across the `.249`–`.296` graphics-realism rounds: the render is
**nondeterministic between three discrete classes** (~45 % apart at an anchor), the modal **swaps in a
different canvas** on completion so the same read returns either the raw trace or the denoised output, and a
frame-wide statistic can sit in a region that never changes. Before adding an arm to that branch, read
**[hq-tracer-probe-notes.md](hq-tracer-probe-notes.md)** — it also carries the reference-photograph screening
method (Wikimedia rate limits, the 20× thumbnail route, the CG-detection test) and a reference for the PT
knobs.

## When a probe reports ZERO, suspect the probe first (the false-zero family)

A zero is the easiest number to believe and the easiest to fake. Four of these cost real time
in the 2026-08-29 graphics-realism run; in three of them the FRAME showed the opposite and was
what caught it. Symptom-first:

| Symptom | Cause | Check |
| --- | --- | --- |
| Census returns 0 while the frame plainly shows the thing | Read a field that does not exist. Items are `position: [x, z]` (**not** `it.x`/`it.z`), and there is **no `st.catalog`** — build it with `buildMergedCatalog({userFurniture, resolvedRemoteFurniture, packFurniture})`. A `if (!def) continue` guard then skips every item and the loop body never runs. | Read the TYPE/store shape first; validate the metric on a case where it MUST be non-zero (the default flat scores 2/7, not 0). |
| HQ still comes back fully transparent, all four channels 0 | `createHqRenderSession` does **not** auto-start — `session.start()` kicks the rAF accumulation. Without it `samples` stays 0 and `toDataURL()` returns an empty canvas that mimics PT-BLANK-GUARD's driver failure, with no error raised. | Assert `session.samples` advanced before reading a pixel. |
| Ray mask finds 0 "outside" pixels through a window | `Sky.tsx` mounts the dome as a REAL scene object, so no ray ever escapes — it always terminates on the dome. Window glass also reads as opaque to a naive `transparent && opacity < 0.9` test. | Treat a dome hit as "sees outside", or stop rewriting the classifier and measure the picture. |
| Every window reports 0 exterior pixels | Not a bug: **the default flat ships with its curtains DRAWN.** | Check the app's own default before calling a featureless frame a broken pose. |

**A blank/empty/zero result is a broken CALL before it is a broken system.** Print the arm's own
state (`uiMode=pro tileBreakup=false`, `samples=24`, `tier=medium`) next to the number, so a run
that measured nothing is visibly distinguishable from a run that measured zero.

## `floor-look.mjs` stands at the ROOM CENTRE, which in a utility room is occupied

The probe teleports to each room's shell centre and pitches the eye down. In a bedroom or living
room that lands on open floor. In the **kitchen** the centre IS the counter run, so the downward
rays hit the sink and worktop; in the **service yard** a ceiling drying rack fills the volume and
the rays hit its rails. Both rooms therefore report **few or no floor hits** —
`kitchen 128|OTHER x1`, `serviceYard 128|OTHER x12`, no named floor — which reads exactly like a
missing or unbaked floor.

**It is occlusion, and the FRAMES are what show it:** the beige stone tile is plainly visible at
the bottom of both frames, correctly jointed. Another instance of "when a probe reports zero,
suspect the probe" — and of the fix being to look rather than to add an arm.

If a future round needs those two floors sampled properly, offset the pose toward the open part of
the room, or raycast straight DOWN from the camera instead of through the screen grid.

## Flag and bake ORDER decide whether an A/B measures anything

- **Simple mode beats a dev override.** `resolveFlags` returns false on the
  `tier === 'pro' && uiMode === 'simple'` branch *before* the override branch, so `?ff=<flag>:on`
  is inert in Simple. Both arms of a pro-flag comparison must run in **Pro**, varying only that
  flag.
- **A flag a material BAKES must be set before boot.** Floors read `tileBreakup` through
  `isFeatureEnabled` when they build; toggling it at runtime leaves the already-built floor
  stale, so the A/B compares an object with itself. Set it in the URL / `evaluateOnNewDocument`
  and confirm the resolved value in-page.
- **Check the UNITS before comparing to the real world.** The lighting rig is RELATIVE, not
  photometric — the sun is a `DirectionalLight` at **0.999** where a physical midday sun is
  ~100,000 lux, and fixture point lights run at 2.6–9, nine times the sun's number. Comparing a
  9 to a real 800 lm bulb's ~64 cd would have multiplied the whole emitter table and blown out
  every night interior. `light-units.mjs` prints the census.

## Editing probes without measuring the old file

- **Never background a compound command whose first part is a Python edit.** If the edit throws,
  the traceback goes to the task log unseen and the rest of the chain runs the UNCHANGED file —
  you measure the old code believing the edit landed. Edit in the foreground, `grep` to confirm,
  then launch.
- **Biome reformats what you write, so a second edit anchored on your own earlier text silently
  misses** (it collapses multi-line `console.log`s and re-wraps blocks). Re-grep the ACTUAL
  current text before the next anchor, and after a multi-part edit grep for both the new
  identifiers (present?) and the old ones (gone?) — a half-applied edit produced a
  `ReferenceError` for a variable its other half was meant to declare.
- **A Node-side variable is NOT visible inside `page.evaluate`.** The callback is serialised and
  run in the browser, so a loop counter, a config const or anything else from the probe's own
  scope is simply undefined there — `ReferenceError: i is not defined`, thrown from inside the
  page and surfacing as a probe crash rather than as a scoping mistake. Pass it explicitly:
  `page.evaluate((a) => …, { i, hour, tier })`. This one has bitten repeatedly (most recently
  `tier-drift.mjs`) because the offending line reads like ordinary JavaScript.
- **Slice copied probe boilerplate AFTER `page`/`browser` exist.** Cutting at the first
  `const OUT`/`const HOUR` drops the browser setup and the probe dies with "page is not defined";
  then grep the copy for a duplicate `const OUT` or a stray `fs.mkdirSync(OUT)` it dragged along.

## An "empty frame" guard that counts non-background pixels does NOT catch a missing WALL

`walk-tour.mjs` gained a guard that flags any frame whose non-background cell fraction falls below
a threshold. It works — it caught a genuinely dark store room at 6.5% — and it is worth having.

**But it scored a frame with no walls at 87% content and passed it**, because what replaced the
walls was a bright city backdrop, which differs from the corner pixel just as much as a wall does.
A content-fraction guard detects a BLANK frame; it cannot detect a WRONG one.

The guard that would have caught this is a **cross-arm comparison**: the same pose at two tiers
should produce similar frames, and `medium` 73% vs `performance` 87% is a 14-point swing on
identical geometry. When a probe sweeps an axis, diff each frame against the baseline arm rather
than judging each frame alone.

**Also: do not use `gl.info.render.calls` to ask "was the geometry submitted".** With the post
stack mounted, the last render before you read the counter is the final fullscreen pass, so it
reads **1 call / 1 triangle** and looks catastrophic. Count the meshes the camera can actually see
instead — visible, parents visible, bounding sphere inside the frustum — which is what
`walk-tour.mjs` now reports (354 meshes / ~87.6k triangles for the default flat at eye level).

## Isolate the SETTING, not the tier — and build a numeric discriminator first

`.62` had a confirmed tier defect ("walls vanish at `performance`") and no mechanism. `.63` closed
it to one line of code without reading much source at all, by doing two things in order.

**1. Build a discriminator before running arms.** Eyeballing eight frames would have been slow and
arguable. The mean luminance of a fixed centre band (64x40 downsample) of one pose separated the
two states cleanly and with no judgement call: **~112 = walls present, ~151 = walls gone**. Get a
number that distinguishes the two states you already have, THEN sweep.

**2. Sweep the preset delta one entry at a time, from the GOOD tier.** Diff the two presets, then
run the good tier plus exactly one of the bad tier's values (`wall-mottle.mjs OVERRIDE=key=value`,
which prints the fully resolved settings object so the arm's own state is beside its number). Six
settings differed; five were exonerated in two batches and one reproduced the defect exactly
(150.7 against the tier's own 150.7 / 152.8).

**3. Then falsify the obvious reading.** `ao=false` reproduced it, which reads as "AO causes it".
Adding one more arm — `ao=false` **plus** `postprocessing=true` — put the walls back, proving AO is
innocent and that the real trigger is `Effects.tsx`'s `if (!postprocessing && !ao) return null`,
i.e. **no composer mounting at all**. The named setting was a proxy, not the cause. One extra arm
turned a plausible wrong answer into the right one.

Note also that a preset diff built from the literal source text can MISS keys — the resolved
settings object printed by the probe surfaced `wallReveal`, which the text diff had not shown.
Print the resolved object, do not infer it.

## Before calling a headless finding a product defect, ask whether a real browser sees it

`.62`–`.64` chased "interior walls vanish at `performance` tier" through eleven measured arms and
narrowed it to one gate. Every app-level explanation was refuted in turn: six tier settings, AO
itself, `polygonOffset`, missing geometry, culling, alpha, probe timing, and a dither/discard path
that does not exist in the codebase.

What survived is a difference in **where the scene rasterises**: with a composer it goes to an
offscreen target, without one it goes to a multisampled DEFAULT framebuffer created with
`antialias: true, preserveDrawingBuffer: true`. That is a plausible app bug — and also exactly the
configuration where headless ANGLE-Metal driver artefacts live.

**Two rounds asserted "this is what a phone user sees" without ever testing a real browser.** The
capability ceiling does drop phones to `performance`, so the inference was reasonable, but it was
still an inference stacked on a headless-only observation. Reproducibility is not the same as
generality: eleven consistent arms in one environment say the effect is real IN THAT ENVIRONMENT.

**Rule: when every application-level hypothesis has been refuted and only a
framebuffer/driver-level difference remains, the next experiment is a DIFFERENT ENVIRONMENT, not a
twelfth arm in the same one.** State the caveat in the write-up the moment the suspicion arises,
and correct earlier claims explicitly rather than letting them stand.

## The environment arms that settle "product defect or harness artefact"

`.64` correctly refused to call a headless-only observation a product defect. `.65` settled it with
two cheap arms added to the probe itself, both one variable from the baseline:

- **`ANGLE=gl`** — swap the ANGLE backend (default `metal`). If a defect survives a different
  graphics backend it is not a backend driver bug.
- **`HEADFUL=1`** — launch a real browser window instead of headless. If it survives that, it is
  not a headless artefact.

Both reproduced the wall dissolve to within 0.2 of the headless number, which is what promoted it
from "suspicious" to "real". Add these to any capture probe before escalating a finding.

A third arm is worth knowing about: **`PUMP=n` forces n extra renders before capture.** Under
`frameloop="demand"` with `preserveDrawingBuffer: true`, an un-repainted canvas keeps whatever it
last held — at boot, the OUTSIDE orbit view of sky, city and ground, which is exactly what a
"missing walls" frame looks like. `PUMP` distinguishes "never drawn" from "never repainted". Here
twelve renders changed nothing, which killed the stale-buffer reading and left the real cause.

## Test the feature a setting protects, through the app's own code path

`preserveDrawingBuffer: true` carried a comment naming Export and Record as its reason. That
comment was the only thing standing between a proven one-line fix and shipping it — and a comment
is not evidence (meta-rule xvii), in either direction.

The check that settled it drove **the app's own readback**, not a puppeteer screenshot:
`document.querySelector('canvas').toDataURL('image/png')`, decoded and measured. With the flag on:
1.4 MB, 100% non-black. With it off: 30 KB, 0.0% non-black — a fully blank PNG. The comment was
right, and five call sites would have broken.

Two things to copy:
- **A puppeteer screenshot would NOT have caught this.** `page.screenshot()` uses the browser's own
  compositor and works regardless of `preserveDrawingBuffer`. Only the in-page readback fails. When
  a setting protects an in-app capture feature, exercise THAT API.
- **Grep for every consumer before judging blast radius.** The comment named two features; the
  codebase had five call sites doing the same `toDataURL` on the main canvas.

## A mask built to exclude CHROME can exclude the SUBJECT — render it before quoting it

`.75` measured "scene legibility" as the mean and near-black fraction over everything outside the
modal card and the toolbar, and reported the after-dark first paint as 89% near-black. `.76`
retracted it. Two compounding errors, both invisible in the number:

- **The excluded card region WAS the subject.** In an unobstructed shot there is no card there —
  the dollhouse is. The mask deleted the only part of the frame worth measuring.
- **The included region was mostly void.** At night the area around the model is black because it
  is 10 pm. A "near-black fraction" over that is a measure of the sky, not of legibility.

The daytime control did not catch it: at 13:00 the background is bright, so the same broken mask
returned a healthy-looking number, which made the night figure look like a real contrast.

**Rules:** before quoting a masked statistic, (a) render the mask — or the masked pixels — and
confirm it contains the thing being judged; (b) prefer a mask derived from the SUBJECT (a raycast
mask, a bounding box of the model) over one defined by what you want to remove; and (c) when a
statistic implies "you cannot see X", go and look at X in the frame before writing it up. Here
`/tmp/fr-seq/22-4-unobstructed.png` shows a warmly lit, perfectly legible flat.

## Every probe here suppresses the first-run path — so nobody had seen it

`lib.mjs`-style probe heads seed `hdb_onboarded` in `evaluateOnNewDocument` and call
`dismissLocationPrompt()` before `sceneReady`. That is correct for measuring the SCENE — overlays
would cover it — but it means the first-run path is invisible to the entire probe suite. Seventy
rounds of frames were all captured after onboarding was already dismissed.

`first-run.mjs` is the deliberate opposite: it suppresses nothing, pins the WALL clock
(`FAKE_HOUR=`, because the app boots `timeMode: 'system'`), and captures a timed sequence from
first paint, printing the store's own first-run flags beside each shot. It found that the
after-dark first paint is 89% near-black DURING onboarding — the exact failure
`firstPaintDaylight.ts` was written to prevent — because the guard lights the interior while the
boot camera is outside.

**Two transferable points:**
- **A guard is only as good as the VIEW it was validated in.** Interior-lights-on fixes the
  interior; the first thing a user sees was the orbit exterior, and nobody had measured that.
- **Mask the chrome, not the frame.** Quote the mean over the region outside the modal card and the
  toolbar. A whole-canvas figure here is dominated by a large white card and says nothing about
  whether the scene is legible.

## Pin the page WALL CLOCK — the app boots in `timeMode: 'system'`

Probes pin `setTimeMode('manual')` + `setManualHour(h)` and then reason as though time is
controlled. It is not: that only pins the SCENE clock. The app boots in `timeMode: 'system'`, and
anything keyed to the user's real time of day is invisible to a probe that never controls it —
including which frames you get, if the state differs.

That is how four rounds disagreed about whether `lightsMode` defaults to `off`: the runs that saw
`off` happened to execute in the afternoon, and the ones that saw `on` in the evening. Nobody was
wrong; nobody was controlling the variable.

`lights-boot.mjs FAKE_HOUR=h` installs a `Date` stub via `evaluateOnNewDocument` so it is in place
before any app code, then reads the store at `sceneReady`. **When a result refuses to reproduce
across sessions, check the wall clock before blaming the probe** — and record the local time a run
executed at, so a later disagreement can be reconciled instead of re-litigated.

## "This looks like a removed feature that survived" — check the DATE and the SHAPE first

`.73` found the app changing `lightsMode` by the wall clock, read `uiSlice.ts`'s note that the
follow-the-sun `'auto'` mode was *removed 2026-07-24 because users found lights turning themselves
on surprising*, and reported a regression. It was not one: the behaviour is
`firstPaintDaylight.ts`, added in **2026-08** — AFTER the removal — and it is a different shape.

- removed `'auto'`: **continuous** follow-the-sun, lights change as time passes.
- shipped guard: **one-shot** at first paint, fresh seed only, both settings still untouched.

Two cheap checks would have caught it before the write-up: **(a) when was the removal, and is the
behaviour newer?** and **(b) does the observed behaviour have the same SHAPE as the removed one, or
only the same trigger?** A shared trigger (the clock) is not a shared feature.

Also worth copying: the instrumentation that localised it. Wrapping `setState` from
`evaluateOnNewDocument` and logging every write that changes the key reported **zero** writes — which
is itself the finding, because it proves the value is decided at INITIAL-STATE CONSTRUCTION, before
`window.__store` exists, and sends you to the store's creation path instead of hunting setters.

## A surprising frame earns a STATE-VERIFICATION probe before it earns a diagnosis

Meta-rule (xi) says dismissing a finding as a probe artefact needs its own evidence. The
converse is just as load-bearing: **accepting** a surprising finding needs evidence that the
scene was in the state you think it was.

DEFAULT-GLOOM (v0.31.5.54) came out of a `walk-tour.mjs` contact sheet in which almost every
interior read dark grey at 13:00. The obvious explanation was the adaptive tier ladder demoting
under the load of a long run — no IBL at `performance` would darken interiors in exactly that
way, and it would have made the whole sheet an artefact of the harness. So that hypothesis was
tested FIRST, with `tier-drift.mjs` printing the resolved tier / IBL / exposure / hour+timeMode
at five points across 24 teleports. It came back `medium / IBL true / exposure 1.38 /
13:00 manual`, unchanged throughout, and reproduced the same dark frame.

The hypothesis lost, and that is what made the finding trustworthy — the dark sheet was now a
measurement of the product rather than of the probe. Write the refutation down next to the
result: a finding that survived a named, falsifiable attempt to explain it away is worth much
more than one that was merely never challenged.

## Separate compounding defaults ONE VARIABLE AT A TIME, with the shipped state as arm zero

When several defaults could each be dimming (or flattening, or greying) the out-of-box picture,
the instinct is to flip them all and report the difference. That number is unattributable and
tends to over-credit whichever lever you were already suspicious of.

`default-gloom.mjs` is the pattern: arm 0 is the **shipped defaults untouched** (meta-rule xxiv),
arm 1 changes exactly one (`lightsMode: 'on'`), arm 2 adds exactly one more (curtains open), and
**every arm prints its own `lightsMode` and tier beside its number** (meta-rule iv). The result
was unambiguous — lights are worth 2.3–2.5x in all four rooms, and opening every curtain on top
of that is worth between −0.4 and +4.6, i.e. nothing. Had the two been flipped together, the
curtains would have inherited credit for the lights' effect, and the earlier
WINDOW-TIME-INVARIANT note would have been promoted instead of demoted to MINOR.

Note also what did NOT happen: nothing shipped. `lightsMode` defaulting to `'off'` at midday is
a defensible product choice, and the daylight model demonstrably works (rooms brighten correctly
when the switch flips). Measuring a lever precisely is a complete result; deciding to pull it is
a product call, not a rendering one.

## A MASK that spans many surfaces makes sigma lie — microcontrast is the honest metric

PLASTER-STRETCH (v0.31.5.56) nearly shipped the wrong fix on a very tidy number. The wall mask
covered 35.7% of the screen across dozens of wall segments at different brightnesses, so its
**sigma measured segment-to-segment luminance**, not the within-surface blotching under
investigation. Turning SSAO off collapsed that sigma by 58% and produced a complete, plausible
story about N8AO's half-res noise.

The `normalMap off` FRAME killed it: a perfectly smooth painted wall **with AO still on**. Of the
three metrics only **microcontrast** — mean |neighbour difference| at full resolution — tracked
the actual defect (0.442 -> 0.206 when the normal map went away, against 0.442 -> 0.421 when AO
did). Sigma and mean are cell-mean statistics and are blind to exactly the high-frequency channel
that "does this surface look right" usually turns on.

- If the mask spans more than one lighting condition, **do not quote its sigma as surface
  contrast.** Either report microcontrast, or narrow the mask to one segment.
- The confirming sweep is worth the extra arm: reducing AO intensity 3.0 -> 1.0 moved the
  blotch metric and the corner-grounding metric *together* (ratio 2.44 -> 1.67), i.e. the shipped
  tuning was already optimal and there was no AO fix to find. A lever that trades one-for-one is
  not a lever.

## A texture's tiling can have a SECOND HOME, and editing the catalog is then a no-op

The same round retuned `uvScale` on all eleven plaster wall paints and the drawn material came
back **unchanged at `repeat=0.40`**. `procedural/generators.ts:buildPlasterMaps` carried its own
hardcoded `repeat.set(1 / 2.5, 1 / 2.5)` — twice — under a comment asserting the very catalog
value it was silently outranking.

Two things saved this from shipping as a "fix" that moved no pixels:

1. **Reading the tiling back off the DRAWN material**, not off the source. The probe printed
   `normalMap 256x256 repeat=0.40` in both runs.
2. **Meta-rule (xxv).** Three metrics identical to two decimals across a code change is not a
   null result, it is a mutation that did not land — the same reflex that has fired four times
   before on innocent cases fired here on a guilty one.

Generalise: a shared/cached texture built once for a whole pattern is a plausible second home for
any per-material parameter (`repeat`, `wrapS`, `anisotropy`, colour space). Grep for the literal,
not just the field name.

## A DEAD value stops being harmless the moment you make it live

`COMPOSE_TEXTURES` carried `{ pattern: 'plaster', uvScale: [2.5, 2.5] }` for a long time under a
comment claiming it mirrored the catalog. It was provably inert — the plaster branch in `cache.ts`
ignored `def.uvScale` entirely — so nobody noticed when the catalog moved to 0.6 and it did not.

The moment that ignored parameter was wired up (to fix the composer's dead tile-size slider), the
stale copy would have put the old 2.5 m stretch straight back on every composed plaster finish.
The fix and the regression were the same commit.

**When you make a previously-ignored parameter load-bearing, re-audit every place that was free to
drift while nobody was reading it.** Grep the field name AND the literal, and prefer importing one
constant over restating a number in a second table — a comment asserting that two tables agree is
not a mechanism that keeps them agreeing.

## Phone probes must BOOT as the device, or they silently measure a desktop

`scene/quality.ts` reads device capabilities **once at boot** (`readDeviceCapabilities` →
`capabilityCeilingTier`, the veto that drops phones to the `performance` tier). Anything
emulated *after* `page.goto` is therefore invisible to it, and the failure is silent: the
probe reports a plausible tier and you conclude the app is mis-detecting phones when in
fact it was never shown one. This cost a full round — `phone-view.mjs` booted at 1280x800
and switched to phone viewports afterwards, which produced "every phone viewport settles
on **medium**, so the documented phone veto never fires". Booted correctly the same app
reports `matchMedia('(pointer: coarse)') = true`, `maxTouchPoints = 1` and a live tier of
**`performance`** — the veto works exactly as documented.

Three traps, all of which have to be handled together (`scripts/dev-probes/phone-view.mjs`
is the working model):

1. **`setViewport({ isMobile, hasTouch })` does NOT set `matchMedia('(pointer: coarse)')`.**
   It sets device metrics and touch, and the pointer media feature stays `fine` — which is
   the single signal `capabilityCeilingTier` leans on hardest.
2. **Puppeteer's `page.emulateMediaFeatures` REJECTS `pointer`** outright with
   `Error: Unsupported media feature: pointer` — its allowlist covers only
   `prefers-color-scheme`, `prefers-reduced-motion`, `color-gamut` and `forced-colors`.
   Use a raw CDP session instead:
   `(await page.createCDPSession()).send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] })`.
3. **A device-metrics override RESETS emulated media**, so the CDP call must come *after*
   `setViewport` and *before* `goto`.

Have the probe PRINT what the page sees (`matchMedia`, `maxTouchPoints`,
`navigator.hardwareConcurrency`, `navigator.userAgentData?.mobile`) next to the resulting
tier. That one line is what distinguishes "the app is wrong" from "the harness never
delivered the signal", and the general rule is worth keeping: **before filing a defect
against the app, confirm the harness actually delivered the input the code reads.**

Note also that the phone tier is `performance` — flat shading, no AO, no IBL, no post — so
a probe that accidentally boots as a desktop is not just reporting the wrong tier label, it
is rendering a materially different image from the one most mobile users see.

## Scenario mode (recommended — use this for anything multi-step)

**Harness runs are serialized machine-wide.** `shot.mjs` takes an exclusive lock file
(`$TMPDIR/sofa-shot-harness.lock`) because concurrent SwiftShader Chromiums
(1–2 GB each) have coincided with container restarts that silently kill the
running process. A second invocation queues (up to 15 min) until the first
finishes — that delay is expected, not a hang. A lock left by a killed run is
cleared automatically via a PID liveness check.

**Scenario mode** is the primary way to drive complex, multi-step user journeys
headlessly. It runs an ordered list of named steps in a single browser session
and produces numbered screenshots. It replaces the legacy blind-timeout + eval
pattern for everything more than a one-liner.

```
node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]
```

Example:
```
node scripts/shot.mjs --scenario scripts/scenarios/first-run.json --out-dir /tmp/first-run
```

Each step prints `STEP n/N <name> … OK (1.2s)`. A failing step prints the reason,
dumps `<out-dir>/failed-<name>.png`, prints recent page console lines, and exits
non-zero — instant post-mortem, no silence.

The scenario `url` field sets the default target URL, but the `SHOT_URL` env var
takes precedence when set — always pass `SHOT_URL` when running someone else's
scenario, since scenarios hardcode their author's dev-server port.
Default localStorage is **empty** in scenario mode (so first-run flows trigger
naturally). Override with `SHOT_INIT_LS`.

**First-run overlays are auto-dismissed by default.** The harness seeds
`hdb_onboarded` (skips the onboarding carousel) and, after boot, clears the
"Where are you?" location prompt (via `__store.dismissLocationPrompt()`, with a
click-the-skip-button fallback for prod builds) — so neither can cover the canvas
in a screenshot. To screenshot those flows on purpose, set `SHOT_KEEP_FIRSTRUN=1`
(the `first-run*.json` scenarios rely on this).

**The `#boot-loader` cannot be captured in scenario mode** — the harness's own init
waits out the boot and dismisses first-run overlays *before* step 1 runs, by which
time the loader has been removed from the DOM (a `waitFor {css: "#boot-loader"}`
first step just times out). To screenshot/verify the boot loader art, snapshot the
served HTML with the app scripts stripped so the loader runs forever, then point a
scenario at it via `file://`:
`curl -s http://localhost:5173/ | sed 's|<script type="module"[^>]*src="[^"]*"></script>||g' > boot-static.html`
(the inline phrase-rotator script survives, so the cycling phrases still work).

### Timing contract — why scenarios beat blind waits

**Known pitfall (fixed in scenario mode):** the legacy harness fires `page.evaluate`
and then waits a fixed `waitMs` offset. Any `setTimeout` / async work kicked off
*inside* the eval fires *after* the screenshot — this burned a previous session
where an animation callback ran too late. In scenario mode, steps are strictly
sequential and awaited. Use `waitFor` steps to synchronise with async work instead
of guessing a delay.

**Rule:** prefer `waitFor` over `wait` wherever possible. `wait` is only for
unavoidable render-settle delays after a confirmed state change.

**A settle `wait` HIDES entrance-animation bugs — to catch them, screenshot at open with NO
settle.** TOOLBAR-MENU-VOID was a transient stagger-cascade void in the File/Tools dropdowns that
was visible only ~0–600ms after the menu opened; every prior review used a 700ms+ settle before the
screenshot and saw a clean, contiguous menu, so the bug survived a whole audit. The reproduction was
to screenshot the instant the panel mounts (`waitFor {css:".menu-item"}` → `screenshot`, no `wait`)
and assert every panel child is fully opaque at that moment
(`Array.from(panel.children).filter(c => parseFloat(getComputedStyle(c).opacity) < 0.99)` must be
empty). Guard scenario: `scripts/scenarios/toolbar-menu-void.json`. When verifying anything with a
per-row/staggered entrance, take a no-settle "at-open" shot in addition to the settled one.

### Step types reference

All steps accept optional `name` (default `<type>-<index>`) and `timeout` (default 15 000 ms).

Two equivalent input formats are supported — **keyed** (recommended in JSON files)
and **typed** (useful for programmatic generation):

| Step type | Keyed form (JSON) | Description |
|---|---|---|
| `eval` | `{"eval": "window.x=1"}` or `{"eval": {"file": "path.mjs"}}` | Run JS in page. Returns when expression returns — use `waitFor` to sync async side-effects. |
| `waitFor` | `{"waitFor": {"css": ".selector"}}` | Wait until condition. See variants below. |
| `click` | `{"click": {"text": "Get started"}}` or `{"click": ".btn"}` | Click element by text (deepest match) or CSS selector. |
| `drag` | `{"drag": {"from": [x,y], "to": [x,y]}}` | Canvas left-button drag. |
| `rdrag` | `{"rdrag": {"from": [x,y], "to": [x,y]}}` | Canvas right-button drag. |
| `wheel` | `{"wheel": {"x": 800, "y": 500, "dy": -400}}` | Mouse wheel. |
| `key` | `{"key": "Escape"}` | Keyboard key press. |
| `type` | `{"type": "type", "text": "hello", "x": 0, "y": 0}` | Type text (click first if x/y given). |
| `select` | `{"select": {"selector": "select", "value": "kitchen"}}` | Native `<select>` value + change event. |
| `wait` | `{"wait": 1000}` | Fixed delay (ms). Only when waitFor cannot help. |
| `screenshot` | `{"screenshot": "step-name"}` | Save `<NN>-<name>.png` to `--out-dir`. |
| `store` | `{"store": {"action": "setUiMode", "args": ["pro"]}}` | Call a store action. |
| `viewport` | `{"viewport": {"width": 390, "height": 844}}` | Resize viewport (e.g. mobile). |

**`waitFor` condition variants:**
```json
{"waitFor": {"css": ".modal-overlay"}}            // element appears (default)
{"waitFor": {"css": ".spinner", "visible": false}} // element disappears
{"waitFor": {"text": "Get started"}}               // page text contains string
{"waitFor": {"store": "state.tourOpen === true"}}  // store predicate (JS expression)
{"waitFor": {"storeExists": true}}                 // window.__store is defined
```
Each `waitFor` accepts `timeout` (ms) and `failMessage` overrides.

### Check your frames actually rendered: `measure-frame-detail.mjs`

```
node scripts/measure-frame-detail.mjs /tmp/out          # a dir or individual pngs
```

Mean absolute difference between horizontally adjacent greyscale pixels, downsampled to 80x50 so
it reads STRUCTURE, not texture. It is a **cover detector** — the thing that catches a green
scenario photographing a loader instead of its subject.

| detail | what it is |
|---|---|
| 0.3 - 1.3 | boot loader / transition splash / blank |
| 2.2 - 4.9 | a rendered panel or UI-heavy frame |
| 6.9 - 10.0 | a rendered 3D scene, or a panel full of swatches |

Exits non-zero under `--fail-under` (default 1.5), so a sweep can gate on it. **Read a flag as
"look at this frame", not "this frame is wrong"** — a deliberately plain empty-state panel on a
flat background can score low legitimately.

Worth running after ANY corpus-wide scenario change. It is how v0.31.9.5 discovered that
`finish-picker-audit.json` had been photographing the boot loader in all ten frames while passing
green, and how v0.31.9.6 confirmed the fix (0.31-0.36 -> 6.9-9.96).

### Returning to orbit: wait for the transition splash, in BOTH directions

`setCameraMode('orbit')` from walk raises the full-screen "Switching to overview…" splash, and
the scene swap **blocks the main thread for 3-6 s** in the headless harness — long enough that
even `transitionHide.ts`'s 2000 ms safety timeout fires late. A fixed `wait` after `back-orbit`
therefore screenshots the SPLASH, not the scene. `backdrop-walk-simple.json` shipped that way
and its final assert verified nothing until v0.31.8.88.

```json
{"name": "back-orbit", "store": {"action": "setCameraMode", "args": ["orbit"]}},
{"name": "orbit-overlay-shown", "waitFor": {"css": "[data-transition-overlay]"}, "timeout": 10000},
{"name": "orbit-overlay-gone",  "waitFor": {"css": "[data-transition-overlay]", "visible": false}, "timeout": 25000},
{"name": "settle-back", "wait": 600},
{"name": "shot", "screenshot": "orbit-again"}
```

Three ways to get this wrong, all of them tried:

- **`{"store": "state.loading.active === false"}` is NOT enough.** `hideLoading` only flips the
  flag; `useOverlayLifecycle` then holds the overlay for `MIN_VISIBLE_MS` (600) and fades it for
  `FADE_MS` (250). Measured ~1.6 s of overlay still painted after the flag cleared.
- **Matching the label TEXT is unreliable.** `visible: false` does not consider `opacity`, so it
  can be satisfied while the splash is fully painted — and worse, it passes VACUOUSLY when the
  step runs before React has rendered the new label, which is the common case since
  `showLoading` is synchronous inside `setCameraMode`.
- **Budget 45 s, not 25 s.** Measured on `walkcam` (Pro mode, so a heavier scene swap) across
  five runs: 11.4 / 15.6 / 17.7 / 26.4 / 50.4 s. A 25 s timeout false-failed once. The guard only
  spends its full timeout when something is genuinely wrong, so err high.
- **Waiting only for it to GO is not enough** — that is the vacuous pass above. Wait for it to
  APPEAR first, then to go. `[data-transition-overlay]` exists exactly while the overlay is in
  the DOM and is not shared with the notification region or the FPS HUD (both `role="status"`).

### Store-injected fixtures must match the real types

`eval` strings bypass TypeScript — `setItems([...])` with the wrong shape
(e.g. `pos`/`rot` instead of `position: [x, z]`/`rotation`) doesn't error at
injection; it crashes far away at render/derive time (a `position[0]` read in
`spendByRoom` took down `BudgetPanel` and looked like an app bug). Check the
real type (`FurnitureItem` in `src/furniture/types.ts`) before hand-writing
fixtures, place items at coordinates inside an actual room (origin `[0,0]` is
a plan corner), and set a daylight hour (`setManualHour(13)`) or screenshots
come out near-black.

### Known headless limitations for scenario steps

- **The `type` action's keyed JSON form is `{"type": "type", "text": "..."}` — not
  `{"type": "the text itself"}`** (found writing `ai-surfaces-simple.json`). Every other action
  has a friendly keyed shorthand (`{"click": {"text": "..."}}`, `{"waitFor": {"css": "..."}}`)
  because its type name differs from its own payload key. The `type` (keyboard-typing) action's
  type name IS the literal string `"type"`, so there's no shorthand to collapse into — write it
  in explicit typed form with a separate `"text"` field, or `validate.mjs`'s `resolveStepType`
  will treat your intended text as the discriminator, find no `text` field, and throw
  `(type action): must have "text"`. The `type` step also needs the target already focused
  (it only clicks first if you pass `x`/`y`) — Command Palette's search input autofocuses on
  open via `requestAnimationFrame`, so a `waitFor {css: ".cmdk-item"}` step before typing is
  enough; don't add an explicit focus click.
- **Top-level `const`/`let` in one `eval` step leaks into every later `eval` in the same
  scenario** — `page.evaluate` runs each script in the page's global scope, so two steps that
  both open with `const s = window.__store.getState()` fail the second one with
  `Identifier 's' has already been declared`. Wrap multi-statement evals in an IIFE
  (`(() => { … })()`) or use unique names.
- **A `waitFor`/`eval` text-substring check against the Command Palette can false-positive on
  its own empty-state echo.** `CommandPalette`'s "no results" row renders
  `No commands match "{query.trim()}".` — if your assertion checks
  `document.body.textContent.includes(<your search query>)` to prove a command is filtered OUT,
  it will find its own typed query quoted back inside that message and wrongly pass (or, as in
  `ai-surfaces-simple.json`'s first draft, fail an "absent" assertion that should have passed).
  Assert against the command's fuller, more specific label text instead (a substring the
  empty-state message can't accidentally contain), and/or assert `.cmdk-item` doesn't exist /
  `.cmdk-empty` does.
- **Demand-frameloop presentation can lag one render burst behind** (SwiftShader):
  a store change that only alters light parameters (e.g. C275 curtain attenuation —
  sun intensity provably updates to 0.62 instantly when probed via the scene graph)
  may not appear in the captured pixels until the NEXT store change triggers another
  burst. When verifying lighting-only changes, follow them with a no-op store nudge
  or assert via a scene-graph probe (`import('/src/scene/pathtrace/hqRenderSource.ts')`
  → traverse for the light) instead of pixels alone.
- **CSS transitions screenshot at their START value right after a store-driven style flip**
  (UIUX-38 theme-matrix sweep): headless Chromium renders no frames between scenario steps
  (demand frameloop, nothing invalidates), and a CSS transition only *begins* on the first
  rendered frame after its style change — so a `wait` step passes wall-clock time without
  advancing it, and the screenshot itself forces the first frame, capturing frame zero. Concretely:
  flipping `[data-mode]` dark and screenshotting 400ms later showed the seg pill's active label
  still at the LIGHT theme's `--text` (its `transition: all .16s` was `playState: running` with
  the light value 400ms in), while non-transitioned properties on neighbours had already switched —
  a convincing fake "theme contrast bug" that getComputedStyle probes + a SECOND screenshot proved
  transient. After any theme/mode/state flip whose properties transition, force a frame before the
  real shot: run any `eval` that forces style recalc (`getComputedStyle(el).color`) followed by a
  short `wait`, or take a throwaway screenshot first — and if a shot still looks wrong, re-probe
  computed style *after* it before diagnosing a token bug. In a MULTI-theme contact-sheet sweep
  this applies between EVERY flip: a `{theme flip} → wait → screenshot` chain reproduces the fake
  bug on each panel after the first (re-hit in the UIUX-56 sweep) — interleave a forced-recalc
  eval (`void getComputedStyle(document.body).color`) + wait, or shoot each theme twice and keep
  the second.
- **`querySelector('.plan-screen svg')` grabs a header ICON, not the plan canvas** (UIUX-19b):
  the plan screen renders many svgs before the drawing surface — the header buttons' icon
  svgs, the North compass, the scale bar — so the first-match selector dispatches your
  synthetic pointer event on a toolbar icon and it never bubbles through the canvas svg's
  React `onPointerMove`/`onPointerUp` (the gesture silently does nothing; `plan-furniture-rotate`
  failed its rotate rung this way for weeks while its pointerdown — dispatched on the knob
  inside the real canvas — worked fine). Target **`.plan-canvas svg`** for plan-canvas
  pointer events. Symptom signature: the down-handler's side effects fire (history pushed,
  drag state armed) but move/up handlers never run.
- **R3F raycasts don't fire for synthetic DOM events** — `click` by text/selector
  clicks a real DOM element fine, but clicking the Three.js canvas does NOT trigger
  `onPointerDown`/`onClick` on 3D objects (meshes). Use store actions (`store` step)
  to manipulate scene state programmatically.
- **Scroll + keyboard navigation inside canvas** — works via `key` steps (keyboard
  events reach the canvas). Orbit/zoom via `drag`/`rdrag`/`wheel` also work (real
  CDP pointer input, not synthetic).
- **Geolocation is unavailable headless** — `navigator.geolocation.getCurrentPosition`
  calls the error callback silently. Use `store: dismissLocationPrompt` or
  `click: "Skip — use default location"` instead.
- **`React.lazy` (dynamic-import) modals never resolve headlessly** (v0.9.0.18): the
  post-load module fetch is gated (the console logs `goto networkidle2 timed out`), so a
  lazily-mounted modal — e.g. everything routed through `ui/app/lazyComponents.tsx` like
  `StyleQuizModal`, `ShortcutsModal` — stays on its `Suspense` fallback (`null`) forever
  even after a multi-second wait; `.modal-overlay` never appears and the store flag is
  irrelevant. To *visually* verify such a modal, temporarily swap its App mount for a
  **direct import** (`import { X } from './ui/X'`, drop the `Suspense`), screenshot, then
  revert — and/or assert its DOM via a `@testing-library/react` render test (see
  `ShortcutsModal.test.tsx`). Non-lazy modals (the first-run location prompt) render fine.
- **Reduced-motion verification has no CDP media-emulation step.** The scenario harness
  can't flip `prefers-reduced-motion` at the browser level. Instead inject a `<style>` tag
  in an `eval` step that mirrors the app's own reduced-motion block (zero every
  `animation-duration`/`-delay`/`transition-duration`/`-delay`), then screenshot — this is
  the technique the `ui-polish-batch2a` scenario uses for its `emulate-reduced-motion` step:
  `document.head.appendChild(Object.assign(document.createElement('style'), { textContent:
  '*,*::before,*::after{animation-duration:0.01ms !important;animation-delay:0ms !important;
  animation-iteration-count:1 !important;transition-duration:0.01ms !important;
  transition-delay:0ms !important;}' }))`.
- **A pointermove-driven DOM handler (e.g. the P7 catalog `--mx/--my` radial-gradient writer) can't
  be exercised headless.** Three walls stack up: (1) the harness has no plain "mouse-move" step;
  (2) a *synthetic* `dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))` fires native
  listeners but does **not** reach React's root-delegated `onPointerMove` (same class as the R3F /
  synthetic-`contextmenu` limitation); (3) a real-CDP `drag` over a `draggable` element (catalog
  cards are draggable-to-place) starts native HTML5 drag-and-drop, which **suppresses** the
  pointermove stream (replaced by `dragover`). Verify such an effect by (a) asserting the CSS is
  applied — `getComputedStyle(el).backgroundImage` carries the expected `radial-gradient`/accent
  `oklch`; (b) probing the *inputs* of its gate (flag + `qualityTier`) rather than the hook itself;
  (c) driving the CSS var yourself via `el.style.setProperty('--mx', …)` for the visual; and lean on
  the effect's unit suite for the handler→var wiring. Say which evidence you got.
- **`navigator.canShare`/`navigator.share` are absent in headless Chromium — stub them with a plain
  `eval` before opening the surface that gates on them** (`share-native-simple.json`). An `eval` step
  assigning `navigator.canShare = (data) => …` / `navigator.share = (data) => { …; return
  Promise.resolve() }` works fine (these are plain instance properties, no native-getter lock like
  `navigator.geolocation`); record each call's args on `window.__shareCalls` so a later `waitFor
  {store: "window.__shareCalls.length > 0"}` step can confirm the click actually reached
  `navigator.share` (a synthetic `click` on a real DOM `<button>` does reach its React `onClick`,
  unlike the R3F-canvas/pointermove cases above — this isn't a canvas or root-delegated-only
  handler). To verify the ungated fallback, `delete navigator.canShare; delete navigator.share;` and
  reassert the gated button is absent — don't just trust the flag-off case, the button's real gate is
  `canShareHeroCardNative()`'s runtime probe, not only the feature flag.

### Scenario template

Copy this skeleton, fill in the steps:

```json
{
  "name": "my-flow",
  "url": "http://localhost:5211/",
  "steps": [
    { "name": "store-ready", "waitFor": { "storeExists": true }, "timeout": 30000 },
    { "name": "dismiss-overlays", "eval": "const s = window.__store.getState(); s.endTour?.(); s.setOnboardingOpen?.(false); s.dismissLocationPrompt?.()" },
    { "name": "shot-start", "screenshot": "start" },
    { "name": "click-something", "click": { "text": "Button label" } },
    { "name": "result-visible", "waitFor": { "css": ".result-class" } },
    { "name": "shot-result", "screenshot": "result" }
  ]
}
```

### Worked example — first-run scenarios

Two scenarios cover the first-user experience (port 5212):

**`first-run.json`** — carousel → choose the guided tour → tour → location prompt → scene:
```bash
npm run dev -- --port 5212 --strictPort &
for i in $(seq 1 30); do sleep 1; curl -sf http://localhost:5212/ >/dev/null && break; done
node scripts/shot.mjs --scenario scripts/scenarios/first-run.json --out-dir /tmp/first-run
node scripts/shot.mjs --scenario scripts/scenarios/first-run-no-tour.json --out-dir /tmp/first-run-no-tour
node scripts/shot.mjs --scenario scripts/scenarios/first-run-returning-user.json --out-dir /tmp/first-run-returning
```

Steps of `first-run.json` (30 total, 8 screenshots):
1. Clears localStorage and reloads → clean session
2. Waits for `window.__store` to exist and `onboardingOpen === true`
3. Screenshots onboarding carousel step 1 (welcome) → "Get started" → step 2 (quick tour) → "Next"
4. Screenshots choices screen → clicks "Take the guided tour"
5. Waits for `onboardingOpen === false`, then `tourOpen === true`
6. Screenshots tour steps 1–3 → "Skip tour" → waits for tour to close
7. Waits for location prompt (`.modal-overlay`) → screenshots → clicks "Skip — use default location"
8. Screenshots final furnished scene (no overlays)

**`first-run-no-tour.json`** — carousel → "Enter sandbox" → assert tour never opens → location prompt → scene.
Asserts `tourOpen === false` immediately after the carousel closes.

**`first-run-returning-user.json`** — the *persistence* re-rung: clean profile boots the carousel,
the top-nav **"Skip"** button (the third dismissal path, not covered by the other two scenarios)
closes it and persists `hdb_onboarded='1'`, then a **real `location.reload()`** must NOT re-show
**any** first-run overlay — neither the carousel nor the location prompt. This is the end-to-end
proof of the `resolveBootDecision` contract that `bootDecision.test.ts` only covers at the
pure-function level, plus the autosave round-trip of the location-prompt dismissal. Gotchas baked
into the scenario:
- **Persistence needs a real reload, not a store reset.** `hdb_onboarded` lives in `localStorage`
  and is read by `hasOnboarded()` only at boot (inside the `booting` effect). Assert the returning
  path by driving `location.reload()` and re-waiting for `bootPhase === 'ready' && sceneReady`, not
  by calling a store reset (which never re-runs the boot decision).
- **The location-prompt dismissal IS persisted — via the design autosave, not localStorage.**
  Don't assume "store flag" = session-only: `locationPromptDismissed` is in `serialize()`
  (`state/schema.ts`) and the autosave watch-list (`PERSISTENT_WATCH_KEYS`,
  `state/storage/autosave.ts`), so after a reload it is restored `true` and the "Where are you?"
  modal must NOT reappear (a first draft of this scenario asserted the opposite and failed).
  The 500 ms debounce is covered by the `pagehide` flush, but the scenario still waits for
  `lastSavedAt` to advance past a pre-dismissal baseline before reloading, making the round-trip
  explicit. (`waitFor.store` predicates run in page scope, so they can compare against a
  `window.__…` baseline captured by an earlier `eval` step.)
- **A late/re-fired boot decision is a real risk.** The decision runs in a `booting`-gated effect, so
  the assertion waits for `onboardingOpen === false` AND then re-checks after a ~1.5 s buffer to catch
  a carousel (or modal overlay) that opens a beat late.

### Worked example — Simple-mode core design loop (IXT-SUITES batch 1, C269)

Eight scenarios covering the five Simple-mode features. All use `SHOT_URL` (do not
rely on the hardcoded `url`); run them sequentially since SwiftShader can't handle
parallel sessions. Suppress onboarding with `localStorage.setItem('hdb_onboarded','1')`
inside the `dismiss-overlays` eval — the store call `setOnboardingOpen(false)` is a
no-op if the decision hasn't fired yet.

```bash
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/catalog-furnish-simple.json --out-dir /tmp/cfs
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/catalog-furnish-journey.json --out-dir /tmp/cfj
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/finishes-simple.json --out-dir /tmp/fins
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/finishes-journey.json --out-dir /tmp/finj
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/budget-simple.json --out-dir /tmp/bgt
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/share-simple.json --out-dir /tmp/shr
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/view-modes-simple.json --out-dir /tmp/vms
SHOT_URL=http://localhost:5220/ SHOT_NAV_TIMEOUT=120000 \
  node scripts/shot.mjs --scenario scripts/scenarios/view-modes-journey.json --out-dir /tmp/vmj
```

**`catalog-furnish-simple.json`** (28 steps, 5 screenshots) — enters room editor,
verifies catalog drawer opens (`.panel.catalog`), Packs tab hidden in Simple / visible
in Pro, places a sofa via `setItems`, confirms item in scene and budget panel.

**`catalog-furnish-journey.json`** (34 steps, 5 screenshots) — places 6 items (sofa,
TV console, coffee table, dining table, 2 chairs), verifies catalog + budget panel
coexist, drag/zoom camera, mobile viewport 390×844 leg.

**`finishes-simple.json`** (25 steps, 5 screenshots) — `selectRoom` opens finish
picker (`.panel.inspector`), applies `floor-wood-oak` + `wall-paint-white`, verifies
`state.finishes.floor['livingDining']` and `state.finishes.walls['livingDining']`
in the store, drag/tilt camera shows applied finishes.

**`finishes-journey.json`** (31 steps, 4 screenshots) — applies finishes while the
catalog drawer is open (coexistence check), mobile viewport 390×844 leg, store
predicates confirm persistence.

**`budget-simple.json`** (23 steps, 4 screenshots) — 5 priced items placed,
`setBudgetTarget(5000)` → `BudgetHud` pill appears (`.budget-hud`), budget panel
(`.panel.mini.aux`) shows `$` totals, pro flags (report, measure, boq) confirmed
OFF in Simple.

**`share-simple.json`** (18 steps, 3 screenshots) — `setShareOpen(true)` → share
modal (`.modal-overlay`) shows "3D link", "plan link", "Snapshot PNG" text; Escape
closes it; report + boq flags confirmed OFF in Simple.

**`view-modes-simple.json`** (24 steps, 6 screenshots) — boot in orbit, walk
(`firstPerson`) mode active → WalkHud (`.walk-hud`) visible, back to orbit, open
2D plan editor (`.plan-screen`), close.

**`view-modes-journey.json`** (39 steps, 6 screenshots) — enters room editor with
3 items, catalog open in orbit + item selected, exits editor (catalog auto-hides),
walk mode → WalkHud, back to orbit, 2D plan opens with items visible, mobile
viewport 390×844 leg.

**Key gotchas from this batch:**
- Use `localStorage.setItem('hdb_onboarded','1')` (not just `setOnboardingOpen(false)`)
  in `dismiss-overlays` to prevent the carousel mounting after the step returns.
- Builtin finish IDs have NO `mat:` prefix: `floor-wood-oak`, `wall-paint-white`.
- Valid `shopTab` values are `'list'` and `'saved'` (not `'rooms'`).
- `.panel.catalog` only mounts when `open && cameraMode === 'orbit' && roomEditor.active`;
  must `enterRoomEditor` before opening the catalog.
- `.budget-hud` only appears after `setBudgetTarget(n)` (non-null target).
- Increase `store-ready` timeout to 60 000 ms under SwiftShader headless.
- `eval` steps sharing the page scope across steps: wrap all `const` declarations
  in IIFEs to avoid "Identifier already declared" errors.

### Worked examples — pro-tier analytical feature scenarios (C272)

All 7 scenarios below run against `SHOT_URL=http://localhost:5213/` (any dev server port works via env override).
Each starts in Simple mode (app default), asserts the feature is hidden, switches to Pro, exercises the feature,
then optionally switches back to Simple and asserts it is hidden again.

- **`drawings-lighting-simple.json`** (30 steps, 7 shots) — `drawings` flag Simple/Pro gate; opens `#elevationPanel`; switches to Lighting tab via segmented control; toggles `luxOverlayOn` via store; scrubs `manualHour` to 19 and asserts overlay state persists.
- **`versions-simple.json`** (14 steps, 3 shots) — `versions` flag Simple/Pro gate; opens `#versionsPanel`; asserts it mounts; closes and switches back.
- **`versions-journey.json`** (31 steps, 6 shots) — seeds a schema-valid save into `localStorage` (`sofa-so-good:save:test-v1`); opens versions panel; adds a dining table (2 items); clicks Compare → asserts `.ver-diff`; clicks Restore → asserts item count round-trips to 1 sofa.
- **`history-simple.json`** (30 steps, 5 shots) — `history` flag Simple/Pro gate; clears items+history; places sofa then armchair; pushes history twice; opens `#historyPanel`; `jumpHistory(0)` → asserts 1 sofa (first past snapshot = state after sofa was placed); jumps to latest.
- **`pano-tour-simple.json`** (27 steps, 5 shots) — `panoTour` flag Simple/Pro gate; seeds 2 stops via `window.__store.setState({panoTourStops:[...], panoTourActiveId:'...'})` (NOT `addPanoTourStopHere` which reads live camera); opens `.modal-overlay`; asserts Living Room + Kitchen tab buttons; opens 2D plan editor via `setFloorPlanEditing(true)`; asserts `.plan-screen circle` count ≥ 2.
- **`pano-tour-journey.json`** (37 steps, 8 shots) — multi-step pano tour: add 2 stops, plan editor markers, tour modal with stop switching; then `{"viewport": {"width": 390, "height": 844}}` mobile leg — asserts stop tabs visible at 390×844.
- **`render-compare-simple.json`** (19 steps, 4 shots) — `renderCompare` flag Simple/Pro gate; opens modal via `setRenderCompareOpen(true)`; asserts `.modal-overlay select` count ≥ 1 (preset selectors: "Bright day" + "Soft morning" dropdowns and "64 samples" selector visible).

**Key gotcha: `jumpHistory(0)` goes to `past[0]`, not an empty state.** After `pushHistory()`, `past[0]` holds the state at the time of the first push (sofa placed), so the assertion after jumping to index 0 is 1 item (`sofa-3seat`), not 0. See `history-simple.json` step `assert-jumped-to-first`.

**Key gotcha: `addPanoTourStopHere()` reads live camera position** — in headless the camera is at the default orbit origin, so all stops land at [0,0] and overlap. Inject stops directly via `window.__store.setState({panoTourStops:[{id,label,position:[x,z]},...]})` instead.

**Key gotcha: versions panel save flow requires interactive `promptText()`.** Seeding a version directly into `localStorage` with a schema-valid payload (requires `version:2`, `apartmentId:'serangoon-north-vista-4r'`, `userFurniture:[]`, `userMaterials:[]`, `timeMode`, `manualHour`, `cameraMode`, `savedAt`, `items`, `doors`, `finishes`) bypasses the modal entirely and exercises the load/compare/restore path. See `versions-journey.json` step `seed-saved-version-in-localstorage`.

### Worked example — 2D plan-editor tools journey (IXT-SUITES batch 3)

**`plan-editor-tools-journey.json`** (21 steps, 3 shots) covers the 2D-editor tools added in the
parity push: text notes (`addNote`), dimension lines (`addDimension`), furniture plan labels
(`setPlanLabels('price')`, Pro), level duplication (`duplicateLevel('ground')`), and wall split→join
round-trip (`splitWall` then `joinWall`). Each mutation is asserted with a `waitFor: { store: … }`
predicate (e.g. `(state.floorPlan.notes||[]).length === 1`, `state.floorPlan.walls.length === window.__w0`).
**Key gotchas:** set `setUiMode('pro')` + `reresolveFeatureFlags()` before `setPlanLabels` (it's a pro
flag); the tools' store actions are exposed directly (`addNote`/`addDimension`/`duplicateLevel`/
`splitWall`/`joinWall`), so drive them via `eval`/`store` steps rather than synthesising canvas drags
(`splitWall` selects the first half, so `joinWall(planSelection.id)` merges it back to the original count).

### Worked example — 2D plan furniture rotate handle (PARITY-PLAN-FURN-ROTATE)

**`plan-furniture-rotate.json`** selects a seeded sofa in the plan, reveals furniture footprints,
grabs the rotate-knob handle and sweeps it, then asserts `__store.items[i].rotation` changed and
is 15°-snapped. **Key gotchas learned here:**
- The **"Furniture" footprint toggle lives inside the desktop "View ▾" dropdown menu**
  (`PlanMenu`), not on the top toolbar row — clicking by text `"Furniture"` fails until the menu
  is open. Open it first; the trigger button is `button[aria-haspopup="menu"]` whose text starts
  with `View`.
- **`click: {text: "View ▾"}` does NOT match** — the `▾` chevron is part of the label string and
  the deepest-text matcher won't find the combined `"View ▾"`. Drive the menu open with an `eval`
  that finds the button by `aria-haspopup="menu"` + a `/^\s*View/` text test and calls `.click()`,
  then click the now-visible "Furniture" button (also via an `eval` exact-text match, to avoid
  matching the help-text paragraph that contains the word "furniture").
- The plan editor is **SVG/DOM**, so unlike the R3F canvas it **does** receive synthetic
  `PointerEvent`s — dispatch `pointerdown` on `[data-rot-handle='<id>']` then `pointermove`/
  `pointerup` on `.plan-screen svg` (with `pointerId`, `button:0`, `buttons:1`) to simulate the
  rotate drag. Wrap `setPointerCapture` in try/catch (it can throw for a fully-synthetic pointer,
  but the handler still records the gesture before capture). The assert only needs the rotation to
  change + be 15°-snapped, so the exact pointer-to-centre angle need not be precise.
- **NEVER launch two `shot.mjs` runs at once.** They serialize on a lock file, but a second queued
  Chromium under SwiftShader starves the first and the editor's `.plan-screen` `waitFor` times out
  spuriously. Run one scenario, wait for `EXIT`, then run the next.

**Editor tap-to-inspect flicker** (`plan-tap-select-view.json`): reproduces the View-mode
select→instant-deselect regression. Seed a mobile viewport (`390×844`) — the editor defaults to
**View** interaction mode there (`isMobile ? 'view' : 'edit'`) — subscribe to `planSelection`
transitions, then fire a synthetic `pointerdown`/`pointerup` (touch) on a `g[data-wall] path`. A
correct build logs **one** transition (the select) and `assert-selection-sticks` (`planSelection !==
null`) passes; the bug logged select→`null`. The paired edit-mode scenario is `plan-tap-select.json`.
Root cause + fix live in the pure `ui/floorplan/editor/tapDeselect.ts` (`clearsSelectionOnPanRelease`).

### Worked example — Sweet Home 3D furniture import (PARITY-SH3D-FURN)

**`sh3d-furn-import.json`** drives a full `.sh3d` parse → place: it base64-decodes a synthetic
archive into a `Uint8Array`, calls the dev-only `window.__importSh3dBytes(bytes, name)` hook
(parse + `applySh3dResult`), then asserts `__store.items.length > 0` and probes the placed
items / openings before screenshotting the furnished scene (dollhouse + a tilted profile) and the
2D plan (door + window openings). Verified: 4 pieces (Comfy Sofa→`sofa-3seat`, Coffee Table→
`coffee-table`, Double Bed→`bed-queen` keeping its 1.57 rad rotation, Wardrobe→`dresser`) placed
inside the room, plus a door + a window opening on the plan. **Key gotchas learned here:**
- **Module functions aren't on `window`** — to drive the importer headlessly, add a dev-only lever
  in `exposeDevHelpers` (`bootstrap.ts`) next to `__arrangeRoom`/`__loadTemplate`. `__importSh3dBytes`
  is now permanent (dev-only, tree-shaken from prod), so the scenario is re-runnable without a temp
  hook. Don't try `await import('/src/...')` from the eval — page-context path resolution fails.
- **Build the `.sh3d` bytes out-of-page and inline them.** `fflate` isn't reachable from the eval
  scope; generate the zip in a Node script (`zipSync({ 'Home.xml': strToU8(xml) })`), base64 it, and
  decode in the eval via `atob` → `Uint8Array` (a small fixture is ~700 chars). Keep the fixture's
  furniture names matched to catalog categories (sofa/table/bed/wardrobe) so they resolve to defs.
- **Sync on the placement, not a fixed wait.** `applySh3dResult` mutates the store synchronously, so
  `{"waitFor": {"store": "window.__store.getState().items.length > 0"}}` is the reliable gate before
  probing/screenshotting; `requestHomeView()` then frames the new plan like a template load.
### Worked example — GLB asset designer simple rung (IXT-SUITES GLB-designer re-rung)

**`glb-designer-simple.json`** covers the pro-only 3D asset designer
(`ui/glbEditor/GlbDesignerDialog.tsx`, gated by the **`glbDesigner`** flag — pro tier, so
`setUiMode('pro')` resolves it on; the Stage-0 `glb-designer-stage0.json` rung additionally
drives the flag directly via `setFeatureFlag('glbDesigner', …)`): Simple/Pro gate (dialog
stays UNMOUNTED in Simple even with `glbDesignerOpen` forced true, present in Pro) → a real edit
round-trip (add box → set size X to 1 m + raise position Y to 0.8 m; the controlled numeric inputs
AND the live 3D preview both reflect the elongated raised box) → a real **save round-trip to the
store** (name → Save asset → a `UserGltfDef` lands in `state.userFurniture`) → back-to-Simple +
mobile legs re-assert hidden. **Key gotchas learned here:**
- **The designer dialog is `React.lazy` but mounts fine headless** — unlike the model-upload dialog
  (next section). It's in `preloadOnIdle.ts`'s `PRELOAD_ORDER`, so its chunk is idle-warmed after
  boot and Suspense resolves immediately when opened. The "lazy dialogs never mount headless"
  limitation only bites dialogs that are NOT preloaded (they pay a first-open fetch that hangs).
- **`clickByText` does NOT scroll the target into view — a button below the fold is silently
  missed.** `scripts/lib/interact.mjs`'s `clickByText` computes the match's `getBoundingClientRect()`
  centre and fires `page.mouse.click(x,y)` at it; if that point is off-screen (e.g. the designer's
  "Save asset" button, which lives in the "Save to catalog" section at the very bottom of the
  scrolling right panel, below the fold at every viewport), the click lands nowhere and the button's
  React `onClick` never runs — a **silent no-op with no error**. This is exactly why the pre-existing
  `glb-csg-textures-simple.json` save step (`waitFor {text:"Saved"}`) was timing out. Fix: click such
  a control via a DOM `.click()` in an `eval` (viewport-independent — a real click event React
  honours regardless of scroll), NOT the harness text-click:
  `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save asset' &&
  !b.disabled)?.click()`. Do NOT misdiagnose this as a headless export limitation: the GLB export
  path is fully drivable headless — `GLTFExporter`'s dynamic import resolves, `GLTFExporter.parse` of
  a solid-material box completes in ~6 ms, and `persistUserGlb` is exercised headless by the
  bulk-import scenarios. The only blocker was the missed click; once Save actually fires, the
  `buildEditedObject → exportGlb → persistUserGlb → addUserFurniture` round-trip completes and
  `state.userFurniture` gains the def.
- **The designer keeps its edit spec in component-local `useState`, not the store** — it commits to
  the global store ONLY on Save. So a mid-edit "round-trip" is asserted against the controlled
  inputs (which reflect the local spec) + the live preview mesh, not `window.__store`; the store
  round-trip is available only after Save.
- **Success toasts auto-dismiss after 3 s** (`notificationsSlice.ts` `SUCCESS_DEFAULT_MS`) and live
  in `state.notifications` (an array), not `notify.current`. Gate a save assertion on the durable
  store change (`userFurniture` length/entry), not a `waitFor {text:"Saved"}` that can miss the
  toast's 3 s window.

### Worked example — GLB designer "Update original" round-trip (GE4)

**`glb-update-original.json`** verifies the designer's edit-existing-asset flow: create a box
asset → place an instance in a room editor → re-open the designer, pick that asset as the
"Start from" source, scale it, toggle **Update original**, save → assert the def is replaced in
place (same id, new geometry, no duplicate) and the placed instance still resolves.
**New gotchas beyond the simple rung above:**
- **The designer's "Start from" picker is the custom `ui/controls/Select`, NOT a native
  `<select>`** — you can't set `.value` + dispatch `change`. Drive it in two eval steps: click the
  trigger `button[aria-label="Source model"]`, then (after a short settle) click the option:
  `[...document.querySelectorAll('[role="option"]')].find(o => o.textContent.trim().includes('<name>')).click()`.
  The option list is portalled (`Popover`), so it's a sibling of the trigger in the DOM, not a child.
- **Wait for the source GLB to actually LOAD before saving an "Update original"**, or the re-export
  silently omits the original geometry (`buildEditedObject(source=null, …)` builds an empty object
  and placed instances lose their mesh). The **"Recolour parts"** section only renders once the
  source scene has loaded into the preview and its named meshes populate `meshNames` — `waitFor
  {text:"Recolour parts"}` (generous timeout — GLB parse under SwiftShader) is the load gate.
- **Assert the EXACT expected size, not just "changed".** This scenario caught a real bug where a
  `scale` prop on `<primitive object={gltf.scene}>` mutated the shared `useGLTF`-cached scene's
  `.scale`, so the export double-applied the source scale (a 0.8 m box at source-scale 2× saved at
  3.2 m / 6.4 m — non-deterministic 4×/8×). A loose `footprint > original` assertion passes on the
  buggy 8×; a bracketed `> ×1.7 && < ×2.4` pins the correct 2× and fails the regression. General
  lesson: never put a display-only `scale` on a `<primitive>` bound to a shared cached object — wrap
  it in a `<group scale>` instead (the cached scene is exported / reused by other consumers).
- **Place a programmatic instance with `addItem` + a known interior coordinate.** `addItem` does no
  collision check, so `window.__store.getState().addItem({defId, position:[x,z], rotation:0,
  props:{}})` always lands; for the default flat, room centroids are stable
  (`apartment/constants.ts` — e.g. Living/Dining centre ≈ `[10.55, 4.1]`). `enterRoomEditor('<roomId>')`
  first to frame the room for a clean before/after screenshot.

### Gotchas from the IXT-SUITES back-fill (materialComposer / wallAccentPicker / planCompass / unroomedFlag)

- **`MaterialComposer` auto-seeds a `tint:` of the ACTIVE catalog material, not a fresh
  `compose:` pattern**, whenever the room's current finish matches a catalog id — an "apply
  composed finish" assertion expecting a `compose:` prefix must first drive the composer's
  custom `Select` to an explicit procedural pattern option (trigger click → portalled
  `[role="option"]` click), or it will (correctly) get a `tint:` id and fail.
- **A `pointer-events:none` layer that is ALWAYS in the DOM can't be probed by presence or
  point-picking.** `unroomedFlag`'s red polygon exists at the full building footprint at all
  times — it's merely occluded by the `RoomsLayer` fills painted above it, and
  `elementFromPoint` skips it (`pointer-events:none`). Assert OCCLUSION instead: check whether
  any room-fill element still covers a known world point after the mutation (e.g. does a
  `[fill^='var(--surface']` rect contain the point), not whether the flag layer "appeared".
- **Store actions that mirror a picker's internals need the SAME argument pair the UI uses** —
  `selectWall(wallId, roomId)` must be a genuinely bordering pair (verify via `wallRoomSides()`)
  or the `WallAccentPicker` mounts against a wall the room doesn't own and the accent key
  (`wallId:roomId`) never resolves in the 3D scene.

### Gotchas from the IXT-SUITES back-fill batch 2 (dimensionChain / planGuides / cornerFillet / roomInset)

- **`PlanMenu.tsx`'s panel closes the WHOLE menu on ANY click inside it** — the `.plan-menu-panel`
  wrapper has its own `onClick={() => setOpen(false)}` and the comment says so outright
  ("Clicking an action closes the menu (bubbles to the panel)"): every action button in the "Plan
  ▾" menu is a **one-shot** control. A multi-action scenario (add a V guide, then an H guide, then
  Clear guides) must **reopen the menu before every single click**, not just the first — reusing
  the same self-retrying open-eval from the `aiwalls-simple.json` gotcha (poll until the target
  button's text is present in `.plan-menu-panel`, re-clicking the "Plan ▾" trigger if it isn't).
  Forgetting this makes the *second* action's button-lookup fail with "button not found" even
  though the first click worked fine — it's not a missing feature, the panel is simply gone.
- **Add explicit settle waits around every Plan-menu open/close, even when the open-eval already
  polls for `.plan-menu-panel` to appear.** A single self-retrying open-eval that returns the
  instant it sees the panel can still race the SAME stray scroll/resize the aiwalls-simple gotcha
  documented — the panel can flicker shut again microseconds after the eval returns, so the very
  next step (an assertion or a screenshot) sometimes finds it already gone. `aiwalls-simple.json`'s
  actual working pattern is open-eval → `waitFor {css:'.plan-menu-panel'}` → a short **300 ms
  settle `wait`** → THEN assert/screenshot/click; mirror that three-step shape (not just the
  open-eval alone) for every open, and add a 300 ms settle after every close too. Skipping the
  settle produced an intermittent "Plan menu panel missing" failure that a bare re-run without the
  waits did not reproduce every time — a genuine timing race, not a flaky harness fluke.
- **Selecting two connected walls for `cornerFillet` (or any two-wall action) mirrors the real
  multi-select gesture exactly**: `setPlanSelection({type:'wall', id: idA})` (primary) followed by
  `toggleWallSelection(idB)` (adds it as an "extra" in `selectedWallIds`) reproduces
  `FloorPlanEditor`'s own `selectedWalls` memo (`sel.id` ∪ `selectedWallIds`, filtered to walls
  that still exist) — don't hand-write `{selectedWallIds:[idA,idB]}` via `setState` directly, since
  the component's `useMemo` also folds in `planSelection` and a hand-rolled state shape can
  silently disagree with what the two "Round corner"/"Bevel corner" buttons actually read
  (`selectedWalls.size === 2`). Find a genuinely-connected pair generically at runtime (search
  `floorPlan.walls` for two whose `start`/`end` share a point, keyed by a rounded string) rather
  than hardcoding wall ids from one plan snapshot — plan-generation details can shift the ids.
- **`RoomInspector`'s `.plan-props` aside is a plain component, not a `Popover`-based menu** — its
  buttons ("Inset −0.1 m", "Grow +0.1 m", the ceiling-style segmented control, …) do **not**
  auto-close anything on click, so (unlike the Plan-menu buttons above) a sequence of clicks inside
  it needs no reopen dance. Select the room via `setPlanSelection({type:'room', id})` — the panel
  mounts on `sel?.type === 'room'` and stays open across a Simple↔Pro `setUiMode` switch (selection
  state is untouched by the mode switch, only the flag-gated JSX inside the panel changes).
- **Pick the LARGEST room for a room-outline-shrinking op.** `insetRoom` rejects (returns `false`,
  shows an error toast) when the offset would collapse the outline — `insetPolygon`'s degenerate
  check. A small room (a bathroom, a household shelter) in the default HDB flat can legitimately
  reject a 0.1 m inset depending on its narrowest span; reduce the flakiness by reducing over
  `rooms.reduce((a,b) => a.width*a.depth >= b.width*b.depth ? a : b)` to always target the biggest
  room (Living/Dining in the default flat), which comfortably tolerates the standard 0.1 m nudge.

### Gotchas from the IXT-SUITES back-fill batch 3 (layoutReroll / planLabels / wallThickness / designerPicks)

- **A curated-swatch/name-search substring scan across `scripts/scenarios/*.json` gives false
  "uncovered" results on a British/American spelling mismatch.** `elementColors` (flag) vs.
  `element-colours-verify.json` (existing scenario) don't share a substring once dashes are
  stripped (`elementcolors` vs `elementcolourverify`) — a naive "does the flag name normalize into
  any scenario filename" pass will report an already-covered flag as a gap. Always grep the
  registry `label`/`description` text too (or just open the top few candidate files) before
  authoring a scenario that turns out to duplicate one that already exists under a differently
  spelled name.
- **A flag can gate a control that lives inside an ALREADY-flag-gated parent panel with no
  dedicated route of its own.** `layoutReroll`'s only UI is the "Try another layout" button inside
  `FinishPicker`'s "Room layout" section (itself reached via `enterRoomEditor` + `selectRoom`, the
  same open sequence `materialcomposer-simple.json` established) — there's no separate menu/route
  to discover it from a flag name search; `grep -rn "layoutReroll"` across `src/ui` is what actually
  finds it (only 3 hits: `types.ts`, `registry.ts`, `FinishPicker.tsx`).
- **`rerollRoomLayout`'s variant counter (`layoutVariants[roomId]`) is session-only state, NOT part
  of `HistorySnapshot`** (see `src/state/CLAUDE.md`'s undo-granularity rule) — `undo()` reverts the
  reshuffled `items` array but leaves `layoutVariants[roomId]` at whatever it last was. Don't assert
  the variant counter decremented after an undo; assert only that the item transforms round-tripped
  back to the pre-reroll snapshot.
- **`planLabels`' cycle button lives in the "View ▾" `PlanMenu`** (the same self-closing-on-any-click
  panel documented in the batch-2 gotchas) — reopen it before EVERY click (toggling "Furniture" ON,
  then separately cycling "Labels: off"→"Labels: name"→"Labels: name"→"Labels: + price" are three
  separate opens, not one). Two more gotchas specific to this flag: (1) **label TEXT rendering is
  gated on the SEPARATE "Furniture" visibility toggle**, not just `planLabels` — `FurnitureLayer`
  (and its `.plan-item-label` texts) only mounts at all when `showFurniture` is true, so a scenario
  that skips turning Furniture on first will find zero label elements no matter what `planLabels`
  mode is active. (2) **the price line needs `budget` (a `default:false` flag) ALSO on** —
  `fPrice = useFeature('budget')` gates whether `itemPrice(...)` is even computed, so cycling to
  `'price'` mode with `budget` still off silently produces name-only labels (no `$` tspan); flip
  `budget` on via `setFeatureFlag('budget', true)` before asserting the price line.
- **`wallThickness`'s plan-wide Exterior/Interior fields live in the NO-SELECTION `PlanInspector`
  default panel** (`.plan-props`, desktop-only-by-default but always mounted since nothing is
  selected) — no click/open dance needed, just `setFloorPlanEditing(true)` and wait for
  `.plan-props`. The `Num` control has no `aria-label` on the `<input>` itself, only a sibling
  `<span>` inside the wrapping `<label>` — locate it via `[...document.querySelectorAll('.plan-props
  label')].find(l => l.querySelector('span')?.textContent.trim() === 'Exterior (m)')` then
  `.querySelector('input')`, and commit a value with the native-setter + `dispatchEvent(new
  Event('input', {bubbles:true}))` trick (`expansion-e4b.json`'s established pattern) — a plain
  `.value = '0.3'` assignment does NOT fire React's `onChange` (React's controlled-input tracker
  ignores a direct property write). The SAME `Num` component (same lack of `aria-label`) backs the
  per-wall `WallInspector` "Thickness (m)" override field one selection away — select a wall via
  `setPlanSelection({type:'wall', id})` first.
- **`designerPicks`' curated row is `[role="group"][aria-label="Designer picks"]`**, rendered by a
  local `DesignerPicks` component inside `ui/finish/swatches.tsx`'s `SwatchGroup` (shared by every
  surface tab) — the SAME `aria-label` string appears independently on the Floor AND Walls tabs (two
  separate DOM nodes, one per active tab), so `waitFor {css: "[role=group][aria-label='Designer
  picks']"}` after switching tabs is sufficient (no need to disambiguate by tab). Each swatch
  button's own `aria-label` is `Designer pick: <name>` — with no easy DOM-exposed material id, assert
  the applied finish id is a MEMBER of the six known curated floor ids (mirroring `designerPicks.ts`'s
  `DESIGNER_FLOOR_IDS` list in the scenario's assertion) rather than trying to derive the exact id
  from the clicked button.

### Gotchas from the IXT-SUITES back-fill batch 4 (layerOrder / furnitureGroups / copyAppearance / suggestions)

- **`openContextMenu(menu)` and `selectItem`/`setSelectedItemIds` are plain store actions — drive
  the right-click ContextMenu and single/multi-item selection directly instead of trying to
  synthesize a real right-click on the R3F canvas** (which doesn't raycast per the existing
  gotcha above). `openContextMenu({x, y, target: {kind:'item', id}})` mounts `.ctx-menu` exactly
  like a real right-click would, with the full selection-aware row set (`layerOrder`'s "Bring to
  front"/"Send to back" rows among them) — no canvas interaction needed at all.
- **`reorderItems(ids, move)`'s array-order contract is exact and cheap to assert**: `'front'`
  moves the id(s) to the END of `items` (last = top of the 3D stack / SVG paint order), `'back'` to
  the START. A round-trip scenario can assert `items[items.length-1].id === target` after "Bring to
  front" and `items[0].id === target` after "Send to back" without any pixel/visual check.
  `layerOrder` is `tier:'simple'` (always on regardless of Simple/Pro), so its scenario asserts
  presence in both modes rather than a hidden→shown transition.
- **`furnitureGroups`'s Group/Ungroup buttons live in `MultiSelectPanel` (`.panel.inspector`,
  mounts when `selectedItemIds.length > 1`), a plain HTML panel** — unlike the context menu, no
  store-action shortcut is needed, real `click: {text: "Group"/"Ungroup"}` steps work directly.
  Two gotchas: (1) **`setSelectedItemIds([a,b])` does NOT set `activeGroupId`** (only the
  selection-flow `selectItem`/plan-click paths that discover an existing group membership do) —
  the panel decides Group-vs-Ungroup purely off `activeGroupId`, so after calling `groupItems`
  via the UI, mirror what a real re-select would produce with `window.__store.setState({
  activeGroupId: <the new shared groupId> })` before asserting the "Ungroup" button appears; don't
  expect it to flip automatically. (2) The "Group" button additionally requires
  `selectedItemIds.length > 1` — a plain 2-item `addItem` + `setSelectedItemIds` is enough, no
  drag-marquee needed.
- **`copyAppearance`'s clipboard only carries "look" keys — a GLB/IKEA item's is
  `['variant','tint','reflective']`, but a *parametric* item's is whichever of its own
  `paramSchema` fields are `kind:'color'` or an enum key matching `/finish|materi|wood|metal|
  fabric|leather|colou?r|.../`** (`appearanceKeys()` in `furniture/appearanceProps.ts`). For a
  parametric fixture like `sofa-3seat`, that's `props.color` (its `paramSchema`'s `kind:'color'`
  field), NOT `tint` — seeding two sofas with different `props.color` and asserting the target's
  `color` after paste is the reliable round-trip; a `tint`-based fixture would silently never
  change on a parametric def since `tint` isn't in its appearance-key set.
- **`suggestions` is a genuinely separate flag NESTED inside the already-`designScore`-flag-gated
  `#designScorePanel`** (`DesignScorePanel.tsx`'s own `useFeature('suggestions')`), so the
  Simple/Pro visibility ladder used for `designScore` itself (hidden/shown via the parent flag)
  doesn't exercise `suggestions` independently — both default true/pro so they flip together on a
  uiMode switch. Isolate it by leaving the panel open in Pro and calling
  `setFeatureFlag('suggestions', false)` directly (dev build has `IS_DEV` true so overrides are
  honoured): the panel (score dial + category rows) stays mounted while only the "Suggestions"
  sub-block (💡 tip lines) disappears — proves the sub-flag's own gate rather than just its
  parent's. **The suggester only fires per-room `empty-*` rules when a room has ZERO furniture
  categories** (`buildSuggestions`'s `categories.size === 0` check) — the default HDB flat ships
  furnished, so `setItems([])` first (clearing every room) is what makes the "Suggestions" section
  populate at all; against the stock furnished flat the section can render empty/absent and look
  like a false "hidden" result that's actually just "nothing to suggest".

### Worked example — GLB designer CSG v2 non-destructive booleans (Stage 1b)

**`glb-designer-stage1b.json`** drives the CSG v2 flow: build a Box, add a Cylinder, rotate/size
it to pierce the box, mark it a **Hole** (Type toggle), multi-select both, **Subtract** → a
non-destructive `Combine 1 · subtract` group that renders as a box-with-hole; then move the hole
(numeric edit) to prove live re-evaluation; multi-**Union** three more boxes; **Bake** that group
to one `mesh` part; save + assert the persisted `assetSpec` embeds `combineGroups` + the subtract
op + the `role:"hole"`. **New gotchas beyond the earlier designer rungs:**
- **Toggling "Select" mode and clicking rows in the SAME synchronous `eval` uses the STALE
  `selectMode`.** The layer-row `onClick` reads the `selectMode` prop at click time; clicking the
  Select toggle only schedules a React state update, which hasn't re-rendered the rows yet within
  one eval tick — so every row click in that same eval still sees `selectMode === false` and
  RESETS the selection to a single part (Union/Subtract then reads <2 operands and is disabled).
  Fix: additive-select via **shift-click MouseEvents** — `row.dispatchEvent(new MouseEvent('click',
  { bubbles: true, shiftKey: true }))` — which the row's `e.shiftKey` branch honours regardless of
  render timing (React reads `nativeEvent.shiftKey`). Reserve the Select-mode toggle for a
  SEPARATE step if you must exercise it (as the subtract selection does — toggle in one step, click
  the row in the next, one render apart).
- **Assert a combine RESULT via its group's Bake button enabling, not a text match.** The boolean
  evaluates off the main thread (worker pool → main-thread `foldCsg` fallback headless) and is
  debounced; the `Bake <group> to a mesh` button is `disabled` until a non-degenerate result lands.
  `waitFor {css:".glb-designer button[aria-label='Bake Combine 1 to a mesh']:not([disabled])"}` is a
  clean "the box-with-hole actually evaluated" gate (a degenerate/empty fold leaves it disabled +
  shows an `Empty` badge). The same gate re-fires after moving an operand (re-evaluation).
- **`add shape` resets the multi-selection** (`addPart` mints a fresh id and the dialog
  single-selects it), so build all operands FIRST, then select — don't interleave add + select.
- Offset test geometry so no two operand faces sit exactly coplanar (three-bvh-csg z-fights on
  exact coplanar faces): the box-through-hole cylinder pierces both faces (length > box depth) and
  the union boxes overlap/clear cleanly — verified artifact-free (no open faces / flipped normals /
  z-fighting) across all 7 frames.

### Worked example — model-upload group detection at scale (UPLOAD-DETECT-PAGINATION)

**`model-upload-simple.json`** verifies the model-upload feature's Simple rung: the **Upload**
entry point renders in the catalog in Simple mode (`modelUpload` is a `tier: 'simple'` flag, so it's
present in both modes — the pro-only "Design" button stays hidden), then it drives the group-detection
pipeline over a synthetic **60-group** folder (+ 2 root-level loose `.glb`s) and asserts
`__detectGroupsResult` = `{ groupCount: 60, looseCount: 2, parsed: 60, total: 60 }`. 60 > the dialog's
`GROUPS_PER_PAGE` (50), so this is the "handles a folder big enough to paginate" input that motivated
the pagination fix. **Key gotchas learned here:**
- **The upload dialog is `React.lazy`, so it never mounts headless** (the general lazy-modal
  limitation above). You cannot screenshot the paginated detected-groups list through the real UI.
  Two things cover it instead: the pure `ui/upload/pageWindow.ts` + `pageWindow.test.ts` (pagination
  arithmetic) and `ui/upload/GroupPanel.test.tsx` (a `@testing-library/react` DOM assertion that 1050
  groups render exactly 50 `<li>`s, the pager navigates, and it pins to page 1 with no pager while
  `detecting`). For the actual pixels, temporarily mount `GroupPanel` directly via a dev-only block in
  `main.tsx` gated on `?__pagerdemo` (revert before commit) and screenshot with the legacy harness.
- **Detection runs through a dev hook, not the dialog.** `bootstrap.ts` exposes `__detectGroups`
  (dev-only, mirroring `__persistUserMaterial`/`__importSh3dBytes`): pass `[{path, meta}|{path, body}]`,
  it builds `File`s with the right `webkitRelativePath`, runs `detectGroups` + `looseModelFiles`, and
  records the outcome on `window.__detectGroupsResult`. The scenario `waitFor`s on that (the eval fires
  the async call fire-and-forget, same pattern as `texture-upload-simple.json`).
- **A GLB *inside* a group folder is not loose**; only model files outside every detected group dir
  count as loose. The fixture puts one `w.glb` under each `bulk/g<i>/` (not loose) and two at
  `bulk/loose-*.glb` (loose) to exercise both branches of `looseModelFiles`.

### Worked example — livePrices gating (default-OFF pro flag: Pro alone isn't enough)

**`liveprices-simple.json`** (26 steps, all green) covers the `livePrices` feature's only UI surface —
the "Live SG retailer prices" checkbox in the Shopping/Budget panel (`BudgetPanel.tsx`, gated on
`useFeature('livePrices')`); flipping it on drives `useLivePrices` → `pingPriceSidecar()` →
`fetch(http://localhost:5175)` (the `npm run price-server` dev sidecar). The rung asserts the full
flag gating matrix at BOTH the store-flag level (`state.featureFlags.livePrices`) AND the real
UI-mount level (`.panel.mini.aux input[type="checkbox"]` present/absent), plus the reachable
pre-network UI state. **Key gotcha learned here:**
- **A `devOnly` + `pro`-tier flag whose registry `default` is `false` needs an explicit override to
  reveal its UI — switching to Pro is NOT enough.** Most pro-tier features are `default: true`, so the
  standard scenario shape (assert hidden in Simple → `setUiMode('pro')` → assert present) works. But
  `livePrices` (like anything `default: false`) resolves **off in Pro too** — `resolveFlags`'s
  `pro`-tier branch only forces a flag *off* in Simple; in Pro it falls through to `def.default`,
  which is `false`. So the correct three-state proof is: Simple → `false` (tier), **Pro → still
  `false` (default-off)**, Pro **+ `setFeatureFlag('livePrices', true)`** → `true` (the override
  unlocks the `devOnly` flag in a dev/admin session AND directly flips the store flag). Switching back
  to Simple returns it to `false` — the pro-tier gate beats the persisted LS override
  (`resolveFlags(..., 'simple')` forces a pro flag off regardless of overrides), which is a bonus
  assertion the default-on flags can't make. Don't write a "Pro reveals it" step for a default-off
  flag; it will (correctly) still be hidden and the step fails.
- **Don't switch the toggle ON in a headless rung for a sidecar-backed feature.** The checkbox
  *mounting* (unchecked, with the estimate caption still showing) is the reachable pre-network UI
  state — the analog of `ai-surfaces-simple.json` typing a fake key to *enable* (but never clicking)
  the "Make photoreal" button. Checking the box fires `pingPriceSidecar()` (a real `fetch` to the
  local price-server), the feature's only network contact, which is out of scope per the no-sidecar
  rule — and the sidecar client + gate matrix are already fully unit-tested
  (`src/catalog/pricing/livePrice.test.ts`), so there's nothing to gain by driving it. Assert the
  toggle's presence + unchecked/enabled state, not its live-fetch result.
- The budget panel mounts purely on `budgetOpen` (`toggleBudget`; App.tsx has no camera-mode/flag
  gate on the mount — the `budget` flag gates only the toolbar entry + `BudgetHud`), and it's an
  idle-preloaded lazy chunk (`preloadOnIdle.ts` `PRELOAD_ORDER`), so it mounts headless like the
  Share modal. Leaving it open across all four mode/flag flips lets the toggle's appear/disappear
  track the resolved flag live in one session.

### Worked example — aiWalls full-UI rung (IXT-SUITES, plan-trace backdrop → "AI walls" button)

**`aiwalls-simple.json`** (57 steps) lands the leg `ai-surfaces-simple.json` deferred: the
FloorPlanEditor "AI walls" vision-model trace button only renders once a 2D plan-trace backdrop
image is uploaded, so the earlier rung could only store-flag-check `aiWalls`. Both `aiWalls` and its
host `planTraceBackdrop` are **pro-tier**, so in Simple neither the trace UI nor the button exists.
Flow: open the plan editor (`setFloorPlanEditing(true)`, an idle-preloaded lazy screen — mounts
headless like the Share modal) → (A) Simple: the Plan menu has no trace section at all → (B) Pro:
inject a tiny canvas PNG through the REAL hidden trace file input (`usePlanBackdrop.loadBackdrop`,
native-setter + DataTransfer + `change`, mirroring `backdrop-upload-simple.json`) and assert the "AI
walls" button **mounts** enabled (absent before any backdrop — it's backdrop-gated) → (C) back to
Simple with the backdrop still resident: button **absent even with the backdrop present** (tier
gate, not a missing backdrop) → (D) back to Pro WITHOUT re-uploading: button reappears (backdrop was
retained) → (E) click "AI walls" with no key → the real "Vision-model API key" `PromptModal`
(`usePlanAiWalls.runAiWalls`) → Cancel, so `runAiWalls` returns at `if (!key) return` before
`classifyVisionEndpoint`/`recognizeFloorPlan`'s `fetch` (never touch the network — same rule as the
other two AI surfaces). **Key gotchas learned here:**
- **A `{label} ▾` menu trigger renders as TWO text nodes (`"Plan"` + `" ▾"`), so `clickByText` can
  never match the whole `"Plan ▾"` label** — no single text node contains the full string, and
  clicking the bare `"Plan"` substring is fragile (the LAST-match rule can pick a later `Plan…` item
  in the open panel). Click the trigger by exact button text instead:
  `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Plan ▾')` — a
  `button`'s `textContent` **concatenates** its child text nodes, so it equals `"Plan ▾"` even though
  no individual node does.
- **The `Popover`-portaled menu panel (`ui/toolbar/Popover.tsx`) keeps its open state in the
  `PlanMenu` component's local `useState`, and closes itself on ANY outside `pointerdown` / capture-
  phase `scroll` / `resize`.** Under headless the plan editor's mount/fit settling can fire a stray
  scroll/resize that snaps a just-opened menu shut between the eval-click step and the next
  `waitFor`, so a single `.click()` + a separate `waitFor {css:.plan-menu-panel}` is flaky (it opened
  reliably in a standalone probe but raced in-scenario). Make open/close **atomic and self-retrying**
  inside one async `eval`: click the trigger, poll up to ~5 s for `.plan-menu-panel` to appear (open)
  or disappear (close), re-clicking if it flipped back. `.click()` (a real dispatched click event
  React honours) DOES open it — this is a timing/re-render race, not a click-doesn't-register bug.
- **Injecting a backdrop needs the menu OPEN in Pro** — the hidden trace `<input type=file>` is part
  of the `fileActions` fragment that only mounts inside the Plan menu's popover panel (and only when
  `planTraceBackdrop` is on), so target `.plan-menu-panel input[type="file"]`, not a global query.
- **"Absent even with the backdrop present" is provable without reading React state:** the backdrop
  lives in `usePlanBackdrop`'s component-local `useState`, which survives a `setUiMode` flip (the
  editor isn't remounted). Assert the button is gone in Simple, then re-open the Pro menu WITHOUT
  re-uploading and assert it reappears — that round-trip proves the backdrop was retained the whole
  time and only the tier gate hid it.
- **No-network proof mirrors `ai-surfaces`:** install a non-blocking `window.fetch` spy in the setup
  eval that records every URL, clear `localStorage['hdb_ai_vision_key']` so `runAiWalls` takes the
  key-PROMPT path, cancel the prompt, then assert no logged URL matches `openai`/`replicate` and no
  `drafted`/`recognition failed`/second-prompt appeared — Vite HMR uses websockets/module loads, not
  `window.fetch`, so the spy stays clean.

### Worked example — optimize worker pool + IO-002 early size-cap gate (2026-07-03)

Verifying the **optimize worker POOL** (`optimize/runOptimize.ts`) end-to-end needs a REAL
`Worker` — the default node test environment can't construct one (`pickWorker` returns `null`
and `runOptimize` always takes its direct-call fallback there), so unit tests exercise the pool's
queueing/lifecycle with a **mock `Worker`** (`runOptimize.pool.test.ts`, `vi.stubGlobal('Worker',
FakeWorker)` + `vi.resetModules()` per test for a clean pool) — that covers the logic, but not
"does a real browser actually spin up N workers and route jobs through them." For that, a
dev-only hook + an ad-hoc (not checked in) scenario:
- **`bootstrap.ts` exposes `__importGlbFiles`** (dev-only, mirroring `__persistUserMaterial`/
  `__detectGroups`): pass `[{name, b64}]` (base64 GLB bytes) + `BulkImportOptions`, it rebuilds
  `File`s and runs the real `importGlbFiles` (convert → optimize-pool → LOD → persist), recording
  the `BulkImportResult` on `window.__importGlbFilesResult`. This is now permanent (like the other
  dev hooks) so a future scenario can reuse it without re-adding the lever.
- **Build an oversized GLB client-side, don't embed a huge base64 blob in the eval script.**
  Embed one small valid fixture (e.g. `duck.glb`, ~120KB → ~160KB base64) and in the page pad a
  fresh `Uint8Array(EARLY_REJECT_MULTIPLIER * MAX_GLB_BYTES + slack)` (>75 MB — the early gate
  only rejects HOPELESS files past the 3× multiplier, not merely over-cap ones) with its bytes
  (the glTF magic header is all that needs to be valid — the IO-002 early gate fires on raw byte
  length before any real GLB parsing). A 3-file batch (2 distinct-content normal GLBs + 1
  synthetic hopeless one) through `__importGlbFiles(files, {category:'decor'})`, gated the same
  fire-and-forget way as `__detectGroups` (`waitFor: {store: "!!window.__importGlbFilesResult"}`),
  confirmed: `imported === 2`, `skipped.length === 1`, and the skip reason contains "even after
  optimization this can't fit" (the early, pre-optimize gate — distinct from the post-optimize
  gate's "over the N MB limit even after optimization" message) — i.e. the hopeless file was
  rejected without ever reaching the expensive optimize pass. ~15-25s wall time in SwiftShader
  headless Chromium (dominated by the two real optimize passes + hashing the 75 MB fixture,
  wasm-permitting — see next point). Worker pool + IO-002 code lives in
  `furniture/upload/bulkImport.ts` + `furniture/optimize/runOptimize.ts`.
- **This sandbox's headless Chromium fails to compile the Draco/Basis wasm** (`wasm streaming
  compile failed … Incorrect response MIME type`, then `CompileError: … expected magic word …
  found 3c 21 64 6f` — that's `<!do`, i.e. the wasm request got an HTML error page). This is a
  pre-existing sandbox/proxy quirk, not a regression: `optimizeGlb`'s `getIO()` treats a failed
  Draco registration as best-effort (falls back to un-Draco'd output) and any doc-transform
  failure returns the input unchanged — so the import still succeeds, just without compression.
  Don't chase this wasm error when verifying optimize-pipeline changes here; it's environmental.

### Worked example — 2D plan align/distribute/mirror (PARITY-PLAN-ALIGN)

**`plan-align-distribute-mirror.json`** seeds 3 furniture items inside the largest room,
puts them in a furniture multi-selection (`setSelectedItemIds(ids)`), then clicks **Align X**,
**Across Z** (distribute) and **Mirror** in the plan Properties panel, asserting equal X / even
Z gaps / mirrored X via `waitFor: {store: …}` after each, with an undo between. **Key gotchas
learned here:**
- **`canPlace` blocks an align/distribute that would overlap.** A fixture where two items share
  the same Z and align to the same X lands them on top of each other → both moves are silently
  rejected and the assert never flips. Space the seed items so the *post*-action layout has no
  overlap (distinct Z when testing Align X, distinct X when testing Distribute Z).
- **Place seed items INSIDE a real room, not at `[0,0]`.** The plan origin is a corner outside
  every room, so a `canPlace` there fails against the boundary wall — every move is a no-op.
  Find the largest room (`rooms.reduce(...)`) and seed within its interior with margin.
- **Reveal footprints for the screenshot** via the **View ▾** menu → **Furniture** toggle
  (it's local component state, not a store flag, so you must click it — same as the rotate-handle
  scenario). The store assertions don't need it, but the PNG is uninformative without it.
- **Don't `pkill -f chrome` mid-session** — it also kills the Vite dev server (the page then logs
  `ERR_CONNECTION_REFUSED` and every store action silently no-ops). Let the harness manage its own
  browser; only restart the dev server you started.
- The panel surfaces purely on `selectedItemIds.length > 1` — drive it with `setSelectedItemIds`
  (or `setPlanMarqueeSelection` once the marquee lands) rather than synthesising a canvas drag.

### Worked example — walk-mode curtain/blind interact (WINDOW-FIXTURE-INTERACT)

**`walk-curtain-interact.json`** proves the walk-mode fixture toggle end-to-end: orbit E-press
inert → enter walk → the REAL aim loop flags the living/dining curtain (`nearbyFixtureId`) →
FixturePrompt pill ("Open curtains") → REAL `KeyE` press flips `drawAmount` 1→0 → prompt flips
to "Close curtains" → store-action toggle back. **Key gotchas learned here:**
- **Teleporting the walk camera works via `window.__three.camera.position.x/.z`** — the
  FirstPersonCamera frame loop only writes x/z on movement input (y is owned by `yPos`+bob, and
  the *orientation* is re-asserted every frame from internal yaw/pitch refs seeded at spawn).
  So you can move the walker anywhere, but you CANNOT re-aim its *yaw* — pick a teleport spot
  such that the spawn look direction (≈`(-0.17, -0.99)` for the default flat) already points at
  your target within the 2 m interact radius. Walk mode is `isContinuous`, so the aim loop ticks
  headlessly without store nudges. (*Pitch* — but only pitch — became drivable later via the
  dev-only `window.__walkLook` lever; see the ceiling-design worked example below.)
- **The R3F mesh-click limitation applies to the fixture/door click path** — verify the click
  branch through its store action (`toggleWindowFixture` / `toggleDoor`) and let unit tests
  cover the `onClick` gate; the E-key path is fully drivable headless (`{"key": "KeyE"}` reaches
  the real `App.tsx` handler).
- **The first-run "Walking through" InfoCallout covers bottom-center HUD pills** (DoorPrompt /
  FixturePrompt render at the same `bottom-24` slot). Call
  `dismissCallout('walk-mode')` after entering walk or the prompt is invisible in screenshots
  (it still exists in the DOM — text `waitFor`s pass either way).
- **Default items get their param-schema defaults filled at boot** — the default curtain boots
  with `props.drawAmount === 1` (not `undefined`), so "unchanged" assertions must compare
  against the filled default, not absence. Toggles are synchronous, so asserting the value
  right after a keypress is a valid inertness proof.

### Worked example — walk-mode screen wallpaper + light on/off (WALK-SCREEN-INTERACT / WALK-LIGHT-INTERACT)

**`walk-screens-lights.json`** proves both new walk-mode interacts end-to-end against the
default flat's Bedroom-2: orbit E-press inert (both) → enter walk → REAL aim loop flags the
desk monitor (`nearbyScreenId`) → ScreenPrompt ("Change wallpaper") → REAL `KeyE` advances
`screenContent` landscape→sunset → teleport to the ceiling pendant → LightPrompt ("Turn off
ceiling light") → REAL `KeyE` sets `lightOn:'no'` → prompt flips to "Turn on ceiling light" →
store-action toggle back on. **New gotcha found here, beyond the curtain worked-example above:**
- **A directional item's face can point AWAY from the only reachable teleport spot.** The
  curtain gotcha above already covers *positioning* the walker so the fixed spawn look-direction
  (`≈(-0.17,-0.99)` for the default flat) hits the target within the interact radius — but it
  doesn't cover *which side* of the item you end up looking at. A wall/desk item with a real
  front/back (a monitor screen, a TV) only shows its face from specific approach angles; since
  you can't re-aim (no headless pointer-lock/mouse-look), you may only be able to reach the
  item's BACK from the room's geometry (e.g. Bedroom-2's monitor faces the chair to the north,
  but the only interact-radius standoff space is the ~0.5 m gap to the south wall BEHIND the
  screen). The aim/E-key/store assertions still prove the interaction fires correctly — screen
  content changes as it should — but the screenshot won't visually show the wallpaper. **Assert
  the state change in-store as the primary evidence** (`props.screenContent === 'sunset'`, per
  CLAUDE.md's guidance for "too subtle to see headlessly") and note which side of the item the
  frame shows; don't burn time hunting for a teleport spot that doesn't exist within a small
  room. `setWalkEyeHeight(1.2)` (min per `WALK_EYE_MIN`) helps bring a desk-height item into the
  horizontal FOV band at close range, but doesn't fix a wrong-side approach.
- **Toggling a ceiling-mounted light IS clearly visible even though the fixture mesh itself is
  out of frame** (it's overhead, above the horizontal look). The emissive glow/bloom it casts on
  the ceiling and upper walls reads as an obvious warm-vs-dark difference in the screenshot —
  good evidence even when the literal mesh isn't visible. Force `setLightsMode('on')` +
  a night `setManualHour` first so the "on" state is unambiguously bright before toggling off.
### Worked example — walk-mode backdrop upload + item-as-light-source (IXT-SUITES re-rungs)

**`backdrop-upload-simple.json`** (47 steps, 10 shots) and **`furnlight-simple.json`** (49 steps,
5 shots) back-fill the `backdrops`/`customBackdrop` and `itemAsLight` simple rungs. Both surfaced
real product bugs (documented in their commits/PR, not fixed there) plus two reusable harness
gotchas:

- **A custom `Select` (`ui/controls/Select.tsx`) nested inside a `ToolbarMenu` closes the WHOLE
  parent menu when you click an option, dropping the pick.** `Popover`'s outside-pointerdown
  listener (`ui/toolbar/Popover.tsx`) closes on any pointerdown whose target isn't contained in
  its own portaled panel DOM subtree. A `Select` opened from inside another `Popover`-based menu
  portals its OWN option list to a **sibling** `document.body` node — not inside the parent
  menu's panel — so the parent's listener sees the click as "outside" and closes first (on
  `pointerdown`, before the option's `click` handler ever runs), unmounting the option before the
  click lands. Net effect: selecting an option silently does nothing and the whole menu vanishes.
  Work around it in a scenario by driving the value with the underlying **store action** instead
  (`{"store": {"action": "setBackdrop", "args": ["dusk"]}}`) — click the Select's own **trigger**
  button (not a portaled option) if you only need to open/screenshot/close it cleanly, since
  clicking the same anchor again just calls the trigger's own `onClick` toggle rather than hitting
  the parent's outside-click path.
- **The default HDB flat's curtains are drawn (`drawAmount: 1`) out of the box**, which hides a
  walk-mode window backdrop entirely — every "look out the window" shot is a plain gray panel
  until you open them: `state.items.filter(i => i.defId === 'curtains').forEach(i =>
  updateItemProps(i.id, { drawAmount: 0 }))`. Do this as one of the first eval steps, before any
  walk-mode screenshot that needs the view to actually be visible.
- **OUTDATED (accurate when written; superseded by the graphics-globalization pass):** the
  per-room editor's `Canvas` (`scene/RoomEditorScene.tsx`) used to be a fixed flat
  `hemisphereLight`+`ambientLight` rig with no `<FurnitureLights />`. It now mounts the FULL
  orbit render stack — `Lighting` (sun/time), `FurnitureLights`, `Effects`,
  `QualityController` — so lighting effects ARE visible and probe-able inside the room editor
  (which is also why the Scene menu now shows there, TB-6b v0.18.6.17). The old
  enter-editor → toggle → **exit editor** → probe dance is no longer required; kept here so
  older scenarios that still do it aren't "fixed" into breaking.
- **A near-pitch-black "unlit" comparison shot proves nothing.** Picking a very late manual hour
  (23:00) for the "before/after" light-toggle pair renders the whole room fully black in both
  states under `lightsMode: 'auto'`-independent darkness — the point light's absence has no visual
  contrast to show. Use dusk (~19:30) instead: dark enough for the point light's warm pool to read
  clearly, bright enough that the "unlit" shot still shows the room's silhouette instead of a void.

### Worked example — walk-mode ceiling-design look-up (IXT-SUITES ceilingDesign rung)

**`ceilingdesign-walk-simple.json`** proves the pro-tier `ceilingDesign` treatments render from
below: Simple-mode flag-off assert → Pro → tray (drop 0.3, margin 0.6, orange cove) on
`livingDining` → walk mode → look-up screenshot → switch to coffered 3×3 → second look-up →
back to orbit (config persists). Gotchas learned here:

- **Pitching the walk camera headlessly needs the dev `__walkLook` lever.** Both real look
  inputs are undrivable: desktop mouse-look requires OS Pointer Lock (unavailable headless) and
  touch-look requires a coarse-pointer profile + synthetic multi-touch streams. The teleport
  gotcha above (position writes stick, orientation can't be re-aimed) covers *where you stand*
  but not *pitch*. `FirstPersonCamera` therefore exposes a permanent dev-only
  `window.__walkLook = { setPitch(rad), getPitch() }` (mounted only while walk mode is active,
  removed on exit) that writes the same clamped `pitch` ref the frame loop re-asserts the camera
  quaternion from every frame — so a scenario pitch sticks exactly like a real look-up.
  `setPitch(1.0)` ≈ 57° up; the ±1.5 rad `MAX_PITCH` clamp applies.
- **A near-vertical pitch from the room centre produces a featureless frame that proves
  nothing.** At pitch ≥1.3 under a 2.6 m ceiling the FOV covers only ~±1 m of ceiling directly
  overhead — for a tray treatment that's the flat centre panel, a uniform grey rectangle
  indistinguishable from "no feature at all" (a first cut of this scenario passed every store
  assert and failed visual review exactly this way). Compose the shot instead: teleport to
  ~1 m horizontal from a recess/beam edge (elevation ≈ 42° at eye height 1.6) and pitch ~1.0 so
  the frame step, riser, and cove strip are all IN frame with the centre panel behind them.
- **Don't turn ceiling lights on for a pitched-up shot.** The point light sits straight ahead of
  a look-up camera; on High tier the bloom blows the entire frame to white and the geometry
  vanishes. Daylight ambient (hour 13) already shades the two ceiling levels distinctly — the
  lighter dropped frame/beams read clearly against the darker recessed base panel.
- `setQualityTier('high')` first (risers + cove strips are High/Maximum-only in `RoomCeiling`),
  then `hideLoading()` — the tier switch raises the transition overlay, which under SwiftShader
  can outlive its readiness signal and cover the canvas.
- **`setRoomCeiling` on the default flat forks the plan** (`forkIfDefault`), flipping rendering
  to the custom-plan path (`PlanRoomCeiling`) and the walk spawn to the custom-plan
  largest-room rule — for the default flat that's still `livingDining`, spawning mid-room
  looking north (−z). Also note `buildCeiling` falls back to a FLAT ceiling for non-rectangular
  polygons: if you design a ceiling on a custom L-shaped/free-form room and see no treatment,
  that fallback (not a render bug) is why — `livingDining` works because the default plan keeps
  its main rect and `extension` as separate rectangles.

### Gotchas from the IXT-SUITES back-fill batch 6 (catalogCompare / bulkAppearance / renderPresets / saveMaterials)

- **`catalogCompare`'s cards are plain `role="button"` `<div>`s identified only by `aria-label`
  (`"Add <name> to compare"` / `"Place <name>"`), not by visible text** — `clickByText` can't find
  them reliably (their visible text is the def name, not the aria-label), so drive them with an
  `eval` querying `[aria-label='Add <name> to compare']` directly. Pick two SAME-CATEGORY defs by
  name (e.g. "3-seat sofa" + "2-seat sofa", both `category: 'seating'`) — `toggleCompareSelection`
  resets the whole selection to just the new pick the moment a different-category item is tapped,
  so a naive "click the first two catalog cards" approach silently ends up with only 1 item
  selected. Arming a placement from the tray's "Place" button (`useCatalogPlacement.arm`) is
  provable via `state.activeDefId` (no scene click needed) — the tray closes and compare mode
  exits in the same `onPlaced` callback.
- **A custom `Select` (`ui/controls/Select.tsx`) shares its trigger `className` with SIBLING
  selects on the same panel — don't assume a component class is unique.** `SceneMenu.tsx` gives
  FOUR different selects (Render preset, Window view, Reveal walls, pets) the identical
  `className="input scene-select"`; a `waitFor {css:'.scene-select'}`/`visible:false` assertion
  meant to gate on the render-preset control alone will falsely pass at "present" (any of the 4
  matches) and falsely FAIL at "hidden" (the other 3 keep the class alive after force-disabling
  just `renderPresets`). Target the Select's own `ariaLabel` prop instead — it renders as
  `aria-label` on the trigger `<button>` (`button[aria-label='Render preset']`), which IS unique
  per control.
- **`SceneMenu`'s render-preset apply logic (`applyRenderPreset`) isn't reachable via a real click
  in a scenario without risking the parent-menu-closes-first bug** (documented in the
  backdrop-upload gotchas: a `Select` nested inside a `ToolbarMenu`/`Popover`-based menu portals
  its options to a DOM sibling, so the parent menu's outside-pointerdown listener closes the WHOLE
  menu before the option's own click fires). Mirror the same work-around: drive the identical 4
  setters `applyRenderPreset` calls (`setPresetTime`/`setToneMapping`/`setExposure`/
  `setLightsMode`) directly via `store`/`eval` steps, and assert on `timeMode==='manual' &&
  manualHour===12` (not a nonexistent `timePreset` field — `setPresetTime` writes `manualHour`
  via `PRESET_HOURS[preset]`, there's no separate preset-name field in the store).
- **`bulkAppearance`'s "Tint all" bulk-recolour is a CONFIRMED REAL BUG for the vast majority of
  the built-in catalog: it writes `props.tint` unconditionally on every selected item
  (`MultiSelectPanel.tsx`'s `setTintAll`), but `tint` is a GLTF-only appearance key
  (`GLTF_APPEARANCE_KEYS` in `furniture/appearanceProps.ts`) — a parametric/procedural primitive
  (e.g. `sofa-3seat`, `armchair`) reads its own colour from `props.color` (or `seatColor`/
  `legColor`/…, per its `paramSchema`), never `props.tint`, so the primitive component (e.g.
  `furniture/primitives/Sofa.tsx`'s `readStr(props, 'color', …)`) never looks at the newly-written
  `tint` at all.** The bug is silent and misleading: the swatch trigger visibly shows the applied
  colour (`sharedTint` also reads `props.tint`, so the UI "looks" like it worked), the store
  round-trips the write correctly, but the 3D render is provably byte-identical before/after (a
  pixel probe at the same screen point on both a sofa and an armchair returned the exact same RGB
  after tinting two stock procedural items #ff8800) — bulk recolour only has any visual effect on
  GLTF/IKEA-backed items, which is a small minority of the catalog. Not fixed here per the
  Implementer-agent scope (report, don't silently work around) — flag for a real fix: either write
  `props.color` (+ any other colour-kind paramSchema keys) for parametric items alongside `tint`
  for GLTF ones, or gate the whole "Tint all" section on the selection actually containing at
  least one GLTF item.
- **`Escape` is a GLOBAL "clear selection" shortcut, not just "close the open popover."** Closing
  the bulk `ColorPicker`'s popover via a `key: "Escape"` step also cleared `selectedItemIds`
  (unmounting the whole `MultiSelectPanel`, including the very `.ms-appearance` block whose
  post-state you're trying to assert) — the popover's own trigger swatch button toggles
  open/closed via a plain re-click (`onClick={() => (open ? close() : openEditor())}`), so close it
  by clicking the SAME trigger button again, never `Escape`, when a selection must survive the
  close.
- **A native `<details>`/`<summary>` (`ui/controls/Disclosure.tsx`, backing "Compose your own…" and
  "Apartment colour palette…") being COLLAPSED (closed) does NOT remove its children from the DOM —
  only CSS hides them.** This makes `waitFor {css: <selector inside the details>}` and
  `clickByText`'s deepest-match a FALSE POSITIVE for "is it open/visible": the child input/button
  is still `document.querySelector`-able (and even reports a real, if off-screen, bounding rect)
  whether the `<details>` is expanded or not. Don't use plain DOM-presence `waitFor{css}` to prove a
  Disclosure is open — check the `<details>` element's own `.open` boolean instead
  (`document.querySelector('details.compose').open === true`), or (simpler) just gate on a control
  that's ONLY ever rendered while a sibling flag is on (React-conditional gating, e.g. the
  `saveMaterials`-gated Save row's own presence/absence, still valid since THAT unmount really is a
  React conditional `{onSave ? (...) : null}`, not the native details collapse).
- **This is the SAME root cause as the earlier documented "`clickByText` does NOT scroll the target
  into view" gotcha, but manifesting differently: a below-the-fold `<summary>` click doesn't error,
  it silently no-ops.** `clickByText`'s own coordinate math is correct (it finds the `<summary>`,
  computes its centre), but `page.mouse.click(x,y)` dispatches at a y-coordinate that can be
  WELL BELOW the viewport height when the target row lives far down a long scrollable panel (e.g.
  FinishPicker's "Compose your own…" sits under a tall swatch grid) — `document.elementFromPoint`
  at that same (x,y) returns `null` (nothing is there; the coordinate is outside the viewport), so
  the click is a genuine no-op with NO thrown error and NO visible symptom other than the
  `<details>` staying closed forever after. Confirmed via a MutationObserver on the `open` attribute
  (zero mutations recorded) + a `document.body.contains()` check (the exact same DOM node, never
  replaced) — ruling out a remount/rerender theory before finding the real cause. Fix identically
  to the established GLB-designer pattern: toggle it via a viewport-independent DOM `.click()` in
  an `eval` — `[...document.querySelectorAll('summary.compose-summary')].find(s =>
  s.textContent.trim() === 'Compose your own…').click()` — never `click:{text:...}` for a
  `<summary>` that might be scrolled out of view. `page.click(selector)` (Puppeteer's built-in
  ElementHandle click, used for ordinary `<input>`/`<button>` selectors) auto-scrolls into view and
  is NOT affected — only the custom `clickByText` helper (`click:{text:...}`) has this blind spot.

### Gotchas from the IXT-SUITES back-fill batch 7 (elementColors / catalogModelInfo / assetCredits / densityMode)

- **A British/American spelling gap in a naive "grep every scenario for the flag name" sweep can
  wrongly mark an already-visually-covered feature as uncovered.** `element-colours-verify.json`
  exercises the `elementColors` feature's rendering but never references the literal flag string
  (no `setFeatureFlag('elementColors', …)` call in it), so a filename/contents scan reports it
  "uncovered" even though the visual behaviour is tested — what's actually missing is the
  **flag-gating rung** (hidden/shown + `setFeatureFlag` round-trip), not the feature's first
  scenario ever. Treat "already has a scenario" and "has a gating rung" as two separate questions;
  it's fine (and was the right call here) to add a dedicated `elementcolors-simple.json` purely for
  the gate, even with an existing non-gate scenario on the books.
- **A `tier:'simple'` flag's "Simple/Pro ladder" is NOT a hidden→shown transition** — CLAUDE.md's
  rule only force-hides `pro`-tier flags in Simple; a `simple`-tier flag (`elementColors`,
  `assetCredits`) resolves the SAME in both modes (present in both, by default). The correct
  three-part proof for a `tier:'simple'`, `default:true` flag is: (1) present in Simple, (2) present
  in Pro, (3) a **direct** `setFeatureFlag(id, false)` override (dev build only) actually hides it
  and restoring it brings it back — i.e. prove the flag *controls* the UI at all, since the
  mode-switch alone can't demonstrate that for a simple-tier feature.
- **`WallInspector`'s "Wall colour" `ColorPicker` trigger is a plain `<button aria-label="Wall
  colour">` whose `backgroundColor` inline style IS the applied hex** — no need to drive the
  popover's internal swatch grid to prove a colour round-trip; `a.updateWall(id, {color:'#3366cc'})`
  + asserting `getComputedStyle(btn).backgroundColor === 'rgb(51, 102, 204)'` is a clean, popover-free
  proof, and the button's own `onClick` toggles the popover open/closed on repeat clicks (so open +
  close a `ColorPicker` with two identical `.click()` evals on the same trigger, no `Escape`/outside
  -click needed — sidesteps the Escape-clears-selection class of bug documented in the batch-6
  gotchas, which doesn't even apply here since plan-wall selection isn't `selectedItemIds`, but the
  pattern is safer to default to regardless).
- **`catalogModelInfo`'s tooltip needs a catalog item whose def actually HAS `license`/`attribution`/
  `byteSize` set, or `modelInfoText()` returns `null` and the card's `title` attribute is absent
  regardless of the flag** — most procedural/parametric primitives (sofa, table, …) carry none of
  these fields. `GENERATED_FURNITURE` (`furniture/generatedCatalog.ts`, merged into the real catalog
  by `catalog.ts`) is the reliable source of CC0/CC-BY bundled GLB decor props with `license` +
  `attribution` set — e.g. `book-set` ("Book set", CC0, Poly Haven) — searchable in the catalog
  drawer's real search box (`input[aria-label="Search the furniture catalog"]`) to isolate a single
  card whose `title` attribute is asserted, rather than trying to prove a tooltip on a def that never
  renders one.
- **`assetCredits` gates only the "Asset credits" entry-point BUTTON in `AppearancePopover` — the
  `CreditsModal` component itself has no `useFeature('assetCredits')` check of its own.** It mounts
  unconditionally in `App.tsx` and opens purely on `creditsOpen` (a plain store boolean), so once
  open (however it got there) the modal renders regardless of the flag; the flag's entire effect is
  "can the user reach `setCreditsOpen(true)` through the UI at all." Drive/assert the gate at the
  BUTTON, and drive the open/close of the modal itself via the `setCreditsOpen` store action directly
  (or the button click) — a `setFeatureFlag('assetCredits', false)` after the modal is already open
  correctly does NOT close it (matches the code: no gate inside `CreditsModal`), so don't write an
  assertion expecting the open modal to auto-close when the flag flips.
- **`densityMode` gates the *effect*, not just a preference field — a great pattern for asserting
  a pro-tier flag's REAL DOM consequence instead of only a button's presence.** `editorPrefs.ts`
  writes `document.documentElement.setAttribute('data-density', flagOn ? density : 'comfortable')`
  on every relevant change, so `document.documentElement.getAttribute('data-density')` is a clean,
  UI-independent oracle: setting `density:'compact'` while in Simple mode (`densityMode` forced off)
  provably leaves the DOM attribute at `'comfortable'` (the preference persists in the store, only the
  *effect* is suppressed), and switching to Pro flips the attribute to `'compact'` immediately with no
  further action — a stronger, more direct proof than checking whether a "Density" label merely
  exists in the popover DOM.
- **A concurrent agent's dev-server restart (not just an HMR module swap) can kill an in-flight
  scenario with `Protocol error: Target closed` or a `waitFor` timeout, distinguishable from a real
  bug by the console log's `[vite] server connection lost. Polling for restart...` line** — this is
  a full process restart (e.g. another agent's source edit triggering a Vite full reload / crash-
  recovery), not the ordinary HMR module-hot-swap the existing playbook guidance already covers.
  `curl -sf <url>` returning `200` again confirms the server is back; simply re-run the exact same
  scenario once it does — no scenario/harness change was at fault in either case observed here.

### Gotchas from the IXT-SUITES back-fill batch 8 (palettePresets / walkCameraControls / electricalPlan / plumbingPlan)

- **Don't trust a flag's tier from memory or from a sibling feature's doc comment — re-read the
  registry entry itself.** `WalkCameraControls.tsx`'s own docblock says "Gated by the
  `walkCameraControls` flag (pro tier)", but the actual `FEATURE_FLAGS` registry entry is
  `tier: 'simple'` (a stale comment, not a bug — the gating code reads the real tier via
  `useFeature`, so behaviour is correct). A first draft of `electricalplan-simple.json` similarly
  assumed `electricalPlan`/`plumbingPlan` were simple-tier (they read like core-loop drawing
  content) and asserted the flag was ON by default in Simple mode — the registry says `tier: 'pro'`
  for both, so the assertion failed immediately at boot. Always grep the registry entry itself
  before writing the ladder's first assertion.
- **A `simple`-tier flag whose only UI surface lives inside a native `<details>`/`Disclosure`
  (`MasterPaletteEditor`'s "Palette presets" gallery, nested in `FinishPicker`'s "Apartment colour
  palette…" `Disclosure`) needs the disclosure OPENED for a meaningful screenshot, even though the
  presence/absence assertions themselves are correct either way** (per the batch-6 gotcha, a
  collapsed `<details>` still has its children in the DOM). Open it the same viewport-independent
  way as a below-the-fold `<summary>`: `[...document.querySelectorAll('summary')].find(s =>
  s.textContent.includes('Apartment colour palette')).closest('details')` and check/set `.open`
  directly, or `.click()` the summary if closed — don't rely on `clickByText` scrolling to it.
- **A pro-tier flag whose only reachable UI entry point is ITSELF gated behind a *different*
  pro-tier flag can't be proven with a bare Simple→Pro mode switch alone — the switch flips both
  flags at once.** `electricalPlan`/`plumbingPlan` only affect the multi-sheet "Drawing set" export
  (`openDrawingSet.ts`), and the "Drawing set" File-menu row itself is gated on the separate
  `report` flag (`FileMenu.tsx`'s `fReport`), not on `electricalPlan`/`plumbingPlan` directly.
  Switching Simple→Pro turns both `report` (which reveals the menu row) and `electricalPlan` (which
  adds the sheet) on together, so a mode-switch-only ladder can't isolate which flag did what. Prove
  the SPECIFIC flag's effect with a same-mode round-trip: stay in Pro (menu row stays reachable via
  `report`) and drive `electricalPlan`/`plumbingPlan` directly via `setFeatureFlag`, re-triggering
  the export each time — the sheet disappears/reappears while the menu row itself never moves.
- **`openDrawingSet()` opens a real `window.open('', '_blank')` popup and calls `document.write` on
  it** — instead of letting a second tab spawn (untracked by the harness's puppeteer `page` handle,
  and printed via a delayed `win.print()`), intercept `window.open` in an `eval` step BEFORE
  clicking "Drawing set": replace it with a function returning a stub `{ document: { write(html){
  window.__capturedHtml = html }, close(){} }, close(){}, focus(){}, print(){} }`. The dynamic
  `import('./drawingSet')` + HTML build still runs for real (nothing about the sheet-selection
  logic is mocked) — only the popup window itself is swapped for a capture sink, so the produced
  HTML string is asserted directly (`__capturedHtml.includes('Electrical plan')`) instead of trying
  to screenshot a second, harness-invisible tab. Restore `window.open` from a saved
  `window.__origWindowOpen` at the end if later steps in the same session need real popups.

### Gotchas from the IXT-SUITES back-fill batch 9 (shortcutsHelp / infoCallouts / proUpsell / planScale)

- **A trigger button whose visible label is `{variable} ▾`** (`PlanMenu.tsx`'s `{label} ▾`,
  matching the existing `View ▾`/`Plan ▾` menus) renders as **two sibling DOM Text nodes**
  (`"Plan"` from the JSX expression, `" ▾"` from the adjacent literal) — JSX does not merge
  adjacent text children into one DOM Text node, and browsers only merge them via an explicit
  `.normalize()` call, which nothing here does. The generic `{"click": {"text": "Plan ▾"}}` step
  walks `NodeFilter.SHOW_TEXT` and checks EACH node's own `textContent` individually (never the
  parent element's combined text), so a two-word label split across nodes can never match as one
  string and the step times out with "could not find visible element" even though the button is
  plainly visible on screen (confirmed via the on-failure screenshot). This was already why
  `plan-labels-cycle-simple.json`'s batch-3 rung open the "View ▾" menu via a bespoke polling
  `eval` (`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Plan ▾')`)
  instead of the `click:{text:...}` step — reuse that exact pattern for ANY menu trigger whose
  label is built from an interpolated variable + a literal suffix, not just `View ▾`.
- **REAL BUG found, not worked around in source:** `ScalePlanModal.tsx`'s factor `<input
  type="number" min={0.01} step={0.1} .../>` defaults to `factorStr = '2'` — but `2` fails the
  input's own native HTML5 `stepMismatch` constraint against `min=0.01`/`step=0.1` (valid values
  are `0.01 + n×0.1`; `2` isn't one of them). Clicking the "Scale" submit button with the
  untouched default silently no-ops in any browser enforcing native constraint validation (a
  native tooltip reads "Please enter a valid value. The two nearest valid values are 1.91 and
  2.01." and the `<form onSubmit>` never fires) — the single most common action in the dialog
  (doubling a wrong-scale plan) is broken out of the box. `planscale-simple.json` documents this
  by asserting `input.validity.stepMismatch === true` for the untouched default, then drives the
  apply path with a step-aligned `'2.01'` (set via the native
  `HTMLInputElement.prototype.value` setter + a dispatched `input` event, the standard way to make
  React see a programmatic value change) so the rung still proves the real apply/undo behaviour.
  Report this upstream rather than "fixing" it by changing the test's expectations only — the fix
  belongs in `ScalePlanModal.tsx` (e.g. `step={0.01}` or seeding `factorStr` from a value that
  satisfies the existing step), not in the scenario.
- **Verifying a `?`-triggered pro-tier overlay (`shortcutsHelp`) needs a real `KeyboardEvent`
  dispatch, not a `key` step.** `page.keyboard.press('?')` has no reliable Puppeteer key mapping
  for a shifted symbol; `window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles:
  true, cancelable: true }))` matches exactly what `useAppHotkeys.ts`'s `window.addEventListener
  ('keydown', ...)` listener reads (`e.key === '?'`) and reliably triggers the flag-gated
  branch (open the shortcuts modal) vs. its off-flag fallback (toggle the Appearance panel) —
  proving the SAME keypress routes to two different targets depending on the flag is a clean way
  to isolate the flag's effect without touching any other control.
- **Two screens can each mount their OWN `InfoCallout` with a different `id` while both stay
  "active" in the store simultaneously** — `setFloorPlanEditing(true)` does NOT clear
  `roomEditor.active` (no cross-clearing between the room editor and the floor-plan editor
  screens), so a bare `document.querySelector('.info-callout')` after entering the plan editor
  can still resolve to the ROOM editor's off-screen instance instead of the new floor-plan one
  if the room-editor container happens to render first in DOM order. Call `exitRoomEditor()`
  explicitly before entering the floor-plan editor (or scope the selector to
  `.plan-screen .info-callout`) rather than assuming the two screens are mutually exclusive in
  the DOM.
- **A dev-server HMR hiccup mid-run** (`[vite] server connection lost. Polling for
  restart...` + a `502 Bad Gateway` resource load, seen once while another agent was
  concurrently editing unrelated `*.test.*` files) can reload the page mid-step and kill the
  Puppeteer `Target` (`Protocol error (Runtime.evaluate): Target closed`), aborting the run with
  ~90s of hung `browser.close()` afterwards. Not a scenario bug — just re-run once the dev
  server's `curl -s -o /dev/null -w '%{http_code}' <url>` reports `200` again.

### Gotchas from the IXT-SUITES back-fill batch 10 (moodboard / cornerAo / planIntegrity / newBadges)

- **Two near-identical flag names can gate genuinely different behaviour — always re-check the
  registry entry, not just the name.** `catalogFits` (simple tier, "badge/dim items that won't
  fit") already has visual coverage (`catalog-fits-simple.json`/`-journey.json`), but
  `catalogFitsFilter` (pro tier, the separate "Fits only" browse-filter toggle) does not — a
  substring/filename sweep that stops at the first `catalog-fits*` hit would wrongly mark
  `catalogFitsFilter` as covered. Same trap almost bit `pbrSurfaces` against the pre-existing
  `pbr-maps-verify.json` (that scenario applies finishes and never touches the flag) and `cornerAo`
  against `photo-gtao-ab-ao.json` (that's the unrelated real-time N8AO/SSAO debug rig, not the
  baked-strip fallback). Open the candidate file and check what it actually asserts before
  crossing a flag off the uncovered list.
- **A `mesh`/`material` pair with a stable, distinctive numeric property is a clean scene-graph
  oracle for an otherwise-invisible-from-orbit render toggle.** The worked example was `cornerAo`'s
  baked wall/floor AO strips (feature since removed in v0.23.1.11, along with its
  `corner-ao-simple.json` scenario): the strips were subtle and easy to miss in a whole-flat orbit
  screenshot, but they rendered a `meshBasicMaterial` with a distinctive exact `opacity` (0.42) on
  a `PlaneGeometry` — traversing `window.__three.scene` and counting meshes matching that opacity
  was a reliable presence/absence proof (count drops to exactly 0 on the flag-off override,
  returns on restore) independent of camera framing or pixel-diffing. For a simple-tier flag the
  three-part proof from the batch-7 gotcha applies verbatim: present in Simple, present in Pro
  (and the mesh COUNT must be identical across the mode switch — a differing count would mean
  something else moved, not just narrated as "still on"), then a direct override hides/restores it.
- **A stray-element warning badge needs a genuine defect, not just the flag on.** `planIntegrity`'s
  `PlanTotalLabel` only shows `⚠ N stray` when `planIntegrityFlags()` actually finds something
  disconnected — the default apartment plan is fully connected, so flipping the flag alone on a
  pristine plan proves nothing. Manufacture a real stray element first with the plain store action
  (`addWall({start:[50,50], end:[52,50], thickness:'internal'})` — a 2 m segment far outside the
  footprint, joined to nothing) before toggling the flag; the badge (and, visually, that one wall
  segment rendered in red on the plan canvas while stray) then genuinely responds to the flag.
- **`.panel-sub` is not a unique class — the floor-plan editor has at least four unrelated elements
  wearing it** (`PlanTotalLabel`'s "Total … · N rooms", `GridZoomControls`, and two labels inside
  `WallNumericEntry`). A bare `document.querySelector('.panel-sub')` grabs whichever one happens to
  be first in DOM order (observed: it grabbed the grid-size control's "Grid" label instead of the
  total readout, an assertion failure that reads exactly like the feature being broken). Filter by
  content instead: `[...document.querySelectorAll('.panel-sub')].map(e=>e.textContent).find(t =>
  t.startsWith('Total'))`. General lesson: a component-scoped `className` shared across a panel
  family (see also the batch-6 `.scene-select` gotcha) is common in this codebase — never assume a
  single `querySelector` hit is *the* element without checking how many share the class.
  `console.log`ging the *actual* matched text in the thrown Error message (not just "assertion
  failed") is what made this one-line diagnosis instead of a re-read of the whole component.
- **A stale/aged-out `NEW_BADGES` registry entry can be revived for a scenario via the same
  dynamic-import "drive a private module-level signal" technique from batch 5** — `newBadges`'s
  only two live wirings (`styleQuiz`, `parallelProjection`) are both long past their recency window
  (their `APP_VERSION` has since moved a minor line on), so a scenario that doesn't touch this
  would see `useNewBadge` correctly return `show:false` regardless of the `newBadges` flag and
  wrongly conclude the wiring is broken. `await import('/src/ui/newBadges.ts')` resolves in-page
  and returns the real, mutable `NEW_BADGES` object — `nb.NEW_BADGES.styleQuiz =
  (await import('/src/version.ts')).APP_VERSION` makes the entry "recently introduced" again for
  the run's lifetime, exercising the exact same `isRecentlyIntroduced` → `.new-dot` render path a
  genuinely-new entry would, without touching source. (Mirrors `MenuItem.badge.test.tsx`'s own
  technique of `vi.mock`-ing `APP_VERSION` to pin recency — this is the browser-scenario
  equivalent when you can't mock a module import.)
- **The Tools menu itself is Pro-only at the mount level, not just flag-gated content inside it** —
  `Toolbar.tsx` renders `{proMode && <ToolsMenu />}`, so in Simple mode there's no "Tools" button in
  the DOM at all (not a hidden/disabled one). A `newBadges`-in-Simple-mode assertion should check
  for the trigger button's ABSENCE, not try to open a menu that structurally can't exist yet — this
  is actually a *stronger*, simpler proof than a hidden-row check would be.
- **The "Style quiz" row can be below the fold in a screenshot even when the DOM assertion on its
  `.new-dot` passes** — the Tools menu's Analyse group is long (10 rows) and the Style row is
  further down under a Style label past Review & Tour; a 1600×1000 screenshot after opening the
  menu shows Walkthrough at the bottom, not Style quiz. The DOM query (`querySelectorAll('.pop-panel
  button')` + `.find`) still finds and asserts the real off-screen node correctly — same class of
  limitation as the batch-6 "below-the-fold `<summary>`" gotcha, but for *reading* the DOM rather
  than *clicking* it (reading has no scroll dependency; only synthetic *clicks* by screen
  coordinate do). Note this honestly as "DOM-proven, not pixel-visible in this shot" rather than
  scrolling to force a screenshot that adds no additional proof.

---

## Packaged targets (Docker / Electron)

- **Docker image**: `docker build -t sofa-so-good:test . && docker run -d --rm -p 8080:80
  sofa-so-good:test`, then screenshot it with the legacy harness via
  `SHOT_URL=http://localhost:8080/ node scripts/shot.mjs out.png 12000` (the image serves at
  root, not `/sofa-so-good/`). Also probe: SPA fallback (`/some/route` → 200 html), wasm MIME
  (`/draco/draco_decoder.wasm` → `application/wasm`), `/sw.js` → `Cache-Control: no-cache`,
  and the `/kenney` proxy → 200.
- **Electron shell**: `ELECTRON_SMOKE_SHOT=<out.png> npx electron . --no-sandbox` captures the
  loaded window after `ELECTRON_SMOKE_WAIT_MS` (default 15000) and exits — build first with
  `npm run build:desktop`. Gotchas: `ELECTRON_RUN_AS_NODE` (exported by VSCode/agent hosts)
  makes Electron run main.mjs as plain Node — the shell detects this and **re-execs itself
  without it** (logs `[shell] ELECTRON_RUN_AS_NODE was set…`), so it's handled, but note the
  extra process if you're capturing exit codes. Under WSL add
  `--disable-gpu --enable-unsafe-swiftshader` or WebGL init fails outright ("WebGL not
  supported" guard screen instead of the scene).

## Legacy mode (one-shot, backward-compatible)

`node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]`

Use this for quick single-frame checks where you only need one screenshot. For
anything that requires multiple screenshots or interaction steps, use scenario mode.

- Software WebGL (SwiftShader) headless Chromium. Slow to first frame — give
  `waitMs` ≥ 8000 for anything that loads a GLB.
- Env: `SHOT_VIEWPORT="W,H"` (responsive breakpoints), `SHOT_TOUCH=1` (emulate a
  touch device — coarse pointer + `hasTouch`), `SHOT_INIT_LS='{…}'` (seed
  localStorage, e.g. `hdb_onboarded`), `SHOT_URL` (target a dev server on another
  port, e.g. `npm run dev -- --port 5199 --strictPort`), `SHOT_NAV_TIMEOUT` ms
  (cold Vite transforms can blow the default 60 s `goto`).
- A dev server with a live HMR socket may never reach `networkidle2`; the harness
  catches the goto timeout and continues (the page has committed — `waitMs` covers
  boot), logging a `[harness] goto…` line. Treat that line as informational.
- `evalFile` is a JS file run **in the page** after `waitMs`. `actionsJson` is a
  JSON array of input actions, run **after** the evalFile.
- Actions: `{type:'drag',from:[x,y],to:[x,y]}`, `wheel:{x,y,dy}`, `click:{x,y}`,
  `type`, `key`, `select`, `wait:{ms}`.
- The harness prints `SHOT_SAVED <path>`, then a `---CONSOLE---` block with the
  **last ~30** page console lines. Your `console.log('PROBE ...')` calls show up
  there — but only the last 30 lines, so if you log in a tight poll loop the
  early ones scroll off. Prefer one summary log at the end.
- `window.__store` (the Zustand store) is exposed in dev. That's your main lever.
- `SHOT_URL=http://localhost:<port>/?…` targets a non-default dev server (run your
  own on a free port with `npm run dev -- --port <port> --strictPort` so you never
  fight another session's server). Query params survive into the page, so an
  evalFile can read variants from `location.search` and one evalFile serves many
  shots. Navigation waits for `networkidle2` with a 120 s timeout — on a slow
  (software-render) box the first cold load can take >60 s, so don't shorten it.

**Legacy timing pitfall:** in legacy mode, `page.evaluate(evalFile)` returns when
the JS expression returns — any `setTimeout` / async work triggered inside fires
*after* the screenshot. If you need to sync on async side-effects, move to scenario
mode with `waitFor` steps.

### A known-good legacy template

```js
// /tmp/vf.mjs — run: node scripts/shot.mjs /tmp/out.png 13000 /tmp/vf.mjs '<actions>'
(async () => {
  const S = () => window.__store.getState();
  S().endTour?.(); S().setOnboardingOpen?.(false); S().dismissLocationPrompt?.();
  // ... import groups / set up items via __store + temp hooks ...
  S().setItems([item]);
  S().focusOn([x, z]);                 // mount + frame the item
  setTimeout(() => {
    // ... act on caches that are now populated ...
    S().focusOn([x, z]);               // re-frame after mutating items
    console.log('PROBE done', JSON.stringify(/* the few values that prove it */));
  }, 3500);
})();
```
Then pass an `actions` array to tilt/zoom to a profile angle, and **look at the
PNG**.

---

## Rules

1. **Review the pixels yourself.** CLAUDE.md requires it — a passing `__vfLog`
   value is NOT verification. Read the PNG with the Read tool and describe what
   you actually see (gap? clipping? floating? facing the right way?). The data
   being right and the render being right are different claims.
2. **Get a side/profile angle for anything about height or contact.** A top-down
   shot hides float/clip/sink. The mattress-on-frame bug was only visible from
   the side. Orbit down before judging vertical relationships.
3. **Clean up after yourself, every time.** Revert temp `main.tsx` hooks
   (`git checkout src/main.tsx`), delete any GLBs you copied into
   `public/assets/ikea/` (they're gitignored but leave a dirty tree), and stop
   the dev server. Confirm `git status` shows nothing you introduced before
   moving on.
4. **Never commit debug hooks or `PROBE` logs.** Strip them before the feature
   commit. (Easiest: keep all temp exposure inside one block in `main.tsx` you
   revert wholesale.)

---

## Gotchas & fixes (the actual time-sinks)

### A photo finish suspends for SECONDS — a screenshot mid-load is a different scene, not a bug
Applying a `textured` (photo) finish for the first time makes the surface suspend on drei
`useTexture` until every channel image has decoded. Measured on the harness: **~10–12 s** for a 1K
ambientCG scan (5 maps / ~3 MB) applied to all 11 rooms — a 2 s or 4 s settle is nowhere near
enough, and the length varies run to run, which is exactly what made the original report look
intermittent and tier-dependent. Rules learned the hard way (v0.29.3.4, FINISH-DEFER):
- **Wait on state, not a clock.** Poll the scene graph until the finish has actually landed rather
  than sleeping: `waitFor.store` accepts any expression, and the predicate runs in page context, so
  a `window.__probe = () => …` installed by an earlier `eval` step is reachable from it
  (`scripts/scenarios/photo-wall-finish-load.json` is the worked example).
- **`eval` step results are DISCARDED** — the runner never logs them. `console.log('[TAG]', …)`
  inside the eval instead; it lands in the run's `---CONSOLE---` dump at the end.
- **`window.__three` is the scene handle** (`__three.scene` / `.gl`); there is no
  `__three.invalidate`. To force one demand-mode frame from a scenario, dispatch a `focus` event
  (`RenderPump` treats it as a dirty mark) — that is also how you tell a stale FRAME from stale
  STATE: re-probe after it, and if the graph still disagrees with the pixels the state is what's
  behind.
- **Surface-level state worth probing:** wall/floor faces carry `userData.finishTarget`
  (`{kind, roomId}`), so a traverse can report per-surface `visible` / `material.map` /
  `material.color`. `o.visible === false` on a finish surface means React has HIDDEN it (a
  suspended subtree) — not a fade; the wall-reveal fade shows up as `opacity`/`transparent` instead.

### Driving a real ambientCG (R2) finish in a scenario: mirror + login + Pro mode
Since v0.29.3.6 the dev API finds the mirror itself (`resources/` then `ikea_optimized/` — see
`scripts/lib/devLibraryMirror.ts`), so `npm run dev` is enough **if** the repo has `resources/`
(`npm run pull-r2-library`); a missing key now logs `[dev-api] LIBRARY miss: …` instead of 404ing
silently. Two things are still on you, or `acgLibrary.fetchIndex` throws and the finish quietly
stays on its fallback:
- an **admin login** from the page — `/api/assets/*` is auth-gated, and
  `fetch('/api/auth/login', {…, credentials:'include'})` in a scenario `eval` step works (the
  cookie then applies to every map load);
- **Pro mode** (`setUiMode('pro')`), because the R2 transport is chosen by the `ambientcgLibrary`
  flag, which is `tier: 'pro'` — in Simple mode the provider falls back to the live ambientcg.com
  API, which needs the internet.

Applying such a finish from a scenario without going through the picker:
`resolveRemoteAsset({provider:'ambientcg', slug:'Bricks030', kind:'material', category:'wall',
resolutions:['1k'], …}, '1k')`, wait on
`state.resolvedRemoteMaterials['ambientcg:Bricks030:1k'] != null`, then `setAllWallFinish(id)`.

### The harness mutex is a lock file, not `flock` (and why that matters)
`shot.mjs` serialises ALL runs machine-wide — SwiftShader Chromium is 1–2 GB per instance and
concurrent runs have coincided with container restarts that silently kill the process. It used to
do that by re-exec'ing under **`flock`**, which **does not exist on macOS**: the spawn failed with
ENOENT, `res.status` was `null`, and `process.exit(res.status ?? 1)` exited **1 printing nothing**
— *after* the scenario header had been logged, so it read as the scenario crashing. Symptom was
`Running scenario: "…"` then silence, on every invocation. Fixed in v0.28.0.2 with an in-process
lock file (atomic `'wx'` create + PID liveness check + release on exit/signals), which behaves the
same on every platform.

Two consequences when a run misbehaves:
- **A wedged run blocks every other run for up to 15 min.** The error names the lock path
  (`$TMPDIR/sofa-shot-harness.lock`); delete it if no `shot.mjs` is actually running.
- **A `SIGKILL`'d run leaves the file behind.** That is recovered automatically — the next run
  reads the PID, sees it is dead, and clears it — so do NOT add sleeps or retries around this.

### A hidden tab has no animation frames — anything awaiting rAF deadlocks
Chrome throttles `requestAnimationFrame` to **zero** while a page is not visible, so any boot or
init path that awaits a frame stops dead in a background tab, an occluded window, or an
offscreen/headless harness. This bit boot itself: `runBootstrap`'s `yieldFrame` awaited a bare
`requestAnimationFrame`, so a hidden tab left `bootPhase` on `'hydrating'` forever — `#boot-loader`
never faded, no canvas mounted, and `window.__store` was never exposed (it is set by the last
bootstrap step), which reads exactly like a broken build. Fixed by racing the frame against a
timer and skipping it when `document.hidden` (v0.28.0.0).

**There is a SECOND rAF gate the v0.28.0.0 boot fix does not cover** (and it bites hardest when
driving a real Chrome tab — see the Claude-in-Chrome section below). `App.tsx`'s three-phase boot
mounts the `<Canvas>` from phase 1→2 via **two chained `requestAnimationFrame`s**
(`setSceneCanvasReady`), deliberately, so the loader art keeps animating while the canvas warms.
In a hidden tab those frames never arrive, so the app sits on "Almost ready…" with
`bootPhase === 'ready'`, `loading.active === false`, **zero `<canvas>` elements**, no
`window.__three`, and **no console error** — which reads exactly like a crashed scene. It is not:
one screenshot (or any action that makes the tab visible) delivers the frames and the scene
appears. Diagnose with `document.visibilityState`, not by reverting code.

Two lessons for verification: (1) when the app appears stuck on the boot cover, **check
`document.visibilityState` before suspecting the code** — a screenshot cannot tell you the tab is
hidden; (2) to reproduce a hidden tab reliably, stub the clock rather than trusting window
focus. `headless: 'shell'` reports background tabs as **visible**, so `bringToFront()` on another
page proves nothing. What works:

```js
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  let id = 0
  window.requestAnimationFrame = () => ++id   // accepted, never delivered
  window.cancelAnimationFrame = () => {}
})
```

Always confirm such a harness actually *detects* the bug — revert the fix, watch it fail, restore
it — otherwise a passing run only proves the harness is inert.

### Claude-in-Chrome quirks (driving the real tab)

Everything below cost real time in the 2026-08-25 ambientCG/texture session. None of it is a bug
in the app; all of it looks like one.

**A backgrounded tab has no canvas** — *fixed in the app as of v0.30.1.0, but know the shape of
it.* Chrome delivers no `requestAnimationFrame` to a hidden page, and on macOS "hidden" includes a
window merely OCCLUDED behind another one, not just a minimised one. Two boot gates used to wait
on frames alone — the phase-1→2 Canvas mount and `sceneReady` — so a hidden tab sat on "Almost
ready…" with `bootPhase: 'ready'`, zero `<canvas>` elements and no `window.__three`, which reads
exactly like a crash. Both now fall back to timers (`ui/loading/frameGate.ts`, the same trade
`state/storage/bootstrap.ts:yieldFrame` already made), so a hidden tab boots and can be probed.

**Pixels still need the window up.** The compositor does not paint a hidden page, so a capture
returns the last frame from whenever the window was last visible — stale, and indistinguishable
from a fresh one. Raise it:

```sh
npm run chrome:focus          # osascript activate; also un-minimises
npm run chrome:focus -- --check   # exit 0 when Chrome is frontmost
```

Or take the throttling out of play for the whole profile, which is what Puppeteer does by default
(covers occlusion; a minimised window is still `hidden` per spec):

```sh
open -na "Google Chrome" --args \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling
```

Always confirm with `document.visibilityState` rather than assuming — and note that
`osascript` talking to **System Events** needs Accessibility permission and BLOCKS on its prompt
(it hung `chrome-focus` on first write, and left `UserNotificationCenter` as the frontmost app,
which is its own kind of confusing). Ask Chrome directly instead
(`tell application "Google Chrome" to return frontmost`) and time-box every `osascript` call.

**`window.__three` can be a stale scene.** After a scene swap (plan ↔ curated shell, room editor
enter/exit) re-read it before traversing; a traversal of the previous scene reports meshes that are
no longer rendered (and misses the ones that are).

**Console capture starts when you first call `read_console_messages`.** Anything logged during the
page load before that call is gone. To catch a load-time error: call the tool once (arming it),
then reload, then read. Errors swallowed by an error boundary never reach the console at all — see
below.

**`SilentErrorBoundary` turns a render crash into a missing surface.** A throw inside a wall face /
floor / panel is swallowed, so the surface simply is not there: no red screen, no console error,
no failed test. If a surface vanishes, count its meshes by tag
(`scene.traverse(o => o.userData?.finishTarget)`) to confirm it is absent rather than mis-styled,
then bisect by reverting the suspect file (`git checkout -- <file>`, let HMR reload, re-probe).
The 2026-08-25 case: a newly added `finishes.wallTex` field was read unguarded, and a design saved
before that field existed rehydrated without it → `undefined[key]` threw → **every wall in the flat
lost its finish**, silently. Optional-chain every read of a new state field.

**A `javascript_tool` result can be refused.** A snippet whose output looks like cookie/query-string
data comes back as `[BLOCKED: Cookie/query string data]` — most often triggered by
`fetch(url, { credentials: 'include' })` probes or by echoing response bodies. Print statuses and
lengths (`r.status`, `text.length`), not payloads.

**Console probes mutate the user's real design.** The tab is the user's session, not a fixture:
`setWallFinish`/`setFloorFinish`/`updateRoom` write to their saved state and persist. Record what
you change and restore it when done. Worse, some store actions have side effects beyond the field
you set — `updateRoom` used to fork the curated flat into a *custom plan* (`forkIfDefault`), which
silently swaps the whole renderer (`<Apartment/>` → `PlanShell`) and changes what walls look like.
That specific fork is fixed (v0.29.5.4, appearance-only patches no longer fork), but check an
action's implementation before driving it in someone's live session.

**Two renderers, two sets of symptoms.** The curated flat renders `<Apartment/>` (walls =
`WallSegment` face planes, floors = `RoomFloor`); a custom plan renders `PlanShell`
(walls = boxes + `PlanWallFace` faces, floors = `PlanRoomFloor`). `isDefaultPlan(floorPlan)`
decides. Before filing "X doesn't render", check `__store.getState().floorPlan.id` — a feature
wired in one renderer and not the other looks like an intermittent bug.

**Stale IndexedDB caches outlive reloads and look like live behaviour.** The remote catalog index
is cached for **7 days** (`sofa-cache-index`), thumbnails in `sofa-cache-thumbs`, assets in
`sofa-cache-assets`. A cached index from an older build can pin the app to a provider/transport
that no longer exists — that is how ambientCG cards kept loading forever against a removed
transport. Inspect or clear them directly:

```js
const db = await new Promise(res => { const r = indexedDB.open('sofa-cache-index'); r.onsuccess = () => res(r.result) })
const keys = await new Promise(res => { const q = db.transaction('kv','readonly').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result) })
// clear one provider's cached index:
await new Promise(res => { const q = db.transaction('kv','readwrite').objectStore('kv').delete('ambientcg'); q.onsuccess = () => res() })
```

The in-app **Clear** button in Browse materials wipes all four stores (index + thumbs + assets +
meta) but leaves the already-loaded `remoteIndexes` in memory — reload after clearing.

**The dev API does not hot-reload.** `scripts/dev-api.ts` runs under `tsx`; edits to it (or to
`server/`, `functions/`) need a full `npm run dev` restart, while Vite HMR keeps updating the
client around it — so the client can be running new code against an old backend. Symptom worth
knowing: `/api/assets/...` answering `401` means "not signed in", `404` means "the key is in no
local mirror" (`resources/`), and the dev API logs the miss once per key. Dev sessions now survive
a restart (`.wrangler/sofa-dev-sessions.json`, v0.29.4.0) — before that, every restart silently
signed you out and the 401 read as an outage.

**HMR can drop you out of a mode.** A component file that also exports a helper fails Fast Refresh
("Could not Fast Refresh — export is incompatible") and Vite falls back to a full reload, which
exits the room editor / clears a selection mid-verification. Re-enter before judging what you see.

**Cross-origin + credentials is a silent CORS failure.** `fetch(url)` succeeding while
`fetch(url, { credentials: 'include' })` throws `TypeError: Failed to fetch` is the signature of a
server answering `Access-Control-Allow-Origin: *` — the wildcard is invalid once credentials are in
play. Test both forms in the tab before blaming the network.

### A store-level flag-off must be re-verified against EVERY consumer, not just the obvious one
Flipping a pro-tier flag off mid-scenario (`setFeatureFlag('mepEditor', false)`) is a good way to
catch a consumer that forgot its own `useFeature` gate — it caught exactly that in the MEP-points
work (G1 PR3): the toolbar group and the plan layer were correctly gated, but the `PlanInspector`
`'mep'` selection case wasn't — flipping the flag off with a MEP point still selected left the
"Electrical point" panel (kind/mount-height/delete) fully rendered and usable in Simple mode. The
screenshot looked identical whether the flag was on or off — only cross-checking against the
toolbar (which correctly lost its "MEP ▾" group) revealed the mismatch. When a feature has several
render sites (tool palette + canvas layer + inspector case + mobile sheet), flip its flag off with
something already selected/armed and diff EVERY site, not just the one you're actively screenshotting.

### First-run overlays cover the scene (location modal, onboarding, tour)
Three first-run overlays will obscure your screenshot, and they're gated on
**store state**, not localStorage, so the harness's localStorage seeding does NOT
dismiss them. Worse, they cascade: dismissing the tour *un-suppresses* the
location prompt, so dismissing one at a time means re-shooting. **Always dismiss
all three up front**, as the very first lines of every evalFile, before placing
items or screenshotting:
```js
const st = window.__store.getState()
st.endTour?.()                 // product tour spotlight
st.setOnboardingOpen?.(false)  // first-run onboarding carousel
st.dismissLocationPrompt?.()   // "Where are you?" sun-position modal
```
(`sofa.helpHint.dismissed` localStorage handles the *help* hint, not these.) Note
the foreground "doors" you may see in the room editor are the apartment's door
leaves, not your items — clear `s.items` first if you need an empty room.

In **scenario mode**, you can do this in an `eval` step right after `waitFor storeExists`.

### First-run flow: onboarding carousel comes FIRST; tour is opt-in from the carousel
On a clean profile (no localStorage), the app opens the **onboarding carousel**
first — not the product tour. The carousel's third step ("Where would you like to
start?") has a **"Take the guided tour"** choice. Selecting it closes the carousel
and starts the tour; any other choice leaves the tour alone. The tour is then
available only via Help (?) or ⌘K.

Migration: users with `hdb_tour_done='1'` but no `hdb_onboarded` (who went
through the pre-C268 auto-starting tour) see the carousel once on their next
visit; after dismissal `markOnboarded()` sets `hdb_onboarded='1'` and future
visits are silent.

`first-run.json` walks carousel → "Take the guided tour" → tour steps → location
prompt → final scene. `first-run-no-tour.json` walks carousel → "Enter sandbox"
→ asserts `tourOpen === false` → location prompt → final scene.

### Seeding/selecting items right after `sceneReady` gets clobbered by the move-in seed
The default move-in furnishing is applied by an async boot step (`bootstrap.ts`'s
`seed` step calls `resetToDefault()` when `items` is empty), which runs *after*
the store exists and can land after `sceneReady` flips — a `setItems([...])` or
`selectItem(...)` fired too early is silently overwritten by the full default
layout. Gate on the end of the whole bootstrap, not on `storeExists`/`sceneReady`
alone: `waitFor {store: "state.bootPhase === 'ready' && state.sceneReady === true"}`
(`bootPhase` flips to `'ready'` in `runBootstrap`'s `finally`, i.e. strictly after
the seed step), then hold a short beat (~800 ms) before seeding/selecting. Found
building `cabinet-open-simple.json` (flagged by the CABINET-OPEN author).

### Pro-tier features are OFF at boot (the app starts in Simple mode)
The store boots with `uiMode: 'simple'`, which forces every `tier: 'pro'` flag
off — so a pro-gated overlay/tool/panel you're verifying silently never mounts
(no error, no DOM, clicks fall through to whatever is behind it). Call
`st.setUiMode('pro')` in the evalFile right after dismissing the overlays
(it re-resolves the flag map) before exercising any pro feature.

In **scenario mode**: `{"store": {"action": "setUiMode", "args": ["pro"]}}`.

### `focusOn([x,z])` doesn't frame the item well
`focusOn` recenters but keeps a high/far orbit angle, often pointing past a
single placed item. To actually see the item: after focusing, drive the camera
with actions — `wheel` dy negative to zoom in, then a vertical `drag` from high
to low screen-Y to tilt down to a side view. Example that yields a usable
profile:
`[{"type":"drag","from":[700,160],"to":[700,520]},{"type":"wait","ms":400},{"type":"wheel","x":700,"y":400,"dy":-400},{"type":"wait","ms":1200}]`
Tune the drag magnitude per scene; large vertical drags tilt more. **Check which
way your drag tilted**: from the default dollhouse pose a downward drag can pin
the camera to straight top-down (polar → 0) instead of a profile — if your shot
comes out plan-view, drag the *other* way (low→high screen-Y, e.g.
`from:[700,520] to:[700,230]`) to tilt toward the horizon, then wheel-zoom in.
Also set a daytime hour first (`setManualHour(12)`) or a night scene hides
geometry faults; and place the item with `rotation: 0` facing the camera side
you'll shoot from so drawer fronts/handles are visible.

In **scenario mode**: use `drag`/`wheel`/`store` steps.

### Items must be on-screen to mount (and to run their effects)
GLB geometry effects (footprint, support-plane caches) run in `GltfModel`'s
`useEffect` — which only runs once the component **mounts**, i.e. the item is in
the render. If you place an item far from the camera and never focus, it may not
mount and its caches stay empty. Place items near the camera target / call
`focusOn` right after `setItems`, then wait.

### Module functions aren't on `window`
Only `__store` (and a few `__arrange*` helpers) are exposed. To call a module
function (e.g. `importGroup`, `combineOnto`, a cache getter), add a TEMP hook in
`src/main.tsx` inside the `if (import.meta.env.DEV)` block:
```ts
const { combineOnto } = await import('./furniture/ikea/stacking');
(window as any).__combineOnto = combineOnto;
```
Revert it before finishing. Do NOT try `await import('/src/...')` from the
evalFile — the path/MIME resolution fails in the page context.

### IKEA GLBs need their blobs in IDB / over HTTP
To exercise IKEA import without the scraper UI: copy a scraped group folder into
`public/assets/ikea/<slug>/` (Vite serves it), then in the evalFile fetch
`metadata.json` + each variant `glb`, wrap them in `File` objects, and call
`window.__importGroup(meta, files)` (the same path `ikeaLive.ts` uses). Pattern:
```js
const meta = await (await fetch(`/assets/ikea/${slug}/metadata.json`)).json();
const files = [];
for (const v of meta.variants) { if (!v.glb) continue;
  const blob = await (await fetch(`/assets/ikea/${slug}/${v.glb}`)).blob();
  files.push(new File([blob], v.glb, { type: 'model/gltf-binary' })); }
const { def } = await window.__importGroup(meta, files);
```

### Caches that populate on render are racy in a one-shot eval
A geometry cache (e.g. support plane) is filled by the render effect, so reading
it immediately after `setItems` returns null. Either (a) **poll** for it before
acting (`setTimeout` loop checking the getter, then proceed), or (b) wait a fixed
generous delay (≥ 3.5 s after the item is placed AND focused) before the action
that depends on it. Polling is more robust; log only the final state.

In **scenario mode**: use `{"waitFor": {"store": "!!window.__myCache"}}` or a
`wait` step with a generous delay.

### Pointing the harness at a non-default dev server
If the default port (5173) is taken, run your server on a fixed port
(`npm run dev -- --port 5199 --strictPort`) and point the harness at it with
`SHOT_URL=http://localhost:5199/`.

In **scenario mode**: set `"url": "http://localhost:5199/"` in the scenario JSON.

### IndexedDB does NOT persist across shot.mjs runs
Each `shot.mjs` invocation launches a **fresh headless browser profile**, so
anything written to IndexedDB in one run (uploaded assets, packs) is gone in the
next — a "persist in run 1, verify hydration in run 2" plan silently probes an
empty DB. Verify persistence/hydration round-trips **within a single run**:
persist, then simulate the reboot in-page (clear the relevant store slice +
session caches, call the hydrator, e.g. `hydrateUserAssets()` via a temp
`main.tsx`/`bootstrap.ts` hook) and probe after that.

### The dev server dies mid-session
Long runs / multiple shots can leave the Vite server down (`ERR_CONNECTION_
REFUSED`). Before each shot batch, `curl -sf http://localhost:5173/` and restart
if needed. Don't assume it's still up from a previous step. Start it detached and
poll the port until ready:
```bash
(npm run dev >/tmp/dev.log 2>&1 &)
for i in $(seq 1 25); do sleep 1; curl -sf http://localhost:5173/ >/dev/null && break; done
```
`pkill -f vite` exits non-zero (144) when it signals itself — that's harmless,
not a failure.

### `goto` times out on `networkidle2` in an offline sandbox
Hung third-party fetches (Poly Haven/CDN requests that black-hole instead of
failing) keep the network "busy" forever, so puppeteer's `networkidle2` never
fires even though the app booted fine. The harness now catches that navigation
timeout and continues (relying on `waitMs`) — if you see
`[harness] goto networkidle2 timed out`, the shot is still valid.

### Lazy panels mount seconds after their store flag flips
Modals/panels are `lazy()`-loaded (PERF5): `setSmartStartOpen(true)` flips the
store immediately, but the chunk can take several seconds to mount under the
headless profile — a `document.querySelector('.modal-overlay')` probe right
after is a false negative, and a keypress sent too early hits the un-mounted
state. Poll for the DOM node (or the editor's `.plan-screen`) before acting,
and put generous `wait` actions before synthetic keys. Also note `setInterval`
ticks get throttled while the page is busy compiling shaders — log
`performance.now()` deltas, not your tick count.

In **scenario mode**: use `{"waitFor": {"css": ".modal-overlay"}}` instead of
a fixed `wait`.

### A text-`click` on a below-the-fold control is a silent no-op
`clickByText` (`scripts/lib/interact.mjs`) resolves the match, computes its
`getBoundingClientRect()` centre, and fires `page.mouse.click(x, y)` at that
point **without scrolling it into view**. If the control is scrolled out of the
viewport — e.g. a button at the bottom of a tall panel with `overflowY:auto`,
or below the fold on a short viewport — the click lands off-screen (or on
whatever is at that clamped coordinate) and the control's React `onClick` never
runs. There's **no error** — the step reports OK, the action just didn't happen,
and you chase a phantom "the handler is broken / the feature can't be driven
headless" bug downstream. (This silently broke the GLB designer's "Save asset"
step in two scenarios.) Fix: for any control that may be below the fold, click it
via a DOM `.click()` in an `eval` (`[...document.querySelectorAll('button')]
.find(b => b.textContent.trim() === 'Label' && !b.disabled)?.click()`) — a real
click event React honours regardless of scroll position — or `scrollIntoView()`
it first. Reserve the coordinate-based text-`click` for controls you know are
on-screen.

### Verifying offline / service-worker behaviour
The PWA service worker is **build-only** (`devOptions` off), so offline behaviour
can't be checked against `npm run dev`. It also can't be checked against
`npm run preview` in this sandbox: `vite preview` here serves `index.html` (the
SPA fallback) for `/<base>/assets/*.js` while the real chunk lives at root, so the
app never boots and every probe is a false negative. Use the static server that
honours the production base like a real host:
```bash
npm run build:all                   # app + user guide, both precached (build-with-guide.mjs)
node scripts/static-serve.mjs       # serves dist/ at http://localhost:4173/sofa-so-good/
node scripts/offline-test.mjs          # editor opens offline (lazy chunk)
node scripts/offline-features-test.mjs # 29 non-exempt features via the command palette
node scripts/offline-guide-test.mjs    # the VitePress user guide loads offline
```
Use `npm run build:all` (not `npm run build`) when checking the guide offline —
plain `npm run build` is app-only; `build:all` builds the guide into `dist/docs`
first, then the app with `VITE_KEEP_DIST=1` so the SW precaches it.
`offline-test.mjs` launches puppeteer with a **fresh `userDataDir`** (a reused
profile keeps a stale SW that 404s every request), seeds `hdb_onboarded=1` so the
onboarding modal doesn't swallow the `P` hotkey, waits until the editor chunk is
in `caches`, then goes offline and opens the editor — asserting no
"Importing a module script failed". `window.__store` is **dev-only**
(`import.meta.env.DEV`), so drive the prod build through the UI (keys/clicks),
not the store.

### Verifying the update toast (PWA-UPDATE) without a live service worker
The service worker is build-only, so the real "Update available" flow can't fire against
`npm run dev` — but the toast is just a notification, so drive `__store.getState().notify`
directly to render each state and screenshot it (`update-check-toast.json`): a `kind:'progress'`
toast with `progress:null` for the **checking** spinner + indeterminate bar (`waitFor` on
`.toast-host .bud-bar.indet`), then an `info` toast with `actionLabel:'Update'` + `icon:'Versions'`
for the **Update available** prompt (`waitFor` on `.toast-host .toast-act`), then a plain `info`
toast for up-to-date. Gate on `.toolbar` + a short `settle` first, or the toast renders over the
boot splash. The SW wiring itself (`onNeedRefresh` → `showUpdatePrompt`, `applyUpdate` →
`updateSW(true)`) is covered by `swUpdate.test.ts` with a faked `navigator.serviceWorker`.

### Editing source mid-session triggers HMR
Vite hot-reloads your edits into the running server, so you usually don't need to
restart after a code change — but a change to `main.tsx`'s startup block may need
a full reload (the harness does a fresh `goto` each run, so it picks it up).

### Decoding Draco GLBs outside the browser is painful
Don't try to parse Draco-compressed GLBs in Node (DRACOLoader wants a Worker;
the stdlib `glb_analysis.py` can't decode Draco geometry, only the container).
The browser already has Draco wired — do geometry probing in-page via an
evalFile that loads through the app's own loader, not in a standalone script.

### `enterRoomEditor` raises an "Entering room…" overlay that covers the catalog
The catalog panel only mounts in the room editor (`open && cameraMode === 'orbit'
&& roomEditor.active`), but `enterRoomEditor` sets `loading: { active: true, label:
'Entering room…' }` — a full-screen overlay that clears on scene-ready. Under
SwiftShader that ready signal is racy (a `THREE.WebGLRenderer: Context Lost.` can
stall it), so a screenshot right after shows the overlay, not the catalog. Call
`window.__store.getState().hideLoading()` after entering the room editor (and again
after any mode switch that re-enters), then `wait` a beat, before screenshotting the
catalog grid. Note the separate **boot** splash (cycles HDB-flavoured status lines on `#boot-loader .bl-sub`, then pins "Almost ready…" during scene warm-up) keys off
`bootPhase`/`sceneReady`, not `loading` — if it's still up, the boot simply hasn't
settled; give `store-ready` a generous timeout and add a settle wait. This was found
verifying the shared-library catalog cards (`shared-library-simple.json`): the Pro
leg (later, boot settled) shot the grid cleanly; an early Simple leg still showed the
boot splash.

### An isolated room renders as a closed box you can't see into
The per-room editor (`enterRoomEditor(roomId)`) renders only that room's walls.
A naive "render the matched walls" gives a fully-enclosed box — from any orbit
angle the near walls occlude the interior, so the first shot looks like a blank
cube. Two things make it usable, both already in `apartment/RoomShell.tsx` /
`roomShell.ts`: (1) **clip shared walls** to the room footprint span (the
bedroom north wall is one 9 m segment shared by all three bedrooms — render the
whole thing and you get the neighbours' windows too), and (2) **hide each wall
when the camera is on its outward side** (camera-facing wall reveal, a per-frame
`mesh.visible` toggle). If you add a similar isolated view, do both — and frame
the camera on the room centre (`OrbitCamera` keys this off `roomEditor.roomId`),
or a far room like `livingDining` loads off-screen to one side.

### Orbit-roofed-lighting checklist (ORBIT-CEILING)
Orbit daytime (Medium+ tier): sun shadows present, interior lit through windows/openings (not
flooded from the open top), see-in view intact; confirm no z-fighting/occlusion pop from the
ceiling occluder.

### Drag-and-drop won't work on a `<button>` drop target
A native `<button>` makes an unreliable drop zone — browsers mishandle drag
events on it and `dataTransfer.items` / `webkitGetAsEntry()` may not populate, so
dropped **folders** silently do nothing. Use a `<div>` with `onDragOver`
(`preventDefault`) + `onDrop`; put any picker button *inside* it. The harness has
no native drop action, but you can verify the handler wiring + loose-file
fallback in an evalFile by dispatching a synthetic event:
`zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))`
where `dt` is a `DataTransfer` with `dt.items.add(new File(...))`. A synthetic DT
has no real `webkitGetAsEntry` entries, so it exercises the `dt.files` fallback,
not directory recursion — unit-test the recursion separately with faked
`FileSystemEntry` objects.

### Emulating touch (long-press, coarse-pointer gates) — `SHOT_TOUCH=1`

**Start every touch scenario by asserting the emulation actually took.** A touch run that
quietly loses `(pointer: coarse)` still goes green — it just stops testing what it claims to.
That happened for real: the `viewport` step used to drop `isMobile`/`hasTouch` (Puppeteer's
`setViewport` replaces the whole config), so **22 touch-named scenarios that switch viewport
mid-run were exercising no touch at all** while reporting success (fixed, and guarded by
`scripts/lib/interact.viewport.test.mjs`). One cheap step makes the claim self-checking:

```json
{ "name": "assert-coarse-pointer",
  "eval": "(() => { if (!matchMedia('(pointer: coarse)').matches) throw new Error('touch emulation did not take — run with SHOT_TOUCH=1') })()" }
```

Put it immediately after the viewport step, not before it.


Touch-gated code (`matchMedia('(pointer: coarse)')`, `body.mobile` long-press)
doesn't run under the default headless desktop profile. `SHOT_TOUCH=1` sets
Puppeteer's `isMobile + hasTouch`, so `(pointer: coarse)` matches and touch
handlers attach. Synthesize gestures from the evalFile with real `Touch` /
`TouchEvent` objects on the canvas (`new Touch({identifier, target, clientX,
clientY})`). Project a world position to screen px via the exposed camera
(`window.__three.camera`, dev-only): `p = new cam.position.constructor(x,y,z);
p.project(cam)` → `cx = (p.x+1)/2*w`, `cy = (1-p.y)/2*h`.

In **scenario mode**: use `{"viewport": {"width": 390, "height": 844}}` to
switch to a mobile viewport mid-scenario. Also handy for finding layout breaks:
`document.documentElement.scrollWidth > clientWidth` flags horizontal overflow;
re-run at 320px (iPhone SE) for the tightest phones.

### Verifying mobile 44px tap targets (invisible `::after` hit-area padding)
The MOBILE-TAP-TARGETS pattern keeps a control's *visual* size (e.g. a 26px
`.icon-btn`) but pads its clickable area to 44px with an invisible
`::after { position:absolute; inset:-9px }` (26 + 2×9 = 44; a 22px control needs
inset −11px). happy-dom/jsdom have no layout, so assert this in a **browser
scenario** via computed pseudo-element geometry rather than a unit test:
`getComputedStyle(btn, '::after')` → check `position === 'absolute'` and
`top === '-9px'` (or −11px). Trigger the surface first (fire a toast with
`__store.notify.start({kind:'error'})`, open a modal via `confirmAction`, …),
then read the `::after` on its `.icon-btn`. The rule is deliberately **scoped**
(not a global `.icon-btn::after`) because padded hit areas overlap in
densely-packed button rows — only expand controls isolated at a container edge.

**Limitation — R3F won't raycast a *synthetic* mouse/contextmenu event headless.**
A dispatched `contextmenu`/click reaches the canvas and your DOM handlers fire,
but `@react-three/fiber`'s pointer system doesn't resolve a hit for it under
software-WebGL, so item-level `onContextMenu`/`onClick` (e.g. opening the context
menu) won't trigger from a faked event. Verify the parts you *can*: that the
handler fires, the event carries the right `clientX/Y`+`offsetX/Y`, and that
move-cancel logic works (`store.contextMenu` / a one-shot `contextmenu` listener
flag). The raycast→handler link is the same path a real right-click uses, so
proving the synthesized event matches a real one is sufficient. (This is the same
class of issue as the "orbit drag/zoom emulation is unreliable headless" note.)

### drei TransformControls gizmos CAN be dragged headless (unlike R3F raycasts)
The R3F-raycast limitation above does NOT apply to drei's `TransformControls`:
it raycasts its own fat picker meshes from real pointer events on the canvas, so
the harness `drag` action (real CDP mouse input) grips a gizmo handle fine under
SwiftShader — dragging the GLB-designer translate arrow wrote the snapped value
into the numeric field end-to-end. Two gotchas: (1) **compute drag coordinates
in the PNG's REAL pixel space** — screenshots are 1600×1000 (`SHOT_VIEWPORT`
default) but the Read tool may display them downscaled 2×, and coords picked off
a *previous* shot are stale the moment the camera/Bounds refit moves (a missed
drag silently orbits the camera instead, which is itself the tell); (2) take a
fresh framing shot first, read the gizmo origin off `file <png>` dimensions,
then aim for a point ~⅔ along the arrow shaft.

### Verifying a new-window exporter (report / BOQ / shopping list)
The harness screenshots only the original page, so a `window.open(…) → document.
write(html)` exporter renders off-screen. Patch `window.open` in the evalFile to
redirect the written HTML into the **main** document, then click the real menu
item — this exercises the whole opener path (flag gate, dynamic import, data
assembly, write) and leaves the export in the page for the screenshot:
```js
window.open = () => ({
  document: { write: (h) => { document.open(); document.write(h); document.close(); },
    close() {} }, focus() {}, close() {},
});
```
Scroll the resulting plain-HTML page with `{type:'key',key:'End'}` for the footer.

### Driving controlled React inputs from an evalFile
Setting `el.value = …` directly does nothing — React's controlled input snaps
back because no `input` event fired through its tracker. Use the **native value
setter** then dispatch `input` (React listens for `input`, mapping it to
`onChange`); for a `<select>` use `HTMLSelectElement.prototype`'s setter +
a `change` event (or the harness `select` action when targeting by selector):
```js
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, String(v))
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
setVal(document.querySelector('input[aria-label="cylinder position X"]'), 0.15)
```
Target inputs by `aria-label` (stable, no test-ids needed). And **poll for the
panel that renders the input** before setting it — after clicking a button that
changes selection, a fixed 300 ms sleep is racy under the slow headless profile
(this intermittently broke the GLB-designer CSG verification); poll for the
specific `input[aria-label=…]`/`select[aria-label=…]` node instead.

In **scenario mode**: use `waitFor: {css: "input[aria-label=...]"}` before the
`eval` step that sets the value.

### three.js `Color` cannot parse `oklch()` theme tokens
The CSS token vocabulary resolves to `oklch(…)` values, and `new THREE.Color(cssValue)`
throws `Unknown color model oklch(...)` — so an **in-scene** (mesh/material) use of a theme
colour like `--accent` must convert it to `rgb()` first. `getComputedStyle().color` does NOT
help (browsers preserve `oklch` in computed style); the working conversion is a 1×1 canvas
readback: set `ctx.fillStyle = cssValue`, `fillRect`, then `getImageData` for the rgb bytes.
DOM overlays (e.g. `FinishDragOverlay`) can use the tokens directly — only three.js parsing
is affected.

### Driving a native `<select>` dropdown
A click at the select's coordinates only *opens* the OS popup (which Chromium
renders outside the page, so you can't click an option by pixel). Use the
`select` action instead: `{type:'select', selector:'.toolbar-room-select',
value:'kitchen'}` — it calls Puppeteer's `page.select`, which sets the value
**and fires the `change` event** so React's `onChange` runs. `selector` defaults
to the first `<select>` on the page. To *prove* the handler ran (not just that
the value was set), bind the select to store state (`value={storeValue}`) — a
controlled select snaps back unless `onChange` actually committed, so a screenshot
showing the new label is end-to-end proof. (That's how the room-editor room
switcher was verified: selecting `kitchen` re-rendered the kitchen scene.)

In **scenario mode**: `{"select": {"selector": ".toolbar-room-select", "value": "kitchen"}}`.

### Probing the live scene graph (lights/meshes) — `window.__three.scene`
`DevCameraExpose` (dev-only) exposes `window.__three = { camera, gl, controls, scene }`.
For lighting-only changes the demand-frameloop may not surface in pixels (see the lag note
in "Known headless limitations"), **assert via the scene graph instead of pixels**: traverse
`window.__three.scene` and read `o.isSpotLight`/`o.isPointLight` + `o.angle`/`o.penumbra`/
`o.intensity`. This is how the IES photometric feature (PC-IES-LIGHT) was verified — applying
a narrow `.ies` profile to the ceiling lights produced `SpotLight`s at a 32° cone (penumbra
0.40, intensity ~8.4), a wide profile gave ~76° cones, and non-IES emitters stayed
`PointLight`s — proving the photometric beam differs from a default cone. Framing a *downward
floor beam* in orbit headless is unreliable (OrbitControls snaps back a manual `lookAt`, and
the dollhouse angle hides the floor), so the scene-graph probe is the reliable proof here.
Give the rebuild a nudge (`setManualHour(h + 0.01)`) after `updateItemProps` so the
nearest-light recompute fires before you probe.

### Selection gizmos never mount in the whole-flat orbit view

`RotateGizmo`/`ResizeGizmo`/`TiltGizmo` all gate on `canEditScene` =
`roomEditor.active && cameraMode === 'orbit'`. A scenario that seeds + selects an item in the
top-level orbit view will show the selection outline and inspector but **no gizmo** — that's
correct view-only gating, not a rendering bug. `enterRoomEditor('<roomId>')` first (and seed the
item at a position inside that room). To drive a gizmo drag headlessly: project the handle's
world position to client px via the dev `__three` camera (`matrixWorldInverse` +
`projectionMatrix`), dispatch a synthetic `pointerdown` on `__three.gl.domElement` at that point
(R3F raycasts it; assert `state.rotatingGizmo === true` to confirm the grab), then
`pointermove`/`pointerup` on `window`. Don't use a `drag` step for a second camera angle while an
item is selected — a left-drag marquee-selects and clobbers the selection; reposition via
`__three.controls` (`camera.position` + `controls.update()`) instead. (Found building
`tilt-gizmo-simple.json`.)

### `click: {text: …}` on a `<summary>` (Disclosure) used to mis-click the 3D canvas

`clickByText` (`scripts/lib/interact.mjs`) climbs from the matched text node looking for a
"clickable" ancestor (`button`/`a`/`input`/`label`/`role=button`/`tabindex`) before computing a
click point. The app's `Disclosure` control (`ui/controls/Disclosure.tsx` — FinishPicker's
"Apartment colour palette…", MaterialComposer's "Compose your own…") is a native `<details>` +
`<summary>`, and `<summary>` wasn't in that allowlist even though it's natively clickable (toggles
its parent `<details>` in every real browser). The climb fell all the way to `document.body`
without finding a match, and the old code then used **body's own bounding rect** as the click
target — silently clicking the centre of the page instead of the summary row. In a scenario with
the 3D canvas centred there, this landed a real pointer click on whatever was in-scene (observed:
selecting a placed sofa and swapping the whole right panel to the Inspector instead of expanding
the disclosure) — a passing-looking step that actually did the wrong thing, one screenshot later
the sofa's Inspector was open where the palette editor was expected. Fixed in `interact.mjs`:
`summary` is now in the clickable-tag allowlist, and climbing all the way to `document.body`
without a match is now treated as "no match" (retries/times out) rather than silently clicking
body's centre. If you add another native-interactive element type the harness doesn't know about,
extend the same allowlist rather than clicking by raw coordinates.

### Worked example — model-convert worker pool (2026-07-03)

Verifying `convert/runConvert.ts` (moves OBJ/FBX/STL/PLY/DAE/3DS/3MF/USDZ/gltf → GLB conversion
off the main thread into a pooled Worker, `convert.worker.ts`) has the exact same problem as the
optimize pool did: a real `Worker` can't be constructed in the Node/happy-dom test environment, so
unit tests (`furniture/worker/workerPool.test.ts`, `convert/runConvert.test.ts`) exercise the pool
logic + fallback branches with a mock `Worker` — that proves the queueing/retry logic, not "does a
real browser actually run the OBJLoader→GLTFExporter round-trip inside a real Worker with no
`document`." For that:
- **`__importGlbFiles` (bootstrap.ts) already works for non-GLB formats with zero changes.**
  Despite the name, `detectModelFormat`/`isModelEntryFile` key off the file's NAME extension, not
  its declared MIME type, and the hook rebuilds a `File` from `{name, b64}` verbatim — passing
  `{name: 'tri.obj', b64}` routes it through the real `bulkImport.prepareGlb` →
  `needsConversion('obj')` → `runConvert`, exactly like a real drag-drop upload. No new dev hook
  needed for this task.
- **New observability seam: `window.__lastConvertRun`** (`runConvert.ts`, mirrors
  `ui/openSceneExport.ts`'s `__lastSceneExport` — `import.meta.env.DEV`-gated, records
  `{name, format, usedWorker}` on every conversion). Without it, a scenario asserting only
  `imported === 1` can't tell a real worker conversion from the main-thread fallback silently
  covering for a broken worker — the exact failure mode this whole task exists to catch.
- **Scenario:** `scripts/scenarios/convert-off-main-thread.json` +
  `evals/convert-worker-obj.mjs` — posts a tiny textureless single-triangle OBJ (deliberately no
  `mtllib`, so the result doesn't depend on the `ImageLoader`→`createImageBitmap` texture patch,
  which is unit-tested directly in `imageLoaderWorkerPatch.test.ts` instead) through
  `__importGlbFiles`, waits on the result, then asserts `__lastConvertRun.usedWorker === true &&
  __lastConvertRun.format === 'obj'`. All 7 steps passed in ~13s (dominated by the real OBJLoader
  parse + GLTFExporter pack + optimize pass) in SwiftShader headless Chromium — confirming a real
  `new Worker(new URL('./convert.worker.ts', import.meta.url))` constructed under the bundler and
  the conversion completed inside it (`usedWorker: true`), not the main-thread fallback.
- **Real conversion round-trips stay browser-only, same as `convertModel.test.ts`'s existing
  skip.** Three's loaders fetch the sibling pool via `blob:` URLs; jsdom/happy-dom's `fetch`
  doesn't resolve them ("URL scheme 'blob' is not supported" — confirmed empirically: `data:` URL
  fetch DOES work under happy-dom, `blob:` does not). This is a pre-existing limitation, not
  something this task introduced — don't spend time trying to route the worker's sibling-pool
  construction through `data:` URLs to work around it; the scenario above is the real proof.
- **Same environmental wasm-compile warnings as the optimize-pool worked example above** (Draco/
  Basis wasm fails to compile in this sandbox's headless Chromium — "Incorrect response MIME
  type" / bad magic word). Not a regression: `optimizeGlb` treats a failed Draco registration as
  best-effort, so the import still succeeds without geometry compression. Don't chase it here.

### Worked example — GLB designer showcase integration build (Asset Studio Stage 11b)

**`glb-designer-showcase.json`** (109 steps, 11 frames, run `SHOT_GPU=1`) builds a complete
catalog-quality chesterfield sofa end-to-end in ONE session — Sofa frame template → oxblood velvet +
oiled-wood clearcoat materials → seat-cushion abut (precision) → diamond tufting + stitch lines →
piping welts → Studio-vs-Room IBL → save (optimize-on-save) → restore from a clean reopened session
(asserts 14 parts / 1 group / 38 decals survive the round-trip) → place the saved sofa in the flat's
Living/Dining room at High tier (the money shot). It's the Stage-11b integration regression.
**Reusable landmines learned here (beyond the earlier designer rungs):**
- **Face-to-face magnetic snapping now ENGAGES on a grouped MEMBER (fixed v0.21.2.68).** Previously
  `__glbDesignerPrecision.drag` on a part inside a `PartGroup` committed the raw position verbatim
  (no face snap), so a "drag 5 mm shy → asserts flush" step failed with the gap left at the raw
  offset — the workaround was to compute the exact flush target and drag to it numerically. That's
  fixed: the drag now runs in the member's **group-local frame** (targets localised via
  `groupTransform.ts:worldToGroupLocalPosition`), so a member snaps to its SIBLINGS (and outside
  parts) exactly like a top-level part. The `precision-abut-seats` phase now drives the REAL magnet
  — drop the member ~4 mm short of flush (inside the 8 mm band; set a fine `setSnapStep(0.001)` so
  grid quantisation can't leave the band) and assert both `gap ≈ 0` AND `committedX !== proposedX`
  (proving the magnet, not a verbatim commit, closed it). The old "compute exact target + drag
  verbatim" recipe still works for a top-level part but is no longer needed for grouped members.
- **The plump/tuft system is TOP-FACE only** — tufting reads on a horizontal seat cushion, never on a
  vertical backrest/arm (its dimples would land on the thin top edge). So a "chesterfield" built this
  way tufts the seat, not the back.
- **`Save asset` auto-closes the designer** (`glbDesignerOpen → false`). A same-session restore/re-edit
  must **reopen** it (`setGlbDesignerOpen(true)`), which resets the spec to blank — making the
  subsequent "pick the saved source → Restore editable parts" a genuine from-storage round-trip (a
  strictly stronger proof than restoring an in-memory spec). Probe this if a post-save DOM query
  ("Source model trigger not found") fails: the panel is simply gone, not relocated.
- **The designer's `SourcePanel` controls (Source-model Select, "Restore editable parts" button) are
  NOT under the `.glb-designer` root selector** that the layers/inspector/details panels answer to —
  query them with a **bare** `button[aria-label="Source model"]` / `document.querySelectorAll('button')`
  (as `glb-update-original.json` does), not a `.glb-designer button…` prefix, or you get a false
  "not found".
- **A headless orbit-drag as the FIRST room-editor camera move can swing the camera off the room into
  empty space** (blank money shot). Do a **wheel zoom first**, THEN orbit, THEN zoom again — wheel-only
  moves stay inside the scene; the drag re-frames around a target that a fresh room-editor fit may not
  have centred where you expect. Sequence that reliably framed the placed sofa: `wheel(-520)` →
  `drag [690,470]→[700,560]` → `wheel(-420)`.
- **A "recolour the upholstery" pass must not key only on the velvet sheen preset.** The Sofa frame
  template tags cushions AND arms/backrest with the same grey `#8a8f98` FABRIC look, but only the
  cushions carry the velvet `sheen` bundle; filtering on `sheen>0` recolours the cushions and leaves
  the arms grey (a half-finished sofa). Key on the FABRIC colour tag to upholster the whole piece.

### Gotchas from the IXT-SUITES back-fill batch 5 (dxfExport / mountHeights / itemDimensionReadout)

- **Filename-substring search across `scripts/scenarios/*.json` finds FAR more real coverage than a
  content-grep for the literal flag name** — this batch's re-derivation first ran a content-only
  `grep -rl "<flagName>"` (batch-1-4's method) and got 55 "uncovered" hits; re-running with the
  flag name **dash-cased and matched against filenames** (`layoutReroll` → `layout-reroll`) dropped it
  to 42, revealing that `scatterFill`, `proceduralSky`, `planMirrorRegion`, `planPolyline`,
  `catalogFits`, `catalogResize`, `finishEyedropper`, `floorTexture`, `iesLights`, `openingStyles`,
  `roomReorder`, `catalogRecents`, and `roomStarters` all already have a scenario whose steps drive
  the feature (often visual/render-verification style, not composed as an explicit flag-gate ladder)
  but simply never mention the camelCase flag identifier as a literal substring. **Always run BOTH
  passes** (content-grep AND filename dash-match) before concluding a flag is uncovered, and open the
  top candidate file to judge whether it already substitutes for a ladder rung (a pure visual-verify
  scenario with no flag toggle is weaker coverage than a real ladder, but still means the feature
  itself is drivable/exercised — don't blindly re-author a duplicate).
- **A private (non-exported-to-`window`) module-level signal can be driven directly via a page-context
  dynamic `import()` of its source file, and this DOES work reliably** (confirmed here, extending the
  "scene-graph probe" gotcha two sections up from a read-only traversal to a genuine read-WRITE
  drive): `await import('/src/scene/selection/resizeReadoutSignal.ts')` resolves in-page and returns
  the real module namespace (`setResizeReadout`/`clearResizeReadout`/`getResizeReadout`), which lets a
  scenario exercise `ResizeHud`'s actual consumer contract (mount-on-live-signal, format the pill text,
  unmount-on-clear, stay hidden with the flag off even while the signal is live) without needing to
  reproduce the real 3D `ResizeGizmo` pointer-drag gesture at all — genuinely equivalent to what the
  gizmo would publish on each resize tick, not a workaround. Store the returned module namespace on
  `window` (`window.__resizeSignal = m`) so later steps in the same scenario can call it again without
  re-importing (dynamic `import()` of the same URL is cached anyway, but stashing it also sidesteps the
  "no top-level `const` across eval steps" scoping gotcha). General lesson: before reaching for a
  "can't be exercised headless" writeup on a module-level (not-on-`window`) signal or store, try the
  dynamic-import drive first — it is NOT the same limitation as "`React.lazy` modals never resolve
  headlessly" (that's an unresolved dynamic **component chunk** fetch stalling on `Suspense`; a plain
  `.ts` module's `import()` is a normal, fast Vite dev-server fetch that resolves immediately).
- **A Simple-mode inspector "Properties" section starts COLLAPSED** (`InspectorSection`'s
  `defaultOpen={proMode}` — Pro starts expanded, Simple starts collapsed) — any scenario that selects
  an item and expects to find a parametric field (e.g. `wall-mirror`'s "Hang height" / the
  `MountHeightPresets` "Standard heights" chip row) inside `.panel.inspector` must first click the
  section's own toggle button (`button.insp-sec-toggle` whose text starts with `"Properties"`) or every
  later `waitFor`/`eval` query against that section's contents times out looking for DOM that is simply
  unmounted (`{open ? children : null}`), not absent from the feature. The **`Size`** section has the
  identical collapsed-by-default-in-Simple gotcha (`defaultOpen={proMode}` again) — expand it the same
  way if a scenario needs the W/D/H `DimField`s.
- **A download-triggering action (`<a>` + `URL.createObjectURL` + `.click()` + `.remove()`, no real
  navigation) is fully verifiable headless by patching `HTMLAnchorElement.prototype.click` BEFORE the
  triggering click**, then reading back the captured `{href, download}` pairs — `href` will be a
  `blob:` URL (proves the export function actually built + Blobbed real content) and `download` carries
  the intended filename/extension. No real file ever hits disk in headless Chromium, so this is the
  only way to assert an export "worked" beyond "the button exists": see `dxf-export-simple.json`
  (`downloadPlanDxf()` → `planToDxf` → Blob → anchor click). Restore the original `.click` after
  asserting if a later step in the same scenario needs a real anchor click for something else.
- **`FileMenu`'s "CAD, 3D & data" section (Export DXF/SVG/glTF/AR) sits well below the fold** in the
  desktop `.pop-panel` — same family as the GLB-designer "Save asset" scroll gotcha two sections up.
  Locating and clicking the row via a DOM `.click()` inside an `eval` (`[...document.querySelectorAll
  ('.pop-panel button')].find(b => b.textContent.includes('Export DXF'))`) sidesteps the harness's
  `clickByText` viewport-visibility requirement entirely — don't bother scrolling the popover first.

### Gotchas from the IXT-SUITES back-fill batch 11 (wallNumericEntry / catalogFitsFilter / gapSuggest / triplanarWalls)

- **`document.querySelector('.plan-screen svg')` can silently grab an unrelated ICON `<svg>`, not the
  plan canvas.** The 2D editor's toolbar/inspector render several small `<svg>` icons (`.icn`/`.ic`
  classes, 14–18px) as DOM siblings *inside* `.plan-screen`, and they appear EARLIER in document order
  than the actual drawing surface — `querySelector` returns the FIRST match, so a selector meant to grab
  the canvas silently returns a 16×16 icon instead. Dispatching a synthetic `PointerEvent('pointerdown',
  …)` on that icon is a complete, silent no-op (no error, no state change) — exactly the shape of bug
  that burns a whole scenario draft chasing a "flag/gate isn't working" theory. Symptom: a `waitFor` for
  whatever the click should have produced times out with no console error at all. Fix: target the
  canvas's own specific class, `.plan-paper` (unique, always the actual drawing `<svg>`), never the
  generic `.plan-screen svg` — this is *narrower* than the wildcard used successfully in
  `plan-furniture-rotate.json`'s `pointermove` step, which worked there only because it fired on a
  window-level listener already primed by a real pointer-capture, not because `.plan-screen svg`
  reliably resolves to the canvas. Confirmed the fix by getting `.plan-paper`'s `getBoundingClientRect()`
  (a large canvas, e.g. 3632×3552, offset far outside the viewport since it's scrollable/zoomable — its
  *centre* still lands inside the visible viewport and is a safe empty click point for starting a
  wall-tool draft) and verifying a debug probe (`document.querySelector('.plan-paper circle')`, the
  wall-draft anchor dot) appeared only after switching to this selector.
- **`waitFor: {"text": "...", "visible": false}` is NOT a supported combination — `visible` only applies
  to the `css` variant.** `interact.mjs`'s `waitForCondition` implements `text` as a bare
  `document.body.textContent.includes(txt)` existence check; it never reads `step.visible` for that
  branch, so writing `{"text": "X", "visible": false}` to assert "X disappeared" silently waits for X to
  *appear* (which may never happen) and times out with a message that looks like a feature-not-working
  failure. To assert text absence, use an `eval`/`store` predicate instead:
  `!document.body.textContent.includes('X')` (or scope it to a specific container query). Caught
  authoring `catalogfitsfilter-simple.json`'s "Fits only" checkbox hide-assertion.
- **The catalog "Fits only" checkbox (`catalogFitsFilter`) only renders while NOT searching** — its
  mount guard is `{!q && fFitsFilter && roomFreeRects ? …}` (`CatalogDrawer.tsx`), so a scenario that
  types into the search box first (the pattern the existing `catalogFits`-badge scenario uses) will
  never see the checkbox at all. Drive it by clicking a category tab (e.g. "Beds") instead of searching
  — `CategoryTabs`' `LABELS` map gives the exact clickable button text per `FurnitureCategory`.
- **`catalogFits` (the passive per-card badge, simple tier) and `catalogFitsFilter` (the pro-tier "Fits
  only" browse checkbox) are two separate flags layered on the same `roomFit.ts` check** — don't
  conflate them. The Queen bed in a small bathroom (`bath1`) is flagged `'wont-fit'` (badge text "Won't
  fit") regardless of which flag is on; only `catalogFitsFilter`'s checkbox controls whether a
  `'wont-fit'` card is filtered OUT of the grid. Other oversized-for-the-room items can be `'tight-fit'`
  (badge "Tight fit") instead of `'wont-fit'` — the filter does NOT hide those, only genuine `wont-fit`
  cards, so don't assume every badged card disappears once the checkbox is on.
- **`gapSuggest`'s "Nudge apart" button needs a real narrow ITEM↔ITEM gap, not a wall gap** — the
  button is explicitly suppressed for wall-participant gaps (`!g.wall`, `ClearancePanel.tsx`). Seed two
  small items (e.g. two `side-table` defs, 0.45×0.45 m footprint) via `setItems` at a centre-to-centre
  distance in (footprint + `CLEARANCE.sofaToCoffee` 0.4 m, footprint + `CLEARANCE.walkwayIdeal` 0.9 m)
  to land a real classified gap (`tight` < 0.6 m clear, else `sub-ideal` up to 0.9 m clear) — e.g. 0.95 m
  centre-to-centre for two 0.45 m tables gives a 0.5 m clear gap (`tight`). Assert the widen by comparing
  the pair's centre-to-centre distance before/after the click, not an absolute position (the fix splits
  the move across both items).
- **An "invisible from orbit" render-only effect (a UV/tangent/attribute-readiness flag with a
  solid-colour fallback material that ignores it) needs a scene-graph oracle, not pixels — and the
  live scene IS reachable via the same `HqRenderController` singleton used for the HQ-render modal,
  even when that modal is never opened.** `triplanarWalls` only adds a `uv` `BufferAttribute` to a
  sloped-wall prism's geometry (`PlanShell.tsx`'s `SlopedWallMesh`); the meshes render with a flat
  `meshStandardMaterial` that never reads UV, so a screenshot is pixel-for-pixel identical with the flag
  on/off. `HqRenderController` (mounted unconditionally inside `Scene.tsx`, not gated on the HQ-render
  modal being open) publishes `{scene, camera}` to the module-level `hqRenderSource.ts` singleton
  the instant the main Canvas mounts — `await import('/src/scene/pathtrace/hqRenderSource.ts')` then
  `.getHqRenderSource()` from a page-context `eval` gives a real live `THREE.Scene` to `traverse()`.
  The sloped-wall prism is uniquely identifiable without any dev hook or id plumbing: its geometry is
  ALWAYS a fixed 36-vertex (12-triangle) non-indexed triangle soup when the wall has no openings
  (`slopedWallTriangles`'s `baseY=0` full-height case) — `geometry.attributes.position.count === 36`
  singles it out from every other mesh in a default/template flat. Toggling the flag and re-probing in
  the SAME session (no reload) works because the flag change is a plain store update; React re-renders
  `SlopedWallMesh`, and its `useMemo` (keyed on `triplanar`) rebuilds the `BufferGeometry` with or
  without the `uv` attribute — the live scene graph reflects the new geometry object immediately, no
  extra settle wait needed beyond letting the store's re-render commit (~800 ms was generous, not
  required to be that long).

### Gotchas from the IXT-SUITES back-fill batch 12 (sunStudy / cameraDof / smartRotateSnap / assetSets / pbrSurfaces) — likely the FINAL batch

This batch closed out the six flags batch 11's report left uncovered. Re-deriving the "uncovered"
list confirmed all six were genuinely un-scenario'd (two-pass check: `grep -rl <flag> scripts/
scenarios/` found zero content hits for any of the six, and a filename dash-match found only
unrelated near-miss files — `pbr-maps-verify.json` for `pbrSurfaces` (already known unrelated per
batch 10) and `palettepresets-simple.json` for `paletteFromPhoto` (confirmed a genuinely different
flag, `palettePresets`, by reading both `registry.ts` entries side by side)).

- **A parent-agent task brief can misname which flag gates which UI — verify against the registry
  before writing the scenario, not the brief's prose.** The brief described `assetSets` as "the
  Arrange 'Sets' pick→apply" (`ArrangeMenu.tsx`'s "Drop a set" dropdown), but `grep -rn "assetSets"
  src/` shows its only real wiring is `ui/glbEditor/designerContext.tsx`'s `setsEnabled` — the GLB
  designer's "Save groups as separate assets" checkbox (Asset Studio Stage 3d,
  `furniture/glbEdit/setSplit.ts`). The Arrange "Drop a set" picker is completely ungated (no flag
  at all); `ArrangeMenu.tsx`'s "My sets" section uses a DIFFERENT flag (`userSets`). Always
  `grep -rn "<flagName>" src/` before touching source/writing steps — a name that sounds like an
  existing feature can point somewhere else entirely.
- **`useSunStudy`'s time-lapse hardcodes its start hour to 6 (dawn), ignoring whatever
  `manualHour` was before activation** (`scene/sunStudy.ts` / the near-duplicate copy inlined in
  `ToolsMenu.tsx`) — only the STOP path restores the pre-toggle `timeMode`+`manualHour`. A
  scenario that seeds `manualHour=13` then asserts the hour "advanced forward from 13" after
  toggling on is wrong: the real first frame jumps DOWN to ~6 before climbing. Assert instead that
  the hour lands on the 6–20h dawn→dusk band and has moved away from the pre-toggle baseline (in
  either direction), then that it keeps moving frame-over-frame; assert the STOP path restores the
  *exact* original mode+hour (that part IS a strict equality).
- **A Pro-only menu's rows auto-close the WHOLE menu on any click (same class as the batch-2
  `PlanMenu` gotcha) — reopen it before every subsequent click on a different row.**
  `ToolsMenu`/`ToolbarMenu`'s doc comment says so outright ("choosing an item closes the menu, click
  bubbles to the panel's onClick"). Toggling `sunStudy` on, then later off, needs the Tools menu
  reopened before the second click — the first click's own re-render already tore the panel down.
- **`cameraDof`'s two consumers are gated independently and need different verification
  strategies.** The raster `<DepthOfField>` pass (`scene/Effects.tsx`/`EffectsImpl.tsx`) only
  mounts on High/Maximum quality tiers — a live pixel diff needs a real-GPU tier switch, which the
  playbook's own "don't switch quality tiers repeatedly in one GPU session" gotcha flags as
  fragile. The HQ Render modal's lens-control DOM (`ui/HqRenderModal.tsx`, `hasLensControls =
  useFeature('cameraDof')`) is the clean, GPU-free rung: flag off → one fallback "Depth of field"
  select (f-stop presets incl. off); flag on → the full set (focal-length select, aperture select,
  auto-focus checkbox, and — only once `dofAuto` is turned off, since it **defaults to `true`** —
  a manual focus-distance input). `setHqRenderOpen(true)` mounts the modal directly; no need to
  actually start a render session to prove the gate + a real store round-trip
  (picking an aperture option commits `state.dofFStop`).
- **A rotate-gizmo drag scenario can extend `gizmo-rotate-multitouch.json`'s exact
  world→client-px projection recipe to test angle-SNAPPING logic, not just pointer-id gating.**
  `smartRotateSnap`'s effect (`scene/selection/rotateGizmoMath.ts:smartSnapRotation`, 5° threshold
  around a neighbour/wall axis, else the 15° grid) needs a genuinely non-grid reference axis (seed
  a second item at e.g. 37°/0.6458 rad — deliberately NOT a 15° multiple) and a candidate drag
  angle within 5° of it but clearly nearer the neighbour axis than the nearest 15°-grid step (39°:
  |39−37|=2° vs |39−45|=6°) so the two rules would visibly disagree if the flag's effect were a
  no-op. Reset the target item's rotation to 0 (`setItems`) before EACH attempt so the grab-handle
  world position is deterministic and reusable across an on/off A-B pair in one session.
- **Programmatic `.click()` calls on TWO separate multi-select checkboxes in the same `eval` can
  silently under-select — not from a React batching race, but because the SECOND element may
  already be pre-checked from an unrelated single-selection concept.** Authoring `asset-sets-
  simple.json`: the GLB designer keeps one derived single-selection (`selId = selIds[selIds.length
  - 1]`) that a NEWLY ADDED shape claims via `setSelId(newId)`, which REPLACES `selIds` with just
  that one id. So after adding two boxes in sequence, the SECOND box (not the first) is already
  the sole selection the instant "Select" (multi-select) mode is toggled on — its checkbox starts
  CHECKED. A scenario that then does `box1.click(); box2.click()` assuming both start unchecked
  actually toggles box 2 back OFF (its checkbox already reflected `selected=true`, so the additive
  `toggleSel` call REMOVES it), leaving only box 1 selected and the "Group 2" chip never appearing
  — a failure that looks exactly like a broken multi-select feature but is a test-authoring gap.
  Fix: assert the real starting state first (`document.querySelector('input[aria-label="Select box
  2"]').checked === true`), then click ONLY the checkbox(es) that still need adding, not every
  checkbox indiscriminately. General lesson for any "add N things then multi-select them" flow:
  check whether adding an item already leaves it selected before scripting the selection clicks.
- **`pbrSurfaces`' material-factory functions (`materials/furnitureMaterials.ts:getMetalMaterial`/
  `getPaintedMaterial`, etc.) read the flag at BUILD time and cache by a key that deliberately
  omits the flag** (documented in `src/materials/CLAUDE.md`) — re-toggling the flag live and
  re-requesting the SAME `(finish, color, repeat)` key returns the stale cached instance
  regardless of the flag's new value. A scenario proving the gate must build each half at a FRESH,
  never-before-built cache key (a different `color` per state), not toggle-and-rebuild-the-same-
  key. Drive the pure factory functions directly via a page-context dynamic import
  (`await import('/src/materials/furnitureMaterials.ts')`, the same technique
  `hqRenderSource`/`newBadges` use) rather than placing furniture and traversing the scene graph —
  it's simpler and sidesteps ever needing to identify which mesh in a crowded scene owns which
  cached material. Verified: flag off → plain `MeshStandardMaterial`, no `normalMap`/
  `roughnessMap`; flag on → `MeshPhysicalMaterial` with both maps + positive `anisotropy`;
  re-requesting the OFF-built key while the flag is now on returns the exact same stale instance
  (worth asserting explicitly so nobody "fixes" a future version of this test by expecting a live
  rebuild).
- **`paletteFromPhoto` (`ui/paletteFromPhoto.ts:pickPaletteFromPhoto`) cannot be driven end-to-end
  headlessly — confirmed by reading the implementation, not assumed.** It creates a detached
  `<input type=file>`, wires `onchange` as a closure over that same local variable (never exposed
  on `window`), and calls `.click()` — a real native file-picker dialog that headless Chromium
  either hangs on or silently auto-dismisses with no `change` event either way. Unlike the
  `sh3d-furn-import` case (which got a dev-only `__importSh3dBytes` hook), no such hook exists here
  yet. This rung stays intentionally GATE-ONLY: the Command Palette entry's Simple/Pro visibility
  (`CommandPalette.tsx` `COMMAND_FLAGS['palette-from-photo']`), driven via `.cmdk-search input`
  (note: the search input has NO `aria-label`, unlike most controls in this codebase — target it
  by its wrapper class). Reviving full coverage would need a dev-only lever like
  `window.__pickPaletteFromPhotoBytes(base64, mimeType)` mirroring `__importSh3dBytes` — flagged,
  not built (out of scope for a coverage back-fill).

### `drawingSet.ts` print-true SVG sizing must use inline `style`, never a bare `width`/`height` attribute (TODO G2)
The drawing set's `.draw svg { width: 100%; height: 100%; max-height: 150mm }` CSS rule
exists so every sheet's diagram fit-to-page fills its box. Adding real, mm-accurate
sizing per the locked scale ratio (`floorplan/drawingScale.ts:pickDrawingScale`) by
setting a plain SVG `width`/`height` **attribute** (e.g. `width="185.3mm"`) does
**nothing** — SVG/HTML presentational attributes have the LOWEST CSS priority (lower
than any matching selector, even a simple type selector), so the `.draw svg` class
rule silently wins and stretches the element back to 100%, discarding the print-true
size with no visible error. The fix is an inline `style="width:…mm;height:…mm"` on the
`<svg>` element — inline style always wins over an external stylesheet rule (short of
`!important`, which `.draw svg` doesn't use) — verified by screenshotting the captured
export: with the bare-attribute version the floor plan filled the whole sheet
regardless of the stated scale (visually identical at "Scale 1:20" and "Scale 1:200");
with the inline-style fix the same plan renders visibly smaller-than-the-sheet at a
coarser ratio and fills more of the sheet at a finer one, matching the stated scale.
Reuse this pattern for any future per-element mm-true sizing added to a generated
print document (report/BOQ/drawing set) — never rely on a raw `width`/`height` attribute
when a class rule could match the same element.

### Verifying a locked print scale + title-block metadata via a captured export (extends the `window.open` intercept above)
Combine the `window.open` capture-sink intercept (above, "Verifying a new-window
exporter") with plain string assertions on the captured HTML — no need to actually
render/measure the popup for a scale or title-block-content check: parse the
"Scale 1:R @ A4" text straight out of the string with a regex, then verify the G2 mm-math
purely in `page.evaluate` against the live `floorPlan` (`wallLength`-equivalent
`Math.hypot`) rather than trying to read a rendered element's `getBoundingClientRect()`
(brittle under a scrolled/interrupted headless page). Only render the captured HTML
into the main document (`document.open(); document.write(html); document.close()`) for
the FINAL visual-confirmation screenshot, after the string assertions already passed —
this keeps the fast assertions decoupled from the one thing that actually needs a
screenshot. See `scripts/scenarios/drawing-scale-simple.json`.

**Follow-up (user-customizable paper):** `document.open()`/`document.write()` on the
SAME document does NOT navigate — it's still the same JS realm, so `window.__store`
and anything else you stashed on `window` (e.g. `window.__a4Html`/`window.__a4Ratio`)
survive a rewrite; you can safely capture TWO exports in one session (switch
`drawingSetTemplate.paperSize`/`orientation` via `s.setDrawingSetTemplate({...s.
drawingSetTemplate, paperSize:'a3'})` between captures, since the store action replaces
the whole object) and only pay for `document.write` + a screenshot once at the very
end for each variant you want a picture of — do the store-dependent switch-and-capture
work FIRST, stash every captured HTML string, THEN do all the `document.write`+
screenshot pairs back to back. One observed flake: two `document.write` rewrites in
quick succession in the same headless session occasionally hit a Puppeteer "Target
closed" `Page.captureScreenshot` error on the second screenshot (all prior assertion
steps still passed) — if this happens, re-run just the failing variant's capture
+screenshot as its own short scenario rather than re-running the whole thing.

### A scenario that cannot find a selector your unit tests prove exists — restart vite first

Symptom: `waitFor` times out on a selector (`.clr-list`), the console shows **no** React error, and
a happy-dom test rendering the same component finds the element fine.

Cause: the dev server was started while the component was still being edited, and HMR left it in an
inconsistent state. Restarting `npx vite` fixed it with zero code change (v0.31.5.412).

So: when the unit tests and the scenario disagree about whether something renders, suspect the
server before the component. Cheap to rule out, and it cost a debugging cycle to learn.

### `await import(...)` inside an `eval` step is flaky — fire-and-forget instead (F13 cost coverage)

An `eval` step whose body is `(async () => { const m = await import('/src/…'); … })()` fails
intermittently with `Protocol error (Runtime.evaluate): Promise was collected`. It passed on the
first run of `multistorey-cost-coverage-f13.json` and failed on the very next one with no code
change, so treat it as a race, not a bug in your module path.

The reliable shape kicks the import off, parks the result (or the error) on `window`, and lets a
separate `waitFor` step observe it:

```json
{ "name": "load-plan",
  "eval": "(function(){ window.__err=null; import('/src/floorplan/templates.ts').then(m => { … }).catch(e => { window.__err = String(e) }) })()" },
{ "name": "plan-loaded",
  "waitFor": { "store": "window.__err ? (() => { throw new Error(window.__err) })() : (state.floorPlan.upperLevels||[]).length === 1" } }
```

Note the `waitFor` **rethrows** the parked error rather than just timing out — otherwise a genuine
import failure reports as a 30-second timeout with no cause, which is the least useful possible
diagnostic.

### A name-match assertion can pass against the WRONG table (same batch, and it did)

Verifying the F13 cost fixes, the check was "does `Sleeping Loft` appear at least twice in the
report?" It passed — against the **lighting** and **electrical** room tables, which were already
multi-storey-correct. The per-room *furniture* breakdown, the thing actually being fixed, was
never examined, and the screenshot landed on the lighting section.

A room NAME is not evidence when several sections list every room. Assert on something only the
target section emits — here the row's own format, `Sleeping Loft · 4 items · 9.9 m²` — and scroll
to *that* element, not the first name match. Generally: if the string you are asserting on also
appears in a section you did not change, the assertion is measuring the wrong thing.

### Worked example — parametric Staircase geometry (parametricStairs)

Scenario `scripts/scenarios/staircase-r-verify.mjs` (an `.mjs` scenario so it can
`readFileSync` a dumped loft-plan JSON and inject it via `setFloorPlan`): three
shots — a straight flight close-up, an L-shape (landing + return) close-up, and the
stair in a multi-level (loft) context feeding `stairConnectivity`. Camera close-ups
use `window.__three.camera`/`controls` (copy the `aimCam` helper). Place stairs with
`store.setItems([{ defId:'staircase', position:[x,z], rotation, props:{ style, steps,
width, riserHeight, treadDepth, railing } }])`.

**Key finding — a handrail must be ONE continuous sloped rail, not per-step caps.**
The first render had a post + a *short horizontal* rail segment per tread; the caps
sat at each post top but the 0.17 m riser jump left a visible vertical gap between
consecutive caps (reads as a broken/gappy rail — a FAIL). Fix: emit a SINGLE rail box
per flight spanning first→last post, tilted up the flight rake — pitch about X for a
Z-running flight, roll about Z for the turned (X-running) flight of an L/U. The
`Staircase` renderer applies `rotation={[pitch, rot, roll]}` (each rail sets exactly
one of pitch/roll, so Euler order never composes ambiguously).

**Gotcha — a flush rail z-fights the tread edge (structural-soundness harness).** With
the rail's outer face at `width/2 - RAIL_T/2` it was *coplanar* with the tread edge at
the same X; the short per-step caps stayed under the harness's coplanar-overlap
threshold, but the long continuous rail exceeded it (104 cm²) and
`structuralSoundness.test.tsx` failed with a "z-fighting coplanar face pair". Inset the
balusters/rail to `width/2 - RAIL_T` (a ~2 cm gap from the tread edge) — also more
realistic (a set-in guard). Re-shoot after ANY geometry tweak: the inset is 2 cm and
invisible-looking but the harness is exact.

**Gotcha — a probe that HARDCODES a value derived from a source constant goes stale
SILENTLY, and keeps printing a plausible number.** `wood-detail.mjs`'s arm O called
`setSceneSaturation(0.94)` with the comment *"`hueSatSaturation` = BASE_POST_SATURATION
(0.06) + (sceneSaturation - 1), so 0.94 puts the HueSaturation pass at exactly 0"*. That
was correct when it was written. POST-SAT-NEUTRAL then shipped `BASE_POST_SATURATION = 0`
in `src/scene/look.ts`, so 0.94 resolved to `0 + (0.94 - 1) = -0.06`: the arm quietly
stopped being *"post saturation off"* (by then a no-op) and became *"0.06 BELOW neutral"*.
It never errored. It reported a 0.037 chroma drop that reads exactly like a live, shippable
lever — when the honest reading is that the lever is already pulled.
· **The app side was fine and TESTED** (`look.colorGrade.test.ts` pins
  `BASE_POST_SATURATION` to 0). The drift lived entirely in the dev probe, which is outside
  the test net — so "the constant is unit-tested" does NOT protect its consumers in `scripts/`.
· **Symptom to watch for:** an arm whose label describes a state the app already ships should
  read a `meanAbsDiff` of ~0. If a supposed no-op arm moves the picture, the arm is lying about
  what it does — do not write up the delta until you have re-derived the arm from the constant.
· **Fix pattern:** name the magic number after what it historically WAS
  (`HISTORICAL_POST_SATURATION = 0.06`), comment it back to the live constant, and re-point the
  arm at the question still open — here, what the shipped fix keeps buying (chroma 0.601 →
  0.643 restoring the pre-fix baseline, i.e. the fix is worth 0.042 on wood pixels).
· **A Node-scope constant is NOT visible inside `page.evaluate`.** Thread it through as an
  argument (`page.evaluate((k, histPostSat) => …, key, HISTORICAL_POST_SATURATION)`) or the arm
  dies with a `ReferenceError` in browser context. Same family as "when slicing a probe head,
  keep the IMPORTS".

**Gotcha — an NDC POINT is NOT portable between probes, and a bad seed used to
produce a confident number for the SKY.** Each probe sets up its own orbit camera,
so a point measured off `chroma-audit`'s orbit frame does not address the same
geometry in `surface-detail` or `pick-surface`. Copying NDC across probes in `.79`
put a `surface-detail` seed on the sky dome (`Sky.tsx`, unlit `BackSide`
`MeshBasicMaterial`, **198.82 m** out). The probe reported the hit — it always did —
then carried on, masked **58.4%** of the frame as "the painter", and printed
`microcontrast=0.481` as if it were a surface reading. Reporting a suspicious seed is
not the same as refusing it.
· **`surface-detail.mjs` now REFUSES such a seed** (`SEED_MAX_DISTANCE`, default 60 m —
  the flat is ~11 m across and the orbit camera sits ~17 m out): it exits 1 with
  "seed hit the BACKDROP, not the flat … NDC is not portable between probes". The
  `DEF=` path is untouched — the control arm `DEF=wardrobe-3door` still measures, and
  agrees with `wood-detail`'s baseline on all five statistics (chroma 0.601, 97.8%
  past 0.35, mean 92.2, sigma 17.79, microcontrast 0.86).
· **Aim by RAYCAST, not by eye.** `.79` burned four attempts on hand-placed NDC and
  hand-placed pixel boxes: picks meant for a wall top kept landing on the wall FACE,
  and hand-boxed "microcontrast" put an unmapped slab (2.745) ABOVE a mapped face
  (1.544) because the boxes straddled edges and railings. Prefer `DEF=`; when you must
  use a POINT, confirm it with `pick-surface` **in the same probe's framing** first.
· **Simultaneous contrast will lie to you about COLOUR.** The wall tops in the boot
  frame read as cool slate against the warm cream faces. Measured, every one of them is
  WARM (blue minus red is -18 to -32, the same sign and similar magnitude as the faces).
  Sample the pixels before writing "it looks blue".

**Gotcha — `MASK=painter` collapsed to a SINGLE material for anything UNMAPPED.**
The painter mask groups by shared map SOURCE, which is right for clones that share a
texture. With no map there is no source to share, so the grouping fell back to the
seed material OBJECT alone. The wall body is **34 sibling slabs that share a look
without sharing a texture**, so `.80` first measured **10 of 5760 cells (0.2%)** for a
class the census puts at 19% of the boot pose — a microcontrast over 10 cells, quoted
with no warning. Unmapped materials now group by EQUIVALENCE (same type, albedo,
roughness, metalness, and equally unmapped): the same run then masks **515 cells
(8.9%)** with all 34 materials. The mapped path is unchanged — control arm
`DEF=wardrobe-3door` still reads 17 materials, 402 cells, microcontrast 0.862 exactly.
· **`COLOUR=<hex>` seeds `surface-detail` with no coordinates at all.** The apartment
  SHELL has no `defId`, and after `.79` an NDC POINT is known not to be portable
  between probes — so neither existing path could reliably address it. `COLOUR=f1f0ec`
  found 34 meshes, matching `class-id.mjs` exactly, which is how the seed was validated.
· **The same MODE name is NOT the same camera.** `surface-detail MODE=orbit` frames the
  flat smaller than `chroma-audit MODE=orbit`, so the identical class reads 8.9% in one
  and 19.0% in the other. Quote the PROBE as well as the pose.
· **A microcontrast over a class of narrow separated bands is EDGE-dominated.** The wall
  body's 1.408 beats both mapped benchmarks (plaster 0.961, wood 0.862), but much of it
  is slab boundaries against bright interior faces, not surface detail. Read it as an
  upper bound; it refutes "this reads flat", it does not prove "this is richly textured".

**Gotcha — a probe that sets `timeMode:'manual'` still inherits the REAL wall clock's
daylight guard.** `ensureDaylightFirstPaint` runs at FIRST PAINT off the system clock,
BEFORE a probe switches to manual time. So a run started after 18:00 local boots with
`lightsMode:'on'` and every arm silently inherits it. In `.83`, launched at 22:25, all
four hours of a boot sweep resolved to `lights=on` — including the "13:00" arm meant to
represent an unlit daytime boot — and the intended lights-off control read byte-identical
to its pair, a no-op (meta-rule lxxxiii). The same script run at 10:00 would have produced
different numbers from identical arguments.
· **`chroma-audit` now takes `LIGHTS=on|off` and prints `resolved <tier>/<lights>/<mode><hour>`.**
  Pass it explicitly and READ the resolved field; never infer the lighting state from `HOUR=`.
  `walk-tour` already had this option — when a probe lacks it, that is a gap, not a default.
· **This is why "RECORD THE LOCAL TIME of every run" is in the setup rules.** It is not
  bookkeeping: the wall clock silently changes what the app boots into.

**Gotcha — `default-gloom.mjs`'s arms COLLAPSED when DEFAULT-GLOOM shipped (v0.31.5.86).**
The probe exists to compare a `default` arm against a `lightson` arm. Now that the
first-paint guard switches the lights on at every hour, the default IS lights-on: a
run prints `lightsMode=on` for all three arms, so `default` vs `lightson` is a no-op
and any delta between them is noise. Do NOT quote that comparison as a payoff figure.
The daytime payoff on record is `.54`'s 2.3–2.5x, measured before the change.
· **To exercise the guard at all you must fake the SYSTEM clock, not the manual hour**
  (meta-rule xcviii). `ensureDaylightFirstPaint` requires `timeMode === 'system'`, so
  any probe that calls `setTimeMode('manual')` — `chroma-audit`, `surface-detail`,
  `walk-tour` — cannot trigger it. `lights-boot FAKE_HOUR=` and `first-run FAKE_HOUR=`
  pin the page wall clock before load and are the only instruments that can.
· **`lights-boot` prints `time=system/12` regardless of `FAKE_HOUR`** — that field is
  `timeMode`/`manualHour`, and `manualHour` keeps its default while the mode is
  `system`. Two arms at different faked hours therefore print identical header lines;
  that is NOT a failed mutation, but it does mean the header cannot confirm the fake
  landed. Confirm it by A/B against the other code path instead.
