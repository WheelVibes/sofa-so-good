# src/materials — finishes rules

Area rules for materials/finishes. Details in `docs/ARCHITECTURE.md`.

- **New finish** = an entry in `builtinCatalog.ts` (`procedural` with a pattern, or
  `solid`); new pattern painters go in `procedural/patterns/<family>.ts` (paint one tiling tile:
  albedo+normal+roughness from seeded noise over the shared `procedural/fieldKit.ts` buffers),
  wired into the `PATTERN_FN` dispatch in `procedural/generators.ts` AND add an entry to
  `PATTERN_SIZE_CAP` (256 for smooth/noise-based, 512 for high-frequency geometric patterns).
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
- **Tile repetition break-up (RD-406 / MAT-006a)**: `worldUv.ts` exports the pure, deterministic
  `cellUvTransform(cu,cv)` (hash a tile cell → a 90°/180°/270° quarter-turn + a {0, 0.5} half-tile
  offset) and `breakRepetitionPlane(w,h,tileSize)` (subdivide a rect floor on the `tileSize`-metre
  grid — `tileSize` = the material `uvScale` — and re-phase/rotate each cell's UVs so a big tiled
  floor stops repeating identically). It's **pure UV math** — no shader, no 2nd UV set, no extra
  texture. Cells snap to the texture period (boundaries land on grout) and the rotation is rigid +
  the offset a half-tile, so a 2ⁿ-grid ceramic stays grout-continuous and a non-gridded
  stone/marble/wood just varies tile-to-tile; the tiles keep their square aspect (no UV stretch),
  share boundary positions (no seam/crack), and sit at the same Y (no z-fighting). Wired into the
  **rectangular** floor build sites only (`apartment/floor/RoomFloor.tsx` + `PlanRoomFloor.tsx`
  `RectFloor` — polygon floors and walls are untouched) behind the **`tileBreakup`** flag
  (`tier:'pro'`, default on — pure prod-safe). Flag off / a sub-tile (repeat≈1) surface →
  `breakRepetitionPlane` returns `null` and the plain world-UV plane is byte-identical to before.
  Degenerate guards: non-positive size/tile, non-finite tile, and a runaway subdivision all fall
  back to the plain plane. Unit-tested in `worldUv.test.ts` (period-breaking + determinism + no UV
  NaN + repeat=1 untouched + the Simple/Pro flag-gate, both modes).
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
- **SNV swatches are render-calibrated (TONE-CALIBRATION).** The five SNV finish swatches are
  deliberately MORE saturated/warm than the boards they match: the midday lighting mix (cool sky
  IBL + hemisphere fill) has a measured per-channel response of roughly (0.56, 0.61, 0.68) R/G/B
  on floors — blue is boosted ~19% over red, which greys out warm albedos. Each swatch is solved
  as `boardTone ÷ response` (peak-normalised), then verified by sampling the mean RGB of
  real-GPU screenshots until the rendered proportions match the board photo's (they now match to
  ±0.002). Recipe to recalibrate after any lighting/tonemap change: render the close-up scenario,
  `sharp`-sample the surface region, `newSwatch = target ÷ (render ÷ oldSwatch)` per channel,
  iterate once. Never eyeball-revert a calibrated swatch toward its board hex.
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
