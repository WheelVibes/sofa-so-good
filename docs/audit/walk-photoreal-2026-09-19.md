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
| `phone-swiftshader` | 390×844 | yes | SwiftShader (software) | `weak` | 13:00, 21:00 | off + on | 8 (1 per room) | **16 of 32 captured — arm stopped early, see note** | `walk-photoreal-phone-swiftshader.json` |

Rooms covered (ids from `src/apartment/constants.ts`): `mainBedroom`, `bedroom2`, `bedroom3`,
`corridor`, `bath1`, `bath2`, `kitchen`, `livingDining`. Two poses per room — one standing at the
door looking in, one at the window / main feature — at default eye height, pitch −0.05; the
window pose is repeated at pitch +0.6 (glance-up) at 13:00 lights-off to see the ceilings.
`serviceYard`, `householdShelter` and `acLedge` were not posed (semi-external / no walkable
standing point in the pose list) — they appear only through openings.

Every pose is driven through `window.__walkLook` with `setTimeMode('manual')` + `setManualHour`,
`setLightsMode`, `setQualityTier('realistic')`, `hideLoading()`, callouts dismissed,
`interactiveDegrade` off, 3 s settle per pose and 4 s after each clock/lights change.

**SwiftShader arm, partial and why.** The software arm captured the full 13:00 half (8 off + 8 on)
and was stopped before the 21:00 half: under SwiftShader the `setLightsMode('on')` program compile
alone costs ~24 s (the `z16` LIGHTS-TOGGLE-RECOMPILE row, made painful by software rasterisation)
and the arm was averaging ~8 min per frame in the lights-on state. The 16 frames it did produce
reproduce **W1, W3, W5, W6, W7, W8 and W14** on the software renderer, so the "both renderers"
column below is answered for those; rows marked *(Metal only)* were not reached. Per the OPEN row
`z20` SWIFTSHADER-FLOOR-DIVERGENCE, the software arm's floor is visibly lighter than Metal's at
the same pose, so it is used here only to confirm that a defect is **present**, never for any
luma figure — every number in this document is from a Metal frame.

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
| **W2** | all rooms / all poses / 08:00 vs 13:00 vs 18:30 / lights off / all arms | The daytime band barely moves. 08:00, 13:00 and 18:30 render the same interior: no sun patch on any floor in any room at any hour, no change of shadow direction, no warm low-sun cast at 18:30 — only a thin warm band appears at the top of the window openings. The one window-shaped light patch anywhere in the matrix, on the `bath1` shower screen, sits in **exactly the same place** at 08:00, 13:00 and 18:30. | `phone-metal/05-h8-off-bedroom3-door.png` vs `05-h18p5-off-bedroom3-door.png` — mean abs **8.0/255** over the central 390×600, against a known same-build session variance of 4.7 (`z17`); `02/34/02-h18p5-…-mainBedroom-window` are visually indistinguishable; the static bath1 patch in `desktop-metal/09-h8-off-bath1-door.png` vs `41-h13-off-bath1-door.png` | the visibility lightmap is a static day map scaled by `visDay`; nothing in the shipped set carries a per-hour sun term for the interior — `src/scene/lighting/altitudeCurve.ts` "Constant, not interpolated per hour, and that is deliberate" applies to the chroma, but the *geometry* of daylight is equally static | **high** | (Metal only — arm stopped before the hour sweep) | yes |
| **W3** | `corridor` / both poses / 13:00 / lights off / all arms | At noon with every bedroom door open the corridor is effectively unlit — floor luma **16.2** (max 80) against `bedroom3` **149.9** across an open doorway, ceiling **29.9**. It is *brighter* at 21:00 lights-off (mean abs 25.4 vs the 13:00 frame) than at midday. Bright hard-edged slivers leak at the door reveals and a thin bright stripe runs along the wall-head/ceiling joint. | `phone-metal/40-h13-off-corridor-east.png`, `39-h13-off-corridor-west.png`, `53-h13-off-corridor-east-UP.png`; crops `/tmp/review/crops/corridor-floor-13off.png`, `corridor-ceiling-UP.png`; compare `40-h21-off-corridor-east.png` | no daylight transport between rooms — the baked set gives the windowless corridor ~0 and nothing carries bounce through the door openings; `src/scene/lighting/daylitRooms.ts`, `planAttenuationWalls.ts` | **high** | yes | yes |
| **W4** | `bath2` / window pose / 13:00 + 18:30 / lights off / all arms | A dead-straight **vertical tonal seam** splits the bath2 wall mid-run: left of it luma **13.4**, right **101.7** — a 7.6× step with no corner, no fixture and no geometry change on the line. | `phone-metal/44-h13-off-bath2-window.png`, `12-h18p5-off-bath2-window.png`, `55-h13-off-bath2-window-UP.png`; crop `/tmp/review/crops/bath2-seam-13off.png` | lightmap island / atlas-slot boundary landing mid-wall, or two wall meshes split at that x with different maps — `src/scene/lighting/visibilityLightmap.ts` applier + the bake's island packing | **high** | (Metal only) | yes |
| **W5** | every room / glance-up pose / 13:00 / lights off + on / all arms | **No ceiling luminaire is visible anywhere.** Glance-up frames show a bare ceiling plane in every room, yet lights-on paints a large soft bright blob on that same ceiling and the walk HUD offers "Turn off ceiling light" — glow with no emitter body. | `phone-metal/49-h13-off-mainBedroom-window-UP.png`, `50-…-bedroom2-window-UP.png`, `51-…-bedroom3-window-UP.png`, `56-…-kitchen-counter-UP.png`; the blob in `60-h13-on-bedroom2-door.png`, `62-h13-on-bedroom3-door.png` | the fixture item exists (`src/furniture/lightInteract.ts:63` builds the prompt from a registered emitter; `src/furniture/primitives/CeilingLight.tsx`) but its mesh is not read from below — either flush-mounted inside the ceiling slab, culled, or the glance-up pitch never clears its plane | **high** | yes | yes |
| **W14** | `corridor`, `bath1`, `bath2`, `kitchen` / all poses incl. glance-up / 13:00 + 18:30 / lights off / all arms | A 1–2 px **bright hairline traces the wall-head / ceiling joint** in every dark room, at full brightness against a near-black wall and ceiling — a light leak at the mitre, not a highlight (it follows the joint round corners and is uniform along its whole run). | `desktop-metal/52-h13-off-corridor-west-UP.png`, `53-h13-off-corridor-east-UP.png`, `55-h13-off-bath2-window-UP.png`; `phone-metal/11-h13-off-bath2-door.png`; crop `/tmp/review/crops/corridor-ceiling-UP.png` | wall/ceiling meshes meeting without a shared mitre, so the lightmap's dilate ring (4 px, `docs/audit/interaction-sweep-2026-09-18.md`) bleeds a lit texel onto the unlit face — `src/scene/lighting/visibilityLightmap.ts` + the bake's island dilation | **med** | yes | yes |
| **W15** | `mainBedroom` / door pose / 18:30 / lights **on** / **desktop-metal only** | The **boot loader splash** ("Sofa So Good — Almost ready…") reappears full-screen over a live walk session, ~4 s after a `setLightsMode('on')` at 18:30, hiding the scene entirely. Intermittent: exactly **1 frame in the 254 Metal frames**, found by scanning every frame for a near-uniform cream field (mean 227.4, sd 1.21 over the lower band). | `desktop-metal/17-h18p5-on-mainBedroom-door.png` | the lights-on program compile (`z16` LIGHTS-TOGGLE-RECOMPILE: +31 programs on Metal) suspends long enough for the loading overlay to re-mount — `hideLoading()` was called once in setup and something re-set it; `src/scene/lighting/FurnitureLights.tsx` mount + the loader's suspense boundary | **high** | not seen on SwiftShader (reduced arm, no 18:30) | desktop only in this run |
| **W6** | `bath1` + `bath2` / window pose / all hours / lights on | Both bathroom mirrors render as flat opaque cream panels with a frame — no reflection of the room, no reflection of the fixture, at any hour or lights state. | `phone-metal/58-h21-on-bath1-window.png`, `60-h21-on-bath2-window.png`; crops `/tmp/review/crops/bath1-mirror-21on.png`, `bath2-mirror-21on.png` | `src/furniture/primitives/useMirrorRelevance.ts` — the planar-reflection gate is budgeted and "starts cheap … nothing is granted until the first evaluation"; in a parked walk pose the gate appears never to grant, so both panes stay on the tier-cheap fake-shiny fallback, which at these angles is indistinguishable from painted board | **med** | not tested (SwiftShader arm has no mirror pose) | yes |
| **W7** | `bath1` / door pose / all hours / both lights | The shower screen fills 60 % of the frame as a uniform milky blur — no transmission, no visible fittings behind it, no edge. At the door pose the whole room is hidden behind it. | `phone-metal/09-h8-off-bath1-door.png`, `41-h13-off-bath1-door.png`, `57-h21-on-bath1-door.png`; crop `/tmp/review/crops/bath1-screen-21on.png` | `src/furniture/primitives/GlassMaterial.tsx` roughness/transmission at close range, or a frosted-glass path that degrades to opaque on `weak`/`realistic` | **med** | yes | yes |
| **W8** | any room with a fixture / any pose / any hour / lights **off** | The walk HUD prompt reads **"Turn off ceiling light"** while `lightsMode === 'off'` and the room is visibly dark — the prompt reports the per-item switch, which the global toggle never wrote. | every lights-off frame, e.g. `phone-metal/34-h13-off-mainBedroom-window.png` | `src/furniture/lightInteract.ts:63` `{ action: on ? 'Turn off' : 'Turn on' }` reads `item.props.lightOn`; `FurnitureLights.tsx:43` deliberately keeps `lightsMode` as "the USER's setting and … never written" to items | **med** | yes | yes |
| **W9** | `bath2` / window pose / all hours / both lights | A grey plumbing stack runs floor-to-ceiling straight through the middle of the view, passing **in front of** the mirror and clipping the toilet's silhouette; it has no bracket, no escutcheon and no shadow contact with the tile it sits on, and at 08:00 lights-off it is rendered *bright* against a wall that is near-black — it is clearly not taking the same lighting as the surface it stands on. | `phone-metal/44-h13-off-bath2-window.png`, `60-h21-on-bath2-window.png`, `desktop-metal/12-h8-off-bath2-window.png`; crop `/tmp/review/crops/bath2-mirror-21on.png` | sanitaryware/riser placement in the default utility layout — `src/furniture/defaults/utility.ts` | **med** | (Metal only — no bath2 window pose in the reduced arm) | yes |
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
  and no **shadow acne / peter-panning** was seen in any of the 290 frames.
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
