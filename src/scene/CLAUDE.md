# src/scene — R3F rendering rules


Area rules for the 3D scene. System details in `docs/ARCHITECTURE.md`.

> **Tier vocabulary changed on 2026-09-03 (`v0.31.7.68`) — read this before any tier name below.**
> The four rungs `performance` / `medium` / `high` / `maximum` were replaced by two **modes** and a
> **device class** that scales whichever mode is active:
>
> | old rung | is now |
> | --- | --- |
> | `performance` | `performance` / `weak` |
> | `medium` | `performance` / `capable` |
> | `high` | `realistic` / `weak` |
> | `maximum` | `realistic` / `capable` |
>
> The settings objects are **byte-identical** across that mapping (pinned in `quality.test.ts`
> against hardcoded copies), so every measurement recorded below is still a fact about the build
> that produced it and is still reachable today — just under a different name. **Measured numbers
> in this file deliberately keep their original rung names**; rewriting them would misreport what
> was run. Live *rules* use the new vocabulary.
>
> Two traps that follow from the mapping. First, `medium` became a *device variant of
> `performance`*, not its own mode — so any gate written as `tier === 'performance'` now catches
> what used to be Medium, which is how `shadowFilterForTier` nearly lost soft shadows for most
> users. Gate on the SETTING (`shadowMapSize > 0`), not the name. Second, the adaptive ladder moves
> the **device class**, never the mode: the mode is user intent.

- **The room probe is SPECULAR-ONLY by construction, and the roughness SCALAR is a trap
  (ROOM-PROBES, R7-L, `v0.35.16.0`).** `lighting/boxProjectEnv.ts` box-projects a per-room cubemap
  into `getIBLRadiance` and leaves `getIBLIrradiance` byte-identical **and `material.envMap`
  null**. That is the whole double-count defence: the lightmap owns diffuse (`replace` mode
  *assigns* `indirectDiffuse`), and the probe is not reachable from the diffuse path at all, so
  there is no tuning value that can leak it. Measured in linear at the calibrated poses: matt
  wall / opposite wall / rug / ceiling all **0.0** counts. Five things that were learned the hard
  way:
  1. **`material.roughness` is 0.85 on every procedural finish** — `materials/cache.ts` puts the
     painter's value in a `roughnessMap` and three multiplies the two. A scalar candidate test
     therefore rejected `wall-tile-white`, the glazed tile the whole feature was diagnosed on, and
     the first A/B moved the steel sink and left the tile at **0.0 linear counts**. Use
     `effectiveRoughness`.
  2. **Rank rooms by area × `(1 − r/max)²`, never area.** Unweighted area picked
     `mainBedroom, corridor, bath1, livingDining` and dropped the KITCHEN: a 10 m² vinyl floor at
     0.49 outweighs a small splashback at 0.14, and at 0.49 the probe is worth 0.0 counts.
  3. **VRAM is the cost, and it is quadratic in the cube.** `3·max(N,112) × 4N` at RGBA16F = 6.0 MB
     per room at 256. Every one of the default flat's 11 rooms has a candidate mesh, so unbounded
     it allocated **69 MB**. `ROOM_PROBE_MAX_ROOMS = 4`.
  4. **`roomProbeResolution` cannot be chosen freely**: `textureCubeUV` reads `CUBEUV_*`
     preprocessor macros three derives from the bound `envMap` (`WebGLProgram.js:691-693`), one
     set per program, so the two PMREMs must match — and `PMREMGenerator` floors its source to a
     power of two, which is why 192 pairs with 128.
  5. **Compose, never replace, `onBeforeCompile` and `customProgramCacheKey`.** The lightmapped
     shell materials already own both.
- **A two-boot A/B of this app is not attributable, and one measured frame was 17 counts dark
  (R7-L).** Two boots of the SAME build, same pins, same poses measured **552/1320 vs 480/1224**
  lightmap key lookups and **184/440 vs 160/408** applied candidates, and the second boot rendered
  the living/dining pose at frame mean **85.1 against 102.1** — a difference four times larger
  than the feature under test. Every ROOM-PROBES number was therefore taken **inside one boot** by
  flipping the `roomProbeMix` uniform (`scripts/scenarios/room-probes-ab.json`), which holds the
  load state, the warm state and the hit rate identical. The same caution applies to anything else
  measured across a `navigate` step. Related: measure cost through `__three.advance`, not
  `gl.render` — the latter skips the composer, and the two-boot frame times it produced (8.16 ms
  "off" vs 5.56 ms "on") were pure program-warm noise, 324 vs 190 programs resident.
- **KTX2 registration is RENDERER-BOUND, and the lightmaps are a DATA texture that must never be
  tagged sRGB (R7-H, `v0.35.14.0`).** `src/scene/ktx2.ts` + `Ktx2Controller.tsx` are the
  `AnisotropyController` pattern for `KTX2Loader.detectSupport( renderer )`: it reads the live
  context's compressed-texture extensions, and `load()`/`parse()` **throw** until it has run
  (three r184, `KTX2Loader.js:361/393`), so there is no boot-time hook and never was. Four rules:
  · **Mount `<Ktx2Controller />` FIRST inside a Canvas, and keep the bind in `useMemo`.** drei's
    `useGLTF` starts its fetch *during render*; effects commit after the whole subtree has
    rendered, so an effect-based bind is ordered after the first GLB request.
  · **drei does NOT auto-wire a KTX2 loader** — `decoders.ts` claimed it did for months, and on
    that false claim no shipped GLB could carry `KHR_texture_basisu`. It reaches the shared
    `GLTFLoader` through `gltf/loaderSecurity.ts:secureGltfLoader` (the `extendLoader` hook), which
    runs on every `useGLTF` call.
  · **ONE loader.** three warns that each instance downloads its own transcoder and allocates its
    own worker pool. On a context restore with a CHANGED format set, `bindKtx2Renderer` replaces
    the instance rather than re-detecting: `detectSupport` only writes `workerConfig`, which is
    captured into each worker at creation, and three's `dispose()` revokes `workerSourceURL` while
    leaving `transcoderPending` set, so a disposed instance can never rebuild its workers.
  · **A lightmap is DATA.** The set stores `pow(v, encode)` and the shader samples the raw texel;
    `KTX2Loader` reads the container's DFD and will tag an sRGB-marked file `SRGBColorSpace`,
    inserting a transfer the PNG set never had. The encoder writes no sRGB flag AND
    `prepareVisibilityTexture` pins `NoColorSpace` — two guards, because this is exactly the class
    of change `IRRADIANCE_GAIN`'s hard-equality test exists to catch. Same reason the encode sets
    `isYFlip: true` (compressed textures ignore `flipY`) and `enableRDO: false`.
  Measured format call (UASTC for the lightmaps, ETC1S for ordinary albedo), the before/after
  numbers and the calibration guard (`scripts/dev-probes/ktx2-lightmap-ab.mjs`):
  **`docs/developer/ktx2-textures.md`**.

- **A mesh that SHARES another's geometry collides with it in the bake (BAKE-TWIN-COLLISION,
  v0.34.1.29).** `lightmapKey`/`geometry_key` hash world-space vertices, and `bake_material.py`
  names each output file by that key — so two objects sharing a `BufferGeometry` at the same
  transform write the SAME file, and the second one wins. The wall-reveal depth twins did exactly
  that: `colorWrite: false` depth-only material, nothing to contribute, baking all-zero maps over
  **24 of 161** real wall maps. Fixed with `noExport` on the twin. **Any future render helper that
  reuses a real mesh's geometry must carry `noExport`**, or it will silently delete that mesh's
  lightmap.

- **The lightmap-key loss is not in the app's export — measured (EXPORT-ROUNDTRIP, v0.34.1.24).**
  `buildExportRoot` preserves every key (1151/1151 against the live scene) and a full GLB serialise
  + re-parse in three preserves every surviving key exactly, so quantisation and transform
  flattening are ruled out. The GLB does drop 43 % of meshes — `GLTFExporter` defaults to
  `onlyVisible: true` and 502 of 1193 export-root meshes are invisible — but that drop is CORRECT:
  the 43 bake-eligible ones among them are zero-thickness 4-vertex planes at storey height sitting
  coincident with real wall faces (render helpers), so exporting them would duplicate surfaces onto
  the walls. **Do not "fix" this by flipping `onlyVisible`.**
- ⚠️ **The orphan rate is dominated by EXPORT STATE, and most previous figures compared two
  different states (v0.34.1.28).** Held to one live-key set: a fresh export from the app's default
  boot state orphans **0.8 %**, the same export posed to walk with lights off orphans **5.9 %**, and
  the shipped set orphans **16.9 %**. So a re-bake IS a large win (correcting v0.34.1.10), and
  hiding the pick planes changes nothing (1 → 1, refuting v0.34.1.26). **Always dump live keys and
  export the GLB from the SAME scene state**, or the measurement invents orphans.
- ⚠️ **The `finishTarget` wall planes are DISPLAY geometry — do NOT exclude them
  (v0.34.1.30).** `v0.34.1.26` called them "pick-only" on the strength of hiding all 129 and seeing
  the frame move only 3.11 counts. **That measurement was invalid**: `WallSegment`'s `FacePlane`
  *is* the surface the camera sees (its own comment says so), the wall body beneath it is plain
  structural `#f1f0ec`, and the default wall finish is `wall-paint-white` `#f5f5f0` — **the same
  off-white, 4 counts apart**. Hiding the finish layer on the default flat is invisible because it
  is white-on-white; on a tiled bathroom or a coloured feature wall it would be obvious. Excluding
  them would ship a GLB whose every wall renders flat structural grey. All five
  `finishSurfaceUserData` call sites produce display geometry (`finishSurfaceExport.test.ts` pins
  this).
- **Changing shell geometry ORPHANS baked lightmaps, silently (LIGHTMAP-KEY-AUDIT, v0.34.1.8).**
  `lightmapKey` hashes WORLD-SPACE vertices, so a re-cut door opening or a changed wall join makes
  a new key and the map baked for the old geometry matches nothing. The surface then falls back to
  the flat analytic fill and renders ~19 counts dark — with no error, no failed test and a
  plausible screenshot. Measured on the shipped set: **40 of 195 maps (20.5 %) orphaned**, caused
  by this arc's own HDB-SCALE-AUDIT (`v0.33.2.10`) and WALL-COLLINEAR-JOIN (`v0.33.2.12`).
  **Run `scripts/dev-probes/lightmap-key-audit.mjs` after any `src/apartment/` geometry change.**
  ⚠️ **But a re-bake does NOT fix it** (REBAKE-REFUTED, `v0.34.1.10`): a bake taken from an export
  made minutes earlier orphans **48 of 200** maps against the shipped set's 40 of 195. The lossy
  step is the EXPORT — the bake only sees the scene through `buildExportRoot`'s GLB, and something
  there moves vertices past the millimetre rounding the key uses. Fix the round trip, not the
  asset. Note `unmatchedMeshes` in that output is NOT a defect
  count — it is mostly the estate backdrop and sub-threshold meshes.

- **The baked lightmap covers a QUARTER of the frame, and the whole-frame agreement with physics is
  two errors cancelling (LIGHTMAP-COVERAGE, measured v0.34.1.7).** At the default living/dining
  pose the app's mean sits 4.7 counts from a physical Cycles reference — but split by whether a
  pixel responds to the baked-GI gain, **lightmapped surfaces (25.6 % of the frame) are +35.5
  counts TOO BRIGHT** and **analytic-fill-only surfaces (74.4 %) are −18.6 TOO DARK**. The applier's
  own log says **318/874 key lookups match (36 %)**; by class, walls are 6/13 and the floor is
  **0/1**. The ceiling is mapped and the walls and floor are not.
  **Consequences for anyone tuning this:** `IRRADIANCE_GAIN` is not a lever — doubling it moves the
  median 1.0 count and pushes p95 from +20.8 to +31.8, because it only reaches a quarter of the
  picture. Neither is the hemisphere/ambient fill balance, nor the sky tint. Raise the hit rate
  first; any gain fitted against a whole-frame statistic before then is fitting the cancellation.

- **The baked lightmaps are RGB and carry spatially-varying chroma; the shader reads `.r`
  (LIGHTMAP-CHANNEL, measured v0.34.1.5).** Over 3.28 M lit texels the shipped set means
  **R 99.3 / G 127.5 / B 143.1** — sky-tinted, as daylit indirect should be — and the hue varies
  both within a map (r-fraction spatial sd 0.033) and across maps (r-fraction p05→p95
  0.232→0.309). `visibilityLightmap.ts` samples one channel as a scalar and re-supplies colour as a
  single global `vec3 visGain`, so every surface gets indirect light of the same hue. Two
  consequences, both measured against a physical Cycles reference: the app's chroma range is 35 %
  narrower than physics, and because `.r` on a blue-dominant bake is **0.810 of luminance with an
  sd of 0.100**, the spatial term is under-read by 1.235x on average and by a factor that *varies*
  ±12.4 % — which `IRRADIANCE_GAIN` absorbs on the mean and cannot absorb per texel. If you change
  the sample, change BOTH: divide the gain by the mean ratio, and neutralise `visGain`'s tint, or
  you will double-apply the sky colour.

- ⚠️ **The sun does NOT enter the default flat's windows in September, and that is correct — do not
  "fix" the missing sun patch (SUN-PATCH, measured `v0.35.10.0`).** Every window in the default plan
  faces **NORTH**: `apartment/constants.ts` cuts glazing only into `wall-ext-N-west` (main bedroom +
  bedroom 2), `wall-ext-N-east` (bedroom 3) and `wall-ext-NE-jog-S` (living/dining), plus two
  high-sill bath vents onto the AC ledge / service yard. There is **no east or west glazing at all**.
  At 1.35°N on 19 Sep, `sunPosition.ts` puts the sun at azimuth **88.6° compass at 08:00**
  (altitude 15.2°) and **271.4° at 18:30** (altitude 7.3°) — within 1.4° of due east and
  due west — so `cos(incidence)` on a north pane is **0.024**. A real flat with this glazing gets no
  sun patch on that date; it does from roughly early April to early September, when the declination
  exceeds the latitude and the rising sun is north of due east, and the model already produces that.
  **The beam path itself is not broken**: hiding the one `DirectionalLight` at the bedroom-2 window
  pose at 08:00 moves the frame **1.22** counts at the shipped `orientationDeg` 0 and **mean abs
  6.76/255, max delta 132, 25.1 % of pixels moving >8** at `orientationDeg` 270 (the sun brought
  round normal to the glazing) — a hard-edged patch. Two traps that cost four wasted arms of that
  experiment, recorded so nobody re-runs them:
  1. **Writing `light.intensity` from a probe does nothing.** `Lighting.tsx`'s `useFrame` assigns
     `sunRef.current.intensity = cur.sun * wx.sun` every frame, so an `intensity = 0` (or `× 6`)
     poked in from a `setInterval` is reverted before the next render and the frame is **exactly**
     unchanged — which reads as "the sun contributes nothing", the opposite of the truth. Write
     `light.visible` instead: nothing in the frame loop touches it.
  2. **`setOrientationDeg` mid-session did not move the render** in a walk pose that had already
     settled, while setting it in the scenario's `setup` step before `sceneReady` did. Pin the
     orientation at setup for any sun-geometry experiment.
  Also: `castShadow` reads **`true`** with `shadow.mapSize` 1024 at every daylight hour on Metal. A
  probe that reports `false` is reading either SwiftShader (`SOFTWARE_REALISTIC_FLOOR` sets
  `shadowMapSize: 0` by design) or the adaptive ladder's `autoShadowsOff` after a lights-on compile
  stall — pin `setAutoShadowsOff(false)` and re-pin `deviceClass` after every lights toggle.

- **Three light levels now carry a TIME term that `lightsMode` and `daylightFromAltitude` did not
  (v0.35.10.0).** All three are pure functions in `lighting/altitudeCurve.ts`, all three are exact
  literals at the calibrated end, and all three are flagged with a bit-identical off state.
  1. **`skyDiffuseRatio(alt)`** — Kasten & Czeplak (1980) clear-sky `G = 910·sin h − 30` W/m²,
     normalised at 75° of altitude and returning **the literal `1.0` at and above it**. That
     exactness is the whole safety argument: Singapore's 13:00 is 89.6°, so every frame the
     Cycles calibration and the audit docs were shot at is untouched to the bit.
  2. **`bakedDayLevel(alt)`** drives `setVisDayLevel`, replacing `daylightFromAltitude` — which is a
     NIGHT ramp and **saturates at 1 for every altitude above the horizon**. Measured live on Metal
     before the change, `visDay` read exactly 1 at 08:00, 13:00 AND 18:30, so all **184** mapped
     shell surfaces rendered their 13:00 bake at every daylight hour and the whole daytime band moved
     8.0/255 against a 4.7-count session variance. It takes `BAKED_DAY_VARIATION` (0.6) of the
     physical swing, which is a **look call stated as one** — the raw ratio puts 18:30 at 0.101 of
     noon and the app's `grade()` exposure only spans a third of a stop between those hours, where a
     real camera would open up several.
  3. **`lampDaylightWeight(alt)`** weights the fixture contribution, and **both halves of one lamp
     must take it** — the point lights in `FurnitureLights.tsx` *and* the `lampBounce` uniform in
     `VisibilityLightmaps.tsx`. The lamp FLUX is never changed, because that is what sets the
     calibrated 21:00 frames; only the ratio moves. It rides `skyDiffuseRatio`, **not**
     `daylightFromAltitude`, for the same reason `look.ts:fixturesLevel` does: the night ramp calls
     18:30 (sun 7.3° up) full daylight and would switch the lamps down an hour before dark.
     `setFixtureGlow` deliberately keeps the bare switch — a switched-on lamp SHADE reads lit at
     every hour, and that signal also drives the fixture emissives and the Fireplace.
  ⚠️ **The W1 defect was NOT any of the obvious suspects, and each was ruled out by measurement
  rather than by reading.** `photographicFill` is not it — `ui.photographicLook` is **`false` by
  default**, so `fixturesLevel` returns 1 whenever the lights are on and the flag's presence tells
  you nothing. Tone mapping is not it (`toneMappingExposure` 1.38 at 13:00 in **both** lights
  states). `iblFillScale`/hemisphere+ambient is not it (hemi 0.330 / amb 0.105 at 13:00 in both).
  And `lampBounce` does not *replace* `visDay` — the GLSL is a sum. It was simply the lamp
  magnitude: `punctual` 0 → 19 and `lampBounce` 0 → **0.462**, against a healthy daylit wall's baked
  term of 0.5–1.1 in the same irradiance units.

- **An UNMAPPED shell mesh beside a mapped one is a hard step, and the trim is all unmapped
  (LIGHTMAP-NEIGHBOUR-INHERIT + WALL-HEAD-CLAMP, v0.35.10.2).** The bake's `--min-area` (1.0 m²) and
  `applyVisibilityLightmaps.ts:MIN_SPAN_M` (1.5 m) both drop the small shell meshes, and a mapped
  surface renders `max(visLit, visAnalytic*visSpill)` where an unmapped one renders the WHOLE
  analytic fill — 8.2 → 124.1 counts across ONE pixel on the bath2 south wall at x = 4.705, where
  two wall meshes meet (W4), and the same thing along every skirting and cornice (W14). Fixed by
  letting a receiver sample its HOST's map at its own place on it (`lightmapNeighbour.ts` picks the
  donor: slab-like, containing, tightest; `lightmapUv.ts`'s `bounds` builds the `uv1` in the donor's
  frame). 530 meshes inherit, 522 material clones — and that costs **+3 shader programs** (244 →
  247, real GPU census), because the injected source is identical and `customProgramCacheKey` is
  constant, so three reuses the program. ⚠️ **The bathroom half of W14 is a DIFFERENT bug and the
  dilation/sentinel hypothesis is refuted** — a raycast lands on ordinary mapped meshes. `bath1`/
  `bath2` have `ceilingHeight: 2.4` against walls built to 2.6, so the wall carries a 200 mm PLENUM
  above its own ceiling which the bake correctly renders at **8.2–11.1 against 0.00 inside the
  room**; a linear filter bleeds it across the topmost visible pixel row at a 20× ratio. A
  per-material `visVRange` (`ceilingClampV`) stops the sample two texels short of the ROOM's ceiling
  — 9 meshes, `(0,1)` and therefore identity everywhere else. Wall-head max 166.7 → 62.0.

