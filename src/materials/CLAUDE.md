# src/materials — finishes rules

Area rules for materials/finishes. Details in `docs/ARCHITECTURE.md`.

- **New finish** = an entry in `builtinCatalog.ts` (`procedural` with a pattern, or
  `solid`); new pattern painters go in `procedural/patterns/<family>.ts` (paint one tiling tile:
  albedo+normal+roughness from seeded noise over the shared `procedural/fieldKit.ts` buffers),
  wired into the `PATTERN_FN` dispatch in `procedural/generators.ts` AND add an entry to
  `PATTERN_SIZE_CAP` (256 for smooth/noise-based, 512 for high-frequency geometric patterns).
- **Bound texture channels (7).** `TexturedMaterialDef.textures` carries `albedo` (required),
  `normal`, `roughness`, `ao`, `metalness`, `opacity`, `displacement`. `cache.ts:buildMaterial`
  binds the first five to `map`/`normalMap`/`roughnessMap`/`aoMap`/`metalnessMap`; a **metalness
  map drives the scalar to 1** (three multiplies the two, so the default 0 would zero the map
  out). `opacity` binds `alphaMap` with **`alphaTest`, never `transparent`** — a blended surface
  joins the sorted transparent pass and fights the wall-reveal fade, which animates `opacity` on
  these same materials. **`displacement` is deliberately NOT bound to three's `displacementMap`**
  (that displaces vertices; the shell's floors/walls are low-poly boxes with nothing to
  subdivide) — it is stashed on `material.userData.displacementMap` for the POM path below.
  Adding a channel means updating `types.ts`, `useMaterial.ts`'s positional unpack, `buildMaterial`,
  the dispose scan, `resolver.ts`, both ambientCG providers, and `scripts/asset-pipeline/
  materialChannels.ts` — keep all seven in parity.
- **World-space UVs** (`worldUv.ts`): surfaces tile at a fixed physical scale — don't bake
  per-mesh UVs or assume a unit cube.
- **Parallax-occlusion floors (`pomFloor.ts`, PHOTO-POM)**: hero grout-relief FLOOR finishes
  (procedural `tile`/`hexagon`/`subway`/`checker`/`brick`/`parquet`/`herringbone`) get real recessed
  grout/joints that occlude as the camera moves, on **High/Maximum only** (shader ray-march cost),
  behind the `pomFloors` flag (pro tier, default on — pure procedural height, prod-safe). No new art:
  it reuses the pattern's OWN height field — `generateProceduralHeightTexture` (generators.ts) bakes
  the same `f.height` that `heightToNormalRGBA` turns into the normal map into a linear depth map.
  `buildPomFloorMaterial` builds a SELF-CONTAINED `MeshStandardMaterial` (its own albedo/normal/rough
  + height, owned + LRU-disposed — independent of the shared `cache.ts` LRU) and patches the stock
  three-r184 shader via `onBeforeCompile`: a steep-parallax + occlusion ray-march (Schüler cotangent
  frame, no precomputed tangents) offsets the shared floor UV (`vMapUv`) before the map/roughness/
  normal chunks. It touches ONLY those UV lookups — VSM shadows, envMap/IBL, tone-mapping all compose
  unchanged. Pure gating helpers (`pomEligiblePattern`/`pomStepsForTier` = 0 perf/med · 16 high · 32
  max/`pomHeightScaleForPattern`/`pomFloorEligible`) are unit-tested (`pomFloor.test.ts`) — **Performance/
  Medium return 0 steps → the floor keeps the plain shared procedural material, byte-identical** (verified
  real-GPU: the Medium A/B pair is pixel-identical, mean 0.0). Wired only at the FLOOR render sites via
  `useFloorProceduralMaterial` (RoomFloor/PlanRoomFloor `Procedural`) — walls/ceilings untouched. If a
  three upgrade changes the `map_fragment`/`roughnessmap_fragment`/`normal_fragment_maps` chunk bodies,
  re-verify the copied GLSL in `pomFloor.ts`.
  **Photo scans too**: `pomPhotoFloorEligible` + `buildPomPhotoFloorMaterial` run the same shader
  patch over a scanned finish's `displacement` map (`useFloorTexturedMaterial`, wired into
  `RoomFloor`/`PlanRoomFloor`). Differences from the procedural path: a scan carries no pattern
  label so depth is the single `POM_PHOTO_HEIGHT_SCALE` constant rather than the per-pattern
  table; a displacement map is a HARD requirement (nothing to synthesise a height field from);
  the `aomap_fragment` include is patched too (procedural bakes no AO, scans usually ship one, and
  sampling it at the unshifted UV would slide it out from under the parallax-shifted albedo); and
  its cache disposes only the MATERIAL — the textures come from drei's URL-keyed `useTexture` and
  are shared with the plain material for the same finish.
- **Colour harmony (`colorHarmony.ts`, CUSTOMIZE-MASTER-PALETTE)**: pure hex↔HSL + `recommendedBlends(palette, max=10)`
  derives harmony companions (complementary/analogous/triadic + tints/shades/neutral) from the
  apartment master palette. The palette lives in `state/slices/colorPaletteSlice.ts` (`masterPalette`
  + per-room `roomPalettes`, persisted as design data; `effectivePalette` resolves override→master).
  Every colour picker renders the shared `ui/color/ThemeColorRows` (an "Apartment theme" row + a live
  "Recommended" row); the editor is `ui/color/MasterPaletteEditor`. Gated by the `masterPalette` flag.
  When you add a new colour picker, drop in `<ThemeColorRows onPick=… active=… />`.
- **Composed / tinted finishes are self-describing ids** (`composeMaterial.ts`): a finish built from
  a pattern + colour is `compose:<pattern>:<#hex>`; recolouring a catalog material is
  `tint:<baseId>:<#hex>`. Both resolve on the fly in `useMaterialDef` (no catalog entry) and serialise
  as a plain string. An optional **`@<scale>` suffix** (CUSTOMIZE-MATERIAL-PARAMS) multiplies the
  tile size (clamped 0.25×–4×; omitted at 1× → back-compat byte-identical id) and is folded into the
  resolved `uvScale`. An optional **`!r` token** (FINISH-RECOLOR) switches a tint from the legacy
  multiply (`m.color`, darken-only) to **repaint** mode: `tintedMaterialDef` sets
  `recolorAlbedo: true` on the cloned def and the textured branch of `buildMaterial` re-bakes the
  albedo through `recolor.ts`. Tokens are order-independent; absent token → multiply
  (byte-identical old ids); on a `compose:`/procedural base `!r` is tolerated but a no-op (the
  pattern re-bake is already a true recolor). When you add another composer parameter, encode it in
  the id the same way (suffix that defaults to "absent") and apply it in
  `composedMaterialDef`/`tintedMaterialDef`.
- **Luminance-preserving recolor (`recolor.ts`, FINISH-RECOLOR)**: mean-anchored repaint of a
  textured albedo — per-pixel Rec.709 luma over the **sRGB-encoded bytes** (no linearisation; same
  domain as the W3C blend modes), then `out_c = clamp(target_c · L / Lmean)`, so the image's
  *average* colour becomes the target while relative contrast survives (can lighten OR darken;
  all-black source → flat fill). Pure core `recolorPixels` (node-tested in `recolor.test.ts`);
  `recolorImageToCanvas` caps the bake at **1024px** max dimension (memory bound — the shared
  normal map keeps full detail) and returns `null` on any failure (no 2d ctx, tainted canvas, bad
  hex) → `buildMaterial` falls back to the legacy multiply path unchanged. The baked albedo is an
  **owned** `CanvasTexture` (`own()`, disposed on LRU evict) with `SRGBColorSpace` + repeat from
  `uvScale` + `applyAnisotropy`, and `m.color` is forced white (tint is baked in — no double tint);
  normal/roughness/ao stay the shared loader instances. `recolorThumbnailDataUrl(url, hex, size=96)`
  is the picker/composer preview helper: memoised (small FIFO), resolves `null` on ANY error so
  callers fall back to a flat colour block.
