# Walk-mode photoreal pass — default 4-room flat (review area 1)

Date 2026-09-19 · HEAD `713151c2` (v0.35.9.0, branch `feat/photoreal-adaptive-fallback`) ·
artefacts under `/tmp/review/walk-photoreal/` · scenarios
`scripts/scenarios/review/walk-photoreal-*.json` · **review only, no `src/` changes**.

This is the first pass of the standing review cycle (`/tmp/photoreal-mobile/review-cycle.md`,
rotation item 1). Every frame below was captured in **walk mode**, `realistic` tier, manual clock,
and looked at. Known items already filed as OPEN in `docs/open-graphics-decisions.md`
(`(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches, `z16` LIGHTS-TOGGLE-RECOMPILE,
`z20` SWIFTSHADER-FLOOR-DIVERGENCE) and the residuals in
`docs/audit/interaction-sweep-2026-09-18.md` (kitchen wing blowout, first-switch recompile, fan
POPs) are **not** re-reported as findings; where a frame shows one it is called out in
"Already known" at the end.

## Matrix run table

| Arm | Viewport | Touch | Renderer | Device class | Hours | Lights | Poses | Frames | Scenario |
|---|---|---|---|---|---|---|---|---|---|
| `phone-metal` | 390×844 | yes (`SHOT_TOUCH=1`) | ANGLE Metal, Apple M4 (confirmed in-session) | `weak` | 08:00, 13:00, 18:30, 21:00 | off + on | 16 (8 rooms × 2) + 8 glance-up | **137** | `walk-photoreal-phone-metal-{am,pm}.json` |
| `desktop-metal` | 1200×900 | no | ANGLE Metal, Apple M4 (confirmed in-session) | `capable`, pinned per the playbook gotcha | 08:00, 13:00, 18:30, 21:00 | off + on | same | **137** | `walk-photoreal-desktop-metal-{am,pm}.json` |
| `phone-swiftshader` | 390×844 | yes | SwiftShader (software) | `weak` | 13:00, 21:00 | off + on | 8 (1 per room) | **32** | `walk-photoreal-phone-swiftshader.json` |

Rooms covered (ids from `src/apartment/constants.ts`): `mainBedroom`, `bedroom2`, `bedroom3`,
`corridor`, `bath1`, `bath2`, `kitchen`, `livingDining`. Two poses per room — one standing at the
door looking in, one at the window / main feature — at default eye height, pitch −0.05; the
window pose is repeated at pitch +0.6 (glance-up) at 13:00 lights-off to see the ceilings.
`serviceYard`, `householdShelter` and `acLedge` were not posed (semi-external / no walkable
standing point in the pose list) — they appear only through openings.

Every pose is driven through `window.__walkLook` with `setTimeMode('manual')` + `setManualHour`,
`setLightsMode`, `setQualityTier('realistic')`, `hideLoading()`, callouts dismissed,
`interactiveDegrade` off, 3 s settle per pose and 4 s after each clock/lights change.

**SwiftShader arm — slow but complete.** All 32 frames landed. It is slow enough to be worth
recording: under software rasterisation the `setLightsMode('on')` program compile alone measured
**24 s** (the `z16` LIGHTS-TOGGLE-RECOMPILE row, made painful by the software rasteriser), and the
arm averaged minutes per frame in the lights-on state against seconds on Metal. It reproduces
**W1, W3, W5, W6, W7, W8 and W14**; rows marked *(Metal only)* were outside its reduced pose/hour
set, not contradicted by it. Per the OPEN row `z20` SWIFTSHADER-FLOOR-DIVERGENCE the software
arm's floor is visibly lighter than Metal's at the same pose, so it is used here only to confirm
that a defect is **present** — every luma figure in this document comes from a Metal frame.

### Scene probe (SwiftShader arm, `probe-settle-*` steps)

Two facts from the in-session scene walk are load-bearing for the findings above:

```
FIX hour=13 lights=off  ceilingMeshes=5 [default-main-pendant y=0.00, default-b2-pendant y=0.00,
                                         default-b3-pendant y=0.00, default-ld-pendant-dining y=0.00,
                                         default-k-pendant y=0.00]  (all vis=true)
                        dirLights=["dir int=1.000 pos=6.4,25.0,4.4 shadow=false"]  punctual=0
FIX hour=13 lights=on   … same 5 pendants …  dirLights=[… int=1.000 … shadow=false]  punctual=19
FIX hour=21 lights=off  … same 5 pendants …  dirLights=[… int=0.000 pos=-15.1,-12.6,3.6 shadow=false]  punctual=0
FIX hour=21 lights=on   … same 5 pendants …  dirLights=[… int=0.000 … shadow=false]  punctual=19
```

- **The scene's only directional light has `castShadow = false`.** There is exactly one, its
  intensity is the day/night switch (1.000 at 13:00, 0.000 at 21:00) and it casts no shadow at any
  hour. That is a direct mechanical explanation for **W2** (no sun patch, no shadow direction, no
  low-sun cast) and contributes to **W3** (nothing transports directional daylight through a door
  opening). It also means the sun's *position* — which does move, 6.4,25.0,4.4 at 13:00 vs
  −15.1,−12.6,3.6 at 21:00 — is computed correctly and then not used for anything a walker can see.
- **Five ceiling pendants exist and are all `visible = true`**, one each in `mainBedroom`,
  `bedroom2`, `bedroom3`, `livingDining` (dining) and `kitchen` — yet **not one of them appears in
  any of the 306 frames**, including the eight deliberate glance-up poses. Every one reports
  `position.y = 0.00`. *Caveat: that is a **local** position, so it is only suggestive — if the
  parent group carries the ceiling height the value is meaningless. It is recorded as the first
  thing to check for **W5**, not as proof.* Note also that `bath1`, `bath2` and the `corridor` have
  no pendant at all, which is consistent with those being the three rooms that stay dark.
- `punctual` goes **0 → 19** on the lights toggle and back, matching `z16`'s measured 19 fixture
  lights — the mechanism behind **W1**.

Cross-checks were numeric patches through a temporary `sharp` probe (`./.patch-probe.tmp.mjs`,
deleted after) — luma means over fixed boxes, and mean-absolute 8-bit differences over the
central 390×600 of the phone frames.

**`photographicFill` check:** the flag is `default: true` (`src/features/flags/registry.ts:1108`)
and `FurnitureLights.tsx:52` composes it into `fixturesLevel`, so lights-on at 13:00 is **not** a
no-op — it is in fact the single largest look change measured in this pass (W1). Lights-on at
13:00 was therefore kept in the matrix, not skipped.

## Ranked findings

| id | room / pose / hour / lights / arm | symptom | evidence | probable subsystem | sev | both renderers | both viewports |
|---|---|---|---|---|---|---|---|
| **W1** | all rooms / all poses / **all hours** / lights **on** / all arms | Lights-on collapses the whole flat to one flat cream wash at the *same* level regardless of the hour or how much daylight the room already had — it reads as a global ambient lift, not as lamp pools. | `phone-metal/70-h13-on-kitchen-door.png` vs `61-h21-on-kitchen-door.png`; floor-patch luma at 13:00 **off → on**: corridor 16.2 → 158.8, kitchen 64.5 → 153.4, livingDining 67.5 → 147.3, bath2 110.9 → 162.5, bedroom3 149.9 → 175.9 — five rooms spanning a 9× daylight range all land inside 147–176 | `src/scene/lighting/FurnitureLights.tsx:52` (`fixturesLevel(lightsMode === 'on', …)` is a single global level), `src/scene/lighting/fixtureGlow.ts:7` ("EXACTLY `lightsMode === 'on' ? 1 : 0`"), `src/scene/lighting/altitudeCurve.ts:250` documents the same "no time term at all" shape for the glass | **high** | yes | yes |
| **W2** | all rooms / all poses / 08:00 vs 13:00 vs 18:30 / lights off / all arms | The daytime band barely moves. 08:00, 13:00 and 18:30 render the same interior: no sun patch on any floor in any room at any hour, no change of shadow direction, no warm low-sun cast at 18:30 — only a thin warm band appears at the top of the window openings. The one window-shaped light patch anywhere in the matrix, on the `bath1` shower screen, sits in **exactly the same place** at 08:00, 13:00 and 18:30. | `phone-metal/05-h8-off-bedroom3-door.png` vs `05-h18p5-off-bedroom3-door.png` — mean abs **8.0/255** over the central 390×600, against a known same-build session variance of 4.7 (`z17`); `02/34/02-h18p5-…-mainBedroom-window` are visually indistinguishable; the static bath1 patch in `desktop-metal/09-h8-off-bath1-door.png` vs `41-h13-off-bath1-door.png` | the visibility lightmap is a static day map scaled by `visDay`; and the scene's **one** directional light has `castShadow = false` at every hour (probe above), so no sun geometry can reach the interior — `src/scene/lighting/Lighting.tsx` shadow setup, `src/scene/lighting/shadowFrustum.ts`, `sunPosition.ts` (which does compute a moving sun) | **high** | (Metal only — outside the reduced arm's hours) | yes |
| **W3** | `corridor` / both poses / 13:00 / lights off / all arms | At noon with every bedroom door open the corridor is effectively unlit — floor luma **16.2** (max 80) against `bedroom3` **149.9** across an open doorway, ceiling **29.9**. It is *brighter* at 21:00 lights-off (mean abs 25.4 vs the 13:00 frame) than at midday. Bright hard-edged slivers leak at the door reveals and a thin bright stripe runs along the wall-head/ceiling joint. | `phone-metal/40-h13-off-corridor-east.png`, `39-h13-off-corridor-west.png`, `53-h13-off-corridor-east-UP.png`; crops `/tmp/review/crops/corridor-floor-13off.png`, `corridor-ceiling-UP.png`; compare `40-h21-off-corridor-east.png` | no daylight transport between rooms — the baked set gives the windowless corridor ~0, the one directional light casts no shadow and so carries nothing through a door opening, and the corridor has no pendant of its own (probe above); `src/scene/lighting/daylitRooms.ts`, `planAttenuationWalls.ts` | **high** | yes | yes |
| **W4** | `bath2` / window pose / 13:00 + 18:30 / lights off / all arms | A dead-straight **vertical tonal seam** splits the bath2 wall mid-run: left of it luma **13.4**, right **101.7** — a 7.6× step with no corner, no fixture and no geometry change on the line. | `phone-metal/44-h13-off-bath2-window.png`, `12-h18p5-off-bath2-window.png`, `55-h13-off-bath2-window-UP.png`; crop `/tmp/review/crops/bath2-seam-13off.png` | lightmap island / atlas-slot boundary landing mid-wall, or two wall meshes split at that x with different maps — `src/scene/lighting/visibilityLightmap.ts` applier + the bake's island packing | **high** | (Metal only) | yes |
| **W5** | every room / glance-up pose / 13:00 / lights off + on / all arms | ✅ **FIXED v0.35.9.2 (CEILING-FITTINGS-VISIBLE).** Root cause was NOT a missing mesh — every room's ceiling fixture already has a real body (`CeilingLight.tsx`'s dome/globe/cone/drum pendant or flush disc, incl. `default-bath1-light`/`default-bath2-light`/`default-corr-light`, which the census above missed because it only looked for `*-pendant` ids). It renders nothing because `showCeilingFixtures` (an orbit/dollhouse-editor toggle predating walk mode, to keep a hanging pendant out of the top-down view) **defaults to `false`** — hiding the body app-wide, including from below in walk mode where nothing else stands in for it. Fixed by ALSO showing the body whenever `cameraMode === 'firstPerson'`, regardless of the toggle: `showFixtures = s.showCeilingFixtures \|\| cameraMode === 'firstPerson'`. The orbit default (hidden) is untouched. Unit-tested (`CeilingLight.test.tsx`): no body in orbit at the toggle's default, a body once the toggle is on, and a body in walk mode with the toggle still off (single + cluster pendants). **No ceiling luminaire is visible anywhere.** Glance-up frames show a bare ceiling plane in every room, yet lights-on paints a large soft bright blob on that same ceiling and the walk HUD offers "Turn off ceiling light" — glow with no emitter body. | `phone-metal/49-h13-off-mainBedroom-window-UP.png`, `50-…-bedroom2-window-UP.png`, `51-…-bedroom3-window-UP.png`, `56-…-kitchen-counter-UP.png`; the blob in `60-h13-on-bedroom2-door.png`, `62-h13-on-bedroom3-door.png` | the in-session probe finds **5 pendants, all `visible = true`**, none of which appears in any frame; all report local `position.y = 0.00` (see the probe note above — start there). `src/furniture/primitives/CeilingLight.tsx`, the default layout in `src/furniture/defaults/`, and `src/furniture/lightInteract.ts:63` which builds the HUD prompt from the same registered emitter | **high** | yes | yes |
| **W14** | `corridor`, `bath1`, `bath2`, `kitchen` / all poses incl. glance-up / 13:00 + 18:30 / lights off / all arms | ⚠️ **INVESTIGATED v0.35.9.2, NOT fixed this cycle — narrowed, deferred.** Two of the brief's three hypotheses are ruled out: `RoomCeiling.tsx`'s flat plane is a plain untextured `MeshStandardMaterial` (`CEILING_MAT`) that never carries a lightmap `uv1` at all, so it cannot be the source of a lightmap bleed, and it is NOT a geometric gap — bath1/bath2's real 0.2 m wall/ceiling-height mismatch (room `ceilingHeight: 2.4` vs the plan's global `2.6` the walls build to, `apartment/constants.ts`) is hidden entirely behind the ceiling plane from inside the room and produces no visible seam. The remaining, best-supported hypothesis is the third: `src/scene/lightmapExterior.ts`'s `EXTERIOR_FACE_UV_SENTINEL`/`exteriorBoost` mechanism (a wall's TOP few texels of its own baked atlas slot picking up a bright value from the bake's island dilation, then reading full-brightness through the `vVisUv.x < -1.5` branch in `visibilityLightmap.ts`) — but confirming and fixing that means either a shader-level clamp of the sampled V range near a wall's top edge or a Blender re-bake with wider island padding, both requiring live visual verification this cycle's browser contention (Brief A) and the risk of the fragile core lighting shader (`byte-identical elsewhere` is not checkable blind) made unsafe to ship unverified. Queued for the next cycle with a live browser and the bake pipeline available. A 1–2 px **bright hairline traces the wall-head / ceiling joint** in every dark room, at full brightness against a near-black wall and ceiling — a light leak at the mitre, not a highlight (it follows the joint round corners and is uniform along its whole run). | `desktop-metal/52-h13-off-corridor-west-UP.png`, `53-h13-off-corridor-east-UP.png`, `55-h13-off-bath2-window-UP.png`; `phone-metal/11-h13-off-bath2-door.png`; crop `/tmp/review/crops/corridor-ceiling-UP.png` | wall/ceiling meshes meeting without a shared mitre, so the lightmap's dilate ring (4 px, `docs/audit/interaction-sweep-2026-09-18.md`) bleeds a lit texel onto the unlit face — `src/scene/lighting/visibilityLightmap.ts` + the bake's island dilation | **med** | yes | yes |
| **W15** | `mainBedroom` / door pose / 18:30 / lights **on** / **desktop-metal only** | ⚠️ **INVESTIGATED v0.35.9.2, reclassified — not a `showLoading`/`setLightsMode` bug.** The exact phrase "Almost ready…" is pinned ONLY on the static `#boot-loader` DOM node (`App.tsx`'s `stopBootPhraseRotator('Almost ready…')`) and never appears in `loadingPhrases.json`, the phrase pool the React `LoadingOverlay`/`TierChangeVeil` draw from — so this frame is that STATIC cover reappearing, which needs a real page reload, not a `loading.kind` misfire. Audited every `showLoading` call site (`cameraSlice.setCameraMode`, `uiSlice.enterRoomEditor`/`exitRoomEditor`/`setQualityTier`, `floorPlanSlice.setFloorPlanEditing`/`toggleFloorPlanEditing`): none is reachable from `setLightsMode`, `setManualHour` or `setTimeMode`, and every one is either gated behind an explicit user action never taken mid-walk-pose or an explicitly-disabled default-on A/B flag (`modeSwitchCrossfade`/`tierChangeVeil`, both left at their default in this review) — confirmed by the passing tests already in `uiSlice.loading.test.ts`. Locked in with a new regression test (`uiSlice.loading.test.ts`: a lights/clock change never touches the transition overlay). **Best-supported explanation:** `docs/visual-verification-playbook.md`'s own documented gotcha — "a concurrent agent's dev-server restart… can kill an in-flight scenario… no scenario/harness change was at fault" — a Vite full-reload from another agent's source edit landing in this SAME worktree's dev server mid-session (this review ran while the standing fix cycle's other brief was also committing). Not reproduced or fixed further; re-run only if it recurs with no concurrent worktree activity. The **boot loader splash** ("Sofa So Good — Almost ready…") reappears full-screen over a live walk session, ~4 s after a `setLightsMode('on')` at 18:30, hiding the scene entirely. Intermittent: exactly **1 frame in the 254 Metal frames**, found by scanning every frame for a near-uniform cream field (mean 227.4, sd 1.21 over the lower band). | `desktop-metal/17-h18p5-on-mainBedroom-door.png` | ~~the lights-on program compile (`z16` LIGHTS-TOGGLE-RECOMPILE: +31 programs on Metal) suspends long enough for the loading overlay to re-mount — `hideLoading()` was called once in setup and something re-set it~~ — ruled out; see reclassification. `src/scene/lighting/FurnitureLights.tsx` mount + the loader's suspense boundary | **high** | not seen on SwiftShader (reduced arm, no 18:30) | desktop only in this run |
| **W6** | `bath1` + `bath2` / window pose / all hours / lights on | Both bathroom mirrors render as flat opaque cream panels with a frame — no reflection of the room, no reflection of the fixture, at any hour or lights state. | `phone-metal/58-h21-on-bath1-window.png`, `60-h21-on-bath2-window.png`; crops `/tmp/review/crops/bath1-mirror-21on.png`, `bath2-mirror-21on.png` | `src/furniture/primitives/useMirrorRelevance.ts` — the planar-reflection gate is budgeted and "starts cheap … nothing is granted until the first evaluation"; in a parked walk pose the gate appears never to grant, so both panes stay on the tier-cheap fake-shiny fallback, which at these angles is indistinguishable from painted board | **med** | not tested (SwiftShader arm has no mirror pose) | yes |
| **W7** | `bath1` / door pose / all hours / both lights | The shower screen fills 60 % of the frame as a uniform milky blur — no transmission, no visible fittings behind it, no edge. At the door pose the whole room is hidden behind it. | `phone-metal/09-h8-off-bath1-door.png`, `41-h13-off-bath1-door.png`, `57-h21-on-bath1-door.png`; crop `/tmp/review/crops/bath1-screen-21on.png` | `src/furniture/primitives/GlassMaterial.tsx` roughness/transmission at close range, or a frosted-glass path that degrades to opaque on `weak`/`realistic` | **med** | yes | yes |
| **W8** | any room with a fixture / any pose / any hour / lights **off** | ✅ **FIXED v0.35.9.2 (LIGHT-PROMPT-EFFECTIVE-STATE).** `fixturesLevel` (`scene/look.ts`) returns exactly 0 whenever `lightsMode !== 'on'`, so with the scene-wide switch off NO fixture emits regardless of any item's own `lightOn` flag — toggling one is a real write with no visible effect. Rather than mislabel that dead interaction, `LightPrompt.tsx` now reads `lightsMode` and suppresses the prompt entirely while the global switch is off (no "Turn on"/"Turn off" is offered until lights are on); with lights on the prompt is unchanged. Unit-tested (`LightPrompt.test.tsx`). The walk HUD prompt reads **"Turn off ceiling light"** while `lightsMode === 'off'` and the room is visibly dark — the prompt reports the per-item switch, which the global toggle never wrote. | every lights-off frame, e.g. `phone-metal/34-h13-off-mainBedroom-window.png` | `src/furniture/lightInteract.ts:63` `{ action: on ? 'Turn off' : 'Turn on' }` reads `item.props.lightOn`; `FurnitureLights.tsx:43` deliberately keeps `lightsMode` as "the USER's setting and … never written" to items | **med** | yes | yes |
| **W9** | `bath2` / window pose / all hours / both lights | ⚠️ **Checked v0.35.9.2 whether the "fade with its wall" shortcut was trivial — it is not, deferred.** `PlumbingFittings.tsx` already fades ANY wall-mounted fitting (incl. `soil-pipe`) to zero scale while its host wall is translucent in orbit (`f.wallId === null` is the only opt-out, for floor-anchored fittings); `plumbingModel.ts:resolvePlumbingFittings` either snaps a soil-pipe flush onto the nearest wall face within `FIXTURE_SNAP_M` (giving it a real `wallId`, so it already fades) or drops the point entirely (`continue`) when no wall is in reach — there is no code path that leaves a rendered stack with a null `wallId`. So the fade mechanism this row asked for is already correct and unit-covered; the actual complaint (mid-room position, no shadow contact, wrong lighting response) is a WALK-MODE placement/lighting question, not an orbit-fade one, and needs the same live-browser verification W14 does. A grey plumbing stack runs floor-to-ceiling straight through the middle of the view, passing **in front of** the mirror and clipping the toilet's silhouette; it has no bracket, no escutcheon and no shadow contact with the tile it sits on, and at 08:00 lights-off it is rendered *bright* against a wall that is near-black — it is clearly not taking the same lighting as the surface it stands on. | `phone-metal/44-h13-off-bath2-window.png`, `60-h21-on-bath2-window.png`, `desktop-metal/12-h8-off-bath2-window.png`; crop `/tmp/review/crops/bath2-mirror-21on.png` | sanitaryware/riser placement in the default utility layout — `src/furniture/defaults/utility.ts` | **med** | (Metal only — no bath2 window pose in the reduced arm) | yes |
| **W10** | `kitchen` / counter pose / 21:00 / lights on | The service-yard opening is a **pure black rectangle** at night while the service-yard floor immediately below it is fully lit — a hole in the shell, not a dark room. (The daytime half of this opening blowing out is the already-known kitchen wing residual; the night void is the new half.) | `phone-metal/62-h21-on-kitchen-counter.png`, `desktop-metal/46-h21-off-kitchen-counter.png` (void is present at 21:00 with the lights **off** too); crop `/tmp/review/crops/kitchen-SY-void-21on.png` | the semi-external service yard gets neither the estate night sky nor the interior fixture set — `src/scene/lighting/daylitRooms.ts` / the SY aperture in `constants.ts:wall-ext-SY-W` | **med** | (Metal only) | yes |
| **W11** | `mainBedroom` / door pose / all hours / all arms | Standing at the main-bedroom door the camera ends up flush against the wardrobe: a 3 m featureless grey slab fills the whole frame with a single hard vertical seam. Walk collision allows the eye to reach a surface with no stand-off, and the wardrobe carcass has no material detail at that range. | `phone-metal/01-h8-off-mainBedroom-door.png`, `33-h13-off-…`, `49-h21-on-…` | walk collision radius / near-plane vs. furniture bounds in `src/scene/cameras/FirstPersonCamera.tsx`; wardrobe material at 0.3 m in `src/materials/furnitureMaterials.ts` | **low** | (Metal only) | yes |
| **W13** | `bedroom2` / door pose / all hours / both lights / **desktop-metal** (clearest) | The door leaf filling the left third of the frame at ~0.3 m shows the veneer as smeared low-frequency horizontal bands — no pore, no edge chamfer, no handle-side shadow; it reads as a stretched texture rather than wood. | `desktop-metal/03-h8-off-bedroom2-door.png`, `19-h8-on-bedroom2-door.png` | door-leaf UV scale / material in `src/materials/` + `src/furniture/primitives/` door geometry | **low** | (Metal only) | more obvious at 1200×900 |
| **W12** | `bath2` / window pose / 21:00 / lights on | The bath2 south window renders as an opaque cream panel exactly the tone of the tile around it — no night sky, no lit estate — while every bedroom window at the same hour correctly shows the lit HDB block opposite. | `phone-metal/60-h21-on-bath2-window.png` against `52-h21-on-bedroom2-window.png` | obscure/frosted bath glazing may be intended, but it takes the interior wash rather than any exterior term — `src/scene/lighting/windowLightModifiers.ts`, `Window.tsx` glass day/night split | **low** | (Metal only) | yes |

## Looks right

- **21:00 lights-off is the best-looking state in the whole matrix.** The lit estate through the
  bedroom and living windows, the cool blue interior falloff, and the warm pool the corridor floor
  lamp throws down the corridor all read as a photograph
  (`phone-metal/34-h21-off-mainBedroom-window.png`, `38-h21-off-bedroom3-window.png`,
  `39-h21-off-corridor-west.png`).
- Window **grille** geometry, sills and reveals are clean at every hour — no z-fighting, no
  floating, no gap at the jamb, and the grille bars read correctly against both the day sky and
  the night estate.
- **Living/dining** at every hour and both lights states is consistently the most convincing room:
  correct wall/floor tonal separation, believable furniture contact shadows, the ceiling fan
  reading solid (`48-h13-off-livingDining-window.png`, `64-h21-on-livingDining-window.png`).
- No **z-fighting**, no **estate popping or seams**, no visible **tiling**,
  and no **shadow acne / peter-panning** was seen in any of the 306 frames.
- Doors, door frames, skirting-line and AC units sit flush — no floating or sunk fittings other
  than W9.
- The HUD (measure pill, menu, joystick, home button) never overlapped scene content in a way that
  hid a defect, at either viewport.

## Top 5 recommended next fixes

1. **W1** — make lights-on a *local* term. Today it is one global level; it should scale against
   the room's existing daylight so that switching the lamps on at 13:00 changes almost nothing and
   at 21:00 changes everything. Biggest single gap between the app and "inside the flat".
2. **W2** — give the interior a per-hour daylight term: at minimum a moving sun patch and a
   shadow direction that tracks `sunPosition`, even if the bake stays static and only a dynamic
   key light is added on top.
3. **W3** — carry daylight through door openings into the corridor (and bath2). A windowless
   corridor between four daylit rooms at noon must not be darker than it is at 21:00.
4. **W5** — make the ceiling luminaire visible from below. A glow with no emitter body is the
   most immediately "computer-graphics" tell in the lights-on frames.
5. **W4** — chase the bath2 vertical seam to its lightmap island; it is a hard 7.6× step on a
   flat wall and is the kind of artefact that reads as a bug rather than as lighting.

## Already known (seen, not filed)

- Ceiling **lightmap blotches** in every room's glance-up frame
  (`51-h13-off-bedroom3-window-UP.png`, `56-h13-off-kitchen-counter-UP.png`) — filed `(ah)`.
- **Kitchen wing blowout** through the service-yard opening in every daytime kitchen-counter frame
  (`46-h13-off-kitchen-counter.png`) — known residual,
  `docs/audit/interaction-sweep-2026-09-18.md`.
- **Window pane luminance**: the north panes sit at mean luma 209–226 with only 0.03–0.10 % of
  texels at ≥254 — the same order the OPEN row `(l)` WINDOW-LUMINANCE already records. Not
  re-reported.