- **A mitred wall body's own end face can be its own donor (MITRE-END-INHERIT, v0.35.11.2).**
  `MITRE-SEAM-IN-REVEAL`'s sentinel was a fallback, not the answer: `applyMiter` only shears the
  along-axis coordinate, so every mitred vertex still sits at an exact thickness extreme and
  shares that edge with one of the wall's OWN room-facing caps. `lightmapMitre.ts:
  computeMitreEndInheritUv` forces the thickness axis, resolves the occupied row the way
  `computeBoxAtlasUv`'s own mirror correction does, and insets one texel from the atlas margin;
  falls back to the sentinel only when neither thickness row is occupied. Pure correction, no flag.

- **A mapped surface has a DAYTIME floor as well as a night one (MAPPED-DAYLIGHT-SPILL,
  v0.35.10.0).** LIGHTMAP-NIGHT-FLOOR gave `replace` mode a crossfade back to three's analytic fill
  *after dark*; the same hole exists by day for a room the bake never reached. The windowless
  corridor's dome-only bake sees no aperture and returns ~0, so at noon its floor measured **16.2**
  against `bedroom3`'s 149.9 across an **open doorway** — and it was *brighter at 21:00 lights-off*
  than at midday, because that is when the crossfade handed the fill back. The injected assignment is
  now `visAnalytic * visNight + max( visLit, visAnalytic * visSpill )`.
  **`max`, not `+`, and this is the load-bearing part**: a sum would re-open the `.67` double-count
  that is the entire reason `replace` discards the fill, whereas `max` leaves every well-baked
  surface at exactly its calibrated value (the bake is larger there, and a comparison is not an
  arithmetic perturbation) and lifts only the surfaces sitting at the floor. `DAYLIGHT_SPILL_K` is
  **0.28** — the analytic fill is the visibility-BLIND skylight, i.e. roughly what a surface with a
  full sky view receives, so k reads directly as the corridor-to-daylit-room ratio a real flat shows
  (0.2–0.35). Measured after: corridor 4.4 → **75.1** at 13:00, `mainBedroom` and `kitchen`
  byte-identical, `livingDining` +2.1.

- **Baked visibility lightmaps (`lightmap*.ts`, `visibilityLightmap.ts`) — ten rules that are
  load-bearing, all measured.** They correct the fill's *visibility-blindness*: every surface
  currently gets the same skylight whether or not it can see the sky, which is a ~3× error on a
  wall in a normal living room. Behind `visibilityLightmap`, off by default. Full pipeline in
  `docs/ARCHITECTURE.md`.
  1. **The shader injection owns its own sampler, uniform and `uv1` varying — do NOT move it to
     three's `aoMap` slot.** Routed through that slot the materials compiled *without*
     `USE_AOMAP` and the attenuation silently never ran; nine hypotheses died before a debug
     visualiser with a magenta "branch never ran" sentinel found it. There is deliberately no
     `#ifdef` in the injected fragment code, because an `#ifdef` is what the engine can disable.
  2. **Apply at material construction, never to a live material.** Attaching mid-session compiles
     ~19 shader variants and cost a measured 216 ms frame, so a flag toggled at runtime hitches.
  3. **Mount `<VisibilityLightmaps />` in BOTH `Scene` and `RoomEditorScene`.** `App.tsx` swaps
     one for the other — they are alternatives, not nested — so a single mount silently leaves the
     room editor with no maps at all. It did, for one commit.
  4. **Window glazing is NEVER a candidate (GLAZING-LIGHTMAP).** `applyVisibilityLightmaps.ts:
     isCandidate` rejects a mesh two ways — its own `userData` mark
     (`apartment/walls/wallReveal.ts:markGlazing`/`isGlazing`, set on the pane meshes in
     `Window.tsx`/`PlanShell.tsx`, never on frames/mullions/grilles/sills) and, belt-and-braces, any
     `MeshPhysicalMaterial` with `transmission > 0`. **Why:** glass has essentially no diffuse
     irradiance to bake (a pane is ~81% transmission), so the `replace`-mode injection was writing
     `reflectedLight.indirectDiffuse` from a synthesised box-atlas `uv1` on the pane — grey texel
     noise. By day the transmitted view swamps it; at night, standing in the living room looking at
     the neighbour block through the pane, it WAS the picture — a mid-grey blocky "static" with the
     lit windows read as blurred squares, and the transmission render target itself measured
     byte-clean the whole time it was the actual cause. Gated on `glazingLightmapExclude`
     (`default: true`); excluded glazing is never counted in `candidates` and never keyed, so it
     cannot become a shared-material sharer either.
  5. **An EXTERIOR-facing shell face must NOT take the interior bake (EXTERIOR-FACE-LIGHTMAP).**
     `bake_material.py` fills only a box's ROOM-FACING atlas slots — a typical shell wall has 3 of
     6 — and `lightmapUv.ts:computeBoxAtlasUv` relocates a face whose computed slot is empty into
     the **mirror row of the same column**. Right for a winding disagreement (rule above,
     `v0.31.7.98`), wrong for a face the bake never covered: the exterior face then renders the
     INTERIOR face's irradiance, i.e. a 256 px atlas slot stretched across a 1.3 m face.
     **Symptom:** at 13:00 in walk mode at the living-room window (x=10.9 z=2.3 yaw 0 pitch −0.18),
     the flat's own outside wall seen THROUGH the pane 2.4 m away read as a soft grey-brown mottle
     at 10–20 cm scale. **The obvious hypothesis was wrong and is recorded so it is not re-run:**
     that face is `MeshStandardMaterial #f1f0ec roughness 0.95` with **no normal, roughness or
     albedo map at all**, so "the plaster normal at a grazing angle" (item `(l)`'s note, now
     superseded) cannot be the cause; `material.clone()` on that one wall — which drops the
     injected `onBeforeCompile` and nothing else — removed it, and a Cycles reference renders the
     face flat and near-white. **Fix:** `applyLightmapsFromIndex` takes an
     `insideBuilding(x, z)` predicate (built in `VisibilityLightmaps.tsx` from the `external`
     walls' centre-lines through `floorplan/footprint.ts:pointInBuilding`), and
     `lightmapExterior.ts:markExteriorFaces` writes `uv1 = (-2,-2)` on every vertical triangle
     whose centroid, probed 6 cm along its own winding normal, lands outside the footprint. The
     injected fragment guards the whole replace on `vVisUv.x < 0.0` and keeps three's analytic
     fill — lamp bounce included, since an exterior face gets no interior interreflection. (The
     sentinel was `(-1,-1)` until rule 7 needed to tell an exterior FACE from a section CUT CAP.)
     **The guard is unconditional GLSL, not an `#ifdef`** (rule 1), so it does not touch the
     program cache key. Gated on `exteriorFaceLightmapFallback` (`default: true`). Two things the
     numbers say: the default flat marks **145** faces, and it reports **20** `exteriorConflicts`
     — a wall box centred on its own centre-line has END CAPS whose two triangles straddle the
     outline while sharing vertices, and that is counted rather than silently resolved. Full
     mechanism, arms and the footprint's known limit: `docs/open-graphics-decisions.md` item (ab).
  6. **A section-CUT CAP must NOT take the interior bake either (ORBIT-NIGHT-CAPS).** Same
     mechanism as rule 5, on the faces rule 5 structurally cannot reach: its `|n.y| > 0.5` gate
     skips horizontals, and orbit's ceiling cull turns the up-facing TOP of every wall box
     (`y = ceilingHeight`) into a visible building-section cut. The bake fills no top slot, so the
     UV builder mirrored the lookup to the BOTTOM row and the cut face rendered the wrong face's
     irradiance. **Symptom:** at 20:00 in orbit (`realistic`, lights on, boot framing) every wall
     top was a bright white rim, and the bloom then amplified it — the single brightest thing in a
     night dollhouse. **Why it is wrong rather than merely bright:** a section cut is **not a
     physical surface**, so there is nothing to reference-render and no light source belongs to it;
     the honest answer is whatever the analytic fill gives a horizontal face, which is what the
     sentinel restores. NIGHT-WALL-CAP below measured these caps BEFORE the GI patch reached them
     and its verdict stands — the patch is what turned them bright afterwards.
     **Fix:** `applyLightmapsFromIndex` takes `cutCapY` (the plan's `ceilingHeight`, threaded by
     `VisibilityLightmaps.tsx`) and `lightmapExterior.ts:markCutCapFaces` sentinels every triangle
     with `n.y > 0.9` whose centroid sits within 3 cm of it, using its OWN sentinel value
     `uv1 = (-1,-1)` — distinct from rule 5's `(-2,-2)` so rule 7's daylight boost cannot reach a
     cut cap. **Height, not orientation, is the
     test** — a worktop, shelf or window sill is an up-facing box top with the identical empty-slot
     problem, and it is never sectioned, so it keeps the bake the room has always had. Carries a
     second, smaller contributor with it: the faded wall-reveal panes' CONSTANT `#eceae4` emissive
     lift (`(1 - opacity) * 0.7` = 0.44 at the head-on fade floor) is right by day and reads as a
     glowing pane against a near-black night wall, so both wall renderers now scale it by
     `apartment/walls/wallRevealMath.ts:revealLiftScale(daylight)` (1 by day, 0.25 at full night).
     Gated on `orbitNightCaps` (`default: true`). Numbers: the default flat marks **76** cut-cap
     faces with **0** conflicts, and the orbit night frame's share of pixels brighter than
     luminance 235 over the flat goes **3.79 % → 2.39 %**. Full arms:
     `docs/open-graphics-decisions.md` item (ac).
  7. **An EXTERIOR face is a SKY-LIT surface and needs a daylight boost, not just the analytic fill
     (EXTERIOR-FACE-DAYLIGHT).** Rule 5 took those faces off the interior bake and left them on
     three's hemisphere/ambient/IBL fill — which is tuned for INTERIOR surfaces. Measured at the
     same pose rule 5 was found at (13:00, walk, x=10.9 z=2.3 yaw 0 pitch −0.18), the flat's own
     outside wall seen through the pane read **163.7** counts against the Cycles reference's
     **243.5**: a flat mid-grey where a sky-lit wall is near-white. The estate already makes this
     correction for its own boxes with an emissive `EXTERIOR_DAY_BOOST` (`estate/Estate.tsx`).
     **Fix:** a per-material `exteriorBoost` uniform, added INSIDE the same sentinel branch as
     `reflectedLight.indirectDiffuse += exteriorBoost * diffuseColor.a *
     BRDF_Lambert( material.diffuseColor )`. Four things about that line are load-bearing:
     · **`BRDF_Lambert`, not an emissive** — this is light ARRIVING, so it is multiplied by the
     surface's own albedo and a dark face stays dark. It also means the constant is not comparable
     to the estate's 1.1; it is FITTED (12, landing the wall at **236.7**, −6.8 of the reference
     and not clipping; the sweep and the "prefer short of the reference" argument are in
     `visibilityLightmap.ts`).
     · **`diffuseColor.a`** — the WALL-REVEAL fade. A faded wall is a UI device for looking INTO
     the dollhouse, and a sky-lit exterior face composited over the room behind it veils exactly
     what the fade exists to show (measured: the kitchen disappeared behind its own front wall in
     the boot orbit view). Alpha blending scales the result once already, so the boost falls off as
     the SQUARE of the fade — full on a solid wall, ~0.14× at the 0.37 fade floor. Opaque surfaces
     have `a = 1`, so walk mode is unaffected.
     · **The uniform is in EVERY injected program with `base = 0` where it does not apply** — rule
     1 again: no `#ifdef`, nothing for the engine to compile out, and `customProgramCacheKey` is
     unchanged (still the per-material generation). `applyVisibilityLightmaps` sets `base` only for
     a material whose mesh actually received an exterior face, remembering the count on the
     GEOMETRY (`userData.lmExteriorFaces`) because the marking pass only runs while `uv1` is being
     built and a re-attach would otherwise drop the boost.
     · **It follows the SUN, via `setExteriorBoostLevel(daylight)`** from `VisibilityLightmaps.tsx`
     — the same `daylightFromAltitude` ramp `Estate.tsx` scales its own boost by, so the flat's
     shell and the neighbour block brighten and darken together. One uniform write per material,
     never a recompile (the `setLampBounce` pattern).
     Gated on `exteriorFaceDaylight` (`default: true`). 30 materials on the default flat carry a
     non-zero boost. Full tables: `docs/open-graphics-decisions.md` item (ae).
  8. **The bake is BOUNCED DAYLIGHT, so `visGain` has to follow the sun (BAKED-GI-DAY-LEVEL /
     LIVING-SLAB).** `lampBounce` tracked the lights switch and `exteriorBoost` tracked the sun, but
     the baked term itself was a CONSTANT: `replace` mode assigned the whole 13:00 irradiance at
     every hour, so after dark each of the ~178 mapped meshes kept its midday bounce while every
     UNmapped surface went dark and warm under the lamps. That asymmetry is *why the defect reads as
     a slab* — an isolated bright plane with nothing around it to match, which is what made it look
     like a blank board rather than an exposure error. Measured real GPU at `pose-living-far`
     20:00, the `livingDining` east wall: **201.6 counts at R−B −1.7** against the adjacent lamp-lit
     west wall's **178.0 at R−B −22.0**, i.e. 24 counts brighter than the lit wall next to it and
     neutral-cold in a warm room; **163.8 at R−B +18.1** after. **Day is exactly unchanged by
     construction** — `daylightFromAltitude` saturates at 1 for any sun above the horizon, so the
     term is `visGain * 1.0` at every daytime hour, and the region's day percentiles all move 0.00
     (per-pixel ≤4 counts, which is the film grain; a whole-frame day diff is dominated by the
     CEILING FAN's blade angle, so localise one before believing it) — a night-only fix, and
     the day frame's p95 was 227 all along, so this was never a clipping bug. Gated on
     `bakedGiDayLevel` (`default: true`); the `visDay` uniform is present holding 1 with the flag
     off, so rule 1 holds and the cache key is untouched. **The general lesson: every term the
     injection writes must be scaled by the source it came from.** Three terms, three levels — bake
     × day, lamp × lights, exterior boost × day. A fourth added without its level is the same bug
     again.
  9. **An opening cut INSIDE a wall box is a fourth family of face the bake never covered
     (DOOR-LEAF-REALISM (b)).** Rules 5 and 6 handle exterior faces and section cut caps; a door or
     window HEAD SOFFIT is neither, and it is not one of the box's six faces either, so
     `computeBoxAtlasUv` mirrors its lookup onto a slot the bake never filled and `replace` assigns
     ~0. Symptom: a hard BLACK WEDGE above every door head in `07-05-corridor-west.png`, on a face
     whose winding normal is (0, −1, 0) at y = 2.09 (`FLAT.doorHeight` less
     `walls/wallBodyShape.ts:OPENING_CLEARANCE`). **Three hypotheses to skip, all eliminated by the
     raycast:** it is not a missing head-jamb face (the face is there), not a back-face cull
     (`side: FrontSide`, normal pointing at the camera), and not shadow acne — with the bake off
     the same patch renders at 229 counts. `lightmapExterior.ts:markOpeningSoffitFaces` gives it the
     same `CUT_CAP_UV_SENTINEL` (26 faces, 0 conflicts on the default flat), lifting the soffit p05
     from 43.3 to 71.1 above a closed leaf and dissolving the leafless doorway's black blob
     entirely. **The gate is the mesh's OWN bounding-box bottom, not `y > 0`** — a floor slab, a
     ceiling plane, a worktop and a shelf are all down-facing, and their bottom face IS their box
     bottom, so only a face above `minY + tol` can be an internal cut. Gated on `doorLeafRealism`
     (`default: true`). **Residual, and it is not a bug:** above a CLOSED leaf a thin dark line
     remains, because a 50 mm leaf centred in a 100 mm wall leaves a real 25 mm reveal pocket that
     N8AO correctly darkens (bake off 77.2, bake AND AO off 127.3). Closing that needs a door
     LINING, i.e. new geometry — do not chase it as a lighting defect.
  10. **The baked bounce is a SKY-DOME quantity, so weather reaches it through `bounce` and NOT
     through `fill` (WEATHER-BAKED-GI).** Rule 8's lesson caught a term with no level; this is the
     same term with an INCOMPLETE one. `weatherGrade` reached the sun, the fill, the IBL probe, the
     estate and the sky backdrop and stopped there, so under a deck — beam exactly zero, every other
     indirect source at 0.55 — the injected bake still carried its whole clear-sky midday value.
     **The obvious fix is wrong and the measurement says so.** `fill` looks right (the bake
     `replace`s exactly the hemisphere/ambient/IBL that `fill` multiplies) but describes a different
     quantity: `public/assets/lightmaps/index.json` records the shipped set as `--pass irradiance`
     with **`with_sun_disc: false`**, i.e. the sun removed as a SOURCE, so the map holds the sky DOME
     and none of the beam. Measured on the app's own export at `pose-living-far`
     (`render_weather.py --sun-intensity 0/1`, 256 samples, `--linear-stops -1` so nothing clips, two
     wall patches, read in LINEAR): a full deck takes the **ROOM** to **0.44 / 0.35** of clear and the
     **DOME alone** to **0.94 / 0.99**. The ~60 % that leaves is the BEAM, which `sun = 0` already
     removes, so scaling the bake by `fill` removes it twice and lands the mapped walls at less than
     half of physics. **The app's decomposition is faithful, which is what makes the dome ratio
     transferable**: on the same patches the clear-sky wall is 39 % / 35 % baked term in the app
     against 47 % / 35 % dome in Cycles, and `scripts/dev-probes/weather-baked-gi.mjs` (DEV seam
     `?visWeather=<k>`) reads that off by sweeping. `BOUNCE` ships 1 / 1.15 / 0.95 / 0.86. ⚠️ **Two
     things to know before touching it.** `partlyCloudy` measures **2.68** and deliberately ships at
     `FILL`'s 1.15 — Blender's clear sky is too clean for the tropics (`k_d` 0.096 against 0.20–0.25)
     and every ratio is normalised by that same clear dome, so the bias is largest where the solved
     dome is largest; it is a LOOK call, pinned by a test, and it is the maintainer's to revisit. And
     the uncorrected ratios are right only *for this asset set* — the shipped map is itself a
     Blender-dome bake whose `IRRADIANCE_GAIN` was fitted against a Blender reference, so **a re-bake
     under a fixed atmosphere must re-fit `BOUNCE` with it**.
     **WEATHER-BOUNCE-RECALIBRATE (z19, v0.35.12.1).** The flat `BOUNCE` above scales the WHOLE
     composed bake, but `SUN-BOUNCE-BAKE` composed the sun's own bounces into it too (ceilings
     x2.48, walls x1.70, floors x1.96 of the dome-only term) — so under a deck the sun-bounce
     share is over-bright. `weather.ts:sunBounceShare(orientation)` + `visDayScale`'s `share`/
     `fill` params scale each material's OWN orientation's sun-bounce share toward `fill` instead
     (`overcast`/`rain` only — `clear` and the `partlyCloudy` look call above are untouched).
     Flag `weatherBounceOrientation`, default true.
     The EXTERIOR faces take `blowout` instead, the same field `estate/Estate.tsx:exteriorDayBoost`
     scales the neighbour blocks by: both terms have the shape "analytic half already scaled by
     `fill`, plus a boost added on top", so the same field is what makes rule 7's "brighten and darken
     together" exact rather than approximate. Gated on `weatherBakedGi` (`default: true`); `clear`
     returns literal 1s so the default condition multiplies both levels by the NUMBER 1.
     ⚠️ **The `wl-*` Cycles set the `FILL` table was measured from is NOT reproducible** — re-running
     its own command line gives interior mean 0.478 against the recorded 0.087, and the recorded set
     has **30.9 % of the interior at exact zero** in a daylit room (the probe's own "read `onFloor`
     first" warning). Every number in this rule comes from one freshly rendered, unclipped set.
  11. **Below civil dusk `visDay` saturates at 0, so `replace` wrote pure BLACK on a mapped surface
     next to a dimly-lit unmapped one (LIGHTMAP-NIGHT-FLOOR)** — measured 02:24 and the 06:00
     "Morning" preset, ceiling/walls black beside a lit fridge/chairs. Fix: capture
     `vec3 visAnalytic = reflectedLight.indirectDiffuse` right after `lights_fragment_end`, then the
     interior branch leads with `visAnalytic * visNight +`, `visNight = 1 - clamp(daylight, 0, 1)` off
     the RAW daylight (never weather-scaled — must read exactly 0 under weather at noon). The floor is
     the analytic fill, not a constant, so the shell converges on what the furniture already renders;
     `visNight` sits in every program per rule 1, 0 by day so the identity is exact bit-for-bit.
  12. **`lightmapIndex.ts` accepts a bake `--encode` in `(0, 1]`, and the shader must UNDO it, not
     just admit it (LIGHTMAP-ENCODE-DECODE).** `--per-map-scale` normalises each atlas slot to its
     own peak, and one slot can span a 14–125× range, so an 8-bit PNG spends nearly all 256 codes
     on the bright end: 5 of the 12 largest shipped maps land their MEDIAN texel on ≤2 of 255
     levels. A 16-bit PNG cannot fix this — `TextureLoader`/`HTMLImageElement` decode any bit depth
     to 8 bits before upload. Fix: `visDecode = 1 / encode` (1.0 for today's set), applied right
     after the `visMap` sample as `pow(v, visDecode)`, a uniform branch skipped at 1.0 per rule 1.

- **`photographicFill` is a FLAG that ships a CONTROL, not a look.** The look is
  `ui.photographicLook` (off by default — reducing the fill is the DEFAULT-GLOOM trade from `.86`,
  the user's call); the render path needs both. It scales the hemisphere, the flat ambient and the
  IBL probe **per tier** (`look.ts:PHOTO_FILL_SCALE` — maximum 0.80, medium 0.62, performance 0.60,
  calibrated against the photographic `%<64` 11.2–12.2 % band; performance cannot reach it at all),
  raises fabric relief to match (`PHOTO_WEAVE` — relief and fill are one knob measured as two: the
  same weave change buys +10 % under the shipped fill and +138 % under this one), and fades the
  fixtures with sun STRENGTH in first person only (`fixturesLevel`), keeping windowless rooms fully
  lit (`lighting/daylitRooms.ts`). Material factories read it through
  `scene/photographicSignal.ts`, because `look.ts` is dependency-free and materials must not import
  the UI store. Full measurement trail: `docs/research/2026-08-31-photoreal-shadow-depth.md`
  (`.162`–`.170`).

- **The photographic look carries SENSOR GRAIN (PHOTO-GRAIN, `.211`).** `<Noise premultiply>` at
  `look.PHOTO_GRAIN_OPACITY` (0.07), mounted in BOTH composer modes — `medium` runs the AO-only
  minimal composer and is what the adaptive ladder picks for most browsers, so a full-stack-only
  grain would miss them. Gated on the photographic look, because grain is a property of a CAMERA
  rather than of a room; the default look stays clean (measured 0.27 against 0.62).
  · **Why it exists:** the app's *untextured* surfaces are far cleaner than a photograph. On the flat
    `#fafafa` ceiling (`ceiling/Ceiling.tsx`, no map at all) the high-frequency floor measures **0.10**
    against photographic ceilings at **0.76** and **1.49**. Painted WALLS need nothing — they read
    0.80–1.94 against 1.18–1.36, because the procedural plaster micro-normal already supplies
    grain-scale detail. The deficit is confined to surfaces carrying no map.
  · **Measure it at NATIVE render resolution.** A probe screenshot at CSS pixels while the app renders
    at DPR 1.5+ averages the grain away — the same frames read 0.46 downsampled and 0.10 native.
    `light-distribution.mjs` captures at `deviceScaleFactor: 2`; `underside-shadow.mjs` and
    `curtain-glow.mjs` do not.
  · Free — `frame-time.mjs` medium p90 8.2 ms against the 8.3 documented above.

- **The photographic look also carries a WHOLE-FLOOR bounce (PHOTO-GROUND-BOUNCE, `.195`).**
  `look.ts:photographicGroundBounce` scales the hemisphere's `groundColor` by **3** (was 6.5; re-tuned
  in `.208` against ceiling ÷ WALL after `.206` showed ceiling ÷ FRAME is composition-dependent), and only
  under this look — the default look already measures inside the photographic ceiling band and
  would be pushed out of it. It exists because turning the flat fill down is what buys the shadow
  depth, and the ceiling was lit almost entirely BY that fill: against four reference photographs
  (ceiling **1.08–1.28** of frame mean) the photographic look sat at **0.87** and now sits at
  **1.08** at 13:00 / **1.17** at 19:00, with `%<64` 7.18 % / 2.19 % (photographs 1.9–12.2 %) and
  walls and floor still in range. The default look is byte-identical.
  · **Three cheaper-looking shapes were tried and all failed — don't re-propose them.** A
    `RectAreaLight` in the window's floor pool is compiled out by the Lambert ceiling
    (`RE_Direct_RectArea` exists only in the physical lighting model). A `SpotLight` in the same
    place contributes nothing at all, **still undiagnosed** — inert even at `decay=0 distance=0`,
    while a `pointLight` at the same position moves the frame decisively. A point light lights the
    WALLS preferentially (+0.15 wall for +0.04 ceiling), because a room's walls are nearer the
    floor than its ceiling and 1/d² does the rest. The deficit is a WHOLE-FLOOR phenomenon, so only
    a whole-floor term moves it.
  · **The hemisphere's angular shape is why it works.** three shades it
    `mix(groundColor, skyColor, 0.5·dot(n, up) + 0.5)`, so `groundColor` reaches a down-facing
    ceiling in full, a vertical wall by half and an up-facing floor **not at all** — the shape of a
    real floor bounce. It also means the frame mean rises ~17 %, so walls brighten in absolute terms
    even though their RATIO barely moves; an amplified frame diff shows that plainly.
  · **`.183` refused this term at ×4.5 on furniture undersides, and that objection cannot be
    measured.** A photograph shows the SHADOW under a piece, never the underside plane, and from the
    walk camera the app renders **no** down-facing faces between shin and table height — a standing
    eye cannot see under a coffee table. The floor-shadow proxy built for it is structurally blind
    here (`groundColor` contributes nothing to an up-facing floor): it reads 0.786 identically at
    ×1, ×3.5 and ×6.5. So this shipped on a visual A/B, not a metric.
  · The floor under furniture was too bright in both looks (**0.786** / **0.865** against
    photographs at **0.579–0.725**); `.196` closed it for the photographic look by raising AO —
    see the AO bullet below.

- **Replace-mode GI carries a per-room LAMP-BOUNCE term (`lampBounce.ts`, v0.33.0.3).** The
  irradiance bake is daylight-only, and `replace` discards the analytic fill that had been standing
  in for the lamps' interreflection — so with the lights on, a room with a small sky view went dark
  where a lamp-lit room is brightest, its ceiling. Measured against lights-on Cycles renders of the
  same GLB (`scene-glb.mjs` → `render_from_manifest.py`, 19 point lights, exposure matched): kitchen
  ceiling **152 vs 190** with walls agreeing to 3 %; living-room ceiling already at/above Cycles
  (that ceiling carries NO baked map, so the term never reaches it — its mapped walls moved the same
  few counts the kitchen's did). The term is per ROOM — `Σ emitter intensity / floor area` (bath2
  2.78, bedroom3 0.89, kitchen 1.17 ≈ living 1.10 — the kitchen/living pair is near-equal, a claim
  to the contrary in the first draft was caught by the test) × `LAMP_BOUNCE_K`
  × an orientation weight (`down 1.0 / side 0.35 / up 0.2`) — set as each patched material's own
  `lampBounce` uniform at attach, scaled live by the lights switch (`setLampBounce`). Sweep with
  `?lampBounce=<k>` (DEV). Result: kitchen ceiling **184** / wall **193.5** (Cycles 190 / 193.6),
  corridor ceiling 170 → 190, living room +1–3 counts. It stays per room so a dense bathroom and
  a sparse bedroom do not share one number; a global term would also have to be re-fitted the
  moment a plan's lamp count changed.
  Census is taken once at attach (a lamp placed later joins at the next attach) — re-attaching
  live costs the 216 ms recompile.
- **The full post stack's AO is intensity 5 at radius 0.7 m, not 7 at 1.0 (AO-SMALL-ROOM,
  v0.33.0.2).** `.222`'s 7 / 1.0 was calibrated on one living-room floor pose; a per-room walk
  tour at `realistic` found the kitchen, corridor and bathrooms 10–20 % darker across whole walls
  and ceilings than the Performance tier, because a metre-radius kernel sees a wall from every
  point of a 1.9 m-wide room. Sweep table in `look.ts:AO`. The under-furniture floor ratio moves
  0.834 → 0.885 — it was already outside the photographic band, so the trade is small-room
  legibility for a contact cue that was not being delivered. `?aoIntensity=&aoRadius=&aoFalloff=`
  is a DEV seam in `EffectsImpl` for the next sweep. The AO-only composer (`performance`/capable)
  is byte-identical.
- **Screen-space AO is the ONLY contact shadow an interior gets, and it was under-strength
  (`.196`).** With `ao: false` the floor under a sofa measures **0.983** of open floor — i.e. no
  contact cue at all — because interiors here are fill-lit and almost nothing casts a shadow into
  them (INTERIOR-SHADOW). `look.AO` therefore carries the whole effect, and was raised from
  `radius 0.7 / intensity 3.0` to **`radius 1.0 / falloff 1.2 / intensity 4.5`**: under/open
  **0.786 → 0.722** (photographs 0.579–0.725) for the photographic look, **0.865 → 0.820** for the
  default look, which is improved but still short.
  · **Radius before intensity.** A metre-scale radius reaches the same ratio as intensity 6.0 at a
    third less intensity, and contact occlusion in a room genuinely is a metre-scale effect.
  · **`distanceFalloff` 2.0 is the trap.** It centres the ratio (0.641) but drives the photographic
    look's `%<64` to **15.16 %**, past the darkest of the four reference photographs. The shipped
    point is where BOTH bands hold, not where this one ratio is centred.
  · It also repaid what `PHOTO_GROUND_BOUNCE` cost: the photographic look's `%<64` went 11.88 →
    7.18 % with the bounce and back to **10.43 %** with this, and the DEFAULT look entered the
    photographic range for the first time (1.32 → **2.03 %**, photographs start at 1.9 %).
  · **The FULL post stack needs a stronger AO, and `look.AO.intensityPost` (7) supplies it (`.222`).**
    Isolated by toggling `postprocessing` at `high`: with the full stack the shadowed/lit floor ratio
    reads **0.786**, with the AO-only minimal composer **0.726** — those passes cost **0.06** of
    contact shadow. AO also buys less than half as much there (0.126 against `medium`'s 0.286) on
    IDENTICAL `<N8AO>` `quality`/`halfRes` props. `EffectsImpl` passes
    `intensity={full ? AO.intensityPost : AO.intensity}`, keyed to the CAUSE rather than to a tier
    name. Result: high **0.786 → 0.716**, maximum **0.761 → 0.691**, medium unchanged at 0.712, all
    against photographs at 0.579–0.725.
  · **`performance` is out of band at 0.827 and that is by design** — it has `ao: false`, so it has no
    screen-space AO at all and leans on the RZ1 `ContactShadow` blob decals. Note the earlier 0.721
    figure for that tier was measured with a SINGLE pose while every other tier used the pooled
    eight; single-pose readings are not comparable (medium reads 0.746 single against 0.712 pooled).
  · **Free** — N8AO's cost is sample-count driven and none of these knobs change it; `frame-time.mjs`
    reads medium p90 8.3 ms, high 10.1 ms and maximum 10.6 ms, all matching the documented baselines.

- **A high-DPR phone needs a DEVICE-aware degrade floor (MOBILE-POLISH, v0.35.2.0).**
  Measured at 390x844 / DSF **3** (every earlier capture used DSF 1, so this had never been looked
  at as the phone sees it): the degrade reached **0.5** mid-gesture — 195x422 on a 1170x2532 panel,
  1 render px per **36** device px — because the ladder's `dprHalved` rung pins `effectiveDpr` to 1
  and the old rule halved that too. `degradedDpr(effectiveDpr, devicePixelRatio)` now floors at
  `max(0.5, dpr*0.5)`; DPR-1/DPR-2 displays and the SOFTWARE rasteriser are unchanged (item (af)'s
  certification depends on the degrade staying armed there). The 3 s long-frame hold was
  self-sustaining on touch — a resize IS a long frame (GPU-STARVE-3) — so it is **1 s + two
  consecutive** long frames on a coarse pointer.
  **`mobileMsaa` shipped, then shipped OFF again (MOBILE-MSAA-OFF, v0.35.2.2).** Real Metal
  measurement found MSAA-on reads 20-25 counts darker on the living/kitchen ceiling and CLIPS the
  night kitchen read (200 -> 254), and toggling the flag after scene-ready blacked the canvas in
  2/4 attempts — a lead on the still-open black-flicker report (z22), not a fix. `default: false`
  pending diagnosis of the exposure shift and the black frame; see `registry.ts`.
  **DIAGNOSED (MSAA-DEPTH-BLIT, v0.35.3.1, see z22):** N8AO's per-frame depth `blitFramebuffer`
  can't resolve a multisampled composer's implicit MSAA depth renderbuffer (WebGL2 rejects it,
  `GL_INVALID_OPERATION`) — stale depth dims/clips AO; the black frame is `EffectComposer`'s
  `useMemo` rebuilding targets on a live `multisampling` change. Fix: `mobileMsaaSamples()` forces
  `0` whenever `ao` is true, and `Effects.tsx` freezes the sample count in a `useRef` at mount.
  **FIXED UPSTREAM (AO-DEPTH-ISOLATION, v0.35.13.0).** The line above names the wrong illegal
  operation: WebGL2 *does* define a multisample→single-sample depth downsample (WebGL 2.0 §4.7.4);
  what ES 3.0.6 §4.3.3 forbids is a **format mismatch**, and that is what this was —
  `DEPTH_COMPONENT24` MSAA renderbuffer vs the `DEPTH_COMPONENT32F` stable depth texture
  `postprocessing` v6.39.0 introduced. pmndrs/postprocessing **#745** fixed it in **v6.39.3** by
  rebuilding both ping-pong buffers' depth attachments at the matching format; this repo was
  pinned at 6.39.1. Upgraded to `^6.39.5`, the `ao` veto removed (it made `mobileMsaa`
  unreachable dead configuration), and the whole policy + the dependency floor now live in
  **`aoDepthPrepass.ts`** + `aoDepthPrepass.test.ts`. Do NOT add a local depth pre-pass: the
  composer's stable depth target already is one. Measured on ANGLE/Metal with an in-session
  flag-off control (`scripts/dev-probes/msaa-ao-depth.mjs`): **0 GL errors**, `4x
  DEPTH_COMPONENT32F` allocated only in the `on` arm, luma |Δ| ≤ 0.96 counts, night kitchen
  ceiling 86.09 → 86.10 with no clipping. The flag still **defaults off** — pmndrs #412 is a
  separate, still-open iOS multisample depth/stencil driver bug and headless Metal is not an
  iPhone. The minimal composer's hardcoded `multisampling={full ? msaa : 4}` (no `ao` gate) was suspected to share this bug on the default `performance`/capable tier; **tested and REFUTED on real hardware (2026-09-18, see z22)** — 0 blit errors, byte-identical-or-1-count luma both arms. Remaining ask there is hygiene only (an `ao` gate for symmetry, optional) plus "unverified on other GPUs/drivers".
- **The `dprHalved` rung itself was still density-blind AT REST (DPR-HALVED-DENSITY, v0.35.2.1).**
  MOBILE-POLISH's floor only applied ON TOP of the rung's `effectiveDpr = 1`, so a DPR-3 phone sat
  at 1 with no gesture in progress (edgeEnergy 1.554 vs a DPR-6 ref 1.36–1.90).
  `interactiveDegrade.ts:halvedRungDpr(devicePixelRatio, dprMax, flagOn)` replaces the rung's
  `dprHalved ? 1 : dprMax` with `max(1, devicePixelRatio*0.5)` gated on `mobileDegradeFloor` — DPR-3
  now rests at **1.5**; DPR-1/2 and flag-off/software-rasteriser stay byte-identical to `min(dpr,1)`.
- **WALK-GESTURE-DEGRADE (S7, 2026-09-18): GPU-STARVE-1's degrade never armed in walk mode** —
  `beginCameraGesture`/`endCameraGesture` were wired only to OrbitControls. `FirstPersonCamera` now
  calls them too: touch look-drag and Pointer Lock acquire/release begin+end directly, a held
  movement key is edge-detected per frame via `cameras/walkGestureInput.ts:gestureEdge` (keydown/up
  give no repeat while held), and `WalkJoystick` pointerdown/up call the same pair — all three share
  `cameraMotionSignal`'s existing ref-count, so overlapping inputs end exactly once, on the last release.
  **WALK-GESTURE-DEGRADE-TOUCH-FREEZE (measured, same day): the naive wiring froze a single-finger
  look-drag outright.** Calling `beginCameraGesture()` synchronously in `touchstart` arms
  `InteractiveDprController`'s next-rAF resize + synchronous `advance()` (GPU-STARVE-3) inside the
  SAME touchstart→first-touchmove window Chrome uses to decide whether a touch sequence is
  cancelable — the sweep harness reproduced a dead drag (`yaw` frozen for the rest of the gesture,
  console "Ignored attempt to cancel a touchmove event… scrolling is in progress"). Isolated three
  ways: removing the two calls fixes it; the same clip with `?ff=interactiveDegrade:off` fixes it
  (degrade never engages, so the resize never fires); the joystick/key paths (Pointer/Keyboard
  events, not Touch) never reproduce it. Fix: `FirstPersonCamera` defers a touch-drag's FIRST
  `beginCameraGesture()` by `BEGIN_DEFER_MS` (120 ms) so it lands after Chrome's decision window —
  a tap shorter than that never engages the degrade at all (which is fine; it was never at risk of
  the watchdog), and a sustained look-drag still degrades exactly like a mouse/joystick drag once
  past it. Verified fixed on the harness (dpr toggles 2↔1.5 in lockstep with the drag, yaw moves
  the full sweep with zero freezes) — **not verified on a real touchscreen**; CDP's synthetic touch
  stream may hit this window more reliably than real hardware's touch predictor does, so raise the
  delay or gate the touch vector off entirely if a real device still reproduces the freeze.
- **WALK-GESTURE-LEASE (N1+N2, v0.35.7.0) supersedes both of the above for walk mode.** Pointer
  Lock is a STATE, not a gesture: beginning on lock ACQUIRE leaked the ref-count (the releasing
  `pointerlockchange` never came — DPR pinned at 0.5 for 7 clips / ~2 100 frames). The look gesture
  is now a LEASE (`gestureLease.ts`, pure) taken by mouse MOVEMENT while locked, renewed per move,
  expiring 250 ms after the last; every begin owns a guaranteed end (idle timer, mouseup/pointerup/
  blur/hidden/`pointerlockerror`/unmount) and `pollCameraGestureWatchdog` force-releases a gesture
  held 10 s with the camera stock-still. On touch, the canvas owns its input (`touchAction='none'`
  + non-passive `touchstart`/`touchmove`, `e.cancelable`-guarded), so `BEGIN_DEFER_MS` is deleted.
- **DEGRADE-UNIFIED (S6, v0.35.9.0): desktop now takes the coarse-pointer hold rule too** — two
  consecutive long frames to arm, 1 s hold, replacing desktop's one-frame/3 s (measured 10 DPR
  toggles / 7 desktop walk clips vs phone's 1). `interactiveDegrade.ts:effectiveCoarsePointer`,
  flag `degradeRuleUnified`; the SOFTWARE rasteriser (item (af)) keeps the old rule.
- **The main Canvas is `frameloop="demand"`** — never assume a continuous render loop.
  Anything that animates must keep `RenderPump` open (`renderDecision.ts`
  `shouldRender`/`isContinuous`/`settleTailMs`, all pure + unit-tested) and call
  `invalidate()` on change; a discrete store change already gets a short settle tail.
  Continuous-span FPS sampling is gated by `renderPumpSignal.ts` — don't sample raw frames.
  For DOM overlays that only need to appear/disappear (e.g. `FinishDragOverlay`) use a
  module-level signal (`finishDragSignal.ts` pattern: `useSyncExternalStore` subscriber +
  pure set/notify) — this avoids routing through the Zustand store and triggering
  `subscribe(markDirty)` on every drag event.
- **Asset streaming ending is itself a reason to draw (FINISH-DEFER).** `RenderPump` grants a
  short dirty tail on the FALLING edge of drei's `useProgress().active`
  (`renderDecision.ts:assetsSettleDirtyUntil` / `ASSETS_SETTLE_TAIL_MS`, pure + unit-tested): a
  surface that SUSPENDED on its textures commits its loaded material *after* the loading manager
  goes idle, so the last continuous frame predates the commit and demand mode would otherwise
  leave the new content undrawn until some unrelated change requested a frame. Any future
  load-then-commit path gets this for free — don't hand-roll a second edge detector.
- **`lightsMode` is ONE switch for the whole home: on lights every fixture, off lights none.**
  No camera-proximity culling, in either view mode. `lighting/FurnitureLights.tsx` renders the
  set the pure `lighting/fixtureLights.ts:fixtureLightsFor` returns — every item that passes its
  own per-item gate (`isItemEmitter`: `props.lightOn === 'no'` is a hard per-light switch that
  still wins), in stable ITEM order, never camera order. This REPLACES the old nearest-N budget
  (`chooseEmitters` + the tier's `maxFixtureLights`, PERF-002, both deleted): capping to the 2
  nearest emitters on the default Performance tier meant that walking through a 19-emitter flat
  switched lamps on and off around you — invisible as a budget, very visible as flicker. The only
  remaining cap is `MAX_LIVE_FIXTURE_LIGHTS` (64), a shader-uniform guard against a driver-level
  compile failure, applied in item order so it can never read as proximity switching. **Do not
  reintroduce a camera-distance cull here** — if fixture-light fill cost needs managing again,
  it has to be something the user can see and control (a per-light switch, a scene-wide off),
  not a silent budget. The component has no per-frame path at all now: the set is a `useMemo`
  over items/mood/flag, and `setFixtureGlow` is written on switch change.
- **Fixture lights are the dominant fragment cost — optimise the SHADER, not the light count.**
  Three unrolls the point-light loop (`lights_fragment_begin.glsl`) and `RE_Direct_Physical`
  runs a full `BRDF_GGX_Multiscatter` per light per fragment with **no early-out on a light
  attenuated to zero** — so N lights ≈ N× the lighting maths on every lit fragment, whether or
  not the light reaches it. **Measured on real hardware** (Apple M4, ANGLE Metal, 1280x800,
  night, fixed camera, full pipeline via `advance`): at **Maximum** the 19 default-flat fixtures
  cost **9.10 ms of a 34.54 ms frame (26%)** — roughly **0.5 ms per light** — while at
  **Performance** the whole scene renders in 3.2 ms and the light cost is below the noise floor.
  So this is a High/Maximum concern only, and it scales with the fixture COUNT: an authored
  design with a 40-downlight false ceiling would spend ~20 ms on lighting alone.
  (Ignore the 73% that a headless software rasteriser reported — SwiftShader is ALU-bound and
  over-weights shading by an order of magnitude.) Consequences to design around:
  · **A cheaper BRDF is NOT the lever — measured, don't re-propose it.** `RE_Direct_Lambert`
    is one dot product against GGX's D+V+F+multiscatter, so swapping matte surfaces to Lambert
    looks like the obvious fix. On the real pipeline it isn't: converting every matte
    `MeshStandardMaterial` (247 of them) saved **2.17 ms of 34.54 (6%)** and only took the light
    cost from 9.10 → 7.70 ms, because the expensive fragments are the 57 `MeshPhysicalMaterial`
    furniture surfaces, not the matte architecture. Walls alone saved **0.23 ms**. Downgrading
    Physical → Standard where no physical-only feature is used is lossless but applies to only
    4 of 57 materials (sheen 27, anisotropy 10, clearcoat 9, transmission 7 are genuinely in
    use) and saved nothing. The one exception kept: the plain white ceiling in
    `ceiling/Ceiling.tsx` is `meshLambertMaterial` — free, since it is an inline matte-white
    material outside the finish cache. If this is ever revisited, note that deriving a Lambert
    twin from a CACHED finish material goes stale: the finish system mutates those in place
    (procedural upgrade swap, tint/recolor).
    · **That Lambert ceiling broke the HQ path tracer, and is now handled at the snapshot —
      v0.31.5.253.** `MeshLambertMaterial` has no `roughness` field, and the tracer's converter
      reads `undefined` as **0**, so the HQ still rendered the ceiling as a MIRROR (the window,
      the AC unit, the curtain rail and the fan were all legible in it). `pbrStandInFor` in
      `pathtrace/hqRenderSession.ts` now substitutes a matte `MeshStandardMaterial` inside the
      tracer snapshot only — the live scene keeps its Lambert, so **the raster is untouched** and
      no raster measurement is re-based. Any new legacy-lit material (`MeshLambertMaterial`,
      `MeshPhongMaterial`) is covered automatically; `MeshBasicMaterial` is deliberately NOT
      substituted, being unlit by intent. Converting the ceiling scene-wide was measured and is
      **not** worth it: it moves the rasterised ceiling by 0.09 % and the frame mean not at all,
      so it only costs the shader (open decision item (n)).
    · The 27 `sheen` + 9 `clearcoat` `MeshPhysicalMaterial` surfaces noted above are the prime
      suspects for the one remaining raster-vs-traced disagreement: the rug reads raster 218 against
      traced 105–116, a factor ~2 that roughness cannot explain (v0.31.5.253, n = 1, unresolved).
      **Measuring anything path-traced: read `docs/hq-tracer-probe-notes.md` first.** The HQ
      still is nondeterministic between three discrete classes ~45 % apart at an anchor (item
      (u)), and `HqRenderModal` replaces the host canvas with the AI-denoised one on completion,
      so the same read returns either stage depending on timing.
      Until that is understood, the path tracer is **not** a valid reference for
      `MeshPhysicalMaterial` surfaces.
  · **Baking into an irradiance volume was spiked and REJECTED — don't re-propose it.**
    three 0.184 ships `LightProbeGrid` (`examples/jsm/lighting/`) and the core shader supports
    it (`USE_LIGHT_PROBES_GRID`, SH in a 3D texture atlas), and it LOOKS fine — a warm, plausibly
    lit home. It does not pay: a 420-probe volume over the default flat costs **6.19 ms** of
    per-fragment SH sampling to replace **9.10 ms** of light evaluation, i.e. **2.43 ms net (7%)**
    at Maximum — because a trilinear 3D-texture fetch across 7 sub-volumes per fragment at DPR 2
    is not cheap either. It also bakes for **4.4 s synchronously** (one cubemap render per probe)
    and would have to re-bake whenever a lamp moves, a finish changes or the sun moves, and it
    supplies DIFFUSE irradiance only — no specular highlight, no sharp pool under a bulb.
  · **What is left is the light COUNT.** 0.5 ms per fixture is intrinsic to a real point light,
    and every alternative to paying it has now been measured and rejected. Merging coincident
    fixtures (below) is the only lever that survived. For scale: at Maximum, geometry detail
    (7.70 ms) and DPR (7.35 ms) each cost about the same as all 19 lights, and both are already
    user-facing dials — Maximum missing 60 fps is a tier-budget problem, not a lighting one.
  · Per-object light culling is NOT available: three filters lights with
    `object.layers.test(camera.layers)` in `projectObject` — that is the CAMERA's layers, so
    per-room light layers only work with a render pass per room, which costs more than it saves.
- **Coincident same-kind fixtures merge on the low tiers** (`fixtureLights.ts:
  aggregateFixtureLights`, `quality.mergeCoincidentLights`, on in every mode and class). A
  false-ceiling downlight grid is several identical bulbs 0.6–0.8 m apart that read as one
  source, and each costs a full BRDF per fragment. The rule is deliberately narrow — same
  `defId`, same bulb colour, never an IES spot, within `MERGE_RADIUS_M` (1.0 m) of the
  cluster's FIRST member (head-anchored, so a long row can't chain-collapse to its centre).
  **1.0 m is chosen to sit below the tightest pair in the shipped flat** (two sconces 1.2 m
  apart, which must stay two pools of light) — the default layout merges nothing, by design.
  Don't widen it to buy a saving in the default flat: that is the lighting design being
  rearranged for performance, which is the thing this whole area is not allowed to do.
- **Tier-gate GPU cost.** Read `RenderTier`; **Performance is the default for everyone**
  (flat: no shadows/IBL/post, DPR 1). Heavy effects (real mirrors, post stack) are
  `realistic` only, at either device class (`mirrorReflectorConfig(tier, device)` is the pattern —
  it takes the class too, because the reflection resolution is what used to distinguish High from
  Maximum).
- **A SOFTWARE RASTERISER is not a device class — it is its own floor, and the floor is NARROW
  (REALISTIC-SOFTWARE-FALLBACK, `softwareRasterFallback`, `default: true` since `v0.33.2.9`).**
  `deviceClassFor` sends SwiftShader/llvmpipe to `weak`, but so does a phone, and `realistic`/`weak`
  is tuned for a mid phone: 2048 shadows, the full composer, `dprMax 2`. A CPU renderer's
  `resolveQuality` layers a floor under the user's overrides — and it contains exactly four keys:
  `shadowMapSize 0`, `dof false`, `cinematic false`, `dprMax 1`. **`postprocessing`, `ao`,
  `envResolution` and `ibl` are absent ON PURPOSE, and adding them back is a regression, not a
  tightening.** Absence is the mechanism: the preset's own values come through (post true, AO true,
  probe 192), plus the baked visibility lightmaps, which are gated on the MODE
  (`qualityTier === 'realistic'`). That is what the wide `v0.33.2.0` floor got wrong — dropping
  post/AO/probe measured +29 counts at luminance p05 and 0.023 less saturation (a milky frame with
  no corner or contact darkening), and, because `shouldDegradeDpr` returns false with no
  `postprocessing` mounted, it also DISARMED the interactive DPR halving and so never reached the
  640×400 canvas that pays for itself. Keeping them, the floored frame matches full Realistic on a
  real GPU to within a point at every percentile and runs at flat-`performance` speed. **Gate the
  floor on the renderer NAME (`isSoftwareRenderer`, read once at boot into `softwareRenderer`),
  never on `weak`** — keying it on the class would silently re-tier every phone. Certified fence
  tables and the closing decision: `docs/open-graphics-decisions.md` item (af); do not change the
  default or the key set outside that item.
- **Orbit + the room editor run the full walk-mode lighting simulation** (ORBIT-CEILING,
  replaces the retired ORBIT-DOLLHOUSE flat-fill). The graded sun, PCF sun shadows, day/night
  exposure grading, and day-ramped bloom apply in every view mode at every tier (still gated by
  the tier's `shadowMapSize`/`postprocessing`). Orbit culls the real ceiling so you can see in;
  an invisible shadow-casting **virtual ceiling** (`apartment/ceiling/CeilingOccluder.tsx`, planes
  from the pure `occluderRects.ts:occluderRectsForPlan`) blocks the sun from flooding in through
  the open top, so interiors are lit through windows/open doors — mounted in BOTH `Scene.tsx` and
  `RoomEditorScene.tsx`, present in walk mode too for consistency. The occluder material writes no
  colour/depth (invisible to the camera) but `castShadow` with `shadowSide: DoubleSide`. There is
  no `dollhouse.ts` module and no dollhouse module-signal anymore — do NOT reintroduce a per-mode
  lighting suppression. (The unrelated orbit *camera-framing* "dollhouse" in `OrbitCamera.tsx`/wall
  reveal is a different concept and stays.)
- **ORBIT-STUDIO-LOOK: orbit gets ONE soft overhead studio key, and pays for it out of BOTH
  halves of the fill (flag `orbitStudioLook`, simple, default on).** ORBIT-CEILING above is why
  this is needed: orbit culls the ceiling and the invisible `CeilingOccluder` blocks the sun, so
  every room is lit by non-directional FILL alone — and fill casts nothing (INTERIOR-SHADOW), while
  the full-stack AO that stands in for contact shadow is calibrated for a WALK camera in a 1.9 m
  kitchen (AO-SMALL-ROOM, 5 / 0.7 m) and delivers almost nothing from 15 m up. Measured at the
  canonical orbit pose (13:00, `realistic`/capable, lights on, camera (18,12,16) → target
  (6.3,0.8,4.5)) over the flat's own crop (`left 470 top 230 width 830 height 600` at 1600×1000),
  Rec.709 luma on sRGB bytes, alongside an architectural-visualisation reference still and a
  Cycles render of the same exported pose:

  | | p05 | p25 | p50 | p75 | p95 | mean sat | R−B | sofa under/open |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | reference still | 56 | 114 | 156 | 193 | 218 | 0.312 | 43.9 | — |
  | Cycles, app exposure | 92.7 | 121.8 | 246 | 255 | 255 | 0.123 | −15.0 | 0.855 (clipped) |
  | **Cycles, −2.0 stops** | 32.4 | 46.5 | 209.8 | 234.3 | 254 | 0.179 | −4.1 | **0.635** |
  | app BEFORE | 127.2 | 161.7 | 186.0 | 200.9 | 233.5 | 0.104 | 14.4 | 0.749 |
  | **app AFTER** | **88.3** | 156.4 | 185.2 | 197.5 | **228.8** | 0.122 | 15.8 | **0.711** |

  The gap was SHADOW DEPTH and never brightness: p95 was already at parity (233.5 vs 218) while
  the darkest 5 % sat at 127 against 56. p50 moves 0.8 counts, so the change bought depth rather
  than dimming the frame. Full arm table (nine key/fill/AO points plus three isolating controls):
  `docs/open-graphics-decisions.md` item (ad).
  · **The key.** ONE extra `DirectionalLight` arriving from `normalize(0.35, 1, 0.25)` — nearly
    overhead with a ~22° tilt, because straight down leaves every vertical wall at `N·L = 0` and
    the wall gradients are half of what the reference reads as. Intensity **1.4** at full day, VSM
    `radius 5 / blurSamples 12` (≈9–11 cm penumbra at the default flat's 18.6 mm shadow texel),
    map size from `shadowMapSizeForExtent` capped at **1024**, plan-centred frustum sharing the
    sun's `sunTarget`. It rides the eased day level: a CONSTANT key took the 20:00 dollhouse mean
    **106.9 → 123.6** and p05 **19 → 49**, a night frame lit by a midday softbox.
  · **The fill compensation must reach the IBL PROBE, not just the hemisphere + ambient.** Scaling
    only `Lighting`'s analytical fill by 0.40 moved the orbit frame mean **181.9 → 180.4** — i.e.
    nothing, because `iblFillScale` has already dialled the analytic half down and the probe is the
    larger half by day (the same fact PHOTO-FILL records). `SceneEnvironment` therefore takes the
    same ramped `orbitStudioFillScale`. Shipped scale **0.40** at full day, `1` at night.
  · **The AO half rides the day level too.** Orbit takes `radius 1.2 / intensity 10` at full day
    against walk's 0.7 / 5. AO is a geometric cue, so ramping it looks wrong on first reading — but
    its job HERE is the contact shadow the overhead key cannot resolve from 15 m, and at night
    there is no such key; a constant orbit AO took the 20:00 frame mean 106.9 → 96.1 and p50
    102.5 → 84, re-basing every number ORBIT-NIGHT-CAPS tuned against. Intensity 12 was measured
    and rejected: it costs 24 counts of WHOLE open floor (176 → 152), which is AO-SMALL-ROOM's
    failure mode reappearing.
  · **The occluder opt-out is `onBeforeShadow`, and the two obvious mechanisms are both refuted.**
    `layers` cannot do it: three 0.184's `WebGLShadowMap.renderObject` filters casters with
    `object.layers.test( camera.layers )` where `camera` is the **MAIN render camera**, not
    `shadow.camera`, so a layer opt-out drops the occluder from the SUN's map too. A shadow-camera
    NEAR PLANE cannot either: it clips by depth along the view axis, and for a tilted key a
    horizontal ceiling plane spans ~10 m of such depths across a 14 m plan while the ceiling→floor
    separation is only `dir.y × 2.6 ≈ 2.4 m`, so the two ranges interleave (there is a unit test
    for exactly that inequality). What ships is three's own per-object, per-shadow-camera hook: the
    key's `shadow.camera.userData` carries `STUDIO_KEY_SHADOW_TAG`, and `CeilingOccluder`'s
    `onBeforeShadow` turns `colorWrite` + `depthWrite` off on the depth material for that one draw,
    `onAfterShadow` restoring them. **It mutates the material three hands it and does NOT bring a
    `customDepthMaterial`** — that instance was the first shape and was reverted, because it is the
    only part of this change that reaches WALK mode (where the occluder is present for consistency
    and casts into the sun's map). Verified live, not reasoned: deleting the tag at runtime puts the
    living-room floor straight back to the blocked reading (under 133.1 / open 176.4 against the
    flag-off 132.1 / 176.3), and the hook is observed firing 110× for the key's camera and 110× for
    the sun's.
  · **Fitting the key's shadow frustum to the plan slab is what makes it cast at all.** At the
    sun's `near 1 / far 59.5` a sofa seat 0.4 m above the floor is 0.7 % of the depth range, and
    VSM's variance bound reports the floor beneath it as nearly lit — the under/open ratio moved
    only 0.750 → 0.727 while the key carried three quarters of the floor's light.
    `studioShadowRange` fits `near`/`far` to the ceiling-to-floor slab plus the tilt's own depth
    spread (~16.4 → 30.8 m on the default flat). A residual leak remains and is honest: a 22° tilt
    displaces a 0.4 m-high object's shadow 0.18 m horizontally, so part of the floor under a piece
    genuinely IS lit.
  · **Walk and the room editor are untouched, STRUCTURALLY.** `Lighting`, `Effects` and
    `SceneEnvironment` take an `allowOrbitStudio` prop that only `Scene.tsx` passes —
    `cameraMode` alone cannot separate the two canvases, because the room editor is a second
    canvas over the SAME store and its `cameraMode` is also `'orbit'`. Measured against a
    two-run noise floor: the editor frame is **0.706 mean |diff| / 0.93 % of channels >2 / own-mean
    delta −0.000** against an off-vs-off floor of 0.707 / 0.93 %, i.e. identical. The walk living
    pose is unchanged on every percentile (p05 45.8→46.4, p25 129.0→129.1, p95 231.1 both, against
    a twin-run spread of 0.5/0.1/0.0); its residual pixel diff is edge-localised antialiasing plus
    the animating ceiling fan, and a diff heatmap shows every flat surface bit-clean.
  · **Cycles adjudicates the CONTACT RATIO and cannot adjudicate the percentiles.** Rendered from
    the same exported pose (`scene-glb.mjs MODE=orbit`, new; `render_still.py --section-cut 2.35`,
    also new — the orbit ceiling cull is BACKFACE culling, which does not survive an export, so
    without the cut a path tracer renders a solid sunlit roof and came back 62.96 % of pixels over
    luma 235). At the app's own exposure the physical open-top case CLIPS its interiors, so its
    p05/p25 are the sky and the shaded exterior rather than interior shadow; stopped down until the
    interiors resolve it reports the sofa under/open at **0.635**, which is the number the shipped
    0.711 is tuned toward and which sits mid-band against the photographic 0.579–0.725.
  · **Free.** `frame-time.mjs` (idle, sequential): orbit **p50 11.8 / p90 12.5 ms** against a
    flag-off control of 12.1 / 13.5 (bands 10.6–13.0 / 11.6–13.8), walk **p50 7.1 / p90 9.8 ms**
    (bands 6.8–7.3 / 10.0–12.1). A second shadow-casting light "should" cost a second shadow pass;
    it does not measurably, because PERF-MAX-1's freeze applies to it too and its direction is a
    CONSTANT — unlike the sun it cannot even move with the clock, so during a camera-only orbit
    drag its 1024² map is never re-rendered. The 1024 cap was therefore never tested against.
  · Sweep seams: `?studioKey=<intensity>&studioFill=<scale>&studioRadius=<texels>` (DEV, read at
    page load in `Lighting.tsx`/`SceneEnvironment.tsx`) plus the existing `?aoRadius=&aoIntensity=`.
    Instrument: `scripts/dev-probes/orbit-studio.mjs` (percentiles + the raycast-masked sofa
    under/open + the 20:00 blow-out control in one run, with `EXTRA=` to push a Cycles frame
    through the same crop and the same mask). Frames:
    `scripts/scenarios/orbit-studio-look-verify(-off).json`.
  · **One product item is NOT decided here** — the reference's warmth/saturation gap (R−B 44 vs
    15.8, saturation 0.31 vs 0.12) is mostly its wood floor and timber panelling against the
    pinned default palette, i.e. CONTENT. See `docs/open-graphics-decisions.md` item (ad).
- **The sun shadow map is FROZEN when nothing that shapes it changes (PERF-MAX-1).** The
  directional shadow frustum is centred on the plan, NOT the camera, so a pure camera orbit /
  turntable auto-rotate / walk produces an identical depth map every continuous frame —
  re-rendering the up-to-4096² map (`realistic`/capable; 2048² realistic/weak, 1024²
  performance/capable) each frame is pure waste
  (sun shadows are the profiler's #2 cost). `Lighting.tsx` sets the sun light's
  `shadow.autoUpdate = false` and only sets `shadow.needsUpdate = true` when the map can actually
  change: the day/night tween is easing (`!settled`), the light just (re)mounted, boot/warmup
  (`!sceneReady`), or the shared **shadow-refresh signal** (`shadowRefreshSignal.ts`) is active.
  That signal is pulsed (a) by `RenderPump.markDirty` for its whole settle tail — so EVERY
  discrete store change (furniture move/add/remove, plan edit, orientation, door toggle, finish,
  quality-tier remount) refreshes the map — and (b) each frame by a continuously-animating shadow
  caster (`pulseShadowRefreshForMotion` in `CeilingFan`/`StandingFan`/`Curtain`/`RollerBlind`).
  **Do NOT key the refresh off `animatedSourceCount()`** — it also counts wall-reveal fades, which
  change only opacity (three's shadow map ignores `opacity`) and fire on every orbit frame, which
  would defeat the freeze during the exact scenario it targets. Camera-only motion writes no store
  and pulses no signal, so the frozen (byte-identical) map is reused — zero visual change. Any new
  shadow-casting furniture that animates its transform without a store change must call
  `pulseShadowRefreshForMotion()` each moving frame, exactly like the fans/blinds.
- **No frame may approach the OS GPU watchdog (GPU-STARVE).** At High/Maximum a pan frame
  (DPR 2 × full-res N8AO × bloom × SMAA × transmission) can hit seconds on an iGPU; frames
  crossing the watchdog (~2 s Windows TDR) reset the driver → WebGL context loss → the canvas
  blanks white ("white flash while panning"). Two mechanisms, keep both intact:
  (1) `InteractiveDprController` (both Canvases, `interactiveDegrade` flag) halves the pixel
  ratio while a camera gesture is held (`cameraMotionSignal.ts` ← OrbitControls
  `onStart`/`onEnd`) and for 3 s after any >250 ms rendered frame (pure, unit-tested decision
  in `interactiveDegrade.ts`; never during recording; a long-frame delta is only trusted when
  the PREVIOUS frame was also continuously driven — the first gesture frame's dt spans the
  idle demand-mode gap and recorded phantom long frames). New camera-control surfaces must
  publish their gestures to `cameraMotionSignal`. (2) `ContextLossGuard` (both Canvases)
  rebuilds after a restore: shadow-refresh pulse (the frozen map would stay stale forever) +
  `contextRestoreSignal` bump (`SceneEnvironment` keys `<Environment>` on it —
  render-target-only resources don't survive a loss) + a frame-COUNTED pump hold (≥8 frames
  AND ≥1.5 s; a timed hold can elapse before a slow renderer's bake frame ever runs). Guard
  scenario: `scripts/scenarios/context-restore-rebuild.json`. Any new render-target-backed
  bake (probes, PMREM, accumulation) must subscribe to `contextRestoreSignal` or it will come
  back black.
- **TIER-GESTURE-END (S2, 2026-09-18): a mid-drag tier switch ends the gesture; its 2s+ compile
  is NOT split across frames.** `setQualityTier` flips `postprocessing`/`ao`/`ibl`/
  `shadowMapSize` at once (measured **2167ms/983ms, +23/+15 programs**) and now calls
  `cameraMotionSignal.ts:endAllCameraGestures()` first, so `InteractiveDprController` isn't left
  degrading for a tier about to stop existing (the observed DPR 0.5→1→0.5 thrash). The compile
  itself stays one synchronous `useLayoutEffect` block before paint — the overlay's DOM is
  already committed, so no half-compiled frame is paintable — rather than a `compileAsync` split,
  the FIREFOX-TIER-SWITCH shape already rejected above. The overlay is the accepted mitigation.
  **TIER-CHANGE-VEIL (S2 residual, 2026-09-18): that overlay no longer has to be the boot-brand
  splash.** `setQualityTier` now passes `showLoading(label, 'veil')` behind the `tierChangeVeil`
  flag (default on), so `App.tsx` renders `ui/loading/TierChangeVeil.tsx` — the same unbranded
  caption+bar veil idea as MODE-SWITCH-CROSSFADE below, but readiness-held (`scheduleTransitionHide`)
  rather than timer-held, since the compile burst above is real work a fixed timer would cut short.
  Flag off restores the exact splash this note measured. A sibling flag, not a shared one — the two
  switches are independent store actions and must A/B independently.
- **MODE-SWITCH-CROSSFADE (N3, 2026-09-18): orbit↔walk no longer raises the branded splash.**
  `setCameraMode` bumps `cameraSlice.ts`'s `modeTransition`, rendered by
  `ui/loading/ModeSwitchCrossfade.tsx` as a short unbranded veil, behind `modeSwitchCrossfade`
  (default on; off restores the old `showLoading` splash). Boot/tier splashes are untouched.
  **BACKDROP-WARMUP (N3 residual, follow-up shipped, now browser-verified — 2026-09-19):**
  `ShaderWarmup.tsx` warms `SceneBackdrop`'s firstPerson-only `scene.background` program
  (`WebGLBackground`'s box material, built inside `render()`, never reachable from
  `gl.compile()`) with one forced `gl.render()` of a THROWAWAY scene into a 1×1 offscreen
  `WebGLRenderTarget` — never the visible drawing buffer, so it is not the GPU-STARVE-3 /
  BLOOM-MIP-FLASH shape (both are about a stray render reaching the DEFAULT framebuffer; a
  render target does neither). Runs once per session (a dedicated ref, independent of the
  tier-keyed gate above), since the background shader carries no tier-dependent defines.
  **Census, real GPU, fresh session, desktop-metal (`gl.info.programs` `cacheKey`s before/after
  the first switch, `scripts/dev-probes/census-backdrop.mjs`, one-off, deleted after use): the
  +37 is confirmed (218→252) and ROOT-CAUSED — 27 `physical`/`STANDARD` + 4 `depth` + 4 `basic`
  + 1 `BackgroundCubeMaterial`, ALL ONE MECHANISM.** A direct `DirectionalLight` census found
  **orbit carries 2 directional lights, firstPerson carries 1** — `ORBIT-STUDIO-LOOK`'s
  orbit-only overhead key unmounts on the switch, and three bakes `numDirLights`/
  `numDirLightShadows` into EVERY program's cache key regardless of whether that shader reads a
  light (LIGHT-COUNT-STABLE's mechanism above, here triggered by camera mode rather than a
  fixture count). So the +37 is not 37 different walk-only materials — it is the ENTIRE currently
  -compiled lit/shadow/background material set recompiling once because one light left the scene.
  A no-switch control held flat (217→217) over the same window, ruling out streaming coincidence.
  **The shipped warm-up does NOT close this — verified, not assumed.** It runs at boot, still
  under orbit's 2-light census, so it warms a cache key matching neither mode (background is
  walk-only, so orbit never uses it; the real switch needs the 1-light census). Re-recorded
  fresh-session desktop-metal: RECOMPILE `218→249→254→…→253` across 4 events, worst STUTTER
  **366.7 ms** — this is the true cold-boot cost; the "255→256 / 133 ms" figure quoted for N3
  above is a SECOND switch in an already-warm session, not comparable. **Rendering the REAL
  scene instead of a throwaway one was tried and REJECTED**: still doesn't match (warm-up still
  runs pre-switch, under orbit's census) and costs **1671.5 ms / 28 programs** at boot — it
  compiles every other not-yet-compiled material in the same pass, moving the stall earlier
  rather than removing it. **Device-class dependent, confirmed live**: fresh-session phone-metal
  (weak) shows only RECOMPILE `206→207→208` (+2) / STUTTER 133.4 ms, because
  `ORBIT-STUDIO-LOOK`'s gate never mounts the extra key light on `weak` — no mismatch to warm
  around.
  **WALK-LIGHT-CENSUS-WARMUP (v0.35.8.2): attempted, closes only PART of this — measured, not
  assumed.** `ShaderWarmup` now hides the studio key (`lighting/studioKeyRegistry.ts`) and
  re-compiles under that census, same task as the `transparent` pass. Real GPU, desktop-metal:
  RECOMPILE net **+34→+31**, STUTTER **366.7→333 ms** — real but modest; the fix's own targeted
  mechanism (confirmed correct) reaches only a minority of eligible materials, cause unresolved
  (streaming settle, IBL-probe timing and colour-space drift were each measured and ruled out).
  phone-metal (no studio key) confirmed unchanged. Full measurement trail: `ShaderWarmup.tsx`'s
  docstring and `docs/audit/interaction-sweep-2026-09-18.md`.
- **Every drawing-buffer resize must repaint in the SAME task, and the interactive degrade is
  raw-GL-only (GPU-STARVE-3).** Resizing the drawing buffer (any `gl.setSize`/`setPixelRatio`,
  including r3f-internal ones) CLEARS it; in demand mode the scheduled invalidate renders on the
  NEXT rAF, so the browser composites a blank page-white canvas in between — at Maximum the
  first full-res frame after a restore takes hundreds of ms, so every degrade/restore toggle,
  tier switch, and DPR stomp flashed white ("white flickering in orbit/room editor at
  Maximum"). Three rules, probe-verified (`scripts/scenarios/interactive-dpr-seamless.json`,
  microtask-vs-frame-count probe — a microtask scheduled inside a resize runs before that
  task's composite):
  · Any code that resizes the buffer must synchronously `advance(performance.now(), true)`
    afterwards (guard: `!document.hidden && gl.domElement.isConnected`, try/catch) —
    `InteractiveDprController.apply` and `QualityController`'s clamp (a `useLayoutEffect`, NOT
    `useEffect` — plain effects run one composite late) are the two models.
  · The interactive degrade goes through **raw `gl.setPixelRatio`, never r3f `setDpr`**, plus
    the same-value r3f `setSize` nudge (`@react-three/postprocessing`'s composer only re-sizes
    its buffers on a `size` identity change and re-reads the drawing buffer; the nudge skips
    the GL resize for identical values so the raw ratio survives). Reason: r3f's root
    `configure()` re-runs on EVERY Canvas commit and calls `setDpr` whenever the `dpr` prop
    VALUE differs from `viewport.dpr` — a degrade held in r3f state was stomped back to full
    (buffer clear, no repaint, then a heal re-resize) by any store-driven Canvas re-render
    mid-gesture. Keeping `viewport.dpr` at the full clamp makes `configure()` a no-op.
  · The Canvas `dpr` prop (memoised `[1, dprMax]`) must always evaluate to the same value as
    `QualityController`'s `setDpr(min(devicePixelRatio, dprMax))` clamp, or `configure()`
    stomp-resizes on every commit (bites on hi-DPI devices if the prop is dropped — r3f's
    default is `[1, 2]`).
- **The post stack owns the view transform; the tiers below it use `gl.toneMapping` (TONE-POST).**
  three applies `renderer.toneMapping` **only when `_currentRenderTarget === null`** (straight
  from `WebGLRenderer.getProgram`: `if (material.toneMapped) { if (_currentRenderTarget === null
  || isXRRenderTarget) toneMapping = _this.toneMapping }`). Under `<EffectComposer>` the scene
  renders into an off-screen HalfFloat target and `postprocessing`'s `EffectMaterial` sets
  `toneMapped: false`, so High/Maximum ran with **no view transform at all** — raw linear HDR
  straight to the display, and `Lighting`'s per-frame `gl.toneMapping`/`gl.toneMappingExposure`
  writes (the entire `grade()` + user-exposure + `toneExposureBias` model) were dead code on
  exactly the tiers meant to look best. Measured at 13:00 on a Mac mini M4, fraction of
  pure-white pixels: Performance/Medium 3.4% vs High/Maximum **31.8%** — the reported
  "lighting is too aggressive on the higher tiers", and why the best tiers looked *less* real
  than the flat one. `EffectsImpl` therefore mounts a `<ToneMapping>` effect
  (`toneMappingPost.ts` maps the pure `ToneMappingMode` → the `postprocessing` enum, the twin of
  `toneMappingThree.ts`), driven by the **same** `resolveToneMapping` call `Lighting` uses so the
  look doesn't jump across the tier boundary. Exposure needs no new plumbing: the effect's shader
  `#include`s three's `<tonemapping_pars_fragment>`, whose operators all multiply by the
  `toneMappingExposure` uniform the renderer already uploads. **Effect order is load-bearing** —
  AO / DoF / Bloom are scene-referred and must come BEFORE the tone mapper; HueSaturation /
  ChromaticAberration / Vignette / Noise / SMAA are display-referred and must come AFTER.
  `postStackGuard.test.ts` pins both the presence and the ordering.
- **Chromatic aberration is now behind its own flag, default OFF (ORBIT-CLEAN-CUT).** The CA pass
  used to ride the `cinematic` tier setting alongside the film grain. On a LENS a sub-pixel RGB
  split is a photographic cue; on ARCHITECTURE it lands on long, high-contrast, near-axis-aligned
  edges — and the orbit dollhouse is nothing but those. Real-GPU zooms showed red/blue dotted
  fringes running along every wall top and a magenta hairline at a cap/face edge, at an offset of
  0.0006 ≈ **1 px at 1600 wide**: a rendering defect, not a photo cue. `EffectsImpl` therefore
  mounts `<ChromaticAberration>` only when `full && cinematic && isFeatureEnabled(
  'chromaticAberration')`, and that flag is `simple`-tier with `default: false`. **The grain
  (`Noise`, opacity 0.035) still follows `cinematic` unchanged** — it is not edge-localised and
  costs the look nothing. No tier setting moved, so `quality.test.ts`'s pinned settings objects are
  untouched. `postStackGuard.test.ts` pins the new gate (and that the grain did NOT get one).
  There is nothing to reference-render here: a lens fringe is an artefact of a physical lens the
  scene does not have, so a Cycles frame would show none of it either.
- **`<Bloom mipmapBlur>` is banned — it blanks whole frames on ANGLE/Metal (BLOOM-MIP-FLASH).**
  Its `MipmapBlurPass` rebinds a chain of ~15 differently-sized half-float render targets every
  frame; on Apple silicon that intermittently leaves the combined `EffectPass` shader sampling an
  unready blur texture, and since the composer's final blit runs regardless, the garbage lands on
  the default framebuffer and the WHOLE canvas goes blank. With `alpha: true` (r3f's default,
  which the orbit view relies on to show the page background around the model) that reads as the
  light page colour — the reported **"white flashes when rotating the view in orbit mode"** on
  the higher tiers. Blank frames per 78 captured during a real orbit drag at Maximum: full stack
  **4/78** (7/78 at night), Bloom alone **5/78**, everything-except-Bloom **0/78**, Bloom with
  `mipmapBlur={false}` **0/78**. Performance/Medium never flashed — they mount no composer, which
  is why the report was tier-specific. Ruled out first, so don't re-litigate them: WebGL context
  loss (`webglcontextlost` never fired), drawing-buffer resizes / the DPR degrade (no
  `setSize`/`setPixelRatio` anywhere near a blank frame, and turning `interactiveDegrade` OFF made
  it *more* frequent), `EffectPass` rebuilds (`EffectsImpl` re-renders 0 times during an orbit),
  every other pass individually, mip `levels` 5/6/7, and `alpha: false` (which only changed the
  flash colour to black). Bloom also only MOUNTS when `bloomActiveForDay(dayLevel)` — in daylight
  the ramp has zeroed its intensity, and an intensity-zeroed Bloom is not inert (its blur texture
  is still sampled by the combined shader). Repro/verify: `node scripts/dev-probes/blank-cause.mjs`.
- **Curtains dim the FILL, never the sun (KEY-FILL-BALANCE).** `curtainLightEffect` used to
  multiply the sun `DirectionalLight`'s intensity by `sceneAttenuationFactor` — the scene-wide
  AVERAGE curtain transmission. Two problems: that light *is* the sun (so one drawn bedroom
  curtain darkened the building's exterior too), and it is the **only shadow-casting light in the
  scene** — everything else (hemisphere, ambient, the IBL probe) is non-directional fill that
  casts nothing. On the default furnished 4-room flat at 09:00/Maximum that left sun 0.41 against
  ~1.10 of fill: a key:fill ratio of **0.37:1**, at which a cast shadow can only remove a small
  fraction of a surface's light and reads as a faint tint or not at all. (An earlier revision of
  this note cited "0.47% of pixels" for the shadow map's contribution; that figure came from a
  probe whose "shadows on" arm cleared the override by writing `undefined`, which SETS
  `shadowMapSize` to undefined and turns shadows off — so both arms were shadowless and the
  difference was noise. See QUALITY-OVERRIDE-UNDEF. Re-measured properly, the conclusion holds:
  see the feature-pricing bullet below.) The attenuation now
  rides the fill (`Lighting`'s hemisphere + ambient via `fillScale`, and
  `SceneEnvironment`'s `scene.environmentIntensity`) through the pure `look.windowFillAttenuation`,
  which is the light curtains actually block — diffuse skylight through the glass. Same magnitude,
  correct light: contrast (pixel σ) rose ~21% at Performance and ~10% at Maximum for a ~2-point
  mean-brightness cost. Measure with `node scripts/dev-probes/shadow-contribution.mjs`.
- **RETIRED: LIGHT-BUDGET-REPICK / LIGHT-SET-INVALIDATE.** These fixed a per-frame nearest-N
  re-pick that no longer exists. `FurnitureLights` used to hold the live set in REACT state and
  re-rank it on camera movement, so (a) a tier change left the old tier's light count mounted until
  the camera next moved, and (b) a set change requested no frame under `frameloop="demand"`, which
  deferred every lit material's recompile to the user's first gesture (measured 150 ms, +25
  programs). Both are structurally impossible now: the set is a `useMemo` over STORE values only
  (`items`, `lightMood`, the IES flag, the tier's `mergeCoincidentLights`) with no camera input, so
  every change that alters it is already a store change `RenderPump`'s `subscribe(markDirty)` sees,
  and there is no per-frame path left to re-pick on. The general lesson is why this entry survives:
  **a scene change held in React state rather than the store requests no frame in demand mode** —
  if you add one, call `invalidate()`.
- **A zero point-light census is CORRECT at the default `lightsMode` — don't re-file it as a bug
  (NIGHT-LIGHT-BUDGET).** `lightsMode` defaults to **`'off'`**, and `FurnitureLights` renders
  nothing at all in that state, so a census of the live scene reports **0 point lights at 21:00
  exactly as at 13:00**. That reads as a broken light system and is simply the switch being off.
  `scripts/dev-probes/night-lights.mjs` measures the state that actually mounts lights (orbit,
  21:00, `lightsMode: 'on'`) and reports the live count and frame cost per tier.
  **The nearest-N budget this note originally verified is GONE** — staging deleted `chooseEmitters`
  and `maxFixtureLights` (see the `lightsMode` bullet above), so the per-tier cap table that used to
  sit here has been removed rather than left to rot: it described 6/18/24/36 orbit budgets that no
  longer exist. What survives is the measurement that the default flat carries **19 emitting
  items** — the number any fixture-cost claim should be read against.
- **Wall TOP CAPS are bimodal at night BY DESIGN, not blown out (NIGHT-WALL-CAP).** Orbit culls the
  real ceiling, so every wall ends in a horizontal up-facing cap, and at night those caps read as a
  hard dark line along some walls and a bright one along others — which looks like an inked-outline
  artefact. Measured it is not one. `scripts/dev-probes/wall-cap.mjs` masks GEOMETRICALLY (raycast
  grid, keep hits whose world normal points up and whose hit point is above 2.0 m, which excludes
  floors and worktops) and compares both hours in ONE run at orbit/Medium with the lights on:

  | hour  | cap mean | p10   | p50   | p90   | dark (<40) | wall mean | cap/wall |
  | ----- | -------- | ----- | ----- | ----- | ---------- | --------- | -------- |
  | 13:00 | 185.3    | 170.8 | 180.9 | 203.8 | 0%         | 184.3     | 1.005    |
  | 21:00 | 115.8    | 42.2  | 129.5 | 176.7 | 4.5%       | 58.6      | 1.976    |

  So at night the caps are on average nearly **twice as bright as the vertical walls**, not darker
  — the caps are lit from the rooms below them, and the dark ones are exactly the caps over rooms
  whose lamps are off. Every dark sample is an ordinary wall body (`#f1f0ec`, `W x 2.6 x 0.2`),
  the same material as the bright ones, so there is no second material or mis-shaded cap geometry
  to find. At ~4.5% of caps and caps being ~3% of the frame, the dark bands are ~0.15% of pixels.
  **Two lessons worth more than the verdict:** a MEAN cannot see a bimodal population (the first
  run reported cap 115.3 vs wall 58.7 and looked like a clean refutation, when the caps were in
  fact split 42/177), and an eyeballed NDC point cannot be carried between probes with different
  poses — mask by world normal instead (meta-rule xii).
  · **SUPERSEDED IN PART by ORBIT-NIGHT-CAPS (rule 6 above).** This verdict measured the caps
    BEFORE the baked-GI `replace` patch reached them; that patch then handed each cut face the
    mirror-row (bottom) atlas slot and turned the bimodal caps into uniformly GLOWING white rims at
    night. They now fall back to three's analytic fill, so the table above is again the reading the
    caps are shaded by — and "by design, not blown out" is again the right verdict.
- **RETIRED: LIGHT-COUNT-STABLE's slot padding — but the COMPILE fact behind it is permanent.**
  three bakes the number of point/spot lights into every lit material's program cache key, so a
  +-1 change recompiles EVERY lit material: measured at **204-214 ms on the first frame of the first
  camera gesture, +29 programs**, all differing in one cache-key field (`18 -> 19`). The remedy was
  to render a QUANTISED number of slots and pad the spares with zero-intensity point lights (three
  counts a light regardless of intensity). That padding is gone with `chooseEmitters`, and correctly
  so: it existed only because the live set was re-ranked on camera movement, and the set no longer
  depends on the camera at all — the count now changes only on a design edit, which already pays a
  recompile the user attributes to their own action.
  **Keep the underlying rule:** any future feature that varies a light count DURING interaction will
  hit the same stall, and quantise-and-pad is the known remedy. Do NOT pad to a large fixed budget —
  that trades a one-off compile for a permanent per-fragment cost in every slot.
  Ruled out along the way, don't re-investigate: the mirror gate (0 of ~1480 orbit frames granted a
  reflection); wall-reveal material CLONES (a census showed +0 materials across the gesture); and
  `material.transparent` flipping (it IS in the cache key, but pre-warming the opposite variant
  compiled 15 extra programs at boot and moved the spike not at all — the 29 were the light count).
- **`ShaderWarmup` pre-compiles the transparent variant at boot.** It flips every scene material to
  `transparent: true`, compiles, and restores — all in ONE task, so no frame renders in the flipped
  state. This is a smaller win than LIGHT-COUNT-STABLE and was kept because the reveal genuinely
  does flip `transparent` on ~15 materials' worth of programs. An earlier version that called
  `compileAsync` in the CURRENT state was reverted for doing nothing: warming the variant already
  being rendered is by definition warming the one already compiled.
  · **It must use the SYNCHRONOUS `gl.compile`, never `gl.compileAsync` (FIREFOX-TIER-SWITCH,
    v0.33.2.2).** `compileAsync` threw an **uncatchable** `TypeError` at every tier switch on any
    driver without `KHR_parallel_shader_compile` — Playwright Firefox 150 (`can't access property
    "isReady", properties.get(...).currentProgram is undefined`) and headless Chromium under
    SwiftShader (`Cannot read properties of undefined (reading 'isReady')`) both reproduced it, and
    both log `THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported`. Mechanism
    (three 0.184 `WebGLRenderer.compileAsync`): with that extension it polls program status
    synchronously; **without** it, it defers to `setTimeout(checkMaterialsReady, 10)`, and that
    check reads `properties.get(material).currentProgram.isReady()`. A tier switch remounts a good
    part of the tree, so a material disposed inside that 10 ms window has already been dropped from
    the renderer's `properties` map by `deallocateMaterial` → `currentProgram` is `undefined` → the
    read throws **from a timer callback**, i.e. outside the promise chain (so the discarded
    `p.then(undefined, () => {})` could never catch it) and outside our own try/catch. The warmup
    gained nothing from the async variant: programs are created synchronously by both and the
    promise was thrown away. **Do not "handle" this with a rejection handler or a
    `window.onerror` — there is no catchable throw; the only fix is not to schedule the poll.**
    Note this was NOT a WebGL context loss: `gl.getContext().isContextLost()` reads `false`
    throughout and `ContextLossGuard` never fires. The `"WebGL context was lost."` warning that
    appears alongside it in Firefox is the app's OWN `ui/WebGLFallback.tsx` disposing its WebGL2
    *probe* canvas with `WEBGL_lose_context.loseContext()` at boot — benign, and unrelated to the
    scene renderer. Verify with `MODES=realistic` and
    `MODES=performance,realistic,performance node scripts/dev-probes/firefox-smoke.mjs` (both must
    exit 0) plus `scripts/scenarios/fallback-swiftshader.json` in Chromium.
- **Ambient occlusion is available BELOW the post tiers (TIER-AO).** `QualitySettings.ao` is
  separate from `postprocessing`: `medium` has `ao: true, postprocessing: false`, which mounts a
  MINIMAL composer — N8AO + the tone mapper + HueSaturation and nothing else. This matters because
  `medium` is the tier the adaptive ladder auto-selects for most browsers, and because interiors
  here are fill-lit, so AO is the only pass that gives a room corners or grounds furniture on the
  floor. Measured at Medium (`feature-price.mjs`, idle, 09:00): **2.2 ms for pixels>8 = 25.81% /
  meanAbsDiff 12.94** against a ~0 noise floor — the best value-per-millisecond of anything in the
  stack by a wide margin (post stack 5.7 ms for 7.35, IBL 2.2 ms for 3.16, sun shadows 2.9 ms for
  0.61). Medium sits at 8.4 ms p90, half the 16.67 ms budget, still 59.9 drawn fps. Two traps when
  touching this path:
  · **The tone mapper is mandatory in AO-only mode.** Mounting ANY composer disables three's own
    view transform (TONE-POST), so an AO-only path without `<ToneMapping>` would blow Medium's
    highlights exactly the way High/Maximum used to.
  · **Antialiasing must be REPLACED, not dropped.** The Canvas is created `antialias: true`, but a
    composer renders into its own off-screen target so that MSAA stops applying. SMAA belongs to
    the full stack, so the AO-only path sets `multisampling={4}` on the composer instead —
    otherwise adding AO would visibly WORSEN Medium's edges, shipping a regression as a feature.
  `postStackGuard.test.ts` pins both.
- **What actually suppresses interior cast shadows — measured, and it is NOT what it looked like
  (INTERIOR-SHADOW).** Run `scripts/dev-probes/interior-shadow.mjs`, an isolating ladder that
  toggles the occluder's `castShadow` live (occluder meshes are identifiable at runtime: theirs is
  the only material with `colorWrite: false` AND `opacity: 0`) and forces the frozen shadow map to
  rebuild. At Maximum, 09:00, ORBIT, against a 0.18 meanAbsDiff noise floor:

  | comparison                                   | pixels>8 | meanAbsDiff |
  | -------------------------------------------- | -------- | ----------- |
  | sun shadows, WITH sun reaching the interior   | 8.31%    | 3.17        |
  | what the ceiling occluder blocks              | 3.94%    | 2.51        |
  | frozen map vs forced-fresh map                | 0.02%    | 0.18        |

  Three conclusions, two of which kill earlier theories:
  · **PERF-MAX-1's frozen shadow map is CORRECT.** Forcing `shadow.autoUpdate = true` changes the
    image by 0.02% / 0.18 — i.e. nothing. The suspicion that the map was captured before furniture
    finished streaming and then never refreshed is disproved; don't re-litigate it.
  · **The CeilingOccluder is not the main villain.** It blocks a real but modest amount (3.94% /
    2.51), and disabling it does NOT produce furniture-on-floor cast shadows — A and B are
    near-identical by eye. It is also self-limiting by geometry: it only blocks rays arriving
    steeply from above, so it matters most near solar zenith and little at low sun.
  · **The residual flatness is NOT the key:fill ratio either.** An earlier revision of this note
    said the sun was "~0.99 against ~1.1 of fill" — that was wrong, and wrong in an instructive
    way: it quoted the PRE-KEY-FILL-BALANCE fill numbers next to a POST-fix sun. Measured live
    (`scripts/dev-probes/light-balance.mjs`): sun 0.985–1.000 against fill 0.455–0.457, i.e.
    **2.17–2.19:1 in daylight** — a healthy photographic ratio that KEY-FILL-BALANCE already
    achieved. Pushing it further would only risk the blown highlights fixed in v0.31.0.0. The
    reason interiors stay flat is simpler: indoors the sun reaches almost nothing (real ceiling in
    walk, occluder in orbit, walls everywhere), so the ratio has nothing to act on and interiors
    are effectively fill-ONLY. The only thing that shapes fill-only lighting is ambient occlusion
    — see TIER-AO below.
  · **In WALK mode this ladder is uninformative** — the REAL ceiling exists there (only orbit culls
    it), so disabling the virtual occluder changes nothing and every comparison sits at the noise
    floor. Run it in orbit.
- **Sun-shadow map resolution tracks TEXEL DENSITY, not the tier (SHADOW-TEXEL).**
  `Lighting` no longer uses `quality.shadowMapSize` literally — that value is now the CEILING, and
  the actual size comes from `lighting/shadowFrustum.ts:shadowMapSizeForExtent(halfExtent, tierMax)`,
  which targets a constant ~20 mm world-space texel (`SHADOW_TEXEL_TARGET_M`) over the plan-fitted
  frustum. A fixed per-tier number meant the same setting gave wildly different quality depending on
  plan size: 4096 over the default flat is 4.6 mm/texel, the same 4096 over a 40 m custom plan is
  19.5 mm/texel. Now the default flat resolves to 1024 at every tier and a 40 m plan scales up to
  its tier ceiling. Justification is measured, in WALK mode at 09:00 standing next to furniture —
  the viewpoint where a contact shadow is actually judged — sweeping 4096/2048/1024/512
  (`scripts/dev-probes/walk-shadow.mjs`): living-room meanAbsDiff **0.43 / 0.21 / 0.43 against a
  0.35 noise floor**, with NO monotonic degradation (512 was no worse than 2048). Two reasons it
  doesn't show: Medium+ run VSM with `radius: 6`/`blurSamples: 12`, a blur wide enough to discard
  the extra texels; and the virtual ceiling occluder leaves interiors lit almost entirely by
  non-shadow-casting fill, so there is very little cast shadow indoors to resolve at all. Re-verify
  with `walk-shadow.mjs` before touching the target density. **Verified saving** (idle machine,
  `with-server.sh frame-time.mjs`, p50/p90): Maximum 11.1/11.7 → **9.0/10.1 ms** and its worst
  frame 21.9 → **16.8 ms**, i.e. back inside the 16.67 ms budget instead of over it; High 8.1/8.9 →
  8.1/8.7 (it only went 2048 → 1024, so a smaller win); Performance and Medium unchanged as
  expected. All four tiers now hold ~59.8 drawn frames/s.
  · **The scaling half of this rule is UNREACHABLE in shipped content — measured, so do
    not go looking for a big-plan regression in the starter plans (v0.31.5.42).** The
    justification above is all from the default 4-room flat, and the obvious worry was that
    a large plan (Executive / 3Gen / Jumbo / Maisonette, condo penthouse, landed terrace)
    scales up to its tier ceiling into a regime nothing had looked at. Running **all 19
    `PLAN_TEMPLATES`** through the app's own `shadowFrustumForPlan` +
    `shadowMapSizeForExtent` (`scripts/dev-probes/plan-shadow-texel.mjs`, module math only,
    no rendering): **every one resolves to 1024 at every tier, 18.6–18.8 mm/texel** — inside
    the 20 mm target. `wanted = 2*halfExtent / 0.02`, so 1024 is left only above halfExtent
    **10.24 m**, i.e. a plan spanning ~15.5 m; the largest shipped plan is `tpl-hdb-jumbo` at
    **14.2 x 13.0 m**, and 18 of the 19 sit BELOW the `MIN_HALF` 9.5 floor and are clamped up
    to it. So `high`/`maximum`'s 2048/4096 ceilings are dead weight for shipped content —
    which is exactly why SHADOW-TEXEL's measured saving was so large (Maximum dropped
    4096 -> 1024 on the default flat).
    · **18 identical readings looked like meta-rule (xxv) and were not.** Every plan
      reporting the same 9.50 is the signature of a variable never reaching the system, so
      the raw bounds were dumped before drawing any conclusion: they are correct and
      plan-specific (each span matches that plan's declared `extent` minus wall thickness).
      The plans really are all that small. Check the bounds before filing the bug.
  · **The tier CEILING silently defeats the texel target on a large CUSTOM plan, and that is
    by design but was never stated.** Only a user-drawn plan can reach the scaling regime;
    synthetic square plans through the same two pure functions give:

    | plan span | halfExtent | medium        | high         | maximum      |
    | --------- | ---------- | ------------- | ------------ | ------------ |
    | 16 m      | 10.5       | 1024/20.5 mm  | 2048/10.3 mm | 2048/10.3 mm |
    | 30 m      | 17.5       | 1024/34.2 mm  | 2048/17.1 mm | 2048/17.1 mm |
    | 40 m      | 22.5       | 1024/43.9 mm  | 2048/22.0 mm | 4096/11.0 mm |
    | 90 m      | 40.0 (cap) | 1024/**78.1 mm** | 2048/39.1 mm | 4096/19.5 mm |

    At `maximum` the target holds everywhere (10.3–19.5 mm) right up to the `MAX_HALF` 40 m
    cap — the design works where it has the resolution to work. At `medium`, whose 1024
    ceiling cannot scale, a 90 m custom plan gets **78 mm/texel, 3.9x the target**. That is
    the documented meaning of `tierMax` ("a tier can still cap the spend") and the right
    trade — letting Medium allocate 4096 would blow the frame budget on exactly the hardware
    the cap exists for — but Medium is what the adaptive ladder auto-selects for most
    browsers, so the consequence is worth knowing before anyone quotes "~20 mm everywhere".
    Nothing was changed: no shipped plan reaches it, and the alternative is worse.
    Note the density is deliberately SAWTOOTHED, not monotonic, because the size rounds up to
    a power of two — a 40 m plan at maximum (4096/11.0 mm) is finer than a 30 m one
    (2048/17.1 mm). That is the clamp working, not a bug.
- **Surface materials are NOT broken — measured, don't re-audit (MATERIAL-AUDIT).**
  `scripts/dev-probes/material-audit.mjs` walks the live scene graph and reports which PBR maps are
  actually bound, classified GEOMETRICALLY (r3f meshes carry no `name`, so a name-based classifier
  reports everything as "other"). At Medium, after texture streaming settles: walls 114 meshes with
  25 albedo / 59 normal / 51 roughness; large floors 4 with 1 / 3 / 1; furniture+other 962 with
  169 / 312 / 215. **`aoMap` is bound on ZERO materials** at any tier. Zero failed non-font
  requests, anisotropy up to 16, 138 textures uploaded at 1024². So most walls are flat near-white
  solids by AUTHORING (a solid albedo plus a subtle normal/roughness is a defensible model for
  painted plaster), not by a load failure — and the missing `aoMap` matters much less now that
  screen-space AO runs from Medium up (TIER-AO). Changing the default flat's wall finishes to
  textured plaster is a CONTENT decision, not a bug fix; don't file it as one.
  Two follow-ups measured the same walls further, and both landed against the obvious guess:
  · **The wall's responsive channel is the NORMAL, not the albedo** (`wall-detail.mjs`). The
    prediction was the opposite: since interiors are fill-lit and `AmbientLight` is perfectly
    direction-independent, a normal map "should" be invisible indoors. Measured at walk/Medium/
    09:00 against a 0.80 meanAbsDiff noise floor: `normalScale` x6 moved the image **6.21**
    (20.4% of pixels), removing the normal map entirely moved it **1.86**, and adding a subtle
    albedo mottle moved it **2.31 but with only 0.64% of pixels past the threshold** — i.e. a
    broad ~1% darkening rather than visible detail. So the plaster normal IS doing work (the IBL
    probe is directional enough to reveal it) and there is no missing-albedo problem to fix. x6
    is also plainly gaudy on inspection — popcorn-ceiling stucco — so the shipped strength is
    about right. Don't "add an albedo texture to the walls"; it buys a tint, not detail.
  · **What DID read as cartoon was a colour cast, and it came from ONE default finish.** See
    WARM-WALL-CAST in `src/materials/CLAUDE.md`, plus the two probes that found it:
    `chroma-audit.mjs` (raycast a screen grid, rank materials by coverage x saturation — the
    rendered frame carried mean chroma 0.206 while every high-coverage albedo sat at ≤0.22) and
    `warm-cast.mjs` (separates the illuminant's share from the finish's; the illuminant owned
    0.003 of it). `pick-surface.mjs` resolves an NDC point to a furniture `defId` + its exact
    material values, which is how "those two saturated orange blocks" became "dining-chair
    backrests at 1.75 m". Prefer these to eyeballing a still.
- **Everything this run judged was at 13:00; 19:00 is CLEAN and flatters the flat
  (SECOND-HOUR, v0.31.5.59).** Flat noon is the condition least likely to reveal a normal-map or
  gloss problem, so the whole `.20`-`.58` body of work was re-shot as an 11-room / 44-frame
  `walk-tour.mjs` at `HOUR=19`, with the low sun raking across the west-facing openings.
  · **Nothing broke, and the two shipped plaster rounds hold up under raking light** — the
    condition that would most easily have exposed a normal map tiled too fine (`.56` shipped 0.6 m
    with the Nyquist rolloff measured one octave away at 0.15 m). No shimmer, no moire.
  · The curtains in particular read markedly BETTER at 19:00 than at 13:00 — the low sun picks out
    the pleats and the fabric gains real depth, where flat noon renders it as a soft grey wall.
    That is worth knowing before anyone retunes curtain material on the strength of a midday
    frame, and it is a second argument for looking at more than one hour.

- **NIGHT WITH THE LIGHTS ON is clean, and it is the condition the emitter table was tuned for
  (NIGHT-SWEEP, v0.31.5.60).** Everything `.20`-`.59` judged was daylight; `walk-tour.mjs
  HOUR=22 LIGHTS=on` (new `LIGHTS=` env; the run prints its resolved `tier/lightsMode/timeMode`
  so the arm's own state sits beside the frames, meta-rule iv) swept all 11 rooms. Note that
  lights-OFF at 22:00 is a near-black frame and NOT the interesting case — DEFAULT-GLOOM (`.54`)
  is why this needs setting explicitly.
  · **Fixtures read as fixtures, not as floating blobs.** The living/dining fan light shows a lit
    diffuser with a restrained bloom halo at the rim and real spill onto the ceiling — the bloom
    threshold is doing its job (no milky veil, and the fixture still clears it).
  · **The plaster's new 0.6 m tile survives a close point source**, which is a harsher normal-map
    test than the 19:00 sun `.59` used: a lamp ~1 m away rakes the wall far more steeply than any
    sun angle. No shimmer, no moire; the wall reads as warm painted plaster.
  · **One real defect found, and it is NOT a lighting defect** — see "Bedside lamp / curtain
    interpenetration" in `TODO.md`. It reproduces at 13:00 too; night only made it visible.

- **A composer now mounts at EVERY tier, because `performance` without one dropped the interior
  walls (WALL-NO-COMPOSER, v0.31.5.67).** `Effects.tsx` used to `return null` when a tier wanted
  neither the full post stack nor AO. Only `performance` has both false, so it alone rasterised
  straight into the canvas' DEFAULT framebuffer — which `Scene.tsx` creates with
  `preserveDrawingBuffer: true` for the in-app PNG/video capture — and in that combination
  **interior wall faces were not drawn at all.**
  · **Discriminator:** centre-band mean luminance of `mainBedroom` yaw 2 — **~112 walls present,
    ~151 gone**. Fixed: `performance` **150.7 -> 113.8**, `medium` unchanged at **112.6**.
  · **Confirmed a real defect, not a harness artefact**, in three environments: headless
    ANGLE-metal (150.7), headless ANGLE-**gl** (150.5) and a **headful real Chrome window**
    (150.7). `performance` is the tier the capability ceiling drops phones to.
  · **Eleven arms refuted everything else** before this: all six tier settings individually, AO
    itself (`ao=false` + `postprocessing=true` → walls present, so AO is innocent and the composer
    was the real variable), `polygonOffset` (stripped from 285 materials), MSAA
    (`antialias: false`), a stale buffer (`PUMP=12` forced renders), missing geometry, culling,
    alpha, probe timing, and any dither/discard path — no `discard` exists in the codebase.
  · **`preserveDrawingBuffer: false` was the obvious one-line fix and is RULED OUT.** Five
    features read the main canvas with `toDataURL` (`openReport`, `openMoodboard`,
    `openShareCard`, `slotThumbs`, `NavCluster`) and none forces a render first. Measured through
    the app's own readback: with the flag on, 1.43 MB / 100% non-black; with it off, **30 KB /
    0.0% non-black — a blank PNG**. Note a puppeteer screenshot does NOT catch this: it uses the
    browser compositor and works either way.
  · **The minimal composer is not empty.** Under a composer three does NOT apply `gl.toneMapping`
    (`toneMappingPost.ts`), so it must still carry `ToneMapping` + `HueSaturation` or the tier
    would render raw linear HDR. `EffectsImpl` gained an `ao` prop so `N8AO` — the whole cost this
    tier exists to avoid — stays off.
  · **Priced before shipping (meta-rule lxviii).** `frame-time.mjs` at `performance`, load ~2.0
    both runs: **before p50 4.1 ms / p90 4.4 ms / 59.9 fps; after p50 4.1 / p90 4.4 / 59.9.**
    Identical — and this is a genuine null rather than a failed mutation, because the same build
    moved the wall metric 150.7 -> 113.8 (meta-rule xxv).
  · `composerPlan()` is the pure invariant, unit-tested: **a composer mounts for every tier**;
    `full`/`ao` decide only which passes it carries, never whether it exists.

- **`maximum` reviewed for the first time, and all four tiers agree on tone (TIER-SWEEP-COMPLETE,
  v0.31.5.68).** Every visual judgement in `.20`–`.67` was made at `medium` or `performance`;
  `maximum` is the only tier with `aoFullRes`, the full post stack, DoF and the highest
  `envResolution`/`shadowMapSize`, and none of it had been looked at. An 11-room / 44-frame
  `walk-tour.mjs TIER=maximum` at 13:00: **no bloom veil, no crushed blacks, no milky curve, no
  DoF on the wrong plane.** AO grounds the corners more deeply than `medium` and the plaster reads
  correctly; 354 visible meshes / **117,676 triangles** against medium's 87,228 (the higher
  `geometryDetail`), 0 empty frames.
  · **`tier-look.mjs` across all four tiers at 13:00** — the quantitative version of the same
    question:

    | tier | slab mean | contrast (σ) | clipped |
    | --- | --- | --- | --- |
    | performance | 180.87 | 22.07 | 0.07% |
    | medium | 178.22 | 23.07 | 0.05% |
    | high | 178.48 | 22.21 | 0.04% |
    | maximum | 179.36 | 22.61 | 0.05% |

    A spread of **2.7 luminance and 1.0 σ across the whole ladder**. Nobody has to worry that the
    tiers drift apart tonally; they do not.
  · **This also discharges the `.67` risk (meta-rule lxix).** Mounting a composer at `performance`
    moved the view transform from `gl.toneMapping` to the `ToneMapping` PASS. If that transfer
    were imperfect the tier would sit visibly apart in the table above — it sits within 2.7 of the
    others, and the DARK case confirms it too: `walk-tour TIER=performance HOUR=22 LIGHTS=on` is
    clean, walls present, fixtures reading as fixtures, no crushed blacks. Tone in the dark is
    where a botched transfer would show first.
  · **The `.67` fix is stable across runs**, re-measured a day-part later: `performance` 113.7,
    `medium` 112.6 (walls present at both; the defect read ~151).

- **Price a render feature in BOTH currencies, and against a measured noise floor**
  (`scripts/dev-probes/feature-price.mjs`). It applies one `qualityOverrides` change at a time and
  reports p90 frame cost in ms alongside two visual metrics. Measured at Maximum, 09:00, DPR 2,
  `interactiveDegrade` pinned off:

  | feature removed        | Δ p90    | pixels>8 | meanAbsDiff |
  | ---------------------- | -------- | -------- | ----------- |
  | sun shadows (4096 → 0) | −2.9 ms  | 0.84%    | 0.61        |
  | post stack             | +5.7 ms  | 20.0%    | 7.35        |
  | IBL probe              | +2.2 ms  | 10.2%    | 3.16        |
  | *baseline repeated*    | ±1.3 ms  | 0.12%    | 0.27        |

  The repeated baseline IS the noise floor — quote it, or a 0.6 reading looks meaningful when it is
  barely 2x noise. On that basis **the sun shadow map is the worst value-per-millisecond feature in
  the stack** (and 09:00 is its best case; at 13:00 the near-zenith sun is fully blocked by the
  virtual ceiling occluder). At 13:00, `shadowMapSize` 1024 and 2048 were both visually
  indistinguishable from 4096 (0.07% pixels) while ~3 ms cheaper — a resize is the obvious next
  move, but it must be verified in WALK mode first, since these numbers are all orbit-only and map
  resolution buys sharpness exactly where a close-up contact shadow is judged.

  Four ways this probe lied before it was trustworthy — check all of them in any new one:
  · **Clear overrides with `resetQualityOverrides()`, never by writing `undefined`** (see
    QUALITY-OVERRIDE-UNDEF) — otherwise every case after the first silently ran with shadows and
    the whole post stack disabled.
  · **Reset the camera to a fixed pose before every capture.** Diffing stills taken from wherever
    the previous case's orbit ended reported 48–70% "pixels changed" for every feature, including
    ones that barely touch the image.
  · **Pin `interactiveDegrade` off.** It halves DPR during a gesture but only at the post tiers, so
    the moment a case flips `postprocessing` the comparison is between two different resolutions —
    which measured "turning post off costs +7.6 ms".
  · **Discard a warm-up pass and repeat the baseline at the end.** The first measured case pays
    shader compilation: the baseline read 16.8 ms first and 12.0 ms warm, making every later case
    look ~3 ms cheaper than it was.
- **The tier is chosen by MEASURING FRAMES, not by detecting hardware (TIER-ADAPTIVE).**
  This replaces both the old unconditional `performance` default and the capability-detected
  default that briefly followed it. Rationale in `adaptiveTier.ts`; the short version is that in
  a browser the hardware isn't legible — `WEBGL_debug_renderer_info` is deprecated in Firefox and
  slated for removal, disabled by `privacy.resistFingerprinting`, farbled by Brave, and generic on
  Safari — and hardware identity is the wrong KIND of signal anyway (the thing actually capping the
  post tiers was a mirror's extra scene pass, a *content* cost, and 7x the viewport pixels moved
  the frame budget by ~9%). `quality.ts:capabilityCeilingTier` survives only as a best-effort
  **veto** (software rasteriser / phone / no-WebGL2 / <4 cores → `performance`; everything else →
  `high`, meaning "no opinion"). First visit boots `initialAutoTier` (conservative `medium`);
  `QualityController` then walks the ladder both ways and the settled tier persists, so a repeat
  visit skips the ramp (`qualityAutoSettled` stops the boot pick stomping it).
- **A near-field / bulb-radius clamp CANNOT fix the fixture hot spots — refuted by arithmetic,
  don't build it (FIXTURE-NEARFIELD-REFUTED).** BLOOM-NIGHT-NEARFIELD found non-emissive surfaces
  reaching 8.22 in scene-referred HDR at 0.51 m from an intensity-9 lamp, and the obvious physical
  fix is to treat the emitter as a sphere rather than a point (`1/max(d², r²)` instead of `1/d²`).
  It cannot work here. three ALREADY clamps: `lights_pars_begin.glsl`'s `getDistanceAttenuation`
  is `1.0 / max( pow(lightDistance, decayExponent), 0.01 )`, and at `decay = 2` that 0.01 IS a
  **0.1 m bulb radius**. For a sphere clamp to change anything at d = 0.51 m it would need
  `r² >= 0.26`, i.e. a bulb **51 cm in radius**; a realistic lampshade (r ~= 0.15 m) leaves
  `max(0.26, 0.0225) = 0.26` — byte-identical. **The hot spots are not in the near field at all**
  (measured at 0.74-1.15 m, p50 0.98 m), they are simply where a lamp sits relative to a wall, and
  a real lamp 0.5 m from a wall does throw a bright pool. If fixture brightness is ever revisited
  the lever is the emitter INTENSITY table in `furniture/lightEmitters.ts`, not the falloff shape.
- **Fixture lights cost almost nothing on the flat tiers and ~1.7 ms on the post tiers
  (FIXTURE-COST).** Measured with `scripts/dev-probes/night-lights.mjs`, which now runs a
  lights-OFF control arm at each tier so the delta is the fixtures and nothing else (meta-rule xvi),
  on the default flat at 21:00 in orbit with all **19** emitters live (the per-tier nearest-N cap is
  gone — see the `lightsMode` bullet):

  | tier        | lights off p50 | lights on p50 | fixture cost | on p90 | on max |
  | ----------- | -------------- | ------------- | ------------ | ------ | ------ |
  | performance | 6.9 ms         | 7.0 ms        | **0.1 ms**   | 8.0    | 9.1    |
  | medium      | 8.3 ms         | 8.6 ms        | **0.3 ms**   | 9.1    | 9.5    |
  | high        | 9.8 ms         | 11.6 ms       | **1.8 ms**   | 13.1   | 13.6   |
  | maximum     | 10.1 ms        | 11.7 ms       | **1.6 ms**   | 12.5   | 13.7   |

  Every tier stays inside the 16.67 ms budget with every fixture lit, so removing the cap did not
  cost the flat tiers anything measurable. **These are SUBMIT-time numbers** (see the caveat below)
  and they disagree with the dev profiler's 9.10 ms-of-34.54 ms figure for the same 19 fixtures at
  Maximum; that disagreement is unresolved — see below.
- **`gl.finish()` inside the rAF loop measures VSYNC, not GPU work — a failed method, recorded so
  it is not retried (COST-SIGNAL-VSYNC).** `frameCost.ts` concedes it measures CPU submit time and
  assumes submit "tracks well enough"; staging's reworked profiler reports Maximum spending 9.10 ms
  of a **34.54 ms** frame on fixtures where this suite measures the whole frame at ~11.7 ms, so the
  assumption looked testable. `scripts/dev-probes/cost-signal.mjs` measured both signals over the
  same frames — submit (sum of `render()` durations) against completion (first render start to
  after a `raw.finish()` at frame end):

  | tier | submit p50 | completion p50 | ratio |
  | ---- | ---------- | -------------- | ----- |
  | performance | 4.7 | **16.5** | 3.51 |
  | medium      | 7.5 | **16.5** | 2.20 |
  | high        | 9.2 | 9.6      | 1.04 |
  | maximum     | 10.4| 10.9     | 1.05 |

  **The result refutes the METHOD, not the meter.** Performance — the cheapest tier — reports the
  HIGHEST completion time, pinned at 16.5 ms against a 16.67 ms refresh interval. If completion
  measured GPU work the cheapest tier would be the fastest; instead `finish()` is blocking on the
  presentation queue, which is the same "rate is clamped by vsync" trap this file already documents
  for frame RATE, reappearing in a completion-time metric. So this probe CANNOT adjudicate whether
  submit time under-reports GPU work, and the discrepancy with the dev profiler stays OPEN. The
  profiler avoids the trap by driving a synchronous `advance` outside the rAF/present loop and
  settling until the cost stops moving — **use `src/dev/profiler` for that question, not a
  finish() in a rAF callback.**
- **The ladder's signal is frame COST in ms, never frame RATE (`scene/frameCost.ts`).** This Canvas
  is `frameloop="demand"`, so rate measures how often the pump chose to draw, not how fast the
  device can draw: measured 59.7 rAF/s against **30.5 actual renders/s while each frame cost
  5.7 ms**. A rate-based guard reads that as "30 fps, failing" and demotes a scene using a third of
  its budget — the first cut of this ladder did exactly that, walking Medium down to Performance on
  hardware with two tiers of headroom. Rate is equally useless upward because vsync clamps it
  (Performance and Medium both report exactly 60). True p90 cost per displayed frame on the M4
  reference machine at 2560x1600: performance 4.7 ms / medium 6.0 / high 8.9 / maximum 11.7,
  against a 16.7 ms budget. The meter wraps `renderer.render` and **SUMS every call inside one
  animation frame** — the post stack issues ~18 SIBLING render calls per frame, so per-call timing
  reports the parts and inflates the apparent rate to ~1000/s. Because an idle demand-mode frame
  renders nothing and therefore contributes no sample, cost-based sampling also removed the need
  for the old `isRenderingContinuously()` gate. Any future adaptive-quality logic must read cost,
  not rate. Verify end-to-end with `scripts/dev-probes/tier-ladder.mjs` (add `CPU=6` to throttle
  and exercise the DOWNWARD half) and `frame-time.mjs`.
- **Promotion is a PROBE with a LEARNED CEILING.** Cost tells you what the current tier uses, not
  what the next one would cost (the step between rungs is content-dependent), so the ladder steps
  up on evidence and steps back if it doesn't hold. Oscillation is therefore the real risk, and it
  is prevented by `autoMaxTier` — the rung that FAILED, persisted per device and never retried —
  **not** by a wider threshold. `autoMaxTier` must never be set on the way UP: conflating "highest
  reached" with "learned ceiling" caps the ladder at the rung it just reached, so `performance`
  would climb to `medium` and then never to `high`. `maximum` is never auto-selected. Verified:
  unthrottled boots `medium` → promotes to `high` at ~11 s and holds; at `CPU=6` it demotes to
  `performance` at ~8 s, learns the ceiling and holds; both survive a reload.
- **The adaptive FPS guard is deaf during boot warm-up (`FPS_GUARD_WARMUP_MS`, 5 s after
  `sceneReady`).** It samples only while the pump renders CONTINUOUSLY — and boot is exactly
  that (loader overlay, asset streaming, shader compilation, the first shadow/IBL bakes), at the
  least representative moment there is. This never mattered while everyone booted at Performance
  (no tier to step down from); the moment TIER-AUTODETECT landed, the guard walked the detected
  tier straight back down during warm-up and capability detection looked broken. Gate is the pure
  `shouldSampleFps(sceneReady, msSinceReady)`.
- **Bloom's threshold clears DAYTIME surfaces but NOT night fixture near-fields — measured, and
  the wording above used to overstate it (BLOOM-NIGHT-NEARFIELD).** RD-409 says the threshold sits
  "above broad lit surfaces". That is true of the case it was validated against and false in
  general. `scripts/dev-probes/bloom-threshold.mjs` reads the domain the threshold actually tests
  — the scene rendered into a FLOAT render target, which three leaves untone-mapped because it
  only applies `renderer.toneMapping` when the target is null (TONE-POST), so the buffer holds the
  same scene-referred linear HDR Bloom sees — and buckets pixels by a geometric mask
  (wall-shaped up-facing caps / vertical walls / emissive materials):

  | state              | cap p99 | cap max | cap over 1.35 | wall max | wall over |
  | ------------------ | ------- | ------- | ------------- | -------- | --------- |
  | 13:00, lamps OFF   | 0.424   | 0.424   | **0%**        | 0.469    | **0%**    |
  | 21:00, lamps ON    | 2.03    | 2.06    | **5.32%**     | 8.22     | 2.3%      |

  The daytime row CONFIRMS RD-409's original finding and validates the probe: sunlit surfaces sit
  at 0.42-0.47, nowhere near 1.35, so the threshold really does clear daylight. But with the
  fixtures on, ordinary non-emissive painted surfaces clear it too — which is what draws the soft
  white haloes along the wall top caps at Maximum that Medium (AO-only composer, no Bloom) does
  not have.
  **It is NOT a misplaced light and NOT a threshold error.** Every one of the 280 over-threshold
  pixels lies 0.74-1.15 m from a live fixture (p50 0.98 m), and the hottest (8.22) is 0.51 m from
  an intensity-9 lamp — nothing is embedded in geometry. It is plain inverse-square falloff: three's
  `pointLight` is a DELTA light with no bulb radius, so irradiance goes as 1/d² without bound, and
  a wall half a metre from a lamp genuinely reaches several times the threshold. A real lamp at
  that distance would bloom in a photograph too, so the behaviour is defensible and **nothing was
  changed**. Do NOT "fix" this by moving `luminanceThreshold`: it is pinned in lock-step with
  `fixtureGlow` (the test asserts `BLOOM_LUMINANCE_THRESHOLD === look.BLOOM.luminanceThreshold`
  and that every emitter peak clears it), so moving it either re-blooms daylight or stops fixtures
  glowing — and it would not touch the 1/d² near-field that actually produces the hot pixels.
  If this is ever revisited, the lever is the LIGHT MODEL (a finite bulb radius / near-field
  clamp), not the post stack. Re-measure with the probe before and after; it prints p50/p90/p99 and
  a fraction-over-threshold, never a mean.
  **One probe trap worth keeping:** the first "daytime control" ran with `lightsMode: 'on'` and came
  back nearly identical to night (cap over 5.32% in BOTH), which looks like the probe is insensitive.
  It was not — the lamps were lit in both arms, so the same near-field hot spots existed in both. The
  control that actually tests RD-409's claim is 13:00 with the lamps OFF.
- **Bloom only blooms genuine HDR emitters, never broad daytime surfaces** (RD-409). The
  Bloom `luminanceThreshold` (`look.BLOOM.luminanceThreshold`, 1.35) sits **above** sunlit
  white walls/ceilings under the day IBL + ~1.2 graded exposure and **below** the night
  light-fixture emissive peaks (`lighting/fixtureGlow.ts` — shade ~1.6 / strip ~1.8 / bulb
  ~2.05). A lower threshold (the old 1.05) smeared a milky white veil across the whole
  High/Maximum frame in daylight. Orbit now runs this same full graded simulation + virtual
  ceiling (ORBIT-CEILING) rather than a flat dollhouse fill, so the threshold applies
  identically in every view mode. The two live in lock-step: the `fixtureGlow` test asserts
  `BLOOM_LUMINANCE_THRESHOLD === look.BLOOM.luminanceThreshold` and that every emitter peak
  clears it with margin — **raise/lower one and you must move the other**, or daytime blooms
  again or fixtures stop glowing.
- **No `AccumulativeShadows` ground catcher** (RD-410, retired). It assumed one hero object
  over an empty floor; for a whole apartment (own floor + real PCF sun shadows + contact
  shadows + corner AO) its 19 m catcher plane caught the building silhouette and drew a large
  dark rectangle on the ground, bigger than the footprint. `ShowcaseController` renders
  nothing and pins `showcaseAccumulating=false`; the `showcase` quality flag is `false` on
  every tier. Grounding comes from the cues above — don't reintroduce a scene-wide
  shadow-catcher plane.
- **A shipped TEMPLATE renders correctly on BOTH storeys — but the tour probe was
  hardwired to the default flat and could never have shown you (TEMPLATE-WALK,
  v0.31.5.95). Nothing changed in `src/`.** Every visual judgement in `.20`–`.94` was
  the default 4-room flat; 19 `PLAN_TEMPLATES` ship and none had been walked.
  · **The instrument was the blocker, and it failed SILENTLY.** `walk-tour.mjs` derived
    its poses from `Object.keys(ROOMS)` — the default flat's hardcoded constant table —
    so touring any other template would have produced **zero poses and an empty tour**,
    reading as "nothing to see" rather than "this probe cannot do that". Poses now come
    from the LOADED plan (`isDefaultPlan(plan)` keeps the `ROOMS` order for the default
    flat, so existing runs are unchanged — **verified: still 11 rooms, 354 meshes /
    87,486 tris**). New knobs: `PLAN=<template id>`, `LEVEL=<upper level id>`,
    `FURNISH=1`. Second instrument trap in two rounds; see meta-rule (cix).
  · **`tpl-hdb-maisonette` is the first MULTI-STOREY plan ever rendered in a review.**
    Its `upperLevels[0]` (`em-up`) sits at elevation 2.9 m, and `FirstPersonCamera`
    already stands the walker at `level.elevation + eyeHeight` for whatever
    `viewLevelId` selects — so the storey was reachable all along, just never looked at.
    Ground 7 rooms / 28 frames, upper 8 rooms / 32 frames, **zero empty frames**; walls,
    cornices, doors, floors and the storey offset all render correctly.
  · **`applyLayoutPreset` IS multi-storey aware — I predicted it was not and was wrong.**
    `furnishPlanItems` takes `plan.rooms`, which looked ground-only. Measured on the same
    upper storey: **63 visible meshes / 15,698 tris when only re-homed vs 213 / 93,677
    after `furniture: 'clear'` + `applyLayoutPreset('move-in')`.** The furnished upper
    master bedroom shows bed, headboard and wall art.
  · **You cannot judge a TEMPLATE through the SWAP path, and that is a probe-design
    lesson, not a defect.** `replaceFloorPlan(tpl, { furniture: 'rehome' })` — the real
    user path — pulls the OLD flat's 87 items into the new shell: the maisonette living
    room came back with sofas overlapping each other and a coffee table intersecting a
    sofa, while every upper room stayed bare. That is `rehomeStrandedItems` doing exactly
    what PLAN-SWAP-STRANDED (`.90`) documents — it pulls items inside a room, it does not
    space them — so it is expected, and `.90`'s confirm already warns the user. **Use
    `FURNISH=1` to review a template's own design; use the default rehome path only to
    review the swap.**
  · **UNVERIFIED observation, recorded so it is not lost:** while standing on the upper
    storey the minimap still drew the GROUND plan and labelled the room
    "LIVING / DINING". It appeared in both upper-level arms but was not investigated, so
    treat it as a lead to confirm, not a finding.

- **PERF-TIER-LOOKS-FINE's open lead is now CLOSED: the phone tier's WALK view is clean
  too (PHONE-WALK-CLEAN, v0.31.5.94). Nothing was changed in `src/`.** That note ends
  *"If the 'not real' complaint is ever re-opened, look at WALK mode close-ups, not the
  phone dollhouse"* — every phone judgement to that point was the ORBIT dollhouse. This
  is that follow-up, and it finds nothing.
  · **The instrument had to be fixed first, and this is the part worth remembering.**
    `walk-tour.mjs` called `setQualityTier(TIER)` unconditionally with `TIER` defaulting
    to `'medium'`. A phone-profile run therefore booted to the capability veto's
    `performance` and was then **forced back to `medium`** — the arm would not have been
    a phone arm at all, and the probe would have reported a desktop tier under a phone
    viewport without saying so. `TIER=auto` now skips the override and the run prints
    its resolved tier. **No earlier finding is invalidated**: `.82` and `.85` both passed
    `TIER=performance` explicitly.
  · **Measured, 44 frames per arm, 11 rooms x 4 yaws, 13:00, both resolving
    `performance/on/manual13` — the ONLY difference is the phone profile**
    (`BOOT_PHONE=1 COARSE=1`, 1170x2532 at DPR 3) against the desktop 1280x800 at DPR 2.
    Centre band, UI chrome excluded:

    | arm     | mean luma | sigma | clipped | dark  |
    | ------- | --------- | ----- | ------- | ----- |
    | phone   | 194.9     | 20.59 | 0.113%  | 0.07% |
    | desktop | 196.1     | 19.68 | 0.033%  | 0.04% |

    **1.2 luminance apart**, with clipping and crush both negligible. Read the sigma
    column with the caveat this file already records for PERF-TIER-LOOKS-FINE: lower DPR
    inflates per-pixel variance, so the phone's slightly higher 20.59 is NOT evidence it
    has more contrast.
  · **The frames carry the verdict, not the table.** `kitchen-y1` shows subway tile with
    real grout lines and specular hits, a dark stone worktop, cabinet handles and a
    frosted service-yard door; `livingDining-y0` shows the fan's lit diffuser, the
    aircon, curtain pleats, TV content and coffee-table decor. Legible, warm, materially
    differentiated — the opposite of the "cartoon" complaint. Zero empty frames.
  · **An over-claim I made and retracted mid-round (meta-rule lxiv).** The first phone
    frame looked to me like a blown-out white void across the top fifth. Measured, it is
    **0.10% clipped on average and 0.7% at worst** across all 44 frames. It is a bright
    ceiling, not a clipped one. **A bright field is not a blown one — measure before
    filing it.**
  · **Mesh counts differ for a boring reason.** Phone 246 visible meshes / 57,895 tris
    vs desktop 354 / 87,096 — the narrow portrait frustum simply sees less of the flat.
    No content is dropped.

- **The `performance` tier is NOT the "flat/cartoon" problem — measured on a real phone
  profile, don't re-file it (PERF-TIER-LOOKS-FINE).** `performance` is what the phone veto
  actually gives most mobile users (no AO, no IBL, no post stack, DPR 1), and until the
  harness could boot a phone profile no frame of it had ever been reviewed. TIER-AO's note
  that AO is "the difference between a room that has corners and one that reads as flat
  shading" made it the prime suspect for the original "looks like animation" report.
  Measured with `scripts/dev-probes/phone-tier-look.mjs`, which holds the viewport FIXED at
  390x844 and varies ONLY the tier (meta-rule xvi), on the default flat in orbit:

  | hour | tier        | ibl   | slab mean | sigma | dark% |
  | ---- | ----------- | ----- | --------- | ----- | ----- |
  | 13   | performance | false | 179.1     | 27.1  | 0     |
  | 13   | medium      | true  | 179.3     | 21.7  | 0     |
  | 13   | maximum     | true  | 180.3     | 22.0  | 0.1   |
  | 21   | performance | false | 87.5      | 85.7  | 47.9  |
  | 21   | medium      | true  | 83.3      | 80.7  | 46.5  |
  | 21   | maximum     | true  | 84.8      | 82.2  | 46.2  |

  `performance` is not flatter — its slab contrast is HIGHER at 13:00 (27.1 against 21.7 /
  22.0) and all three tiers are within noise at night. Read the sigma column with care: DPR
  differs per tier (1 / 1.5 / 2) and lower resolution inflates per-pixel variance, so sigma
  cannot settle this on its own — the verdict comes from the cropped frames, which show
  `performance` crisp, warm and legible, fully competitive with `medium` and if anything
  less hazy than `maximum` at phone size.
  **The visible tier deltas are the documented post effects, not a deficiency:** at 21:00
  `maximum` has soft bloom glow on lit surfaces and smoothly-shaded fan blades where
  `performance` has harder edges and no fixture glow (RD-409 mounts Bloom only at the post
  tiers). Nothing here reads as missing corner darkening.
  **Consequence: AO at `performance` is retired as a target on EVIDENCE, not just on the
  earlier "cannot be honestly verified on an M4" caution.** The flat tier already ships the
  ContactShadow blob decals (RZ1) for grounding, and the dollhouse orbit view — mostly wall
  faces and floors seen at distance — is not where screen-space AO earns its 25.81%; that
  figure was measured at Medium in a close interior view. If the "not real" complaint is
  ever re-opened, look at WALK mode close-ups, not the phone dollhouse.
- **Cheap baked AO on the flat tier.** With no SSAO on Performance/Medium, grounding is
  faked with shared-texture alpha decals: `ContactShadow.tsx` (under-furniture blob, RZ1; also a
  fainter/tighter **surface decal under small decor** resting on a table/shelf — PC2-CONTACT-AO-DECOR,
  qualified by the pure `furniture/surfaceDecal.ts` and rendered from `furniture/Furniture.tsx`).
  One shared `CanvasTexture`, a single transparent plane each, `depthWrite:false` +
  `polygonOffset` + small `+Y`. When adding a new baked-AO cue, follow this pattern (shared
  texture) — never per-instance textures. **NOTE (`.223`): the decals are NOT tier-gated off where
  real AO runs — `quality.contactShadows` is `true` on all four tiers, so every tier renders both.
  An earlier version of this line said otherwise.** Measured contribution to the shadowed/lit floor
  ratio at `performance` (the tier with `ao: false`, where they are the ONLY grounding cue):
  **0.874 without → 0.827 with**, i.e. **0.047**, against screen-space AO's **0.286** at `medium`.
  Raising the blob's `opacity` cannot close that: 0.5 → 0.827, 0.75 → 0.809, **1.0 → 0.789**, still
  outside the photographic band of 0.579–0.725. A painted radial gradient under a footprint is a
  grounding cue, not a substitute for occlusion, and this is its measured ceiling. The wall/floor
  **corner-AO strip is retired** (RD-403, removed v0.23.1.11): from a top-down/plan camera the
  0.32 m gradient read as a hard black outline hugging every wall base, and it only ever ran on
  the tiers with no SSAO — don't reintroduce a baked wall-base darkening decal.
- **Render-only helpers must tag themselves out of the glTF/OBJ export (EXPORT-HELPERS).**
  `export/sceneGltf.ts:buildExportRoot` prunes by `noExport` TAG, helper TYPE and Camera —
  **never by appearance**. That is not an oversight to work around: `colorWrite: false` is a
  WebGL renderer state with no glTF equivalent, so an invisible mesh has no way to tell an
  importer it was never meant to be seen. Two populations were shipping into every export as
  real geometry, measured on the default flat with `scripts/dev-probes/export-helpers.mjs`
  (which runs the app's OWN `buildExportRoot` so the check cannot drift from the exporter):
  · **`CeilingOccluder` — 10 planes.** The virtual ceiling that lets orbit light interiors
    through windows. Exported, an importer gets solid caps over every room; and since the
    occluder is present in WALK mode too (deliberately, for consistency), those planes are
    coincident with the REAL ceiling and would z-fight.
  · **`ContactShadow` — 51 planes.** The RZ1 fake grounding cue: a transparent plane with a
    painted blob texture under every piece of furniture, which exports as a grey disc on the
    floor of the user's model.
  Both now carry `noExportUserData()` on their root, matching `Sky`, `MeasurementOverlay`,
  `CommentPins`, `WalkMeasureOverlay` and `AnnotationsOverlay`. Verified: scene 10 occluders
  + 51 contact planes, export **0 and 0**, total meshes 1122 -> 1060. The non-zero SCENE
  counts matter as much as the zero export ones — they prove the probe can see the
  populations at all (a run where both columns read 0 proves nothing).
  **When adding any new render-only helper — a gizmo, an overlay, a shadow catcher, a
  proxy — tag it at creation.** `exportHelpers.test.ts` pins that appearance alone does not
  prune, and that a tag on a parent group takes the whole subtree.
- **The HQ path-traced still uses the app's RESOLVED view transform, not its own
  (HQ-TONE-MATCH).** `pathtrace/hqRenderSession.ts` hardcoded
  `renderer.toneMapping = ACESFilmicToneMapping` and left `toneMappingExposure` at 1. Both
  were wrong, and on the one feature whose entire purpose is a faithful high-quality image:
  · **It contradicted the app's own policy twice over.** `toneContext.ts` sets
    `AUTO_PHOTO_MODE = 'agx'` — a photo context is exactly what an HQ render IS — and
    `DEFAULT_TONE_MAPPING` is AgX as well since TONE-CURVE-CHOICE. Worse, an EXPLICIT user
    pick was ignored: someone who chose Neutral still got filmic in their export.
  · **The difference is not subtle.** `tone-curve.mjs` at walk/Medium/09:00 measured filmic
    against AgX at mean 185.9 vs 176.7, sigma 54.5 vs 43.3, **clipped 1.94% vs 0.28%** and
    chroma 0.180 vs 0.152 — so the "photo" carried roughly SEVEN TIMES the blown highlights
    of the viewport it was supposed to reproduce.
  · **Exposure was wrong too.** `Lighting` grades `toneMappingExposure` across the day/night
    curve (0.78 night floor to 1.20 full day) on top of the user's own exposure, so a still
    pinned at 1 renders night too bright and midday slightly dark. There is no pure function
    to recompute it from — it is written per-frame — so `HqRenderSource` now carries the live
    `gl` and the modal passes `gl.toneMappingExposure` straight through.
  · The session takes `toneMapping`/`exposure` options and maps through the SAME
    `TONE_MAPPING_THREE` registry `Lighting` uses, so the still and the viewport cannot drift
    apart; the modal resolves via the same pure `resolveToneMapping`. Default if a caller
    omits it is `AUTO_PHOTO_MODE`, never filmic.
  · **VERIFIED BY A RENDERED A/B on a real GPU (v0.31.5.41) — this note previously said it was
    verified by unit tests and reading ONLY, and that caveat is now retired.**
    `scripts/dev-probes/hq-tone.mjs` stands at one fixed walk pose in the living/dining room and
    renders the still twice in ONE run, changing exactly one variable (meta-rule xvi): once as the
    modal now requests it, and once with `toneMapping: 'filmic'` forced, i.e. the pre-fix
    behaviour. At 24 samples, 320², identical pose, identical live exposure **1.38**:

    | arm                        | resolved tone | clipped | mean  | sigma |
    | -------------------------- | ------------- | ------- | ----- | ----- |
    | hq-auto (shipped policy)   | **agx**       | 0.18%   | 174.5 | 38.0  |
    | hq-filmic (pre-fix)        | filmic        | 0.66%   | 191.9 | 49.9  |

    So filmic blows **3.7x** the highlights of the shipped operator at the same exposure, the
    shipped path resolves to AgX rather than filmic, and the live graded 1.38 reaches the
    session instead of the old hardcoded 1. The two arms DIFFERING is the load-bearing part —
    identical readings would have meant the option never reached the renderer (meta-rule xxv).
    Cropping confirms it: the filmic arm blows the ceiling and the fan and washes the whole
    frame, while AgX holds the fan's blade detail and the floor's warmth.
  · **The pathtracer DOES compile and render under ANGLE/metal headless — PT-BLANK-GUARD is
    about OTHER drivers.** It was reasonable to expect the megakernel to fail here (that guard
    exists because it does fail on e.g. WSL D3D12/ANGLE), so this was written up as possibly
    unverifiable. It renders fine: 24 samples, sigma 38-50, opaque.
  · **Probe trap, and it mimics the driver failure exactly:** `createHqRenderSession` does NOT
    auto-start. It builds the tracer, and `session.start()` kicks the rAF accumulation loop.
    Omitting it leaves `samples` at 0 and `toDataURL()` returns a **fully transparent** canvas —
    all four channels 0 — which is indistinguishable at a glance from PT-BLANK-GUARD's
    black/white failure signature, and the session reports no error. A blank frame is a broken
    CALL before it is a broken GPU: check `session.samples` advanced before believing any number
    off that canvas (meta-rule iv).
- **Tone mapping is context-aware** (`toneContext.ts`, pure + unit-tested). The stored user
  setting is `ToneMappingSetting` (`auto` | filmic | agx | neutral); `Lighting` resolves the
  concrete operator each frame via `resolveToneMapping(setting, ctx)` — never read `st.toneMapping`
  raw for the renderer. An explicit pick wins; `'auto'` picks Neutral while previewing finishes,
  AgX for a photo context, else filmic. Keep `look.ts` pure (no three) — the three constant comes
  from `toneMappingThree.ts`.
- **Curtain sun attenuation is computed from the LOADED plan's viewed storey, never from
  `apartment/constants.ts` (SUN-CURTAIN-PLAN, v0.31.5.101).** `CurtainLightController` derives
  its walls with `lighting/planAttenuationWalls.ts:planAttenuationWalls(floorPlan, viewLevelId)`
  and its store subscription watches `floorPlan` and `viewLevelId` as well as `items`/`glassTint`
  — without those two a plan swap leaves the factor stuck on the previous apartment's windows.
  It used to pass the default flat's `WALLS` unconditionally.
  · **The old failure produced a PLAUSIBLE NUMBER, not an obvious null**, which is why it
  survived: `curtainWindowOverlap` matches a curtain to a window POSITIONALLY (within 0.5 m of
  the wall, angularly aligned, spans overlapping) and every plan sits near the origin, so a
  template curtain attenuated whichever DEFAULT-FLAT window it happened to land near. Measured
  end-to-end on the maisonette with four curtains on its own windows: **closed = 0.7526 before,
  0.5600 after** — both dim the sun, so a binary "do curtains work?" check passes either way.
  Judge this by the NUMBER and by which windows produced it.
  · `windowLightModifiers.ts` takes a structural `AttenuationWall` (`{id, start, end, cutouts}`)
  rather than `WallSpec`, so the constants and the plan adapter are both valid inputs. A test
  pins the default flat as **bit-for-bit identical** through either source — with an `< 1` guard
  so a mechanism that silently stopped firing cannot pass it as `1 === 1`.
  · Cost measured before commit: 0.0145 ms -> 0.0123 ms per recompute at 87 items (no added
  cost), and it runs on items/plan/level change, not per frame.
- **Walk-mode INTERACTION TARGETS come from the LOADED plan and the WALKED storey, never from
  `apartment/constants.ts` and never unscoped (WALK-AIM-PLAN, v0.31.5.99).** `FirstPersonCamera`
  aims at four kinds of thing — doors, curtains/blinds, screens and lights — and every one of
  them must be narrowed the same way `buildWalkBlockers` already narrowed the collision
  footprints:
  · **Doors** come from `collision/doorAim.ts:doorAimSegments(levelAsPlan(plan, walkLevel(plan,
  viewLevelId)))`, which reads `floorplan/openingSegments.ts` — the SAME spans the minimap draws
  doorways with, so a gap on the map and an openable door are one fact. This replaced a
  **module-level `const DOOR_SEGMENTS` built from the default flat's hardcoded `DOORS`/`WALLS`**.
  That constant was right about exactly one of the nineteen shipped templates and no user-drawn
  plan at all: the maisonette's door ids and the constants' overlap by **ZERO**, so the walker
  was offered phantom doorways from a different apartment while every real door stayed shut.
  Measured with `door-aim-plan.mjs` on the maisonette upper storey: **0/5 -> 5/5** interactable.
  · **Items** (`windowFixtureAimSegments` / `screenAimSegments` / `lightAimSegments`) take
  `itemsOnLevel(items, walkerLevelId)`, not raw `items`. This is load-bearing, not tidiness: an
  `AimSegment` is **purely 2D** (`sx/sz` + `segDx/segDz`) and `nearestAimedSegment(ox, oz, dir.x,
  dir.z, ...)` never looks at Y, so height cannot separate two storeys that sit directly on top
  of each other. Unscoped, the walker could aim THROUGH THE FLOOR and toggle a lamp, a TV or a
  curtain downstairs. **If you ever add a fifth aim category, scope it at the point it is built,
  not at the point it is used.**
  · **Do not re-add a module-level segment constant.** These lists must be effects keyed on
  `[floorPlan, viewLevelId]` / `[items, walkerLevelId]` — a module constant cannot see a plan
  swap or a storey change, which is precisely how the door bug survived.
- **The walk-mode `sky` backdrop fades its ground out of the HORIZON HAZE, never butts a flat
  tint against the sky (SKY-HORIZON, v0.31.5.97).** `skyGradient.ts:skyRadiance` returns a ground
  tint below the horizon (the orbit surround deliberately does not — see SKY-ANALYTIC-ORBIT
  above; a dollhouse sits on infinite haze, a window looks out over real ground). That tint used
  to be applied bare, so it met the Perez sky at a hard edge: measured at 64 deg sun altitude /
  turbidity 5, sRGB-byte luma stepped **62 across ONE degree** of elevation (`0.5:175` →
  `-0.5:113`) and then barely moved (`-10:105`), which through the main-bedroom window read as a
  crisp seam over one flat, featureless slab filling the bottom ~45% of the glass. The missing
  term was **aerial perspective**: at the horizon the ground is seen through kilometres of
  atmosphere, so it IS the sky's colour there, and only resolves into ground further down. The
  branch now blends `horizonSampleDir(v)`'s sky sample → the ground tint with
  `smoothstep(-v.y / GROUND_HAZE_SPAN)` (`GROUND_HAZE_SPAN = 0.3`, ~17.5 deg — the depression
  range a window actually shows at standing eye height). The seam is gone **by construction**,
  not merely reduced: at `v.y → 0` the blend weight is 0, so both sides agree in the limit.
  Verified: step 62 → **0**, above-horizon bit-identical (`5:178 2:176 0.5:175` unchanged), nadir
  unchanged (48), monotonic to the nadir; in the render, column x=1380..1520 went
  `780:150 800:140 820:130` → `780:150 800:152 820:153` with everything above y=780 identical.
  · **The haze sample is HOISTED PER COLUMN in `paintSkyEquirect`, and must stay that way.**
  It depends only on azimuth and one equirect column is one azimuth, so the painter takes `w`
  samples (from the middle row — the top row is near the pole, where azimuth degrades) rather
  than one per lower-hemisphere pixel, and passes it in via `skyRadiance`'s optional
  `hazeSample`. Recursing per pixel measured **87.2 -> 144.0ms** for a 1024x512 bake (+65%),
  which is main-thread time on every sun move, on the phone tier too; hoisted it is 90.4ms
  (+3.7%). A test pins the painter's bytes as byte-identical to per-pixel `skyRadiance`.
  (`paintSkySurround` has the same shape and is 160.6ms at 1024x512, but `Sky.tsx` bakes it at
  256x128 — 1/16 the pixels, ~10ms — so it was measured and deliberately left alone.)
  · **Do NOT "fix" this by raising `groundAlbedo`** — that lifts the slab without removing the
  seam, and darkens nothing that was too bright. The seam was the defect; the darkness was a
  symptom of the missing gradient.
  · **`HORIZON_EPS` / `smoothstep` / `horizonSampleDir` now live in `skyGradient.ts` and are
  SHARED with `skySurround.ts`** (which re-exports `HORIZON_EPS`). That sample carries three
  hard-won traps — the Perez `1/cos(zenith)` singularity right at the horizon (two samples 0.001
  apart differed 1.5x), the horizontal part needing renormalisation or the effective elevation
  drifts with tilt and the result goes non-monotonic, and the nadir having no azimuth (a `|| 1`
  fallback there collapses the sample to the ZENITH). Two copies would be two things to get
  wrong. The surround's 21 existing tests pass untouched, which is what makes that extraction a
  refactor rather than a change.
  · **This narrows an earlier claim.** `skySurround.ts`'s header said the ground tint was "right
  for the walk-mode WINDOW view it was written for". It was right to HAVE ground there — that
  part stands, and is why the window keeps a ground the dollhouse does not — but the measurement
  above shows the bare, un-hazed form was not right; it is only right now.
- **The orbit surround is an ANALYTIC sky with no ground (SKY-ANALYTIC-ORBIT) — the drei `<Sky>`
  dome it replaced was blown out to a colourless white (SKY-BLOWN, resolved v0.31.5.19).** Worth stating because it is easy to assume the opposite in both directions. It is
  NOT a flat gradient or the page background: `lighting/Sky.tsx` mounts drei's `<Sky>` — a Preetham
  atmospheric shader fed by `altitudeCurve.ts:skyFromAltitude` — and it responds to the clock
  (sampled at the dollhouse background, luma 81 at 06:00 and 21:00 against ~232 at 13:00).
  But at 13:00 its ZENITH measures rgb 229/232/233, HSV saturation **0.017**, and is
  indistinguishable from the horizon (0.017 vs 0.021) when Preetham should show a strong blue
  gradient between them.
  · **Not the tone curve.** The zenith is washed out under all three operators — filmic **0.008**,
    AgX 0.017, Khronos Neutral 0.073 — so AgX is actually the best of them and TONE-CURVE-CHOICE is
    not implicated.
  · **Not the scattering parameters either, and this is the counter-intuitive part.** Sweeping the
    live shader uniforms (`scripts/dev-probes/sky-tune.mjs`), raising `rayleigh` — the BLUE
    scattering term — from the shipped 1 through 2 / 3 / 4 made it monotonically WORSE
    (sat 0.017 → 0.008 → 0.004 → 0.004), because more scattering means more total radiance and the
    dome climbs further onto the operator's shoulder. Every arm sat at luma 234–237, pinned near the
    top of the range. `turbidity` 3 changed nothing.
  · **And the radiance is not the lever either — the dome emits genuinely WHITE light.** Scaling
    `toneMappingExposure` live (`sky-tune.mjs EXPOSURES=`) is monotonic but far too weak: a **4x**
    cut (x0.25) lifts zenith saturation only 0.017 → **0.041**, with luma still 193. If the sky were
    a saturated blue merely rolled off by the operator, dimming would reveal the blue. It does not,
    so the shader's per-channel ratio is ≈1:1:1 before any transform.
  · **Not a near-sun aureole either.** Preetham is legitimately white close to the sun, and Singapore
    at 13:00 has the sun near the zenith — but measured across altitudes the zenith saturation is
    0.027 / 0.024 / 0.017 / 0.014 / 0.007 at 08:00 / 10:00 / 13:00 / 16:00 / 18:00. Never above 0.03,
    so there is no hour at which this sky is blue.
  · **A FIFTH attempt was made and REVERTED: painting the in-repo analytic equirect as the orbit
    `scene.background`.** `lighting/skyGradient.ts` is the right colour source — sampled headlessly
    it gives zenith saturation 0.54–0.68, a pale horizon (0.09–0.23) and a warm low-sun horizon
    (0.63), all in a controlled LDR range. But `paintSkyEquirect` fills the **lower hemisphere with
    a ground tint**, and the orbit camera looks DOWNWARD at the dollhouse, so the visible background
    is mostly below the horizon: the flat rendered on a dull brown-grey (zenith sample 175/165/152,
    warm r>g>b) which is worse than the white it replaced. An equirect built for a walk-mode WINDOW
    view is the wrong shape for a top-down orbit. Whatever replaces the dome must be sky-only, or
    must orient/clamp so the camera never sees the ground half.
    · Two gating traps found on the way, both worth remembering: the first attempt gated the orbit
      surround on the `proceduralSky` flag and measured BYTE-IDENTICAL, because that flag is
      `tier: 'pro'` and **Simple mode — the app default — forces pro flags off**. Anything that
      changes the DEFAULT look must not sit behind a pro-tier flag. And `Sky.tsx`'s dome is what
      actually fills the orbit background, not the page behind the alpha canvas: hiding it changes
      the sampled pixels from 231.9/235.0/236.0 to the page's warm 234/219/209.
  **Five hypotheses tested and rejected: the tone curve, the scattering parameters, the global
  exposure, the sun-angle, and reusing the walk-mode equirect. Do not re-test them.**
  **RESOLVED** by `lighting/skySurround.ts` + a rewritten `lighting/Sky.tsx`: a `BackSide` sphere
  mapped with a small (256x128) equirect baked from `paintSkySurround`, which is `skyRadiance` above
  the horizon and a DIMMED CONTINUATION of the horizon below it (never a ground tint), re-baked
  debounced through the same `shouldRebuildSky` predicate the walk backdrop uses. Verified: the
  interior is **byte-identical** — an interior-only region at orbit/Medium/13:00 reads mean 191.43,
  sigma 36.43, clipped 1.124%, chroma 0.162 both before and after — which is the safety property
  claimed above (background only, no `scene.background` / `scene.environment` writes). Frame cost
  unchanged (4.5/4.8, 8.4/9.0, 10.4/10.9, 11.4/12.0 ms p50/p90). Night is the biggest visible win:
  a deep dark surround with the lit flat glowing against it, instead of the old flat grey.
  · **The dome TRACKS THE CAMERA and its radius is a shared, test-asserted constant
    (SKY-DOME-FAR).** As first shipped it was world-anchored at `DOME_RADIUS = 400` under a
    comment claiming that sat "well inside the camera far plane" — but both Canvases set
    `far: 400` as their own unrelated literal, so the radius EQUALLED the far plane. Seen from
    inside a `BackSide` sphere the centre of frame shows the sphere's FAR wall, which sits at
    `radius + camera distance from origin` — measured 430.2 m at the boot pose against `far` 400,
    with **436 of 825 dome vertices beyond the frustum**. So the middle of the orbit background
    was cut away and the page colour showed through, bounded by the 32x24 sphere's facets: a
    faceted polygon of page in a field of sky. It survived a full round of sky work because every
    probe measured interior slabs and the surround's own COLOUR, never its COVERAGE.
    Fixed by `lighting/skyDome.ts`: the far plane is now one shared `SCENE_CAMERA_FAR` both
    Canvases import, the radius is `SKY_DOME_RADIUS` (200), the pure `domeRadiusIsSafe` holds the
    invariant and `skyDome.test.ts` asserts the shipped pair passes AND that the pair which
    shipped the bug fails. `Sky.tsx` also copies `camera.position` onto the dome each frame — a
    sky has no parallax, so tracking is the physically right model, and it is what makes a fixed
    radius PROVABLE rather than plausible: the dome is then exactly its radius away in every
    direction at every orbit distance on every plan. Verified real-GPU with
    `scripts/dev-probes/dome-clip.mjs`: distances 369.8-430.2 / 436 clipped vertices became
    **200.0-200.0 / 0 clipped**, and the background renders full-bleed and uniform at 13:00/Medium
    and 21:00/Maximum alike (night still reads as night, no banding). Any future change to either
    number must go through that module, or the test fails.
  · **It is not blue, and should not be.** The orbit camera is pitched ~25 degrees DOWN, so every
    visible background direction is at or below the horizon, where a real sky IS pale. Sampling the
    top of the frame is sampling the horizon, not the zenith — an earlier round mislabelled it.
  · Two bugs the unit tests caught, both worth keeping in mind for any similar spherical sampling:
    passing `[v.x, EPS, v.z]` as a "horizon" direction does NOT give a constant elevation, because
    `v` is a unit vector whose horizontal length shrinks as it tilts — the effective elevation drifts
    into Perez's steep near-horizon region and the surround came out non-monotonic. And at the exact
    nadir the azimuth is undefined, where a `|| 1` divisor fallback collapses the sample to the
    ZENITH, making the underside the BRIGHTEST part (0.552 against 0.370). What remains is that the app's exposure (1.38)
  is tuned for interiors and this dome's absolute output is simply in a different range — which means
  a fix is a DESIGN change (render the sky through its own exposure / replace the drei dome with the
  in-repo analytic `lighting/skyGradient.ts` painted at controlled values, as the walk-mode `sky`
  backdrop already does), not a parameter tweak. Two rounds went into parameter tweaks; start from
  the design if this is picked up again.
  · One probe note worth keeping: `sky-tune.mjs` re-asserts its uniforms INSIDE a wrapped
    `renderer.render`, because `<Sky>` is a React component and drei re-applies `rayleigh` et al.
    from props on every re-render — and the `setManualHour` nudge used to force a frame IS a store
    change. The corrected sweep reproduced the naive one exactly, so that race did not bite here,
    but the pattern is the same one that invalidated `warm-cast.mjs`'s first illuminant arm.
  **The safety fact that makes such a change cheap:** this dome is purely visual. `Sky.tsx` renders
  geometry and writes neither `scene.background` nor `scene.environment` — the IBL is the separate
  procedural Lightformer probe in `SceneEnvironment.tsx`. So dimming it cannot disturb interior
  lighting, the key:fill ratio, or the bloom lock-step (RD-409); only the background pixels move.
- **The DEFAULT exterior does not follow the clock, and the sun-driven one is PRO-GATED
  (WINDOW-TIME-INVARIANT, v0.31.5.44 — measured, and a CONTENT decision rather than a
  bug).** Every audit so far has looked at surfaces inside the home; this is about what is
  beyond the glass, which is half of what makes a walk-through read as a real flat.
  · **You cannot see it at all by default: the flat ships with its CURTAINS DRAWN.** Facing
    any of the 5 window openings in walk mode, a ray grid finds essentially no exterior
    pixels — the pose is right, the glass is simply covered, and the UI offers "E — Open
    curtains". So the backdrop the app bakes is invisible in the out-of-box state.
  · With the curtains opened, the view IS there and reads well — a city skyline with lit
    windows and a horizon glow. But it is the same view at every hour.
    `scripts/dev-probes/window-hours.mjs` stands at one fixed window pose (derived from the
    plan's own opening), opens the fixtures ONCE, then sweeps the clock changing nothing
    else. Same crop, hour 9 / 13 / 21: mean rgb **198.8/187.2/171.8**, **198.2/186.4/170.5**,
    181.6/166.9/146.7 — 09:00 and 13:00 are identical within ~1 unit, and 21:00 is ~9%
    darker only because the global day/night exposure dims the whole frame (the white
    window grille in the crop dims with it). The exterior CONTENT never changes: warm lit
    tower windows are painted at 13:00 exactly as at 21:00.
  · **That is by construction, not a fault in the baker.** `backdrop` defaults to `'city'`,
    and `BACKDROP_PRESETS.city` is a static authored palette (sky `#5d8fc4`→`#dfe8ec`,
    buildings `[74,86,104]`, `windowColor rgba(255,221,160,0.55)`, `litScale 1`). The
    sun-driven alternative is the `sky` backdrop (RD-412) — and that is gated on the
    `proceduralSky` flag, which `featureFlags.test.ts` pins as **false in `simple` and true
    in `pro`**. Simple is the app default, so a default user can never get a time-following
    exterior. This is the same gate that made SKY-ANALYTIC-ORBIT's first attempt measure
    byte-identical.
  · **Nothing was changed.** Which backdrop ships by default, whether curtains start drawn,
    and whether the sun-driven sky should be simple-tier are CONTENT/PRODUCT decisions, not
    rendering defects — and meta-rule (xiii) is a rule about not hiding a fix behind a pro
    flag, not a licence to re-tier someone else's feature unilaterally. Recorded so the
    trade-off is visible: the app has a sun-following exterior and the default user does not
    see it, behind curtains they must open first.
- **The `city` preset was a NIGHT skyline sold as a daytime one, and the fix is a
  POLARITY rule (CITY-DAYLIGHT, v0.31.5.93).** WINDOW-SKY-DEFAULT moved the default
  away from `city`; this makes `city` itself honest, since it stays one click away in
  the picker and its entry reads *"Daytime HDB skyline"*.
  · **The mechanism is that `buildingWindows` returns ONLY the LIT windows**, and the
    equirect is baked ONCE — so `windowColor` burns into the facade at every hour.
    `city` shipped `rgba(255,221,160,0.55)` (warm interior glow) over dark slate
    `[74,86,104]` blocks: a night skyline, at noon, permanently.
  · **Measured at `win-mainBedroom-N`, 13:00, curtains open** (left third of the upper
    glass band, away from the centre lamp reflection): exterior mean went
    **rgb(92.7, 96.0, 98.4) -> rgb(132.6, 129.3, 123.0)** — **+40 brightness**, and the
    r−b polarity flipped **−5.7 -> +9.6** (cold and dark -> warm and sunlit). The `sky`
    backdrop measured alongside as a control reads 135.8/140.4/142.4, comparably bright
    but COOL (r−b −6.6), which is right for open sky against sunlit concrete.
  · **The invariant is contrast polarity between glazing and facade**, because that is
    what reads as time of day regardless of exposure: by day a window is a hole into an
    unlit interior (DARKER than sunlit concrete); by night the interior is the only
    source (BRIGHTER). `backdropDaylight.test.ts` pins `city` to the first and `dusk` to
    the second, plus "a daylit block is not darker than its own sky". It **fails 2 of 5
    on the old palette** — verified by restoring it. Pinning the polarity rather than
    literal hexes leaves the presets free to be re-tuned while making the day/night
    inversion impossible to reintroduce silently.
  · **TWO metrics were built and discarded before one discriminated** (meta-rule xciv,
    twice in one round). A "warm lit-window pixel" count over the whole window read
    ~9.9% for `city` and **9.5% for the `sky` backdrop, which has no towers at all** —
    it was counting interior lamp reflections in the glass. Narrowed to the left third
    it still read 13.9 / 14.3 / 13.3% across before / after / control, because the cream
    GRILLE BARS dominate the region. Mean brightness plus hue polarity is what actually
    separates the three arms. **Check a new metric against a control that must score
    zero before quoting it.**
  · **Two iterations, both looked at.** v1 (`building [156,162,168]`, neutral grey) fixed
    the polarity but read as flat overcast concrete — towers and sky sat at the same
    grey with no separation. v2 warmed the concrete to `[182,177,166]` and deepened the
    zenith to `#6fb0e8`, which separates sunlit facade from blue sky. The frame is the
    arbiter here, not the number: v1's polarity metric already passed.

- **The default window view is the SUN-DRIVEN sky, and the flag that paints it is SIMPLE-tier
  (WINDOW-SKY-DEFAULT, v0.31.5.92 — shipped on the user's decision).** This closes
  WINDOW-TIME-INVARIANT below, which measured the default exterior as identical at 09:00 and
  13:00 but changed nothing pending a product call.
  · **`.91`'s headline finding was WRONG and is RETRACTED. `BACKDROP_PRESETS` IS the lever.**
    `.91` edited `BACKDROP_PRESETS.city` (`litScale`, `windowColor`, `building`), measured a
    byte-identical window and concluded "the presets are not read; paint path unidentified".
    Re-run with a corrected probe and an unmistakable mutation (`sky`/`ground`/`building` to pure
    red/green/blue, `litScale: 0`), the frame moved decisively — sky patch blue **102.5 -> 169.0**,
    and the crop shows blue towers, green ground, a red haze band and no lit windows. The paint
    path is exactly what it always looked like: `SceneBackdrop` bakes `bakeBackdropEquirect(kind)`
    into `scene.background`, and `lighting/Sky.tsx`'s dome stands down for it.
  · **What made `.91` measure a null was the PROBE, and the cause is a shipped-fix interaction
    (meta-rule ci).** `window-hours.mjs` opened the curtains with `toggleWindowFixture`, which
    FLIPS. Since WINDOW-TIME-INVARIANT shipped `drawAmount: 0` on the default layouts
    (v0.31.5.88), that toggle CLOSES the very windows the probe exists to look through — so its
    arms were comparing two covered windows. The probe now sets the open value explicitly via
    `updateItemProps` and prints its resolved backdrop / cameraMode / tier / uiMode /
    `proceduralSky` / `photoBackdropActive` / per-fixture draw amounts (meta-rule iv). **A fix
    that lands in content can silently invalidate an instrument that assumed the old default.**
  · **The real defect was never the preset data — it is that `city` is authored at ONE hour.**
    With a correct arm the time-invariance reproduces exactly: sky patch **rgb(97.5, 100.4,
    102.5)** at 09:00 against **rgb(97.4, 100.3, 102.4)** at 13:00, identical to 0.1. The `city`
    preset paints warm lit tower windows at every hour, so with the curtains open the default
    flat showed a night skyline at midday.
  · **Fixed by changing the MECHANISM, not by re-authoring the palette**: `backdrop` now defaults
    to `'sky'` (the analytic sun-driven backdrop) instead of `'city'`. Measured at the
    `win-mainBedroom-N` pose, same crop, curtains genuinely open:

    | hour | before (`city`) | after (`sky`) |
    | ---- | --------------- | ------------- |
    | 09   | rgb(97.5, 100.4, 102.5) | rgb(121.4, 121.3, 118.8) |
    | 13   | rgb(97.4, 100.3, 102.4) | rgb(137.2, 143.1, 146.0) |
    | 21   | rgb(77.6, 78.8, 78.8)   | rgb(55.1, 50.8, 41.3)    |

    09:00 -> 13:00 moves from **0.1** to **16-25 units**, and the HUE flips (09:00 `r > b` warm
    morning, 13:00 `b > r` cool midday) — the exterior now tracks the clock the interior is
    already graded by. Night is darker and warmer rather than a flat grey.
  · **The two halves are ONE change; either alone is a regression — this was measured, not
    reasoned.** `proceduralSky` was `tier: 'pro'`, and Simple (the app default) forces pro flags
    off, so `backdrop: 'sky'` in Simple selected a backdrop nothing could paint. Verified in a
    frame before building: the window rendered a **flat dead grey slab**, worse than the city
    preset it replaced. The flag is therefore now `tier: 'simple'` — the same argument that keeps
    the orbit surround dome ungated (this file, SKY-ANALYTIC-ORBIT: *anything that changes the
    DEFAULT look must not sit behind a pro-tier flag*), and the view out of a window is core
    realism rather than an analytical tool.
  · **Root-caused, so the dead-slab state is now unreachable at ANY flag setting.**
    `isPhotoBackdropActive` does double duty — it tells `SceneBackdrop` to paint AND tells
    `Sky.tsx`'s dome to stand down. It returned `true` for `sky` unconditionally, claiming the
    background slot for a painter that never ran while suppressing the dome that would have
    covered for it. It now takes a `skyAvailable` argument (defaulted `true`, so no other caller
    changes) and both call sites pass the live feature, so a `sky` backdrop with the painter off
    falls back to the sun-driven surround dome instead of nothing.
  · **Honest trade-off:** the `sky` backdrop has **no skyline**. The default view gains a
    time-tracking sky and loses the HDB towers; `city` / `dusk` remain one click away in the
    backdrop picker, and this is why the change is a default rather than a deletion.

- **The HDB estate outside the windows is GEOMETRY, not a backdrop (ESTATE-SURROUND,
  `scene/estate/`, flag `estateSurround`, v0.33.0.1) — and it is visible in BOTH walk and orbit
  mode (ESTATE-ORBIT, 2026-09-05 product decision, superseding the earlier "the orbit dollhouse
  stays clean" call recorded under PHOTO-BACKDROP).** Item (r) measured that anything painted
  into the equirect `scene.background` is PMREM-blurred to blobs and the cube route was refuted,
  so a legible exterior has to be drawn: `estateLayout.ts` (pure, tested) places the flat's OWN
  slab block continuing left/right/above/below with the common corridor outside the main door,
  neighbouring slab + point blocks at 50–110 m, roads, ground at the storey's true depth (#08,
  20.4 m) and rain trees; `estateTextures.ts` paints tileable façade/corridor/ground/tree canvases
  (one façade tile = 4 bays × 3 storeys, repeated by UV scaling so one texture serves every block);
  `Estate.tsx` mounts it in walk mode AND orbit mode, HDB plans, `sky`/`none` backdrop only,
  `noExport`, no shadows.
  · **In orbit the own block is drawn CUT at the flat's ceiling, building-section style
    (ORBIT-SECTION-CUT).** The orbit dollhouse culls the real ceiling to look in (ORBIT-CEILING);
    left alone, the own block's storeys above (`own.above`/`own.roof`) would cap that open top
    with an opaque slab, and its wings would rise the full 12 storeys beside it. The pure
    `estateLayout.ts:sectionCut(layout, cutY)` returns a layout with `own.above`/`own.roof`
    REMOVED and the wings' `yMax` clamped to `cutY` (`plan.ceilingHeight ?? 2.6` + 0.15 m slab) —
    everything else (the storeys below, the corridor, every neighbour block, ground, roads,
    trees) is untouched. Walk mode calls `buildParts` on the plain layout and is byte-identical
    to before; only orbit routes through `sectionCut` first.
  · **LIGHT-WELL-ORBIT (item (ag), v0.35.9.0): the service light well now shows in orbit too** —
    `layout` memo composes `sectionCut(serviceWell(rawLayout), cutY)`; `sectionCut` now also
    clamps `westWingFar`/`eastWingFar`. **Orbit references captured before this version show
    the wing as an unbroken slab at the notch — re-base anything pinned against the old framing.**
  · **The corridor fronts the plan's REAL main door, on any of the four faces (ESTATE-DOOR-SIDE,
    `estateCorridor.ts`, v0.33.0.8).** `corridorFromPlan(plan)` reads the main door through the
    SHARED `apartment/fittings/fittingModel.ts:mainDoor` (widest external door), takes the
    exterior face its wall lies on (wall axis picks the pair, nearest plan-extent edge the sign)
    and returns a run covering the leaf plus 1.5 m either side, clamped to the face and extended
    to the nearer block end. Real HDB templates are not all `+z`: `tpl-hdb-5room` opens on **−z**
    and `tpl-hdb-3gen` on **+x**, and both used to get a corridor bolted to the wrong wall (and
    the window façade pointed at it). `estateLayout.ts` still builds ONE **canonical** estate —
    corridor on +z, width along +x, so `winSign` is a constant and every neighbour/road/tree
    offset is stated once — and `estateFrame` returns the canonical extent (width/depth SWAPPED
    for the ±x faces), the canonical span, and a **yaw about the plan's footprint centre in
    multiples of 90°** that `Estate.tsx` puts on the `estate-surround` group. Rigid, never a
    reflection, so the invariant "windows on the face opposite the corridor" survives the move.
    Because 90° yaws keep axis-aligned boxes axis-aligned, `sectionCut`, `tileBoxUv`, the tree
    `InstancedMesh`es, roads, ground and the lit-window emissive all need no change — they are
    all children of the rotated group. The default 4-room result is unchanged to 7 cm (the old
    hand-tuned span started at 9.5 m, the derived one at 9.43 m).
  · **Every estate mesh (and each tree `InstancedMesh`) carries a no-op `raycast`.** Orbit selects
    furniture/rooms by pointer raycast and deselects via `onPointerMissed` — background scenery
    must never intercept either, so `Estate.tsx` sets `mesh.raycast = () => {}` on every part and
    on each tree `InstancedMesh`; `mesh.name = p.key` too, so a probe can census which parts
    mounted (e.g. confirm `own-above`/`own-roof` are absent in orbit) without adding a dev-only
    path.
  · **The ground plane is 360 m (±180 m), inside the orbit sky dome's 200 m radius
    (SKY-DOME-FAR)** — the flat's 700 m walk-mode ground would run well past the dome and either
    show through it or z-fight past its far wall from the top-down orbit vantage.
  Three rules from the first real-GPU round:
  · **Exterior surfaces carry a daylight emissive boost (`EXTERIOR_DAY_BOOST`)** — the scene's sun
    and hemisphere light the estate no harder than the flat, so without it the neighbours read as
    a grey interior wall seen through glass; a camera exposed for a room sees the outside 2–3×
    brighter. By night the emissive map swaps to the lit-window mask (`EXTERIOR_NIGHT_GLOW`).
  · **The corridor night mask is a thin tube + a confined wash, not a full-void gradient
    (ESTATE-CORRIDOR-NIGHT, flag `estateCorridorNightMask`, default on).** `EXTERIOR_NIGHT_GLOW`
    (2.4×) applies to the corridor materials exactly as it does the window ones, so the original
    mask — a gradient filling the ENTIRE corridor void — bloomed (post stack's 1.35 luminance
    threshold) into one continuous white band the length of a wing, erasing the storey lines a
    real HDB corridor reads by. `estateTextures.ts:paintFacadeTile`'s corridor-night branch now
    paints a tube ≤0.06 m tall plus a wash confined to the upper ~60% of the void, fading to 0
    well above the parapet (which stays black in the mask either way); the legacy full-void mask
    stays reachable via the painter's `corridorNightMask` option (set by the caller from the flag
    — the painter itself stays pure) with the flag off. This is a stylised night MASK, not a
    physical light — no Cycles reference is applicable. **Testing the flag OFF needs the
    `?ff=estateCorridorNightMask:off` URL override, not a post-boot `setFeatureFlag` call**:
    `Estate.tsx`'s `materials()` is a module-level singleton built once and never rebuilt, and
    `Estate` mounts at boot (default cameraMode is orbit), before any scenario `setup` step can
    run — verified live that a `setFeatureFlag` call after boot is a no-op here. See
    `scripts/scenarios/estate-corridor-night-verify(-off).json`.
  · **The window panes must stay CLEAR at night while the estate is mounted (ESTATE-NIGHT-GLASS,
    `estateSignal.ts`).** PHOTO-GLASS drops transmission to 0.2 and tints the pane near-black after
    dark — right for a void, wrong for lit neighbours, which it hid entirely. `Window.tsx` and
    `PlanShell.tsx` scale the night ramp by 0.15 when `estateVisibleNow()`; every other path is
    byte-identical.
    **And a pane held near-clear is still not clear enough (GLASS-NIGHT-VEIL, v0.33.1.13).** The
    0.15 damping leaves `windowTransmission(1 − dn)` at **0.81** at 20:00, and
    `MeshPhysicalMaterial` renders the non-transmitted ~19 % as DIFFUSE of the pane's `#e2e4e6`,
    lit by the room's lamps and fill — a grey VEIL over a dark neighbour block. Measured as the
    mean over the neighbour-façade pixels in the pane region (mask taken from a PANE-HIDDEN frame,
    so every arm reads the same pixels): **101.3 with the pane against 38.6 with it hidden**. With
    a real view behind it the pane now runs `windowTransmissionRealView` → **0.99** at full dark,
    which lands it at **39.8**, +1.2 of the unglazed truth. The physics: real float glass has NO
    diffuse term — its ~4 % is a Fresnel SPECULAR reflection, which the `ior` 1.5 and
    `specularIntensity` already render separately, so a diffuse remainder double-counts it with the
    wrong lobe. Do NOT reach for a darker `color` instead: on this tier the pane's colour IS the
    shader's transmittance (GLASS-CLARITY), so darkening it darkens the view. Day is unchanged by
    construction (the lift is zero at `d = 0`, and the day pane already ran at 0.92), and the cheap
    opacity-blended tiers are untouched. Flag `glassNightVeil` (simple, default on).
  · **Nothing linear on a repeating tile.** The first ground tile carried a straight footpath and
    it repeated as stripes across 300 m of lawn; the first tree was a lollipop. Blotches and an
    umbrella crown (rain tree: ~1.6× wider than tall) read right at 30–150 m.
  Priced free in walk: `frame-time.mjs` walk/realistic p50 7.3 ms both arms, p90 10.1 vs 10.4.
  Verify walk with `scripts/scenarios/estate-surround-verify.json` (day near/far, bedroom, service
  yard, night); verify orbit with `scripts/scenarios/estate-orbit-verify.json` (boot framing +
  20:00, asserting `own-above`/`own-roof` are absent and the flat still reads open from above);
  verify the non-`+z` door sides with `scripts/scenarios/estate-door-side-verify.json`
  (`tpl-hdb-5room` −z and `tpl-hdb-3gen` +x, walk + orbit).
- **Backdrops paint `scene.background` only — never `scene.environment`.** Walk-mode
  surroundings (`SceneBackdrop.tsx`) bake an equirect into `scene.background`; the static photo
  presets (`backdropEquirect.ts`/`backdropHorizon.ts`) and the sun-driven `sky` (RD-412,
  `proceduralSky` flag) both follow this. The `sky` math is pure + headless
  (`lighting/skyGradient.ts` analytic Preetham, `lighting/skyRebuild.ts` rebuild predicate); the
  baker re-paints debounced when the sun crosses the threshold and **disposes the old texture**.
  The IBL/PMREM/bloom/exposure path is a **separate, tuned, real-GPU concern** — do NOT feed a
  backdrop into `scene.environment` or touch `SceneEnvironment.tsx`/`Lighting.tsx`/`look.ts` from
  the backdrop code (the bloom-threshold lock-step regresses, RD-409).
- **`scene.environment` IBL is the procedural Lightformer probe by default; a user-selected CC0
  HDRI replaces it (F3/R-HDRI · PHOTO-HDRI).** `SceneEnvironment.tsx` renders drei `<Environment>`
  with the procedural Lightformers UNLESS `s.hdriId` is set (+ `hdriEnvironment` flag + `quality.ibl`,
  i.e. Medium+), in which case it renders `<Environment files={hdri.url} background={false}>` — a real
  captured environment from the curated `lighting/hdriCatalog.ts` (Poly Haven CC0 `.hdr`, CORS-direct).
  The default (`hdriId === null`) keeps the exact procedural probe, so the out-of-box look never
  changes. The night-dim `environmentIntensity` ramp applies to both. (This is the sanctioned way to
  set `scene.environment` — distinct from the backdrop rule above, which forbids *backdrop* code from
  touching it.)
- **The orbit camera's projection/orientation may be corrected post-`OrbitControls.update()`,
  never fought with it (FEAT-D).** `cameras/verticalLock.ts` (`computeVerticalLock`, pure,
  no three.js import — dependency-free like `cameraLensSettings.ts`) computes a leveled look-at
  target + a vertical `camera.view.offsetY` shift from the live pose + FOV; `OrbitCamera.tsx`
  applies it in its OWN `useFrame` (default priority), registered textually *after* the component's
  existing fly/tour `useFrame`, so — because drei's `<OrbitControls>` runs its internal `update()`
  at priority **-1** and same-priority (0) subscribers fire in registration order — the correction
  always sees this frame's final pitched pose and applies last. It mutates only
  `camera.up`/`camera.quaternion` (via `lookAt`) + `camera.view`/projection matrix, **never**
  `camera.position` or `controls.target` — OrbitControls recomputes its own quaternion from
  spherical state + `object.up` each frame regardless of what a later callback did to
  `camera.quaternion`, so this can't feed back or drift. Assign `camera.view` directly (not
  `PerspectiveCamera.setViewOffset`, which also stomps `camera.aspect` via its `fullWidth/
  fullHeight` args) when you need a projection shift without touching the live aspect ratio R3F
  already maintains. Any future per-frame camera correction on the orbit camera should follow this
  exact pattern (pure math module + post-controls `useFrame`, position/target untouched).
- **The walk camera's FOV is aspect-aware, and its spawn is furniture-resolved.** three's
  `PerspectiveCamera.fov` is the VERTICAL angle, so `FirstPersonCamera` never assigns the
  `walkFov` slider value raw — it goes through `cameras/walkCameraSettings.ts:walkVerticalFov(fov,
  aspect)` (pure, unit-tested), which widens the vertical angle below `WALK_FOV_REF_ASPECT` (1.5)
  so a tall/narrow viewport keeps the HORIZONTAL view the slider promises instead of collapsing to
  tunnel vision (WALK-HFOV-FLOOR; a phone in portrait went ~43° → ~60° horizontal, and anything
  3:2-or-wider is unchanged). The FOV effect must therefore depend on the r3f `size`, not only on
  `walkFov`. Spawning is the mirror rule (WALK-SPAWN-CLEAR): every branch of the spawn effect picks
  a nominal point + a look target and then routes it through `cameras/walkSpawn.ts:resolveWalkSpawn`,
  which reuses the SAME `resolveCircleVsObbs` + `resolveMovement` solvers (and
  `WALK_PLAYER_RADIUS`) a normal step and the minimap teleport already use — never a hand-picked
  point applied raw, which is how the default flat ended up spawning the eye inside its dining
  table. A new walk entry point (a new plan kind, a new "walk here" affordance) must resolve through
  the same helper.
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- **The room-editor lock-step is VERIFIED at runtime, and the ONE difference is deliberate
  (EDITOR-LOCKSTEP).** The rule below had never been checked against a running app — every fix in
  the graphics-realism work landed in `Scene.tsx`, and the editor was assumed to inherit the shared
  modules. `scripts/dev-probes/editor-lockstep.mjs` censuses both canvases in ONE session (they are
  mutually exclusive in `App.tsx`, so it enters and exits the editor) by each system's runtime
  SIGNATURE rather than by component name — `scene.environment` for the IBL, a big
  `MeshBasicMaterial` sphere for the Sky, a shadow-casting `DirectionalLight` + its map size,
  `gl.shadowMap.type`, `colorWrite:false`/`opacity:0` meshes for the occluder, live point lights,
  and render() calls per animation frame for the post stack. Measured, every capability matches:

  | | medium / 13:00 | maximum / 21:00 |
  | --------------- | -------------- | --------------- |
  | ibl             | true = true    | true = true     |
  | shadowType      | 3 = 3 (VSM)    | 3 = 3 (VSM)     |
  | sunShadowMap    | 1024 = 1024    | 1024 = 1024     |
  | dpr             | 1.5 = 1.5      | 2 = 2           |
  | cameraFar       | 400 = 400      | 400 = 400       |
  | maxAnisotropy   | 16 = 16        | 16 = 16         |
  | renderCalls/frame | 13 = 13      | 45 = 45         |
  | point lights    | 18 = 18        | 20 = 20 (19 lit)|

  `renderCalls` is the load-bearing one: it proves the tier-gated post stack mounts identically
  (13 sibling render calls at Medium's AO-only composer, 45 at Maximum's full stack), which no
  source-level check can establish. `cameraFar` 400 confirms SKY-DOME-FAR's shared constant reached
  the editor.
  **The only difference is the Sky dome (`domeRadius` 200 vs null), and it is deliberate** —
  `RoomEditorScene` documents ROOM-EDITOR-BACKDROP and paints a flat `#e6eaef` background instead:
  a faded exterior wall in an ISOLATED room reveals the background directly (nothing is behind it),
  so a bright sky bled through the fade as a blown-out band and the shower glass's transmission
  sampled it and lit up cyan. The dotted translucent plane visible around the room in the editor is
  `GridOverlay`, an authoring affordance, not an artefact.
  **Two probe traps recorded, because both produced a confident wrong answer first:**
  · **A source-level `grep` for mounted components is not evidence.** `<Sky` matched inside a JSX
    COMMENT explaining why the Sky is deliberately NOT mounted, so the static diff reported the
    editor as having it. Census the live graph.
  · **`renderCalls` came back 0 for the editor and looked like "no post stack".** Both canvases are
    `frameloop="demand"`, so an idle one renders nothing — the count measured the pump, not the
    stack. The probe now drags the camera while sampling, and the two agree exactly.
- The room editor uses a **separate Canvas that mirrors the main orbit render stack**
  (`RoomEditorScene.tsx`): `frameloop="demand"` + `RenderPump`, the tier-driven shadow filter
  (VSM on Medium+, PCF on Performance — `RendererTierController` + the Canvas `shadows` prop),
  `Sky`/`SceneBackdrop`/`SceneEnvironment` (IBL), the graded `Lighting`, `FurnitureLights`, and the
  tier-gated `Effects` post stack + `QualityController` — so materials/finishes look identical to
  orbit at the user's quality tier (a glossy/metallic surface reflects the environment instead of
  rendering flat). Daytime lighting here is the same full graded simulation + virtual ceiling
  occluder as orbit (ORBIT-CEILING) — it is NOT the old "flat, no-sun/Effects" lightweight canvas
  anymore; keep it in
  lock-step with `Scene.tsx`'s render systems (add a new lighting/post system to BOTH). It still
  omits the whole-flat-only feature controllers (`RoomHoverHighlight`/`CommentPins`/`TapeMeasure`/
  `LuxOverlay`/`Panorama`/`Record`/`HqRender`/`SceneExport`) — those aren't rendering systems.
  Its walls fade with the
  **same camera-facing reveal as orbit** (ROOM-EDITOR-WALL-REVEAL): `RoomShell`/`PlanRoomShell`
  call the shared `apartment/walls/useWallReveal` hook, which reuses the pure angle-graded curve
  (`facingToward`/`revealStrength`, `wallRevealMath.ts`)
  + the `wallRevealStrength`/`wallReveal` settings (default fade 0.95) and fades a wall via a
  **per-mesh material clone** (the room's walls share one finish material, so mutating it in place
  would fade them all) + publishes `setWallOpacity` so the wall's windows/doors fade too.
- **The wall reveal is ANGLE-GRADED, not binary (WALL-REVEAL-ANGLE-GRADED).** This deliberately
  REVERSES the earlier WALL-REVEAL-BINARY-TARGET decision (binary settle + 0.35/0.65 hysteresis,
  now removed from `WallSegment` and `useWallReveal`): fade strength ramps with how much a wall's
  OUTWARD surface faces the camera — onset at `REVEAL_ONSET` (a slight angle past perpendicular),
  peak (`WALL_TRANSLUCENT_MIN`, a strong **0.05** — head-on near walls are barely an outline) head-on —
  and a wall **settles anywhere along that curve**. All four surfaces (`WallSegment`,
  `useWallReveal`, `PlanShell`, `PlanDoorLeaf`) share the pure
  `revealTargetOpacityForFade(fade, strength)` so the peak is identical everywhere.
  **Single fade-strength slider (WALL-REVEAL-STRENGTH):** one `wallRevealStrength` value (0..1,
  step 0.05, default `DEFAULT_WALL_REVEAL_STRENGTH` = 0.95) replaces the retired three-way
  translucent / auto-hide / opaque mode. It is the head-on opacity FLOOR expressed as fade depth:
  `0` = never fades (fully opaque, callers skip fading), `1` = fades fully hidden head-on, and in
  between the head-on opacity floor is `1 − fade` (so the default 0.95 → `WALL_TRANSLUCENT_MIN`
  0.05, the old default "translucent" look). The angle grading (`revealStrength`) is preserved
  across the whole range — the slider only scales how deep the peak fade goes — so unlike the
  retired `auto-hide` mode, even at 1.0 a grazing near wall settles partway and FAR walls stay
  opaque (strength 0). It still respects `wallRevealScope` (applied together with the fade). Rationale for the earlier binary→graded reversal: the binary target guarded against walls resting at a
  "washed" mid-band opacity, but the wall class that must never rest mid-band is the FAR/back
  walls (interior surface toward the camera) — and those are excluded *structurally* by the
  orientation check (`facingToward` ≤ 0 → strength exactly 0 → fully opaque), with or without a
  binary snap. NEAR walls (exterior toward the camera) are the intended graded surface and may
  rest at any partial translucency; keep the curve a gentle, honest smoothstep (no fast-ramp
  bias). Interior partitions in `wallRevealScope === 'all'` keep the flip-normal-toward-camera
  behaviour on the same curve. **Corner spread (WALL-REVEAL-CORNER-SPREAD):** a wall sharing a
  corner (endpoint, `cornerNeighbors`) with a wall fading by its OWN facing fades too —
  `cornerSpreadStrength` grades it by this wall's own facing on the spread curve
  (`SPREAD_ONSET`→`SPREAD_FULL`; a corner companion is near-perpendicular so its `toward` tops
  out ~0.3–0.5, hence the lower full-point), CAPS it at the strongest neighbour's own strength
  (the follower never fades deeper than its leader — without the cap a ~45° two-facade view
  would snap both walls near peak, defeating the graded look), and gates it *smoothly* on that
  neighbour strength (`SPREAD_GATE`→`SPREAD_GATE_FULL` ramp — a hard cut would pop with no
  hysteresis); final strength = `max(own, spread)`. Spread is strictly FIRST-degree: each wall publishes its
  own-facing strength (never its final strength) to the per-frame registry in `wallReveal.ts`
  (`setWallOwnStrength`), so spread can't cascade wall→wall→wall around the perimeter. All curve/adjacency math is pure in `wallRevealMath.ts`;
  `PlanShell`/`PlanDoorLeaf` (custom plans in orbit) share the same graded curve (corner spread
  there is deferred — `WallBox` carries no wall id yet, see TODO.md).
- **A T-junction always RETRACTS; only a true corner spans (WALL-TJUNCTION-RETRACT).**
  `wallSegments.ts:wallCornerAbut` used one alphabetical tie-break (`wall.id < other.id`) for
  every join. At a real corner that is right — both walls end there, one must span the notch.
  At a T-junction only the STEM ends: there is no notch, and winning the coin-flip drove the
  stem's body from the through wall's centreline to its FAR face, overlapping it by the
  NEIGHBOUR'S FULL THICKNESS. Invisible while both are opaque; a hard-edged double-composite the
  moment they fade — and the width is the neighbour's thickness, so a 100 mm partition into
  another partition hid a 100 mm block while the same partition into a **300 mm** RC wall painted
  a 300 mm-wide, full-height bright band down the reveal. That is why it looked like a
  "different thickness" bug: the thickness set the severity, the tie-break set whether it
  happened at all. `wallCornerAbut` now checks whether the neighbour also ends at the point
  (`mutual`) and retracts unconditionally when it does not.
- **A fading wall renders ONE layer per side — overlays are culled (WALL-FADE-OVERLAY-CULL).**
  The wall body is deliberately one watertight extruded shape so it has no internal seams when
  it fades. Everything sitting ON it undoes that: an interior face plane (1 mm proud), a
  baseboard, a crown, the accent-selection highlight. With `depthWrite` on and back-to-front
  transparent sorting the body blends first and the overlay blends over it, so the wall
  composites TWICE wherever an overlay covers it and once where it doesn't — density bands down
  the wall, and a heavier band along every base/ceiling junction. At an outside corner it is
  worse again: a face plane is extended by the abutting wall's half-thickness so the finish
  reaches the outer edge, which is invisible while that neighbour is opaque and a third layer
  once it isn't. So every overlay mesh is tagged with `wallReveal.ts:markWallOverlay()` and
  hidden for the duration of the fade (`WallSegment`'s traverse and `useWallReveal`, i.e. orbit
  AND the room editor); they return the instant the wall is opaque, where depth testing — not
  blending — resolves them and the finish must be visible.
  **An OPENING in a fading wall shows frame + glass only**, on the same mark and for the same
  reason: a window is a frame + glass + sill + mullions + safety grille + louvre slats +
  invisible-grille cables, and a door adds a security gate (8 bars + 6 rails) and handles —
  each its own translucent layer over the wall. `Window.tsx` / `Door.tsx` cull everything that
  is not frame, glass or the door leaf; a door's gate and handles are tagged on their GROUP and
  matched with `isWallOverlayBranch` so a multi-mesh sub-assembly needs one mark, not one per
  member. Glass BLOCKS stay — they are the glazing, not detail. Measured on the default flat
  mid-fade at a corner: 49 visible translucent meshes before, 31 after (all cylinders gone),
  leaving exactly wall body + frame + glass. **Anything new drawn on a wall face or inside an
  opening must carry the mark**, or it reintroduces the banding.
- **`depthWrite` stays ON through the whole wall/door/window fade (WALL-FADE-DEPTHWRITE).** Every
  reveal-fade site — `WallSegment`, `useWallReveal`, `PlanShell` (wall + trim), `PlanRoomShell`,
  `Skirting`, `Door`, `PlanDoorLeaf`, `Window` (incl. glass) — sets `material.depthWrite = true`
  regardless of opacity; only `transparent`/`opacity` change as it fades. Do **NOT** flip
  `depthWrite` with `transparent` (the old `!transparent` / `!fading` pattern): flipping it made a
  surface snap between a solid occluder and a see-through pane the instant it crossed the ~0.985
  threshold (visible *popping* while orbiting, + a 2D↔3D door/frame snap), and left faded surfaces
  (dw off) sorting inconsistently against glass/openings (dw on) so the backdrop bled through their
  overlap into a bright band. Constant depth-write = no occlusion pop, single-surface self-occlusion
  (no front/back double-blend), and consistent transparency sorting across every reveal surface.
  **But depth-write only makes ONE wall self-consistent — the ORDER across walls is the other
  half of the rule (WALL-REVEAL-SINGLE-LAYER).** Three sorts the transparent list
  back-to-front, so two faded walls stacked in depth (an exterior wall in front of a partition at
  a corner, the kitchen/yard pair, the room editor's cut-away walls) each blend in turn and the
  alpha ACCUMULATES: `1 − (1 − 0.37)² ≈ 0.60` where they overlap against `0.37` beside it —
  rectangular density bands and L-shaped dark patches. Every fade site therefore also sets a
  per-frame `renderOrder = wallRevealMath.ts:revealRenderOrder(viewDepth)`: strictly negative
  (so faded walls draw ahead of ordinary transparent objects at 0 — a pane IN FRONT still blends
  over the wall, a pane BEHIND correctly depth-fails) and RISING with depth, i.e.
  FRONT-TO-BACK. The nearest faded fragment then writes depth first and every faded fragment
  behind it fails the test: exactly one layer of alpha per pixel however many walls stack. The
  order is per WALL, not per mesh — body, face plane, trim and the section cap share it and
  resolve among themselves by their real depths — and resets to 0 the moment the wall is opaque.
  Do NOT "fix" it to `-depth`: that merely restates three's own back-to-front order and the
  banding returns. **And per-OBJECT order is only most of the answer: at a corner where walls of
  DIFFERENT thickness meet, the nearest wall by midpoint is not the nearest SURFACE, so every
  faded surface additionally writes a depth-only pre-pass and draws its colour with
  `depthWrite: false` + `EqualDepth` (WALL-REVEAL-DEPTH-PREPASS, `apartment/walls/wallRevealPrepass.ts`)
  — which makes the single layer per-PIXEL and order-independent.** The reveal is a UI device,
  not a physical surface, so there is nothing to reference-render in Cycles.
- **Zero artifacts.** Realism work must introduce **no z-fighting or clipping**: offset
  coplanar overlays off the surface (e.g. floor decals at +~0.005 m, `depthWrite` off,
  `transparent`), keep parts from intersecting, and orbit to a side/profile angle to confirm
  contact (top-down hides float/sink). Visually verify per the playbook — green tests are
  not proof the render is right.
- **The dollhouse RE-FITS on a material aspect change (ASPECT-REFRAME).** `OrbitCamera`'s
  framing effect frames once on first attach / room switch and read the viewport size
  point-in-time rather than as a dependency, so nothing re-fitted when the viewport changed.
  Portrait -> landscape that is harmless (the flat just gets smaller), but landscape ->
  portrait CLIPS it: the landscape fit solves the vertical FOV at ~2.6r while portrait needs
  ~5.3r for the narrower horizontal FOV. Measured with `scripts/dev-probes/phone-view.mjs`
  (frame at 844x390, rotate to 390x844, camera untouched): the plan spanned **191.1% of the
  viewport width**, and the frame shows whole rooms cut off BOTH edges. A phone rotation is
  the everyday way to hit this.
  The framing body is now a `frameNow(force)` callback shared by the original attach effect
  and a new `size`-keyed effect, and `framedRef` remembers the aspect it solved for plus the
  pose it produced. The re-fit fires only when BOTH hold, and both guards matter:
  · `aspectChangedMaterially` (pure, `frameSelection.ts`) gates on a RATIO (1.2), not a pixel
    delta — a window drag fires continuously and must never re-frame, while a rotation is a
    4.7x change.
  · `poseIsStillFramed` (pure) requires the camera to be exactly where auto-framing left it
    (5 cm), so a deliberate zoom or pan is NEVER yanked away. Any user gesture disqualifies
    the re-fit until the next explicit frame request — being pulled out of your own zoom on
    rotate would be worse than the clipping this fixes.
  Verified: rotated portrait went **191.1% -> 91.5% w x 26.2% h**, identical to a fresh load
  at 390x844 (so the re-fit reproduces native framing, it doesn't approximate it), with the
  whole flat visible and margins both sides. 320x568 also improved (75.1% -> 91.2% w — it had
  been holding the stale 390 framing), 390x844 is unchanged, and desktop 1280x800 is unchanged
  at 55.2% w x 55.9% h.
  **Two things this is NOT, both measured, so don't re-file them:** the sphere fit is not
  wasteful (at 390x844 the flat already fills 91.5% of the width; the ~26% height is inherent
  to a wide, shallow plan on a 0.46-aspect screen and zooming in would CROP the plan), and the
  phone pixel budget is fine (DPR is correctly clamped 3 -> 1.5 by medium's `dprMax`, giving a
  0.74 Mpx buffer — smaller than the 2.3 Mpx desktop frame).
  · **RE-CONFIRMED QUANTITATIVELY, and a plausible replacement was built and thrown away
    (DOLLHOUSE-PORTRAIT-FIT-REFUTED, 2026-09-25, audit finding V9).** The objection is intuitive:
    a bounding SPHERE is shape-agnostic, so fitting one "must" over-size a rectangular flat, and
    in portrait the narrow horizontal FOV multiplies the error. An exact box fit was therefore
    written — project all eight corners of the storey AABB onto the camera basis and solve each
    screen axis — and measured against the shipped sphere fit at 390x844 on the default flat:
    **48.67 m against 48.82 m, i.e. 0.3 % tighter.** The premise is wrong because the dollhouse
    looks from **45 deg of azimuth**, where the screen-right axis is the footprint's DIAGONAL: the
    box's extent along it is `(pw + pd)/sqrt(2)` = 9.02 m against the sphere's 9.5 m radius, so the
    sphere was never materially over-sizing anything. The box fit was reverted rather than shipped
    with a docstring claiming a win it does not deliver. **If a phone boot frame ever looks too
    small again, the lever is CONTENT (how much of the frame ESTATE-SURROUND fills around the
    flat), not the fit.**
  · **The "phone boots to a near-black void" report (V9) does NOT reproduce at v0.35.13.0** —
    measured, twice, and not by reasoning. Booted as a real phone (`SHOT_VIEWPORT=390,844
    SHOT_TOUCH=1 SHOT_GPU=1 SHOT_ANGLE=metal`), clock pinned to 13 and `deviceClass` pinned
    `capable` with the setter stubbed, the default boot frame shows the flat lit and legible, and
    a `requestHomeView()` in the same session produces a **pixel-identical** frame — which is
    expected, since boot framing and reset-view call the same `dollhouseFraming`. The same holds
    through a real document load into `#/showroom/<code>` at 390x844. The original report's phone
    frames were captured after `focusOn()` calls, and that audit separately records `focusOn`
    dollying to <= 4.5 m at y = 0.6 and landing the camera INSIDE a wall as the cause of its own
    featureless frames.
- **Every new orbit-camera retarget reuses the shared `startFly` tween, never a raw
  `camera.position.set`/`controls.update()` snap.** `OrbitCamera.tsx` funnels saved view,
  double-click focus, top-down, reset/home, and frame-selection (FEAT-A, `Z` — `scene/cameras/
  frameSelection.ts`) through one `fly` ref + `startFly.current(pos, target)`, so every retarget
  gets the same smoothstep ease, distance-aware duration (`cameraTween.ts` `flyDurationFor`), and
  spherical (not Cartesian) interpolation that avoids the TV-SNAP pole-instability bug. A new
  camera-framing feature adds a nonce + payload field to `cameraSlice` (mirror `frameNonce`/
  `frameBounds`) and a `useEffect` that calls `startFly.current(...)` — never a new ad-hoc tween.
  Keep bounds→distance math in a pure, three.js-free module (`fitDistanceForFov`/
  `clampOrbitDistance` in `frameSelection.ts`) so it stays unit-testable; `OrbitCamera.tsx` only
  supplies the live `camera.fov`/`aspect` and the current view angle.
- **A plain-object module signal is the sanctioned way for DOM UI outside the R3F tree to talk
  to a per-frame controller inside it**, in either direction — `cameraForward.ts`
  (`cameraForwardXZ`/`cameraPosXZ`) publishes OUT (written every frame, read by the minimap/
  arrow-key nudge); `cameras/walkTeleport.ts` (MINIMAP-JUMP) is the mirror-image IN: the minimap
  calls `requestWalkTeleport(x,z,yaw)` on tap, `FirstPersonCamera` polls
  `consumeWalkTeleport()` once per frame and clears it. Never round-trip a once-per-event signal
  like this through Zustand (a `subscribe(markDirty)` firing on every pointer event is wasted
  churn) — reserve the store for state that actually needs to persist/react beyond one frame.
- **A furniture drag is gated by `pointerId` (BUG-1).** `Furniture.tsx`'s `onPointerDown`
  records the initiating `e.nativeEvent.pointerId` into `placementSlice.startDrag(...,
  pointerId, ...)` (stored as `dragPointerId`) and best-effort `setPointerCapture`s it on the
  canvas (guarded — a stale/synthetic id throws `InvalidPointerId` on some browsers).
  `DragController`'s window-level `pointermove`/`pointerup`/`pointercancel` listeners gate every
  event through `dragHelpers.ts:isActiveDragPointer(state.dragPointerId, ev.pointerId)` before
  touching the drag — a second finger's independent pointer stream (its own `pointerId`) is a
  complete no-op: it can't move the item and it can't end the drag. Only the pointer that
  started the gesture drives `onMove` and commits/reverts on `onUp`. `endDrag` clears
  `dragPointerId`. Any new in-canvas drag/gizmo gesture that adds its own window-level
  pointermove/up listeners should follow the same pattern. **`RotateGizmo`/`ResizeGizmo`/
  `TiltGizmo` now comply (MOBILE-1)** — each records the initiating `e.nativeEvent.pointerId`
  into its own `gesture` ref (a per-gizmo field, not the store's `dragPointerId`, since a gizmo
  gesture is a distinct pointer stream from an item drag — the two are mutually exclusive via
  `!draggingItemId`/`!activeDefId` in each gizmo's `visible` check) + best-effort
  `setPointerCapture` (same guarded try/catch as `Furniture.tsx`), and gate their window
  `pointermove`/`pointerup`/`pointercancel` through `dragHelpers.ts:isActiveDragPointer`. Verified
  with a real two-pointer scenario (`scripts/scenarios/gizmo-rotate-multitouch.json`): grabbing the
  rotate ring with one pointer then driving a second pointer far away leaves the rotation
  untouched and the second pointer's `pointerup` doesn't end the gesture. `MarqueeSelector`
  (MOBILE-2) is gated the same way (a closure-local `activePointerId`, since it lives outside the
  Canvas with no per-gesture ref). Catalog placement-drag ghost (`src/ui/catalog/
  usePlacementController.ts`, MOBILE-3) is gated too, though it's outside `src/scene/` and a
  UI-owned surface: placement arms off-window (a catalog-card long-press timer fires before this
  hook's listeners exist), so there's no `pointerdown` to record the initiating id from — its
  `dragPointerId` is instead latched lazily onto the first pointer event the effect observes, reset
  on every concluding touch up/cancel (so a stamp/shift drop that keeps the same `activeDefId`
  armed re-latches per drop). Same `isActiveDragPointer` reuse, adapted for a hook that can't see
  the gesture's actual start.
- **Select-then-drag model (DRAG-SELECT-FIRST + bugs #11/#12).** `scene/touchGestures.ts`
  (installed once from `App.tsx`) counts active touch pointers on the window (capture phase, so
  it's current inside R3F handlers). `Furniture.onPointerDown` bails on a multi-finger touch
  (`activeTouchCount() > 1`) so a pinch/zoom never selects or moves a piece. A pointer-down begins
  a MOVE drag ONLY when the pressed piece was ALREADY selected before the gesture
  (`dragHelpers.ts:shouldBeginItemDrag`, pure + unit-tested) — on **both desktop and touch**. The
  FIRST press on an unselected piece never drags: selection is deferred to `onClick` (a clean
  click selects; a press-drag falls through to the orbit camera, so `draggingItemId` stays null
  and an immediate drag rotates the room view instead of moving the piece). This unifies desktop
  with the old touch-only rule (desktop previously selected AND started a drag on one
  pointer-down, so a first grab moved the piece). `Furniture.onClick` skips selection when
  `gestureIsMultiTouch()`, so a pinch's first finger landing on a piece still never selects it. A SECOND touch finger arriving mid-drag calls
  `placementSlice.cancelDrag()` (from `DragController`'s window `pointerdown`) — reverts the
  in-progress drag to its pre-drag snapshot + ends it — so a pinch that starts on an
  already-selected piece hands off to the (re-enabled) camera instead of dragging + swallowing
  the zoom.
- **The orbit camera freezes under any mobile overlay (bug #6).** `OrbitCamera`'s `controlsEnabled`
  adds `!(isMobile && (anyModalOpen || overlayOpen))` — a bottom-sheet (catalog / inspector /
  finish / wall-accent) or modal floating over the canvas must not let a swipe pan/orbit the scene
  behind it. `modalGuard` gained a reactive `useAnyModalOpen()` (`useSyncExternalStore`) for this;
  `overlayOpen` is `catalogOpen || selectedItem(s) || selectedRoomId || selectedWall`. Desktop is
  unaffected (docked side panels don't cover the canvas). This is in addition to the existing
  drag/rotate/placement freezes.
- **Alt/Option-drag duplicate (FEAT-B, `altDragDuplicate` flag, pro tier).** Starting a drag on
  an ALREADY-selected item while holding Alt clones it and drags the copy, leaving the original
  in place — the decision (`dragHelpers.ts:shouldDuplicateOnDragStart`, pure + unit-tested) is
  locked in at `Furniture.onPointerDown`, which passes the selection's ids as `startDrag`'s
  optional `duplicateSourceIds` instead of creating anything yet. That only arms
  `placementSlice.dragDuplicatePending` — the clone is created lazily, on the drag's FIRST real
  `pointermove`, via `resolveDragDuplicate()` (`DragController`'s `onMove`, before every other
  branch): it clones the source item(s) **in place** (`furniture/duplicatePlacement.ts:
  cloneItemsInPlace` — same clone shape as `planDuplicates`, no offset search since the copy is
  about to be dragged away) and repoints `draggingItemId`/`dragGroupOriginals` at the fresh
  clone(s), so every later `onMove`/`onUp` branch (collision, snug-stack, alignment guides, the
  BUG-1 pointerId gate) runs unmodified against the copy while the original sits as an ordinary
  static obstacle. This is why a plain Alt+click that never moves duplicates nothing (no
  pointermove ever fires) and can't collide with `selectItemGrouped`'s existing Alt-drill-in
  (that only runs when the pressed item ISN'T already selected — `shouldDuplicateOnDragStart`
  requires the opposite). A multi-selected drag clones the whole selection, re-grouping the
  copies under a fresh id only when every source shared one group (mirrors `duplicateAll`/
  `duplicateSelection`'s groupId rule) — a lone item's clone always drops the group, matching the
  single-item Duplicate button. `startDrag`'s one `pushHistory()` already covers "undo the
  duplicate + the move" in a single step (the clone itself is added via a plain `set`, no second
  push) — the one wrinkle is `dragIsDuplicate`/`dragDuplicateSourceIds` (set by
  `resolveDragDuplicate`, read + cleared by `onUp`): if the resolved copy ends up nowhere
  different from its source (an invalid drop auto-reverted, or a net-zero move), `onUp` restores
  the exact pre-duplicate items/selection snapshot instead of falling into the generic "no-op
  click" `dropRedundantHistory()` path, which would otherwise leave an orphaned, un-undoable
  duplicate stacked on the original (item-COUNT changes aren't visible to that path's
  position-only `changed` check).

- **The out-of-box flat renders at ~40% of its lit brightness, and `lightsMode: \'off\'` is
  essentially the whole reason (DEFAULT-GLOOM, v0.31.5.54 — measured, NOT changed).** A 24-frame
  walk-tour contact sheet at 13:00/medium came back with almost every interior dark grey. That is
  not a probe artefact and not the tier: `tier-drift.mjs` holds one pose through 24 teleports and
  reports **medium / IBL true / exposure 1.38 / 13:00 manual, stable throughout**, reproducing the
  same dark frame. Three separately-defensible defaults compound — lights off, curtains drawn
  (WINDOW-TIME-INVARIANT), interior doors closed — so `default-gloom.mjs` separated them at four
  room-centre poses, one variable at a time:

  | room          | default | lightsMode on | + curtains opened |
  | ------------- | ------- | ------------- | ----------------- |
  | bath1         | 78.8    | **192.9**     | 196.4             |
  | kitchen       | 83.3    | **188.8**     | 193.4             |
  | livingDining  | 76.0    | **175.1**     | 175.5             |
  | mainBedroom   | 74.8    | **190.2**     | 189.8             |

  · **The switch is the lever; the curtains are not.** Turning the lights on is worth **2.3–2.5x**
    in every room. Opening every curtain on top of that adds between −0.4 and +4.6 — nothing.
    So the gloom is one boolean, and the curtain default (which an earlier round flagged) is a
    minor contributor by comparison.
  · **This is already half-documented and the consequence understated.** NIGHT-LIGHT-BUDGET
    records that `lightsMode` defaults to off and that a zero point-light census "reads as a
    broken light system and is simply the switch being off" — but it frames that as a trap for
    someone auditing lights, not as the dominant driver of how the whole flat looks on a first
    walk-through. It is both.
  · **Nothing was changed: this is a PRODUCT decision, not a defect.** Lights-off at 13:00 is
    physically reasonable (you do not switch a light on at midday) and the daylight model is
    working — the rooms brighten correctly when the switch flips. Whether a first-run user should
    walk into a lit home is a product call, and re-tiering someone else\'s default on my own
    judgement is exactly what meta-rule (xiii)\'s scope forbids.


- **The BOOT view holds up on the PERFORMANCE tier — the whole sweep's medium-tier findings
  transfer (TIER-PARITY-BOOT, v0.31.5.82).** Every measurement in `.56`–`.81` was `tier=medium`,
  but `quality.ts:tierForCapabilities` boots `performance` on software rasterisers, coarse
  pointers (phone/tablet), no-WebGL2, and <4 cores — i.e. the tier many real users actually get.
  `.67` had already found one performance-only wall defect, so the axis had paid before.
  **Hypothesis: the flat tier's boot view differs materially from medium. FALSIFIED.**
  · **`chroma-audit MODE=orbit TIER=performance` h9**: mean chroma **0.142**, 2.1% of pixels past
    0.35 saturation, versus medium's 0.158 / 3.2%. The class ranking is unchanged down to 0.7%.
    Chroma TRACKS rather than diverges, which is the live confirmation that `.67`'s always-mounted
    composer keeps AgX on the flat tier — `postprocessing: false` no longer means "no tone map".
  · **The no-IBL metalness cap is visible in the census.** `#d8dade` reads `metal 0.90` on medium
    and **`metal 0.25`** on performance. That is the documented guard (`Wardrobe.tsx`, `.77`)
    doing its job with `ibl: false`, not a discrepancy between tiers.
  · **Grounding is measurably shallower, and that is the designed trade-off — not a defect.**
    With `shadowMapSize: 0` and `ao: false`, the cheap `ContactShadow` blob is the only contact
    cue. Differential A/B over identical pixel regions in the two orbit frames (so any framing
    error cancels), reporting `(mean - p1)/mean`: round side table **46.7%** performance vs 66.6%
    medium; sofa **42.4%** vs 54.8%. Shallower by 12–20 points, but a strong contact gradient is
    plainly present — the furniture does not float, which is the property `quality.ts` calls RZ1.
  · **Read that number for what it is.** The regions contain the furniture bodies as well as the
    floor, so it conflates the contact blob with each piece's own shading and, on medium, with AO.
    The gap is those three together, not the blob alone. It is adequate to answer "does it float";
    it is NOT a measurement of the blob decal in isolation.
  · `tier-look` at h13 (performance 180.8 / medium 178.21 / high 178.48, sd 22.09/23.09/22.22) was
    a RE-RUN — the four-tier tone agreement was already on record. Meta-rule (xvii-b), eleventh round.

- **The `performance`-tier "EMPTY flat" contradiction is CLOSED — it does not reproduce
  (PERF-EMPTY-CLOSED, v0.31.5.85).** `.61` recorded a contradiction it could not settle:
  `walk-tour.mjs TIER=performance` returned 44 frames of an empty flat (no walls, no furniture,
  just ground and backdrop) while `wall-mottle.mjs` at the same tier found the geometry fully
  mounted. Re-run at the shipped state, `walk-tour.mjs TIER=performance LIGHTS=on` (22:45 local,
  resolved `performance/on/manual13`): **44 frames, mean 75% content, 354 visible meshes in
  frustum, 87,228 triangles, ZERO empties**, all 11 rooms `ok, 4 yaws`. A cropped frame shows
  walls, ceiling, curtain weave and rail, TV and a fan blade. `.82` independently got real frames
  from `chroma-audit TIER=performance`.
  · **The most likely original cause was probe TIMING, not culling** — a stale `frameloop="demand"`
    composite captured before the scene drew, which is exactly what the two instruments disagreeing
    while the scene graph was fully mounted implies.
  · **The instrument that would catch a recurrence already exists.** `walk-tour.mjs` carries the
    EMPTY-FRAME GUARD (`EMPTY_PCT`, default 12) comparing every cell against the backdrop corner,
    plus `assertSceneAlive` per pose — so a silently empty shot now fails loudly instead of being
    written to disk looking plausible. That was `TODO.md`'s recorded next step and it is done;
    meta-rule (xvii-b), THIRTEENTH round.

- **The 0.371 boot-pose opacity is NOT a defect — `.53`/`.84`'s framing was wrong, and the user
  closed it as designed (WALL-REVEAL-POSE-RETRACTED, v0.31.5.89).** No code changed.
  · **The claim was that "the parameter promises a 0.05 head-on floor and the shipped boot pose
    never gets near it, so intent and behaviour disagree". That is false.** Verified exactly:
    `revealStrength(1)` with `REVEAL_ONSET = 0.25` gives opacity **0.0500** — the floor IS delivered
    **head-on**, which is precisely what `WALL-REVEAL-STRENGTH` documents. The dollhouse boot pose
    looks down a 45° diagonal, so `toward` = 0.707 → strength **0.6616** → opacity **0.3715**
    (matching the recorded 0.371 / own-strength 0.662). An intermediate angle producing an
    intermediate opacity is the ANGLE-GRADED curve working, not failing.
  · **`WALL-REVEAL-ANGLE-GRADED` already answered the "washed mid-band" worry.** The class that must
    never rest mid-band is the FAR walls, and they are excluded *structurally* (`facingToward` ≤ 0 →
    strength exactly 0 → opaque). NEAR walls "are exactly the ones that SHOULD fade gradually and are
    EXPECTED to rest anywhere along the curve". `.53` re-applied the retired binary target's
    reasoning to the very class that decision exempted.
  · **The onset lever cannot deliver the request anyway.** `smoothstep(onset, 1, 0.707)` at
    `onset` 0.25 / 0.10 / 0.00 gives opacity 0.3715 / 0.2864 / **0.2468** — even onset 0 lands
    nowhere near 0.05. Reaching the floor at 45° requires narrowing the domain (≈
    `smoothstep(0.25, 0.707)`), i.e. exactly the "fast-ramp bias" this file forbids, and it would
    flatten all grading above 45°.
  · **Verified visually before deciding**: the boot frame crop shows kitchen cabinets, microwave and
    counter reading clearly through the near façade — a legible dollhouse cutaway, not a fault.

- **WEATHER-CONDITIONS: a sky condition moves energy between the SUN and the FILL; it does not dim
  the frame (`lighting/weather.ts`, flag `weatherConditions`, simple, default ON).** `timeSlice.ts`
  had carried `weather` since `v0.34.1.31` with nothing in the render path reading it. The grade is
  pure and dependency-free like `look.ts`: `weatherGrade(condition, daylight)` returns a `sun`
  multiplier (the shadow-casting `DirectionalLight`), a `fill` multiplier (hemisphere + ambient +
  the IBL probe + the orbit studio key), two chroma-only tints and a `blowout` scale.
  · **`'clear'` is the EXACT identity, not a computation that lands on 1**, and every condition is
    the exact identity at night — rule 8 above, since weather is a property of DAYLIGHT and a
    lamp-lit room looks the same under any sky. Verified live: flag-on `clear` against a flag-OFF
    control at 2 modes × (orbit / room editor / 2 walk poses) sits **at the measured noise floor in
    every cell**; the only residual is the living room's ANIMATING CEILING FAN, and with that one
    rectangle excluded the worst cell reads **0.096 mean|Δ| against a 0.012 floor with a maximum of
    8 counts**, all of it the fan's own moving shadow on the ceiling. An amplified diff is five
    blades on pure black. `scripts/dev-probes/weather-app.mjs` reproduces the table; note it
    captures the flag-off arm TWICE, at the start and the end of each cell, so the floor is
    measured per cell rather than borrowed.
  · **Under a full deck the beam is EXACTLY zero**, so the scene's only shadow-casting light goes
    dark and there are no cast shadows at all. That is the defining property of an overcast room,
    not a side effect, and it is why a grade that merely dimmed would be wrong.
  · **The numbers are Kasten & Czeplak (1980) outdoors and Cycles indoors.** Their global
    transmittances — clear 1.00, 4 oktas 0.929, stratus 0.18, nimbostratus 0.16 — are the exterior
    truth, and **rain is only ~11 % darker outdoors than plain overcast**; the dramatic part of a
    rainy room is not its level. Indoors the outdoor ratio does not survive the aperture: at the
    app's 13:00 the Singapore sun sits at **87°**, so the beam meets a vertical window at
    `cos 87° = 0.05` and the interior is diffuse-lit under every condition.
    `python/scripts/blender/render_weather.py` renders the exported scene under each calibrated
    sky and `scripts/dev-probes/weather-cycles.mjs` reads it in linear: interior mean
    **1.000 / 2.186 / 0.728 / 0.649**. The shipped `fill` (1 / 1.15 / 0.55 / 0.48) sits between
    that and an aperture calculation done with a tropical clear-sky diffuse fraction — see
    `weather.ts` for both biases in the Cycles arm and why `partlyCloudy` deliberately ships short.
  · **`exteriorDayBoost` falls out rather than being re-fitted.** A window blows out because the
    outside receives more than the room, so the ratio is `transmittance ÷ fill` — **~1/3 under a
    deck**. Visible and large: at the kitchen pose the near-white fraction goes **50.2 % → 1.5 %**
    and at the living/dining window **15.4 % → 0 %**, which is the single most legible part of the
    whole change.
  · **MEASURED AGAINST EXPECTATION: overcast reads WARMER here, not cooler, and the reason is the
    app's own clear sky.** The goal predicted "a much cooler colour". Measured at the living/dining
    walk pose, R−B goes **−8.5 (clear) → −6.2 (overcast)**. Two things cause it and both are the
    app rather than the grade: `LIGHTING_KEYS` uses a strongly blue `[0.55, 0.66, 0.92]` hemisphere
    while a real cloud deck is near-neutral, so neutralising the dome *warms* the fill; and
    INTERIOR-SHADOW already established that the sun reaches almost nothing indoors, so deleting
    the warm beam costs less warmth than the dome change gains. A photographic "overcast is cooler"
    intuition is formed against a SUNLIT room, which this renderer does not produce indoors.
  · **One bug worth keeping, because the class recurs.** The tint was first applied as a single
    ratio (deck ÷ clear sky, `[1.18, 0.99, 0.72]` at 6600 K) to both the hemisphere AND the flat
    `ambientLight`. The hemisphere carries the clear sky's chroma so the ratio is right there; the
    ambient is WHITE, so the same ratio made the flat fill visibly warm — the opposite of a cloud
    deck. `WeatherGrade` therefore carries two tints, a ratio and an absolute, and the test pins
    which is which. **A chroma ratio is only valid against the chroma it was divided by.**
  · **The orbit SKY DOME did not follow the weather. CLOSED by WEATHER-SKY below.**
  · Sweep/verify: `scripts/dev-probes/weather-app.mjs` (byte-identical proof + per-condition
    statistics), `scripts/scenarios/weather-conditions-simple.json` (picker in Simple + a live
    scene-graph read of sun/hemisphere/ambient/`environmentIntensity` per condition — a screenshot
    cannot tell a grade that ran from one that was computed and discarded) and
    `weather-conditions-journey.json` (walk + room editor + night identity + the Pro crossing).

- **WEATHER-SKY: the sky BACKDROP follows the weather, using the SHIPPED grade's own terms rather
  than a second weather model (`skyGradient.ts:skyWeather`, flag `weatherSky`, simple, default ON).**
  This closes the gap WEATHER-CONDITIONS recorded: the room, the estate and the window all responded
  to `store.weather` while `lighting/Sky.tsx` / `skyGradient.ts` / `skySurround.ts` painted from the
  sun altitude alone, so an `overcast` dollhouse sat under a cloudless blue sky in the app's BOOT
  view. Both surfaces now respond, and they cannot disagree — they share `skyRadiance`, and each
  builds its deck from the same `weatherGrade` call.
  · **Three terms, all read off `WeatherGrade`; `weather.ts` is untouched.**
    `cover = 1 - grade.sun` (`BEAM` is documented as the cover fraction, so the beam lost and the
    dome covered are one number), `level = grade.fill` (the multiplier the grade already puts on the
    hemisphere light, i.e. on the dome), `tint = grade.fillTint` (the deck's ABSOLUTE chroma — the
    deck is built from a luminance, which is neutral, so the ratio `skyTint` would be the exact bug
    WEATHER-CONDITIONS records catching in the frames). Only ONE new quantity exists, and it is a
    property of the sky rather than of the weather: `clearDomeLuminance`, the cosine-weighted mean
    luminance of the CLEAR dome, which is the energy the deck redistributes.
  · **The model is CIE standard overcast (Moon & Spencer 1942), energy-normalised.**
    `overcastShape(cosθ) = (1+2cosθ)/3 ÷ 7/9` has a cosine-weighted hemispherical mean of exactly 1,
    so `level` is the ONLY term that changes the level and the 3:1 gradient purely redistributes.
    Without that normalisation the shape would dim the horizon a second time on top of `fill` — and
    the horizon is exactly where the orbit camera looks, since it is pitched ~25° DOWN.
    `deck(v) = domeLum · level · overcastShape(v.y) · tint`, then `lerp(clear, deck, cover)`, which
    is what makes `partlyCloudy` a partial version of the same thing rather than a third case. The
    deck's polarity is INVERTED from the clear sky's (brightest overhead, greying to the horizon),
    which is right and is the most legible part of the change.
  · **`clear` is byte-identical BY CONSTRUCTION, not by rounding.** `weatherGrade('clear', d).sun` is
    an exact literal 1, so `cover` is exactly 0 and `skyWeather` returns **`undefined`** — not a
    neutral deck. `skyRadiance` then runs the shipped path with not one extra arithmetic operation.
    A neutral deck would be a lerp by zero, which is *almost* always the same bytes; `clear` is the
    default condition and "almost" is not the guarantee a default look needs. The same holds at
    NIGHT for every condition, because the grade ramps to identity there (rule 8).
  · **The re-bake is FREE, and the hoist is the reason.** `domeLum` costs 512 `skyRadiance`
    evaluations and does NOT vary with the view direction, so it is built once per bake by the
    caller (`Sky.tsx`, `SceneBackdrop.tsx`) and passed in — the same discipline SKY-HORIZON's
    per-column haze sample follows, whose per-pixel version cost 87.2 → 144.0 ms. Measured on the
    real browser main thread, median of 9: walk equirect 1024x512 **80.7 → 82.6 ms** (rain, +2.4 %),
    orbit surround 256x128 **8.7 → 8.8 ms**, the 1024x512 surround SKY-HORIZON quotes 136.6 → 138.6,
    and `clearDomeLuminance` itself **0.1 ms**, i.e. 0.12 % of a walk bake. `shouldRebuildSky` gained
    a `weather` field with NO threshold — a picker click is always past every threshold, and the
    grade's continuous half (its dusk ramp) is driven by the sun altitude `sunAngleRad` already
    watches.
  · **`tier: 'simple'`, and that is not a preference.** The orbit surround and the default walk-mode
    window ARE the default look, and this file records twice (SKY-ANALYTIC-ORBIT, and
    WINDOW-SKY-DEFAULT, which had to re-tier `proceduralSky` for precisely this) that a change to the
    default look behind a pro-tier flag is invisible to the users who see it.
  · **Measured, painted equirect bytes read back off the live textures** (the dome's `CanvasTexture`
    in orbit, `scene.background` in walk — a screenshot cannot tell a re-bake that ran from one that
    was skipped). 13:00, horizon row / the row the orbit camera actually looks at:

    | condition | dome horizon | dome 45° below | window ground |
    | --- | --- | --- | --- |
    | clear | 192/188/193 | 172/168/172 | 77/74/72 |
    | partlyCloudy | 185/183/185 | 165/163/165 | 80/77/75 |
    | overcast | 126/126/127 | 113/113/114 | 57/55/53 |
    | rain | 115/119/125 | 103/106/112 | 51/51/52 |

    At 18:00 the clear horizon is a warm 148/129/106 and the overcast one a flat 74/74/75 — the
    golden-hour aureole is gone, which is what "no sun disc" looks like in a model that never drew a
    disc. `rain` is 10–11 counts darker than `overcast` and measurably COOLER (b > r), which is the
    6600 K → 7300 K deck; `weather.ts` records that the outdoor level difference really is only
    ~11 % and that the visible difference is the colour.
  · **HONEST TRADE-OFF, measured and NOT patched over: the shipped overcast sky is on the moody side
    of a real one.** `fill` is fitted through a VERTICAL APERTURE, so it is smaller than the
    dome-to-dome ratio a sky backdrop wants. The physical figure is
    `GLOBAL_TRANSMITTANCE / k_d` with `k_d` the clear-sky diffuse fraction — **0.22** in `weather.ts`'s
    own module doc, where it is prose and **not exported** — giving **0.82** for `overcast` and 0.73
    for `rain` against `fill`'s 0.55 and 0.48. That would put the 13:00 overcast horizon near byte
    152 instead of 127. Reusing `fill` was chosen because it makes the sky agree with the light by
    construction and needs no new constant; if the brighter, more photographic deck is wanted, the
    fix is to EXPORT a dome term from `weather.ts` (this module must not duplicate its constants).
    Note the formula is only valid for a FULL deck — at 4 oktas the transmittance still contains half
    the beam, so `partlyCloudy` has no analogue and would need its own diffuse-only figure.
  · **What the change canNOT reach, so do not file it here.** With `estateSurround` on (the shipped
    default) the estate geometry fills nearly the whole orbit background at the boot framing and
    leaves a sliver of sky, so the dollhouse's weather reads mostly from the LIGHT; the dome change is
    plainly visible with the estate off and in a wider orbit. And the hard-edged diagonal on the
    living-room wall persists identically under `overcast` despite `grade.sun` being exactly 0 —
    that is the BAKED lightmap (daylight-only, weather-blind), not a cast shadow, and it belongs to
    the visibility-lightmap path rather than to the sky.
  · Verify: `scripts/scenarios/weather-sky-simple.json` (both modes, both surfaces, four conditions
    at 13:00 and 18:00, reading the painted bytes back off the live texture) and
    `weather-sky-dome.json` (the same orbit arm with `estateSurround` off, which is the arm that
    actually shows what the dome paints).

- **WINDOW-EXPOSURE + YARD-ESTATE + SWEEP-MODE-GUARD (S1/S4, v0.35.6.0).** `'walk'` is NOT a
  `CameraMode` — the sweep set it, `CameraRig` still walked, and everything gating on
  `=== 'firstPerson'` (incl. `Estate`'s mount) went off: **every walk clip recorded with no estate
  at all**, which WAS S4 and invalidated S1's evidence. `setCameraMode` now rejects unknown values
  with no state change. With that fixed the blowout is real — aperture facade **231 counts, 20-31 %
  ≥240**: `estate/apertureCoverage.ts` estimates pane coverage on the CPU (no readback) and ramps
  the boost 8 → **4** above 0.30 coverage, τ 0.3 s → **213 counts / 0.3 %**, sd +39 %. Calibrated
  poses measure 0.12 coverage, so scale is exactly 1 there. `estateLayout.ts:serviceWell` (walk
  only, like `sectionCut` is orbit only) re-opens the neighbour's service void the yard faces.

- **ORBIT-SHELL-CLAMP: the orbit camera is kept OUTSIDE the building envelope.** `minDistance`
  (3 m) and `maxPolarAngle` are scalars that know nothing about the flat's size, so at target
  (6.36, 1, 4.69) with radius **5.96 m** the polar limit parked the camera at (10.56, 1.09, 8.91)
  — inside the kitchen, walls opaque, and unrecoverable because EVERY polar angle at that radius
  is interior (audit finding S5). `cameras/orbitEnvelope.ts` (pure, tested) pushes it radially out
  to the plan's padded storey box (`ORBIT_SHELL_PAD` 0.6 m) each frame, eased over
  `ORBIT_SHELL_TAU`, and `target.y` is now clamped to [0, ceilingHeight]. Skipped while a tour
  owns the camera and in the room editor. Measured: 24/116 → **0/118** pose samples inside the
  shell. No flag — it is a constraint on an existing control, like the clamps it repairs.

- **PHONE-POLISH-2 (N4/N5/N6, v0.35.7.3).** **CEILING-EXPOSURE** (`lighting/ceilingCoverage.ts`,
  flag `ceilingExposure`): the ceiling is genuinely the brightest surface in a lit flat — `#fafafa`
  albedo with the bulb 0.10–0.55 m under it at `decay 2` (`9/0.55²` = 29.8) — so the fix is the
  CAMERA, a coverage-gated two-stop stop-down. Ceiling crop at the pitch clamp **≥240 22.84 % →
  0.03 %, sd 19.7 → 28.6**; kitchen pose byte-identical, living pose under the twin-run floor.
  **Featureless is CONTENT, not exposure** — that ceiling carries no map at all (PHOTO-GRAIN), so
  no stop-down can add detail. **N5 REATTRIBUTED:** the 136 POP are PARALLAX of the estate's
  window grid behind near mullions (tile deltas 46–107 counts; the whole ramp spans ~26), not the
  ramp — the true facade step was already ≤4 counts and `clampExposureStep` takes it to ≤3.
  **Two harness traps:** `sweep/record.mjs` samples `manualHour` but never sets `timeMode`, so a
  clip inherits the WALL CLOCK (a night re-run is not comparable to a day baseline), and a phone
  "top two-thirds" crop is ~20 % white DOM callout — masking it moved ≥240 from 8.93 % to 0.03 %.

- **ORBIT-ROTATE-ISOTROPIC: a phone rotation no longer changes how far a drag swings the camera
  (audit finding R2).** three's OrbitControls normalises BOTH rotate axes by `domElement
  .clientHeight` alone, so a 390x844 -> 844x390 swap made the same pixel drag rotate **2.16x**
  further. `orbit-phone-orientation-mid-gesture` holds the finger DOWN across the swap and then
  jumps it 300 px in ONE move, so in landscape that one move asked for ~4.83 rad instead of the
  ~2.23 rad its zero-event 09-18 baseline recorded: past `maxPolarAngle`, inside the shell, and
  out again as ORBIT-SHELL-CLAMP's radial push — a 6.5 m camera teleport in 100 ms ending 7.65 m
  from the pivot on the blown exterior (FLASH 7 / POP 2 from zero). `cameras/orbitTouchGestures.ts
  :orbitRotateSpeed` (pure, tested) normalises by the LONGER dimension instead. Measured with
  `dev-probes/orbit-resize-rotate.mjs`: portrait-vs-landscape gain **2.16x -> 1.01x**. The shorter
  dimension is equally invariant and WRONG — it converges on the fast landscape gain instead of
  removing it. Desktop 1200x900 was a real 1.33x slowdown, and is now CARVED OUT — see below.
- **DESKTOP-ROTATE-CARVEOUT: the long-axis rule is coarse-pointer only (v0.35.11.4).** The defect
  ORBIT-ROTATE-ISOTROPIC removes is an ORIENTATION SWAP changing the gain under a finger that is
  already down; only a coarse-pointer device swaps orientation. A desktop window is resized, not
  rotated, so paying a permanent 25 % loss of rotate travel per pixel on every mouse drag bought
  nothing. `orbitRotateSpeed(w, h, coarsePointer)` returns 1 on a fine pointer — three's stock
  `clientHeight` normalisation, the pre-v0.35.11.3 desktop feel EXACTLY (`orbit-slow-rotate`
  desktop-metal: 0.5148 -> 0.6865 rad/100 px against a 0.6981 theoretical and a 0.6981 measured
  pre-change control). Coarse keeps the invariance (phone clip still zero events, worst tick
  0.0526 rad). The first-delta-after-resize discard is NOT carved out — a window resize reflows
  under a held mouse button too.