- **User-saved custom materials (`saveMaterials`)**: `state/slices/savedMaterialsSlice.ts` keeps a
  per-device (localStorage, like favourites — NOT the save schema) list of `{ finishId, name,
  category }`. `useMaterials` synthesises a named `MaterialDef` for each (resolving a tint's base from
  the catalog) so it shows in the picker grid (badged "mine", removable). The composer's name+Save
  row writes here; applying still writes the underlying self-describing id to the room (renders even
  where the name isn't present). Saving a different colour/scale is a *new* material (the id changed),
  so editing = re-seed the composer from a saved finish, tweak, and Save again.
- **Physical tile size comes from the MAP (`tileSize.ts`)**, not a hardcoded guess. Order:
  the provider's **scanned size** (ambientCG publishes `dimensionX`/`dimensionY` per asset — our
  packer writes it into the manifest as `uvScale` + `uvScaleSource`), else a caller's guess
  **capped** by what the map's resolution covers at `TARGET_TEXEL_DENSITY` (512 px/m — a 1K map
  covers at most 2 m), else the resolution alone (a user upload), else the legacy 1 m. **A guess
  may shrink a map, never stretch it**; a MEASURED size stands past that target (a 2.45 m tile
  scan really is 2.45 m — 418 px/m from a 1K map, the density the procedural floors ship at) but
  not past `MIN_TEXEL_DENSITY` (256 px/m), where scale finally yields to sharpness. **Decided
  2026-08-25: keep true scale** — the floor stays at 256 px/m rather than the 512 px/m target, so a
  2.4 m brick scan renders at 2.4 m (427 px/m, the density the procedural floors ship at) instead
  of being shrunk 17% to stay crisp. Only the extremes clamp. If a future call reverses that, it is
  one constant, but re-read this line first: physical accuracy was the deliberate choice. Magnification
  is the one direction mipmaps cannot save,
  and it also renders the pattern at the wrong physical size. Two bugs this fixed: the packer's
  per-family table was >1.5× off on 16 of 28 measured assets (`Wood066` is a 0.4 m scan stretched
  to 1.2 m — blurry, planks 3× too wide; `Tiles141` a 2 m scan squeezed into 0.6 m), and
  `resolver.ts` **discarded the manifest value entirely**, rendering every ambientCG finish at a
  flat 1 m. Carry `RemoteEntry.uvScale` through when adding a provider, and re-tag an already
  packed corpus with `scripts/retag-acg-tile-sizes.mjs` (manifest-only — the maps don't change).
  A **synthetic** entry (a finish id rehydrated from a save, a scenario step) carries no size, and
  when its maps come from the IDB asset cache nothing has loaded the manifest either — so
  `RemoteProvider.tileSizeFor(slug)` exists (async: `acgLibrary` pulls the manifest in if needed)
  and `resolveRemoteAsset` asks it before building the def. Without that, every saved ambientCG
  finish came back at 1 m on reload even with a correct manifest.
- **Tile repetition break-up (RD-406 / MAT-006a)**: `worldUv.ts` exports the pure, deterministic
  `cellUvTransform(cu,cv)` (hash a tile cell → a 90°/180°/270° quarter-turn + a {0, 0.5} half-tile
  offset) and `breakRepetitionPlane(w,h,tileSize)` (subdivide a rect floor on the `tileSize`-metre
  grid — `tileSize` = the material `uvScale` — and re-phase/rotate each cell's UVs so a big tiled
  floor stops repeating identically). It's **pure UV math** — no shader, no 2nd UV set, no extra
  texture. **Cells are anchored to the texture PERIOD** — each starts at an exact multiple of
  `tileSize` and the last one per axis is CLIPPED by the surface edge. Sizing them
  `round(size / tileSize)` instead (shipped behaviour until v0.30.0.2) broke the premise on any
  room that is not a whole number of tiles: a 1.75 × 1.85 m bathroom with a 1.2 m period got one
  1.75 × 0.925 m cell showing 1.2 × 1.2 of UV — the texture STRETCHED, differently per axis — and
  its neighbour starting at V 0.925, off-period, so the grout could not meet. Every cell's world
  extent now equals its UV extent and every cell's map is a texture-lattice symmetry (unit-scale
  axis permutation + half-period translation), which is the property that actually lets grout
  lines meet across a boundary — assert THAT in tests, not a corner's raw UV (a 180° cell starts
  mid-tile while its tile origin stays put). The rotation is rigid +
  the offset a half-tile, so a 2ⁿ-grid ceramic stays grout-continuous and a non-gridded
  stone/marble/wood just varies tile-to-tile; the tiles keep their square aspect (no UV stretch),
  share boundary positions (no seam/crack), and sit at the same Y (no z-fighting). Wired into the
  rect floor build sites (`apartment/floor/RoomFloor.tsx` + `PlanRoomFloor.tsx` `RectFloor`) AND,
  via `breakRepetitionShape(points, tileSize)`, into **irregular (polygon) rooms** — L-shapes,
  angled bays — which clip the room ring to the tile grid (Sutherland–Hodgman per cell,
  `clipPolygonToRect`), triangulate each cell piece and UV it through the same `cellUvTransform`.
  Cells anchor to the WORLD grid, not the room bbox, so two rooms agree on a shared cell and the
  pattern doesn't jump at a threshold. Walls stay untouched.
  **Direction guard (`finishDirection.ts` → `analyzeTextureDirection.ts` → `textureDirection.ts`)**:
  a cell may only be turned a QUARTER turn when that leaves the material looking like itself;
  everything else gets 180° only (which re-phases the cell but leaves a board running the same
  way). This is how the materials are really laid: plank floors run ONE direction across the whole
  floor and vary only in END STAGGER (what the sub-tile offset gives us), and directional tile
  ships with an orientation arrow on its back so the whole floor reads one way. Quarter-turning a
  wood floor produced a visible patchwork of crossed planks — verified on a real GPU before/after.
  **The verdict is MEASURED from the albedo, not listed**: gradient-tensor `coherence` (is there a
  dominant direction?) plus `axisProfileSimilarity` (is the lattice square — would a quarter turn
  land its grid lines back?). Two signals because a hex grid has no dominant direction yet still
  misaligns. Measured on the real catalog: oak 0.44 / vinyl 0.52 → directional; square tile
  sim 0.88 → rotate; hex sim 0.24 and marble sim 0.48 → directional; terrazzo/carpet flat both
  axes → rotate. So a NEW pattern, ambientCG scan or user upload classifies itself — nothing to
  add to a list. `ISOTROPIC_PATTERNS` remains only as the prior for when pixels can't be read (no
  2D context, image still decoding, tainted cross-origin canvas), and the safe default for the
  unknown is "directional". Pass `allowsQuarterTurns(def, material)` from any new build site.
  Behind the **`tileBreakup`** flag
  (`tier:'pro'`, default on — pure prod-safe). Flag off / a sub-tile (repeat≈1) surface →
  `breakRepetitionPlane` returns `null` and the plain world-UV plane is byte-identical to before.
  Degenerate guards: non-positive size/tile, non-finite tile, and a runaway subdivision all fall
  back to the plain plane. Unit-tested in `worldUv.test.ts` (period-breaking + determinism + no UV
  NaN + repeat=1 untouched + the Simple/Pro flag-gate, both modes).
- **Furniture box projection (MAT-006c, `furnitureBoxUv` — simple tier, default on)**:
  `boxUv.ts` re-projects each parametric part's UVs from its OWN geometry — drop the axis the
  vertex normal points along most strongly, use the other two LOCAL coordinates as UV in metres,
  with U on the LONGER face axis (`faceAxes`). Without it the primitives' default `BoxGeometry`
  UVs are 0..1 per face whatever the face measures, so a tiled finish scaled with the PART (a
  1.6 m tabletop and a 4 cm leg showing the same number of tiles) and its grain followed the
  face's axes — running across a leg rather than along it. Object space, NOT world
  (`triplanar.ts` is the world-space shell path), so a rotated chair's grain doesn't swim.
  Applied by `boxProjectSubtree` from `furniture/Furniture.tsx`'s root group for `parametric`
  defs only (GLB meshes keep their authored UVs) and only to `BoxGeometry`/`ExtrudeGeometry` (the
  latter is drei's `RoundedBox` — our `BeveledBox`); cylinders/spheres keep their own wrap.
  Each geometry is tagged (`userData.__boxUv`) so a re-render is a no-op.
- **Per-surface lay DIRECTION + tile size (`ui/finish/DirectionRow.tsx`, `floorTexture` /
  `wallTexture` flags — simple tier, default on)**: `floorTexAngle`/`floorTexScale` and
  `wallTexAngle`/`wallTexScale` on the plan room, set from the **finish picker** (a
  0°/45°/90° `Segmented` + an angle/tile-size stepper on the Floor and Walls tabs) as well as the
  plan Room inspector. Direction is a design decision — a floor is laid one way across a room —
  so the break-up only varies the stagger around whatever is chosen here. Writes go through
  `finishesSlice.setSurfaceTexture`, which mirrors `planWithRoomFinish`'s **no-fork** discipline
  (picking a grain direction must not convert the curated flat into a custom plan) and DELETES a
  dial at its default so an untouched room serialises byte-identically. Read it at a render site
  with `useFloorTexTransform` / `useWallTexTransform` (`apartment/walls/wallTexTransform.ts`) —
  wired at every floor site (`RoomFloor`, `PlanRoomFloor` via `PlanShell` + `PlanRoomShell`) and
  every wall site. **A single wall FACE can override its room**: `finishes.wallTex` is keyed
  `${wallId}:${roomId}` exactly like `wallAccents` (an accent wall usually wants its own
  direction), set from the `WallAccentPicker`, resolved face → room → nothing by
  `useWallTexTransform(roomId, wallId)`. **Optional-chain every read of a NEW finishes field**
  (`s.finishes.wallTex?.[key]`): a design saved before the field existed rehydrates without it,
  and the unguarded read threw inside `WallSegment`'s face — which `SilentErrorBoundary`
  swallowed, so every wall in the flat silently lost its finish. Applied via
  `applyUvTransform` at all three wall-face sites (`WallSegment` face planes, `RoomShell` +
  `PlanRoomShell` extruded bodies). **Fold it into the geometry `useMemo`, never a separate
  effect** — the transform MUTATES UVs, so re-running it over an already-transformed body
  compounds the scale/rotation (that is what `applyUvTransformed` is for). The hook selects the
  two dials as SCALARS: a selector returning `{scale, angle}` would hand back a fresh identity on
  every store update and re-render every wall in the flat.
- **Per-surface + scene colour dials (COLOR-GRADE).** The finish-id grammar carries two more
  order-independent tokens beside `@scale`/`~rough`/`!r`: **`%<sat>`** (saturation 0–2) and
  **`^<bright>`** (brightness 0.5–1.5), parsed by `splitColorScale` and applied to the effective
  bake colour via the pure `adjustColorTone` (mix toward luma grey, then scale; identity at
  (1,1) so token-less ids are byte-identical). They work for every material kind at every tier
  (procedural re-bake, textured repaint/multiply) and surface as **Saturation/Brightness sliders
  in `MaterialComposer`** — the sanctioned per-surface "make this floor grey again" lever.
  `recolorFinishId` + the FinishPicker keep-colour path must carry `sat`/`bright` through when
  rebuilding a tint id. **Scene-level dials** live in `look.ts`: `sceneWarmth` (-1…1, tints the
  analytical sun/hemisphere/ambient lights via `warmthTintRGB` — neutral (1,1,1) at 0, every
  tier) and `sceneSaturation` (0…2, rides the High/Max HueSaturation pass via `hueSatSaturation`
  — default 1 reproduces the shipped +0.06 baseline exactly). Both persist per-device via
  `qualityPrefs` beside `exposure`, gated by the `colorGrade` flag (simple tier) in
  `GraphicsSettings`. Keep every new dial byte-identical-neutral at its default.
- **SNV swatches are render-calibrated (TONE-CALIBRATION) — but the recipe is NOT reproducible
  in this repo, and the "response" is not single-valued.** The historical record: the five SNV
  finish swatches are deliberately MORE saturated/warm than the boards they match, because the
  midday lighting mix (cool sky IBL + hemisphere fill) was measured with a per-channel response of
  roughly (0.56, 0.61, 0.68) R/G/B on floors — blue boosted ~19% over red, greying out warm
  albedos. Each swatch was solved as `boardTone ÷ response` (peak-normalised) and verified against
  the board photo to ±0.002. The stated recipe is: render the close-up scenario, `sharp`-sample
  the surface, `newSwatch = target ÷ (render ÷ oldSwatch)` per channel, iterate once. Never
  eyeball-revert a calibrated swatch toward its board hex.
  **Two findings that bound how much weight that ±0.002 can carry.** Both came out of trying to
  execute the recipe for TONE-CURVE-CHOICE (`scripts/dev-probes/snv-response.mjs`, rebuilt to
  cover all five surfaces from plan-derived orbit poses with world-normal masks and 837–3910
  sampled cells each):
  · **The board photos are not in the repo.** `assets/guidelines/` is gitignored
    (`.gitignore:77`) and absent from every checkout, so the ground truth the recipe depends on
    cannot be sampled here. Any recalibration attempted without it is not a calibration.
  · **There is no single render response per surface.** The `livingDining` floor
    (`floor-vinyl-oak`, #d6b38d) under filmic at 13:00/Medium measures a peak-normalised response
    of **0.923 / 0.970 / 1.000 in ORBIT** — blue the STRONGEST channel — and
    **0.998 / 1.000 / 0.921 in WALK** — blue the WEAKEST. Same surface, same operator, same hour;
    orbit culls the ceiling so the slab takes cool sky IBL directly, walk does not. The response
    also moves with pose within a single mode. So `boardTone ÷ response` has no well-defined
    right-hand side, a swatch cannot hold to ±0.002 across the app's own two view modes, and the
    recorded (0.56, 0.61, 0.68) is both stale AND measured under conditions the note does not
    pin down. Before relying on this rule again, decide WHICH view/pose/hour defines the
    calibration and record it with the numbers.
- **The default view transform is AgX, not ACES Filmic (TONE-CURVE-CHOICE) — SHIPPED v0.31.5.6
  with the user's sign-off.** Measured, not argued. three's `ACESFilmicToneMapping`
  applies its curve PER CHANNEL, so on a warm mid-dark surface it crushes blue much harder than
  red and saturation climbs. The default flat's furniture wood makes this concrete
  (`scripts/dev-probes/wood-detail.mjs`, walk/Medium/09:00, wood pixels only via a raycast mask,
  in-run noise floor 0.00): a #7a5c3c albedo whose own sRGB HSV saturation is **0.508** renders at
  **0.833**, with 97.8% of its pixels past 0.35 saturation while the whole frame sits at 0.18. The
  excess decomposes cleanly — lightening the albedo x1.8 gives 0.784 (so darkness is worth only
  ~0.05, matching what a pure sRGB encode predicts at that luminance), zeroing the HueSaturation
  baseline gives 0.764 (0.069 — now shipped, see POST-SAT-NEUTRAL in `scene/look.ts`), and
  switching to AgX gives **0.678**. The remaining ~0.21 is the curve.
  A whole-frame sweep (`scripts/dev-probes/tone-curve.mjs`, walk + orbit x 09/13/18/21:00) says the
  same thing globally and adds the highlight story:

  | operator | mean          | contrast (sigma) | clipped         | chroma        | >0.35 sat     |
  | -------- | ------------- | ---------------- | --------------- | ------------- | ------------- |
  | filmic   | 185.9         | 54.5             | 1.94%           | 0.180         | 11.1%         |
  | **agx**  | 176.7         | 43.3             | **0.28%**       | **0.152**     | **4.0%**      |
  | neutral  | 173.2         | 59.5             | 0.05%           | 0.307         | 27.4%         |

  (walk/Medium/09:00; the ordering is identical at every other hour and in orbit.) AgX cuts blown
  highlights **4–7x** at every hour and visibly recovers ceiling gradation and curtain weave that
  filmic was clipping away. Khronos Neutral is clearly WRONG as a default despite its perfect
  highlights — it pushes chroma to 0.307 in daylight and 0.518 at 21:00 in orbit (89% of pixels
  past 0.35), i.e. hard toward the cartoon look. Read AgX's lower sigma with care: **clipping
  inflates variance**, so some of filmic's "contrast" is the blown pixels themselves.
  **Why it is not shipped yet.** TONE-CALIBRATION (below) solved five SNV swatches as
  `boardTone / response` against the render, and `scripts/dev-probes/snv-response.mjs` measures
  exactly how far that moves. On the living/dining floor (`floor-vinyl-oak`, swatch #d6b38d) at
  13:00, peak-normalised per-channel response:

  | operator | R / G / B response   | rendered RGB          |
  | -------- | -------------------- | --------------------- |
  | filmic   | 1.000 / 0.963 / 0.829 | 181.8 / 146.5 / 99.3  |
  | agx      | 0.998 / 0.997 / 1.000 | 173.2 / 144.7 / 114.3 |

  AgX's rendered channel proportions (1.000 / 0.838 / 0.661) reproduce the SWATCH's own
  proportions (1.000 / 0.836 / 0.659) almost exactly — it is the faithful transform, and filmic's
  distortion was being compensated LOCALLY in five finishes while going uncompensated everywhere
  else. But the drift is **0.171 in blue, ~85x the ±0.002 the calibration holds to**, so switching
  would push those five finishes visibly cooler than the boards they were matched to. Re-solving
  them is part of the same change, not a follow-up.
  **Status: shipped.** `DEFAULT_TONE_MAPPING` in `scene/look.ts` is `'agx'`; both tier paths
  already honoured it (Performance reads `TONE_MAPPING_THREE` → `AgXToneMapping`, Medium and up go
  through the `<ToneMapping>` effect via `TONE_MAPPING_POST`), and an explicit user pick still
  wins. Verified after the switch: `tier-look.mjs` across four tiers x four hours, bloom lock-step
  confirmed visually at 21:00/Maximum (fixtures still glow, RD-409 untouched — Bloom runs BEFORE
  the tone mapper on scene-referred values, so its threshold semantics do not move), and the frame
  cost is a shader-constant change with no cost. The known cost was accepted deliberately: the
  five board-matched SNV finishes shift subtly paler/cooler, largest on the bathroom floor.
  The recalibration route was attempted and is closed:
  the board photos are absent from the repo, and the response the recipe solves against is not
  single-valued (see TONE-CALIBRATION above). So the five swatches can be neither re-derived nor
  verified. Measured drift across all five surfaces, filmic → AgX, at 13:00/Medium in orbit with
  837–3910 sampled cells each (peak-normalised response, max channel):

  | surface                        | swatch   | drift | visual effect                     |
  | ------------------------------ | -------- | ----- | --------------------------------- |
  | `livingDining` floor (vinyl)   | #d6b38d  | 0.083 | slightly paler, still pale timber |
  | `kitchen` floor (stone tile)   | #cfb38e  | 0.085 | slightly paler                    |
  | `bath1` floor (porcelainStone) | #a69e83  | 0.132 | less olive, more neutral greige   |
  | `bath1` wall (porcelain)       | #eddfc4  | 0.054 | marginally cooler                 |
  | `householdShelter` floor       | #cfb38e  | 0.051 | marginally paler                  |

  Reviewed as cropped stills, none of the five BREAKS under AgX — each still reads as the finish it
  is meant to be; the change is a subtle paling and de-warming, largest on the bathroom floor which
  loses some of the sage undertone SNV-BOARDS calls for. The probe also prints a
  **render-preserving multiplier** per surface (the per-channel scale that makes AgX reproduce
  filmic's render exactly), which is the honest fallback if the switch is wanted without moving
  those five — but applying it would re-bake filmic's distortion into the swatches and is not
  obviously right. **Do not ship this switch autonomously**: it alters the default appearance of
  the whole app and knowingly moves five finishes that were matched to physical exhibition boards
  the user photographed — it needed the user's call, which it has. If the board photos come back
  into reach, re-verify those five (and pin WHICH view/pose/hour defines the calibration first).
  **A "flat-tier clipping defect" was reported here and it was NOT REAL — corrected v0.31.5.7.**
  The claim was that at 13:00 `tier-look.mjs` showed 6.78% blown pixels on Performance and Medium
  against 0.03% on High/Maximum, i.e. a flat-tier exposure defect the post tiers merely hid behind
  their Vignette. It was a MEASUREMENT artefact: that probe reported the FULL CANVAS rect, which
  is dominated by DOM chrome — the toolbar, the "Get started" card and the zoom rail are drawn
  over the canvas AND are translucent, so their brightness tracks the canvas behind them and
  differs per tier, which mimics a render regression precisely. A 4x4 grid of the full canvas put
  the blown pixels in the top-centre cells (22% — toolbar), the bottom-left cell (54% — the card)
  and the bottom-right rail, with every interior cell at **0.0%**. Re-measured over
  `lib.mjs:centerBox`, the 3D render clips **0.02–0.05% at EVERY tier and EVERY hour** (09/13/18/
  21:00 x four tiers), with the flat tiers marginally the cleanest. There is no flat-tier exposure
  problem. `tier-look.mjs` now prints the DOM-free slab as its authoritative number and labels the
  full-canvas figure "do NOT quote". The AgX clipping numbers above are unaffected — `tone-curve.mjs`
  always measured a centre slab. Lesson: `centerBox` exists for this and its docstring says so;
  a whole-canvas fraction is a UI measurement wearing a render costume.
- **The Nyquist sweep is CLOSED: 5 fields fixed, 14 verdicts recorded (NYQUIST-CLOSED).** Working
  the allowlist with NYQUIST-HARM applied first settled every remaining entry without a mechanical
  sweep. Fixed and removed: all four `patterns/wood.ts` fields, `patterns/fabric.ts:fibre` (3.44),
  `patterns/fabric.ts:warp` (1.09) and `tileSurface.ts:peel` (1.41). The other 14 are **recorded
  verdicts, not pending work**, grouped in `nyquistAudit.test.ts` by why they are harmless:
  thresholded sparse speckle that reads as real pinholes (`stone.ts:pores` 2.81 and
  `stoneSurface.ts:fine` 1.72, both verified on a crop), roughness-ONLY whispers where there is no
  normal map to corrupt (`tile.ts`/`stone.ts:microRough`, `plasterSurface.ts:fine` — MAT-003's
  ±0.04 nap drift on every default wall), and albedo whispers at ≤ ±0.025 of the shade factor.
  · **`patterns/fabric.ts:warp` was the subtle one worth catching.** It is a PHASE warp —
    `sin(v * S * 0.85 + warp * 3)` — so per-texel noise displaced the weave line by up to 3 radians
    (nearly half a cycle) at EVERY texel, scrambling grasscloth's horizontal weave into noise
    instead of meandering it, and `line` carries half the height field. baseFreq 70 → 8. The crops
    are unambiguous: a random speckled hatch before, coherent flowing fibre runs after.
  · **And it is the case that proves the metric's blind spot.** That clear visual fix moved
    microcontrast only 2.086 → 1.951 (−6.5%), with chroma, mean and sigma flat. **Microcontrast
    measures AMPLITUDE, not COHERENCE** — a scrambled-phase field and a meandering one have similar
    texel-to-texel magnitude. This is the mirror of the usual trap: here the numbers under-report a
    real improvement. Always look.
  · **`normalScale` is NOT a proportional proxy for a painter's `normalStrength`.** Carpet's live
    sweep gave microcontrast 4.010 / 2.739 / 1.838 / 1.353 at `normalScale` 1 / 0.5 / 0.25 / 0.1,
    but a real `normalStrength` 6 → 1.5 (a 4x cut) measured **1.349** — where `normalScale` 0.1 (a
    10x cut) landed. `heightToNormalRGBA` normalises `(-dx, -dy, 1)`, so its response saturates.
    Use a live sweep to pick a DIRECTION, then confirm with the real bake.
  · **Carpet is improved but still not carpet, and that is where it stops.** Aliasing gone (static
    → soft matte, microcontrast 9.084 → 1.349, −85% across both changes) but it reads as speckled
    terrazzo, because the remaining cue is the ALBEDO speckle, not the normal. `floor-carpet-grey`
    is a non-default, user-selectable finish and two rounds went into it — a prioritisation error
    worth not repeating. Default surfaces first.
- **Frequency alone does NOT determine whether aliasing hurts — amplitude and thresholding do
  (NYQUIST-HARM).** Working down the NYQUIST-AUDIT allowlist worst-first immediately produced two
  opposite verdicts from the top two entries, both confirmed on close-up crops of a table top
  wearing the finish (`surface-detail.mjs DEF=coffee-table FINISHES=mat:<id>`):
  · **`patterns/fabric.ts:fibre` (3.44 cycles/texel) was genuinely broken and is FIXED.** It is
    UNTHRESHOLDED and drives three channels at full amplitude — albedo `0.82 + fib * 0.3`, the
    ENTIRE height field, and roughness — so the aliasing rendered as harsh black-and-white static,
    closer to TV snow than carpet pile. baseFreq 110 -> 12; close-up microcontrast **9.08 -> 4.01
    (-56%)**, the highest reading measured anywhere in this work.
  · **`patterns/stone.ts:pores` (2.81) is a deliberate KEEP.** It is THRESHOLDED (`p > 0.86`), so
    only ~14% of texels fire and the aliasing appears as sparse dark specks — which is precisely
    what concrete pinholes look like. The close-up reads as plausible mottled concrete, and
    "fixing" it would trade correct-looking sparse specks for broad blobs. Its allowlist entry says
    so, and the entry is a decision rather than debt.
  **So read the CALL SITE before changing a frequency.** Unthresholded + high amplitude + feeding
  the HEIGHT (which `heightToNormalRGBA` turns into a per-texel random normal) is the damaging
  combination; thresholded sparse speckle in the albedo is usually fine or even desirable.
  **And a lowered frequency does not automatically look right.** Carpet after the fix no longer
  looks like static but reads as mottled grey STONE, because `normalStrength = 6` was tuned against
  the old per-texel field and over a smooth low-frequency one it carves broad polished swirls. An
  attempt to correct that by halving the albedo swing was REVERTED for moving nothing (microcontrast
  4.010 -> 4.007, sigma 22.52 -> 22.40, crop indistinguishable) — the albedo was never the dominant
  cue. Whoever picks this up next: the normal strength is the lever, and it needs its own
  before/after.
- **HALF the procedural noise fields alias, and the limit that binds is 256 (NYQUIST-AUDIT).**
  After two fields were found broken one at a time (WOOD-PORE-NYQUIST, FABRIC-FINE-NYQUIST), a full
  sweep of every `makeFbm` call site against its tile size found **21 of 42 fields over the
  0.5 cycles/texel limit** — worst offenders `patterns/fabric.ts:fibre` at **3.44**,
  `patterns/stone.ts:pores` at 2.81, `stoneSurface.ts:fine` at 1.72, `tileSurface.ts:peel` at 1.41.
  Thirteen of them alias even at 512.
  **The binding size is 256, not 512.** `generators.ts:BASE_SIZE` is 256 on the Performance tier,
  so every pattern bakes at 256 there regardless of its `PATTERN_SIZE_CAP` — a field tuned to be
  safe only at 512 still ships noise to those users. Bound new fields at 256.
  This is now an enforced test, not a note: `nyquistAudit.test.ts` parses the painter sources,
  computes each field's top-octave frequency, and fails on any aliased field that is not on an
  explicit `KNOWN_ALIASED` allowlist. **The allowlist may only shrink** — fixing an entry means
  deleting its line, and the test also fails if an entry no longer exists or no longer aliases, so
  it cannot rot into a meaningless exemption set. It caught a field the ad-hoc sweep had missed
  (`patterns/tile.ts:grain`) on its first run. A comment asking people to remember was tried
  implicitly and failed — the second occurrence was introduced long after the first.
  `patterns/wood.ts` was fixed first because it paints the FLOORS: `fineGrain`/`fine` 28 -> 6,
  `microRough` 70 -> 25, `micro` 90 -> 12, all now ~0.38 cycles/texel at 256. **Expect no visible
  change** — those fields contribute +-0.03 to an albedo factor, +-0.04 to roughness and +-0.0175
  respectively. An attempt to measure a floor before/after came back BYTE-IDENTICAL, but that
  measurement is inconclusive rather than a null result: the raycast mask seeded from a
  hand-picked NDC point resolved to "shell/unknown" with 30 materials sharing a map source, so it
  probably was not a wood-painted surface at all. Use `snv-response.mjs`'s room+face-normal mask
  for floors, not an eyeballed point.
- **The upholstery weave had the same defect, with a much smaller payoff (FABRIC-FINE-NYQUIST).**
  `procedural/upholsterySeams.ts:buildUpholsteryHeight` — the LIVE fabric path, since `pbrSurfaces`
  defaults true — built its sub-weave fuzz from `makeFbm(seed, 4, 120)` sampled at `(u, v)`, i.e.
  **3.75 cycles per texel** on the 256² tile, seven times Nyquist, contributing
  `fine(u, v) * 0.2` of the height. (The `fine` field in `furnitureMaterials.ts:getFabricNormal`
  that the same bug report named is the LEGACY branch, only reached with `pbrSurfaces` OFF — check
  which branch is live before fixing.) The fields are now data (`FABRIC_FIELDS`) so a test can
  bound them, and `fine` is `{ octaves: 4, baseFreq: 11 }` = 0.34 cycles/texel.
  **The ceiling on this one is low, and it is worth understanding why:** the weave grid itself is
  `sin(x * 2.4)` ≈ **0.38 cycles/texel**, already near the limit, so there is no room in a 256²
  tile for a fuzz an order of magnitude finer — "fine fuzz below the weave" was never
  representable. Measured on the sofa (`scripts/dev-probes/surface-detail.mjs`, walk/Medium/09:00,
  749 masked cells, two runs over the identical view): microcontrast **1.681 → 1.617, only −3.8%**,
  with chroma (0.187), mean (152.8) and sigma (32.2) identical to three decimals — against the wood
  pore's −34%. Isolated, the channel itself improves a lot (its own texel-step/sigma ratio 0.732 →
  0.105, where a degenerate white-noise reference is 1.133); it simply carries a fifth of the
  amplitude at two-thirds the normal strength. Shipped as a correctness fix with no claimed visual
  win — do not go looking for one in a still.
- **Every procedural noise field must stay inside its tile's NYQUIST limit (WOOD-PORE-NYQUIST).**
  `makeFbm(seed, octaves, baseFreq)` multiplies its input by `baseFreq * 2 ** octave`, and callers
  scale the input again (`fbm(u * 18, …)`), so the finest octave lands at
  `baseFreq * 2 ** (octaves - 1) * uvScale` cycles across the tile. A tile of N texels can only
  represent 0.5 cycles per texel; past that the field does not carry fine detail, it aliases into
  deterministic WHITE NOISE. The furniture wood tile's pore field was
  `makeFbm(0x2c7a, 3, 48)` at `(u * 18, v * 1.2)` on a 256² tile —
  **13.5 cycles per texel at the top octave, 3.4 even at the coarsest**, i.e. 27x over the limit
  with no octave resolvable at all. Its own comment described "long open pores streaking along the
  grain … lengthwise hairlines, not dots"; what it actually baked was per-texel noise, and
  `heightToNormalRGBA(height, N, 3)` turned that into a per-texel random normal. Under specular
  light that reads as a pebbly dimple field, which is why every wood furniture surface in the app
  looked like moulded plastic or gingerbread rather than timber — see the before/after crops in
  `scripts/dev-probes/wood-detail.mjs`'s output directory.
  The field now lives in the pure `procedural/woodPore.ts`, which exports
  `topOctaveCyclesPerTexel` + `NYQUIST_CYCLES_PER_TEXEL` and keeps the original **15:1 u:v streak
  anisotropy by construction** (`vScale = uScale / PORE_ANISOTROPY`) so a density retune can't
  silently destroy the streak character. `woodPore.test.ts` pins the limit, pins the anisotropy,
  and — the assertion with teeth — checks the field is SMOOTHER texel-to-texel than its own
  standard deviation, then shows the OLD parameters fail that same check.
  Verified as a before/after on the identical view (walk/Medium/09:00, wood pixels only via a
  raycast mask, in-run noise floor 0.00): pixel-to-pixel microcontrast **1.50 → 0.99 (−34%)** in
  walk and **4.93 → 4.40 (−11%)** in orbit, with wood chroma (0.831 → 0.833), mean luminance
  (57.8 → 57.9), grain contrast (24.26 → 24.29) and the clipped fraction (2.01% → 1.91%) all
  unmoved — the signature of a correct de-alias: the artefact goes, the design stays.
  Three notes for whoever works here next:
  · **A cell-MEAN metric cannot see this class of bug.** The probe's first version block-averaged
    each sampled cell and reported the baseline unchanged (chroma 0.831 → 0.833) while the dimples
    had visibly vanished. Measure microcontrast alongside it, or measure nothing.
  · **`repeat` is not the fix, and it is worse than it looks.** Sweeping the wood tile finer
    (`repeat` x4 / x8) does move the image a lot (meanAbsDiff 7.14 / 8.25 over wood pixels), but
    the tile bakes `PLANKS = 3` board seams AND `PI * 7` growth rings into one frequency — real
    boards are ~120–180 mm wide and real rings ~2–10 mm, so no single `repeat` can serve both. At
    x4 a 0.44 m chair back is sliced into four hard-seamed strips and reads as corrugated
    cardboard. If small furniture parts ever need finer grain, they need a SEAMLESS variant of the
    tile, not a bigger `repeat`.
  · **`getFabricNormal`'s `fine` field has the same defect, unfixed:** `makeFbm(4242, 4, 120)` at
    `(u, v)` on the same 256² tile is **3.75 cycles per texel**. It was left alone deliberately so
    this change measured one thing; fix it on its own and measure it on its own.
- **The DEFAULT flat's painted walls stay near-neutral (WARM-WALL-CAST).** `livingDining` used to
  override its walls to `wall-paint-warm` (#e9d8c4, HSV saturation 0.16). That was the single
  largest surface in the app — `scripts/dev-probes/chroma-audit.mjs` raycasts a 96x60 screen grid
  and attributes each hit to its material, and the cream wall covered **21.8% of the living-room
  walk view and 33.6% of the dining view**, ahead of the ceiling and the floor. It was also the
  measured reason the picture was more colourful than anything in it: at 09:00/Medium every
  high-coverage albedo sits at 0.00–0.22 saturation, yet the rendered frame carried **mean chroma
  0.206 with 14.6% of pixels above 0.35 saturation**. An unbalanced colour cast on the surfaces a
  viewer reads as neutral is the most reliable giveaway that an image was rendered rather than
  photographed, and a cream wall under a warm morning illuminant is warm twice over. Dropping the
  override (`scripts/dev-probes/warm-cast.mjs`, an A/B inside ONE run via the app's own
  `setWallFinish`) took walk/Medium/09:00 to **chroma 0.180, 11.1% above 0.35**, with contrast
  (sigma) 54.8 -> 54.5 and the clipped fraction flat at ~1.9% — no cost in either currency. Two
  things this rule is NOT:
  · **Not a claim about the lighting.** The same run forced the sun/hemisphere/ambient colours to
    neutral white and moved chroma only 0.206 -> 0.203, so the cast lived in the FINISH. The
    day/night warmth that carries time-of-day is correct and untouched — do not "white-balance"
    the grade on the strength of this finding. (That diagnostic arm is also a cautionary tale: its
    first version re-asserted the neutral colours on a `setInterval` and came back BYTE-IDENTICAL
    to the baseline, because `Lighting` rewrites the light colours every frame from the altitude
    curve and always won the race. It reads exactly like "the illuminant contributes nothing".
    Neutralising inside a wrapped `renderer.render` is the only point guaranteed to land after
    `Lighting`'s write and before the draw.)
  · **Not a ban on warm paint.** `wall-paint-warm` stays in the catalog and in the style presets
    (Warm Minimal, Japandi, Modern Luxe, …), where the user is choosing it deliberately. The rule
    binds the DEFAULT only, and `builtinCatalog.test.ts` pins it: every painted-plaster entry in
    `DEFAULT_WALL` + `DEFAULT_ROOM_WALL` must sit below 0.10 HSV saturation. Tiled wet-wall
    finishes (glazed porcelain in the kitchen/baths) are a spec choice and are exempt.
  Effect is view-dependent, so quote the mode: in ORBIT the same A/B moves chroma only
  0.190 -> 0.184, because the dollhouse view is mostly floor and furniture seen from above with
  the near walls faded by the reveal. Walk mode is where wall finishes are judged.
- **Joint widths are real-world millimetres (JOINT-SCALE).** Convert a painter's joint band to
  mm before shipping it: `band_px / S × uvScale_m × 1000` (both sides of the boundary count).
  Real values: rectified porcelain ≈ 2–3 mm, classic ceramic grout ≈ 3–5 mm, wood/vinyl
  micro-bevels ≈ 1–2 mm, brick mortar ≈ 10 mm. The pre-tuning painters exaggerated these
  3–8× (e.g. the `tile` painter's 1.8%-of-texture grout ≈ 20+ mm near-black rules; vinyl's 7 mm
  0.78-dark seams) — which is what read as "ugly" spaces between tiles/planks. Darkening is
  gentle too: grout ≈ 0.7–0.75 × face for cement joints, ≥ 0.86 × face for rectified/hairline
  and wood bevels; recesses are shallow steps (Δheight ≤ 0.3), never 0.05-vs-0.95 canyons —
  those catch specular ridge lines under VSM/IBL and read as chamfered glass block. When adding
  a painter, size the joint from the physical tile/plank first.
- **SNV sample-board fidelity (SNV-BOARDS)**: the five SNV default finishes are matched against
  the user's photos of the actual Serangoon North Vista exhibition sample boards
  (`assets/guidelines/specs.png` + board close-ups) — treat the boards as ground truth when
  touching them. **`vinyl`** (`patterns/wood.ts`) is its own painter now, NOT a `woodFields`
  wrapper: a grey-washed rift-oak PRINT — fine straight striations along the strip (sine ladder
  + fbm amplitude modulation; never the natural painter's wavy cathedral bands, which read as
  zebra moiré), sparse elongated dark/light streaks, one staggered end joint per 1.2 m strip,
  tight V-seams, matte (rough ~0.6, normalStrength 4). **`stoneTile`** = the kitchen/HS/SY honed
  warm-greige stone print (soft ~18° striations mirrored per tile + broad clouds, hairline LIGHT
  rectified joints ≈ face·0.86 — never the `tile` painter's 0.62-dark grout); one painter, two
  physical sizes via uvScale (kitchen 600×600 `[1.2,1.2]`, HS/SY 300×300 `[0.6,0.6]`,
  `floor-tile-beige` / `floor-tile-beige-300`). **`porcelainStone`** = the bathroom floor's
  mottled grey-green honed 300×600 running bond (broad m1 ±0.22 clouds + finer blotches,
  per-tile phase, sage undertone in dark patches). **`porcelain`** (walls) is `subwayFields`
  with `rectified: true` — NO bevel band, gentle face↔joint height step (0.72 vs 0.58), ~⅓
  glaze peel, soft per-tile clouding; the metro `subway` keeps its proud bevel look. Bath walls
  default `wall-tile-white` (the board shows white-cream, not grey). Verified with real-GPU
  walk-mode close-ups (steep + grazing pitch per surface — see the playbook's `__walkLook`
  recipe); painter signatures unit-tested in `patterns/snvBoards.test.ts` (striation direction,
  print uniformity vs natural wood, light joints, honed-vs-glaze roughness, near-flat wall
  relief). the wood painters (`procedural/patterns/wood.ts` —
  planks/parquet/herringbone) give each board a deterministic per-board grain **lean** via the pure
  `procedural/woodPlank.ts` (`plankHash` shared stateless hash, `grainLean` ~±2.6°, `shearAcross`
  shearing across-by-along about the board mid-length) so the figure flows board-to-board instead of
  running uniformly. The lean is keyed by a hash **independent of** each painter's tint stream, so it
  never perturbs the existing value/warmth/phase. Keep it subtle (a larger angle reads as warped
  laminate). Path-A micro-detail (no flag, all tiers); albedo sRGB, normal/roughness linear.
- **Designer finish texture variants (`finishTextureVariant.ts`, Asset Studio Stage 6c)**: a
  GLB-designer part with a `mat:<id>` finish can override the texture **tile size** (`finishScale`
  0.25–4×, larger = coarser, mirroring the `compose:@<scale>` convention → `repeat` divided) and
  **grain direction** (`finishRotation` 0/90° → `texture.rotation` about centre 0.5). Because the
  shared finish materials in `furnitureMaterials.ts` OWN their textures across the whole app,
  `finishTextureVariant(base, scale, rotationDeg)` **clones** the texture and transforms the clone —
  it MUST never mutate the passed-in source's `repeat`/`rotation`. Variants go through a bounded
  `LruCache` keyed `(source uuid, scale, rotation)` (max 96, dispose-on-evict — the same AUD-002
  discipline as `furnitureRepeatCache`) so a slider drag reuses a handful of variants instead of
  leaking a GPU texture per frame. Applied in `glbEdit/buildObject.ts:buildSurfaceMaterial`'s finish
  branch (`applyFinishTextureTransform`), which also rotates `anisotropyRotation` where the finish is
  a `MeshPhysicalMaterial` (brushed metal) so the highlight tracks the visible grain.
- **Textured (photo) finishes render true (REAL-2/REAL-3).** `cache.ts:buildMaterial`'s
  `textured` branch tags the loaded albedo `SRGBColorSpace` (drei's `useTexture` leaves it
  untagged → wrong gamma) and sets `m.color` **white** for a PLAIN textured def — a def's
  `swatch` is only its picker-chip colour, never an albedo multiplier. The multiply is kept
  ONLY for real `tint:<baseId>:<#hex>` ids (`isTintMaterialId`) — that IS the legacy tint
  mechanism (and the documented fallback when a `!r` repaint bake fails). `useMaterial.ts:
  useTexturedMaterial` loads all four channels incl. **ao** (positional unpack — keep the list
  order albedo/normal/roughness/ao). Don't reintroduce a swatch multiply on plain photo defs.
- **A finish change on a RENDER path resolves the DEFERRED id (FINISH-DEFER).** Every
  wall/floor/ceiling dispatch calls `useMaterialDef(useDeferredFinishId(id))`, never
  `useMaterialDef(id)`. A `textured` def suspends on first use (drei `useTexture` throws until all
  channels decode — ~12 s measured for a 1K ambientCG scan), and those surfaces sit inside
  `<Suspense fallback={null}>`, so an eager id change makes React HIDE the committed surface
  (`visible = false`) and paint nothing for the whole load: the bare structural wall body shows
  through and it reads as "the finish didn't apply" (the v0.29.3.3 open audit item). Deferring the
  id makes it a low-priority update, so the previous finish stays on screen until the new maps
  land. The `fallback={null}` boundaries stay as the first-mount / load-error safety net. Never
  defer in a UI panel — a picker must reflect the selection immediately. Sites:
  `apartment/walls/WallSegment`, `RoomShell`, `PlanRoomShell`, `floor/RoomFloor`,
  `floor/PlanRoomFloor`, `ceiling/RoomCeilingTile`, `floor/PlanRoomCeiling` — add the same call to
  any new surface dispatch. Guards: `deferredFinishId.test.tsx` +
  `scripts/scenarios/photo-wall-finish-load.json`.
- **Showroom finishes (`showroomCatalog.ts`, SHOWROOM-FINISHES, flag `showroomFinishes` —
  simple tier, prod-safe CC0):** the hand-curated Poly Haven photo-PBR shortlist behind the
  FinishPicker's one-tap "Showroom" strip (`ui/finish/ShowroomRow.tsx`). Pure data + id helpers:
  curated `uvScale` = physical metres-per-tile, `swatch` = mean albedo, honest names;
  `bundleToMaterialDef` (catalog/remote/resolver.ts) applies the curated override by slug.
  Applied ids (`polyhaven:<slug>:<res>`) are **rehydrated on boot** by
  `state/storage/rehydrateRemoteFinishes.ts` (pure `extractRemoteFinishRefs` string scan →
  `resolveRemoteAsset`, IDB-cached → works offline; NOT flag-gated — gating is browse/add only).
  Adding a curated finish = one entry in `SHOWROOM_FINISHES` (slug must be a real Poly Haven
  texture asset; a dead slug degrades to a hidden chip). Bundled photo sets under
  `public/assets/materials/` carry a mean-albedo `swatch` in their `material.json` sidecar —
  recompute it (sharp mean over the albedo) when swapping a texture.
- **Texture anisotropy** (`anisotropy.ts`, RD-401): never hardcode `texture.anisotropy`.
  Route every CanvasTexture creation (and every per-repeat `.clone()`) through
  `applyAnisotropy(tex)` — it stamps the shared cap and tracks the texture. The cap defaults
  to 8 until the first render publishes the real device max via `setMaxAnisotropy(gl.capabilities
  .getMaxAnisotropy())` (from `scene/AnisotropyController`, mounted in both Canvases), which
  clamps to `max(1, deviceMax)` and re-applies to all already-created textures. Anisotropy needs
  mipmaps — CanvasTextures have them by default; if you build a texture without mipmaps it's a
  no-op. **`textured` (DLC/uploaded) maps get it too (REAL-1):** `cache.ts:buildMaterial`'s
  `textured` branch calls `applyAnisotropy` on every loaded albedo/normal/roughness/ao map,
  matching the procedural path — without it, photo-textured floors/walls (the surfaces meant to
  look best) rendered blurrier than the procedural fallback at grazing angles.
- **Wall/floor/ceiling material cache is a bounded LRU (PERF-A).** `cache.ts`'s module-level
  `CACHE` (also backs furniture DLC `mat:<id>` finishes via the `furn:`-prefixed ids from
  `furnitureMaterials.ts:furnitureMaterialCacheId`) is `materialLru.ts`'s `LruCache` — same
  bounded + dispose-on-evict shape as the furniture material cache (AUD-002), capped at 256.
  Reads (`getCachedMaterial`/`getBuiltMaterial`) happen inline during a mesh's render, so a
  mounted surface keeps its entry's recency fresh every frame; an evicted (LRU) entry is
  disposed one frame later. Disposal only frees textures a material **owns exclusively** —
  the procedural branch's per-material canvas bakes (sync fallback + worker-upgraded swap,
  tagged via the file-local `own()`/`OWNED_TEXTURES`) — never the shared plaster
  normal/roughness singletons or `textured`-branch maps (those come from drei's `useTexture`,
  a `useLoader` cache keyed by URL, so a `tint:<baseId>:#hex` of a DLC material shares the
  same `Texture` *instances* as its base and any other tint sibling). `disposeCachedMaterial`
  (explicit user-material deletion) uses the same ownership-aware disposal via `LruCache.delete`.
  When adding a new texture-producing branch to `buildMaterial`, tag its per-material textures
  with `own()` if and only if they are never shared with another cache entry.
- **Furniture wood was GLOSSIER THAN PAINT, and that is what read as "animation" (WOOD-GLOSS).**
  `getWoodMaterial` defaulted to `roughness 0.5` while this same file gives painted 0.72,
  concrete 0.85 and marble 0.12 — so the app rendered oiled timber shinier than paint, which
  is backwards. The consequence is not a subtle tint: the specular lobe at 0.5 is tight
  enough to turn the grain normal's low-frequency waviness into **mirror ribbons**, and on
  the default flat's dining table (walk pose, 13:00) the top read as crumpled cling film
  over timber — repeated on the chair backs, the sideboard and the TV console. It is the
  single most "rendered, not photographed" surface in the default walk view.
  Swept live over the 90 wood-signature materials in the scene
  (`scripts/dev-probes/walk-tour.mjs ROUGH=0.5,0.7,0.85`, one run, same pose): **0.5** shows
  strong ribbons, **0.7** still carries them, **0.85** removes them — the grain survives as
  grain and the surface reads as matte satin timber. `WOOD_BASE_ROUGHNESS = 0.85` ships the
  value that was measured; do not interpolate to a prettier number without re-running that
  sweep.
  · **Applied at all THREE wood sites**, because the default alone is not enough: the two
    `getSurfaceMaterial` wood branches passed a hardcoded `0.5` and would have won over it.
    A caller can still ask for a shinier wood explicitly, and `rough` is in the cache key, so
    a matte and a satin wood of the same colour cannot collide.
  · **Scope, honestly stated:** this fixes the SHINE, not the grain SHAPE. The painter's
    low-frequency cathedral banding is still soft and wavy under close inspection; it simply
    no longer behaves like varnish. If wood is revisited, the next lever is the band
    structure in `procedural/patterns/wood.ts`, not the roughness.
  · **Not changed here, deliberately:** `Door.tsx` and `PlanDoorLeaf.tsx` pass an explicit
    `0.45`, so a wooden door keeps the old glossier character. Doors are a surface this work
    has not reviewed — change them on their own evidence rather than by side effect.
  · Watch the argument positions: `getWoodMaterial(color, repeat, rough)`. Call sites like
    `getWoodMaterial(legColor, 0.4)` are setting **repeat**, not roughness.
- **CORRECTION to the WOOD-GLOSS entry above:** when that fix shipped (v0.31.5.31) the
  commit message and this file described `walk-tour.mjs` as standing the camera "in the flat
  with poses derived from the plan". It was not. The probe called `requestWalkTeleport` as
  `store.requestWalkTeleport?.(…)`, but that is a MODULE function in
  `scene/cameras/walkTeleport.ts`, not a store action — so the optional call was a silent
  no-op and every frame in that round was the DEFAULT WALK SPAWN. **WOOD-GLOSS itself
  stands**: its A/B varied roughness only, at one fixed pose, and the mirror ribbons visibly
  went. Only the claim about the tool was wrong. The probe now teleports through the real
  module function, asserts the camera reached the intended point, and captures four facings
  per room.
- **The furniture wood's rings snaked almost a full band-width and read as zebra moiré
  (WOOD-BANDS, fixed).** WOOD-GLOSS fixed the shine; walking the flat afterwards exposed the
  SHAPE problem on the DEFAULT main-bedroom wardrobe — hard **zigzag chevron bands, identical
  and periodic across every panel**, printed wallpaper rather than timber. Same artefact
  SNV-BOARDS warns about ("never the natural painter's wavy cathedral bands, which read as
  zebra moiré"), reached from the other direction.
  The arithmetic makes it obvious. `getWoodMaps` lays the rings as
  `(u + waver + phase) * PI * 7`, so a waver of W displaces a ring by `W * 7` half-cycles —
  and the shipped 0.12 gave **~0.84, nearly a whole band**, while varying with `v`. A wide
  band that wanders almost its own width as it rises cannot read as figure. A sawn board's
  rings run essentially PARALLEL; the figure comes from ring spacing and latewood contrast,
  not lateral wander. `FURNITURE_WOOD_WAVER = 0.04` (0.28 half-cycles) is the shipped value.
  · **Deliberately NOT the other two knobs.** Raising the ring count would undo Wave 4A's fix
    for the busy watermark, and `FURNITURE_WOOD_COARSEN` is FURNITURE-WOOD-SCALE, settled
    across all 21 defs. The meander was the one term that was purely harmful at this scale.
  · **Floors are unaffected by construction** — this painter serves the furniture `wood`
    finish only; the floor uses the separate `woodFields` painter in
    `procedural/patterns/wood.ts`. Verified anyway in the same frames.
  · Verified as a CROSS-RUN A/B at an identical deterministic pose (mainBedroom, yaw -pi/2),
    which is the honest fallback here: the waver is baked into a canvas texture at module
    init, so it cannot be swept live inside one run. Chevrons gone, bands parallel with gentle
    undulation; the dining table, chair backs, sideboard and the wooden door all still read as
    matte timber with no ribbons.
  · **Scope, stated honestly:** this removes the moiré, it does not ADD crispness. The grain
    is still soft with little fine line detail between rings. If wood is revisited again, the
    remaining lever is the latewood contrast/power term or genuine fine grain lines — not the
    meander, the ring count, the coarsen factor, the roughness or the pore field, all now
    settled.
- **The bathroom tile is CORRECT — verified by arithmetic, don't re-file it (BATH-TILE-OK).**
  This was the last DEFAULT surface never properly judged; the 44-frame walk survey left an
  impression of "glossy with large soft highlight blobs". Both halves of that impression were
  wrong.
  · **The numbers match the spec exactly.** `porcelainFields` passes its OWN options —
    `cols: 2, rows: 4, groutDiv: 500, rectified: true` — so at the 512 bake and
    `wall-tile-white`'s `uvScale [1.2, 1.2]`: the joint is `1 px / 512 x 1200 mm` =
    **2.34 mm**, precisely the 2-3 mm JOINT-SCALE requires of rectified porcelain, and the
    tile is `1.2/2 x 1.2/4` = **600 x 300 mm**, matching its "300x600" name. Joints are LIGHT
    (`0.9-1.0` x the grout RGB, never the `tile` painter's 0.62-dark grout), the face/joint
    height step is a shallow 0.95 -> 0.72 rather than a canyon, and `normalStrength: 3` keeps
    it near-flat. Confirmed on a close crop: light hairline joints, gentle glaze, no chunky
    bevel.
  · **The "highlight blobs" were the MIRROR**, not the tile — a specular reflection of the
    ceiling light in the bathroom mirror, which is what a mirror should do.
  · **The methodological trap that nearly produced a false defect:** computing JOINT-SCALE
    with the PAINTER'S DEFAULTS (`groutDiv 150`, `cols 4`, `rows 8`) gives a 7 mm joint and a
    300x150 mm tile — a 3x-too-wide joint and a tile that contradicts its own name, i.e. two
    plausible-looking bugs. Neither exists. **Always read the options the WRAPPER passes, not
    the signature defaults**, before doing the arithmetic.
- **Furniture materials** come from `furnitureMaterials.ts` helpers (real three `Material`
  instances: tintable wood/stone/fabric, `getSolidMaterial`, the `mat:<id>` DLC resolver).
  **Drapery (CURTAIN-FABRIC):** `getDraperyMaterial(kind, color, pattern, doubleSided)` is the
  **fabric-only** mapper for curtains/blinds (cotton/linen/sheer/velvet — never wood/stone), reusing
  the tone-on-tone `getPatternTexture` set; the **opacity/light-blocking** axis is separate
  (`draperyOpacity.ts` `DraperyOpacity` sheer→blackout → `{visual, transmit}`): the primitive passes
  `getDraperyMaterial`'s `opacity` (sheer renders translucent via `getFabricMaterial`'s `opacity` arg)
  and `windowLightModifiers` reads `draperyTransmit` for the daylight floor. Velvet uses
  `getVelvetMaterial`'s `doubleSided` arg (cache-keyed, default-unchanged). Linen gets a visibly
  coarser weave-relief `normalScale` than cotton (not just a hairline roughness delta — safe to
  mutate the cached instance since linen's `rough=0.98` key never collides with cotton's `0.95`);
  a zebra blind's translucent sheer band rides the same `opacity<1` path as a sheer curtain (real
  cloth normal map kept, just transparent) rather than a flat unlit plane.
  **Door leaf finish (`openingStyles` `material` axis):** `PlanOpening.material`
  (`floorplan/doorMaterial.ts:resolveDoorLeafMaterialKind`, additive like `style`/`color`) picks
  `painted` (flat `getPaintedMaterial`, default) / `wood` (`getWoodMaterial`) / `vinyl`
  (`getVinylMaterial` — smooth PVC laminate, the SG toilet/utility-door standard, defaulted for
  `style:'bifold'`), gated behind `pbrSurfaces` exactly like `getMetalMaterial` (physical +
  clearcoat + micro-normal on, plain `MeshStandardMaterial` off). `PlanDoorLeaf` **clones** the
  cached instance per door (same pattern as `WallSegment`'s `faded` clone) because its camera-reveal
  fade mutates `opacity`/`transparent` per-instance — a shared cached material would leak that
  mutation across every same-colour door.
  Don't invent bespoke texture art — apply a CC0 DLC material over the procedural fallback.
  The procedural micro-textures (256² shared singletons, tinted via `material.color`) get their
  higher-fidelity variants — plank wood, woven fabric, painted micro-normal — behind the
  `pbrSurfaces` flag (default on, Simple tier); keep normal maps on **all** tiers (they're cheap
  and the default Performance tier still needs them to not read flat).
- **Upholstery weave (RZ6)**: the fabric normal's height field is built by the pure
  `procedural/upholsterySeams.ts` `buildUpholsteryHeight(size, seed, SeamParams)` — woven
  micro-texture + a soft fabric wrinkle + a faint panel-seam channel & topstitch. Keep it
  **subtle** (tasteful default `DEFAULT_SEAM_PARAMS`; `seam`/`wrinkle` are 0..1 intensities, `0`
  disables a channel) — the goal is "reads as cloth", not quilted leather. It's deterministic +
  unit-tested (dims/determinism/seam-recess), baked once into the shared fabric normal singleton
  behind `pbrSurfaces` (off → legacy clean weave). Albedo stays sRGB, the normal stays linear.
- **Tile/ceramic glaze (MAT-002)**: the glossy-ceramic painters (`procedural/patterns/tile.ts`
  `tileFields`/`hexagonFields`/`subwayFields`) get their micro-detail from the pure
  `procedural/tileSurface.ts`: `makeGlazePeel(seed, glaze)` adds a fine signed orange-peel height
  delta on the **tile face only** (catches grazing light), and `glazeRoughness(isGrout, grout,
  micro)` resolves a **glossy-glaze (≈0.16) ↔ matte-grout (≈0.92) roughness contrast** with the
  painter's existing per-texel break-up folded in. The painter owns the grid and only asks the
  helper per-texel, so normal+roughness **align with the visible grout** automatically (square /
  hex / subway). Keep it **subtle** (`DEFAULT_TILE_SURFACE_PARAMS`; `glaze`/`grout` are 0..1, `0`
  disables that channel). Path-A micro-detail (no flag, all tiers — like RZ4 grout aging); albedo
  sRGB, normal/roughness linear. checker/brick are not ceramic — untouched.
- **Stone/marble micro-detail (MAT-001)**: the pure `procedural/stoneSurface.ts` adds the two
  cues polished stone needs. `veinHeight(veinMask, veinRelief)` turns the painter's OWN vein mask
  into a shallow tunable height lift, so the baked normal relief **aligns with the visible albedo
  veins** for free (any marble colour / vein pattern); `makeRoughDrift(seed, roughDrift)` is a
  broad low-freq signed roughness delta (polished/honed patches) so the slab isn't a dead-uniform
  mirror. Wired into **Path A** (`procedural/patterns/stone.ts:marbleFields` — vein height routed
  through the helper, no flag, all tiers like RZ4) and **Path B** (`furnitureMaterials.ts:
  getMarbleMaps`/`getStoneMaterial` — the shared marble singleton gains a roughness-drift map
  **gated behind `pbrSurfaces`**, same gate as the PR6 cloud; off → legacy uniform polish, no rough
  map). The Path-B drift map is a multiplier clamped ≤ 1 → only glossier, never matter (no
  regression). Keep it **subtle** (`DEFAULT_STONE_SURFACE_PARAMS`; `veinRelief`/`roughDrift` 0..1,
  `0` disables). Albedo sRGB, normal/roughness linear. terrazzo is untouched.
- **Concrete pinhole pores (CONCRETE-PORES)**: the same `procedural/stoneSurface.ts` exports
  `makePinholePores(seed, pores)` — a **roughness-only**, non-negative micro lift where a
  high-frequency noise field (distinct seed offset +137, integer freq) crosses a high threshold, so
  a sparse, scattered set of tiny air pinholes reads rougher than the sealed face (a ramp at the
  rim, never a hard speckle; never polka-dots). Wired into **Path A** only
  (`procedural/patterns/stone.ts:concreteFields` — **layered onto** the existing macro
  mottle/pore/stain roughness, NOT replacing it; the macro `pore` term still owns the albedo
  darkening + height recess). The combined roughness is clamped `[0,1]` after the lift. No flag, all
  tiers (like RZ4); deterministic. Keep it **subtle** (`DEFAULT_CONCRETE_SURFACE_PARAMS`; `pores`
  0..1, `0` disables). marble/tile/plaster paths untouched.
- **Plaster/concrete roller-nap (MAT-003)**: the pure `procedural/plasterSurface.ts` adds the cue
  matte painted walls need — `makeRollerNap(seed, nap)` is a signed, mean-preserving roughness
  *drift* (broad coverage + fine nap stipple, ±~0.035) so a matte wall isn't a single flat
  specular value while **staying matte** (overdoing it reads as stucco). Wired into **Path A**
  (`procedural/patterns/wall.ts:plasterFields` — the constant `0.92` roughness now drifts by the
  nap; no flag, all tiers like RZ4) and **Path B** (`procedural/generators.ts:getPlasterNormal`
  builds the shared normal AND, behind `pbrSurfaces`, a shared roughness-drift map via
  `getPlasterRoughness()`, wired into the plaster branch of `cache.ts:buildMaterial`; off → the
  legacy flat `roughness = 0.92` scalar). The Path-B map is a tint-independent multiplier over the
  base scalar (like the shared normal), so every wall colour reuses one 256² map. Keep it
  **subtle** (`DEFAULT_PLASTER_SURFACE_PARAMS`; `nap` 0..1, `0` disables). Albedo sRGB,
  normal/roughness linear. batten/fluted are untouched.
- **Brushed/satin metal (MAT-004)**: steel appliance bodies used to be flat grey plastic. The pure
  `procedural/metalBrush.ts` `buildBrushedMetalFields(size, seed, BrushParams)` bakes **directional
  brush hairlines** running along U — a value-noise lattice sampled WIDE across U / NARROW along V
  (plus a slow drift warp so the grain wavers, not ruled lines), returning a height field (→ baked
  normal) and a signed roughness streak delta. Row-variance ≫ column-variance is the brush
  signature (unit-tested). `furnitureMaterials.ts:getMetalMaterial(color, finish, repeat)` builds it:
  **under `pbrSurfaces`** a `MeshPhysicalMaterial` with the shared brush normal + roughness-streak
  maps (one 256² singleton via `getBrushedMetalMaps`, cloned per material) + three.js `anisotropy`
  (swept highlight, `anisotropyRotation = 0` so the sweep follows the U hairlines); finishes
  `stainless`/`satin`/`black-steel` pick the metalness/roughness + brush/anisotropy preset (tint from
  the caller). Flag **off** → a plain `MeshStandardMaterial` (legacy flat steel, no maps). Tasteful,
  not chrome-mirror; cached per `(finish, color, repeat, brushRotation)`. The roughness map is a
  multiplier centred on 1 (mean-preserving). Keep it **subtle** (`DEFAULT_BRUSH_PARAMS`; `streak: 0`
  collapses to plain metal). Albedo/tint sRGB, normal/roughness linear. The 8 appliance primitives
  wire to it via `furniture/primitives/shared.tsx:applianceBody` (steel body → shared material;
  non-steel unchanged); furniture metal legs/frames/rails wire to it via the sibling
  `metalLeg(color?, finish?, repeat?)` helper (BarCart/OfficeChair/BarStool/Sideboard/TowelLadder/
  DryingRack/Desk/KitchenIsland) — both inherit the same `pbrSurfaces` gate, so Performance is unchanged.
- **Brush axis per face (BRUSH-AXIS)**: the baked hairlines run along U and three.js sweeps the
  anisotropic highlight along them. The pure, deterministic `brushAxis.ts`
  `anisotropyRotationForNormal(normal)` maps a face/mesh **world** normal → the `anisotropyRotation`
  that keeps the hairlines on that face's dominant in-plane axis: a near-vertical normal (top/bottom
  face) keeps the default `0` (U is already in-plane); any upright face (front/side panel) gets a
  quarter turn so the grain runs vertically (the conventional appliance brush direction). Degenerate
  / near-zero / non-finite normals fall back to the default; **no normal → `0`, byte-identical to
  before**. `getMetalMaterial(color, finish, repeat, faceNormal?)` takes the optional `faceNormal`,
  folds the resolved rotation into its cache key (omitted when `0`, so default callers are
  unchanged), and sets `m.anisotropyRotation`. No new flag — it rides the existing `pbrSurfaces`
  gate (the flat tier has no anisotropy). Unit-tested in `brushAxis.test.ts` (axis-aligned faces,
  default unchanged, degenerate/non-finite, determinism). The body-shared sites (`applianceBody`,
  `metalLeg`) span multiple face orientations on one material, so they keep the default fixed axis;
  pass `faceNormal` only from a single-orientation mesh.
- **Uploaded-material persistence (`upload/persist.ts`)**: each channel blob is one IDB record;
  the material's full identity/appearance (`name`, `category`, `swatch`, `uvScaleX`/`uvScaleY`
  — `uvScale` is stored as two scalars since IDB `meta` values can't be arrays) is stamped on
  **every** channel's `meta` so it round-trips through `state/storage/hydrateAssets.ts` (BUG-003).
  When you add a new identity/appearance field to `TexturedMaterialDef` for user materials,
  persist it in the channel meta here AND restore it (with a back-compat default for legacy
  records) in `hydrateAssets`, or it resets to a default on reload.
- **Uploaded textures** normalize through `convert/` (`normalizeTextureFile` → near-lossless
  WebP, full res; `decodeImage.ts` handles TGA/TIFF/EXR/HDR/KTX2/DDS).
  KTX2 and DDS are handled by `decodeGpuTexture.ts`: uncompressed formats via pure-JS paths
  (no WebGL), Basis-compressed KTX2 via `KTX2Loader` + GPU readback (same Basis transcoder
  singleton at `/basis/` as the GLB path), compressed DDS via `DDSLoader` + GPU readback.
  Graceful error on missing `OffscreenCanvas`/WebGL → error toast, never a crash.
- `finishDrop.ts` is the pure drag-to-apply core (payload + `resolveFinishDrop`) — reuse it
  for any new drop surface rather than re-implementing the routing, and commit through
  `state/finishDropApply.ts` (shared store dispatch: one undo step + recents + toast).
  Existing surfaces (Layers rows, 3D canvas via `scene/FinishDropSurface.tsx` +
  `scene/finishDropTarget.ts`) gate on the `finishDnd` flag — gate new ones the same way.
- **Finish eyedropper (UX-7, `finishEyedropper` flag, simple tier):** `sampleFinish.ts` is the
  pure sampler — `resolveSampledFinish(surface, maps, plan)` returns the finish id the renderer
  currently shows on a clicked floor/wall (same read precedence as the scene: accent `wallId` →
  live slice → plan-room default → app default; an unfinished wall resolves to `DEFAULT_WALL`, never
  null, so the pick is always applicable). Armed from the FinishPicker header, it holds the sampled
  swatch in `state/slices/eyedropperSlice.ts` (session-only: `eyedropperArmed` + `sampledFinish`);
  the click side is `scene/FinishEyedropperSurface.tsx` (capture-phase canvas click → raycast →
  `finishDropTarget.ts` hit → sample, then paint each subsequent click by REUSING
  `resolveFinishDrop` + `state/finishDropApply.ts`). The in-app path samples at room-wall
  granularity (the surface tag carries no `wallId`); the accent branch is kept + tested for a later
  per-wall tag. Escape / toggle-off / leaving the editor disarms.
- **OffscreenCanvas worker generation** (`procedural/procedural.worker.ts` +
  `procedural/runProceduralWorker.ts` + `proceduralSwapSignal.ts`): `buildMaterial` for
  procedural kinds generates a sync fallback texture immediately (no first-paint block),
  then fires a worker request off-thread that hot-swaps the maps and calls
  `notifyProceduralSwap()` to kick a render frame. Graceful degradation: if
  `OffscreenCanvas`/`Worker` are unavailable or the worker errors, the sync texture stays.
  When adding a new pattern, add its painter to `procedural/patterns/<family>.ts` and wire it
  into the shared `PATTERN_FN` dispatch inside `generators.ts` (not a separate worker-only file).
  The `RenderPump` subscribes to `subscribeProceduralSwap` — do not add more subscribers
  elsewhere; the signal is intentionally not a store slice (avoids re-render overhead).
- **CAT-A 2026-trend materials round**: procedural additions for modern SG homes, all pure/CC0.
  Two new painters + `ProceduralPattern` members: **`peranakan`** (`patterns/tile.ts:peranakanFields`
  — Nyonya majolica ENCAUSTIC tile: a 2×2 grid of four-fold-symmetric cement tiles, cream medallion
  + eight-petal rosette + corner fans, MATTE cement (not the glossy `tile`/`subway` glaze); colours
  derived from the single `base` swatch — cream ground + `base` field/flower + a channel-rotated
  `accent` for majolica contrast) and **`limewash`** (`patterns/wall.ts:limewashFields` — cloudy
  mineral-wash matte paint: a broad low-freq tonal wash (±~0.1, deliberately stronger than
  `plaster`'s ±~0.02) + faint diagonal brush-drag, near-flat + high-roughness). Both wired into
  `generators.ts` `PATTERN_FN`/`PATTERN_SIZE_CAP` (peranakan 512, limewash 256) + `composeMaterial.ts`
  `COMPOSE_TEXTURES`, with builtin catalog colourways (peranakan jade/cobalt/rose floors + jade/cobalt
  wall accents; limewash white/greige/clay/terracotta walls; heritage checker jade/cobalt reuse the
  existing `checker` painter). **Limewash verify verdict:** a microcement variant already existed
  (`concrete` pattern → `Microcement (light/grey/charcoal)`), but no true limewash — its cloudy tonal
  wash isn't captured by `plaster` or `concrete`, so a dedicated painter was added.
  Furniture-material additions (all in `furnitureMaterials.ts`): **`getBoucleMaterial`** (nubby looped-
  wool "quiet luxury" upholstery — a shared blob-rounded loop normal singleton cloned+repeated per
  material, matte, kept on ALL tiers since the nub relief IS the material; selectable via
  `getUpholsteryMaterial('boucle', …)` + the seating `material` enum), **sintered-stone worktop**
  (`getSurfaceMaterial('sintered')` → satin `getStoneMaterial`, matter than mirror-marble/glossier
  than concrete; a `worktopFinish` enum option on kitchen island + counter), and **`brushed-brass`**
  `MetalFinish` (warm brushed gold hardware preset mirroring `black-steel`; routed via
  `getSurfaceMaterial('brass')` with a canonical brass tint + exposed as a side-table top finish).
  Tests: `procedural/patterns/heritagePatterns.test.ts` (peranakan multi-colour/matte + limewash
  cloudier-than-plaster) and `catAMaterials.test.ts` (bouclé/sintered/brass, both `pbrSurfaces` modes).
- **Woven upholstery reads as foam without weave RELIEF, and SHEEN is not the lever
  (FABRIC-WEAVE-KEY).** The default flat's sofa is its largest furniture surface and read as moulded
  matte plastic in close-up. Measured on it (`surface-detail.mjs DEF=sofa-3seat MASK=item`,
  walk/Medium/09:00, every arm in ONE run with the first repeated and identical):
  · **Sheen is nearly inert.** The whole space — `sheen` 0 / 0.4 / 1 crossed with `sheenRoughness`
    0.6 / 0.4 / 0.3 / 0.2 — moved microcontrast only **1.24 → 1.68** and mean 130.5 → 138.9, with
    chroma flat at 0.153. Worse, `sheen = 0` sits mid-range at 1.513, ABOVE the shipped 0.4/0.6's
    1.346: a broad sheen lobe FILLS IN the weave's own shading instead of revealing it. Note also
    that three's sheen is a Fresnel-weighted retroreflective lobe driven mostly by the environment,
    so it is near-dead on `performance` (no IBL) and shows most at grazing angles.
  · **The weave normal is the lever.** `normalScale` 0.65 / 1.3 / 2.0 / 3.0 gave microcontrast
    **1.346 / 2.115 / 2.879 / 3.829**. Shipped **1.3**: the crop reads as woven textile across the
    whole sofa, where 2.0 becomes a regular grid that looks like mesh screen. The shipped source
    change re-measured to 2.106 against the live arm's 2.115.
  **The relief is now a PARAMETER folded into the cache key, and that was a latent bug.**
  `getDraperyMaterial` used to call `getFabricMaterial` and then re-set `normalScale` on the
  returned instance, with a comment claiming its `rough=0.98` key "never collides with cotton's 0.95
  or any other caller". True for linen, FALSE for cotton: a cotton curtain and a woven-fabric sofa
  of the same colour and pattern both key `fab:<color>:0.95:<pattern>`, so drapery was stomping a
  shared cached material. It was invisible only because both wanted 0.65 — raising the upholstery
  default would have made the sofa's weave depend on whether a curtain was created first. Drapery
  now passes its own `weave` (linen 0.95 / cotton 0.65) and gets its own cache entry. **Never mutate
  a material returned from this cache; add the axis to the key.**
- **The no-IBL metalness cap must be LIVE, not baked at creation (IBL-CAP-LIVE).** A fully metallic
  PBR surface has no diffuse term, so with `scene.environment === null` it has nothing to reflect and
  renders black — hence `NO_IBL_METALNESS` (0.25) and the caps in `getSolidMaterial` /
  `getMetalMaterial`. Both read `isIblActive()` ONCE, inside the factory, and baked the result into
  the material (and, in `getSolidMaterial`, into the cache KEY). That was sound only while the tier
  was static, and TIER-ADAPTIVE made it dynamic: the app boots at `medium` (IBL on) and the ladder
  demotes to `performance` on weak hardware at runtime, so a material built at boot outlives the
  environment it was built for. `getMetalMaterial` had a half-fix — `:noibl` in the key — which
  hands a correct material to any NEW call but leaves an already-mounted mesh holding the old one;
  only `MetalMaterial.tsx` subscribes to `subscribeIbl` and re-renders, so just its consumers
  tracked the tier.
  Measured on the default flat with `scripts/dev-probes/metal-tier-stale.mjs`, which switches the
  tier live and re-reads the SAME material instances: at `performance` the wardrobes' sliding-door
  frame panels sat at metalness **0.75** — fully uncapped — while the door pull (through
  `MetalMaterial`) was correctly at 0.25. Scene-wide at `performance`: **69 meshes across 15
  material kinds above the cap**.
  Fixed by `iblSignal.ts:registerCappedMetal`, which applies the cap now and re-derives every
  registered material whenever `setIblActive` fires; the pure `effectiveMetalness(requested, ibl)`
  holds the rule. Two details that matter: it remembers the **requested** value, not the capped one
  (storing the capped value is what made the old behaviour one-way — once flattened to 0.25 there
  was no route back to 0.75), and the registry holds **WeakRefs**, pruned on each sweep, because
  these materials live in an LRU that disposes evictions and a strong Set would pin every material
  ever built. Both cache keys now use the requested metalness, which also collapses the two
  IBL-split entries into one. Verified: the frame slab goes 0.75 → 0.25 on demotion and back on
  promotion.
  **The remaining 57 need NO action — measured, don't sweep them.** Scene-wide meshes above the cap
  at `performance` fell 69 → 57, and the leftovers do bypass these factories (inline
  `<meshStandardMaterial metalness={…}>` in primitives, plus `cache.ts`'s scanned `metalnessMap`
  binding). But a threshold violation is not a defect. Enumerated, every one sits in a narrow
  **0.30–0.40** band — `#e6e7e4@0.35 x34` dominates, then a handful of dark trims at 0.30–0.40 —
  where the diffuse term is still 60–70%, nowhere near the no-diffuse black the cap exists to
  prevent (the fixed slab was **0.75**). Capping all 57 live and diffing the centre slab at
  `performance`/13:00 moved the frame **0.04% of pixels, meanAbsDiff 0.02** — pure noise against the
  0.2–0.8 floors these probes usually report. So the cap's purpose is satisfied; a 57-call-site sweep
  would be churn. Still route any NEW metallic material through `registerCappedMetal`, because a
  future preset could ask for 0.8.
  · **`setManualHour(h)` is NOT a side-effect-free redraw nudge** — it switches `timeMode` to manual
    and jumps the scene to `manualHour` (it even ticks the onboarding checklist's "Scrub the time of
    day"). `metal-tier-stale.mjs` used it purely as an invalidate without pinning the clock first, so
    its two captures straddled a live-clock night and a manual daylight hour: the diff read
    **98.97% of pixels, meanAbsDiff 96.37** and looked like a colossal metalness effect. An
    implausibly LARGE result needs proving exactly as much as a null one. Pin
    `setTimeMode('manual')` + `setManualHour(h)` at the top of every probe.
