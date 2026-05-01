# Outdoor Environment

Brainstormed 2026-05-02. Lifts item #5 from the [time-of-day spec — Out of scope](2026-05-01-time-of-day-design.md#out-of-scope).

## Goal

Replace the floating-in-void look outside the apartment shell with a stylised HDB-block skyline plus a ground plane, so windows look out onto something. Approach **B** from brainstorming: procedurally generated distant boxes + a flat ground plane. Approach C (a photo-textured 360° panorama) is out of scope; A (ground only) is the strict subset that ships if B is disabled.

The outdoor scene is **decorative only**: it casts no shadows, isn't shadow-receiving, and doesn't enter the lighting calculation. It exists for the view through windows.

## Design

### Module layout

- `src/scene/outdoor/OutdoorScene.tsx` — top-level component mounted from `Scene.tsx` after the apartment. Composes the ground plane and the building ring. Reads `quality.outdoor` and unmounts entirely when off.
- `src/scene/outdoor/buildings.ts` — pure module exporting `generateBuildings(seed: number)` returning an array of `BuildingSpec { position: [x, z], width: w, depth: d, height: h, shade: number }`. Deterministic given the same seed. Tested in isolation.
- `src/scene/outdoor/buildingTexture.ts` — lazy-builds a canvas-backed `CanvasTexture` for the window-grid pattern, cached at module level. Imported only at component mount time so vitest doesn't try to run canvas code at module load.

### Ground plane

A single `<mesh>` with a circular `<circleGeometry args={[GROUND_RADIUS, 48]} />` rotated `-π/2` around X, positioned at `y = -0.005` (below the apartment floor). `meshStandardMaterial` colored `#2a2e2a` (dark damp asphalt-grey), `roughness=0.95`. `GROUND_RADIUS = 200`.

The disc extends well past the building ring so the horizon never reveals an edge.

### Building generation

Algorithm (in `buildings.ts`):

1. Seed a `mulberry32(seed)` PRNG.
2. Compute the apartment AABB centroid `(cx, cz)` from `ROOMS`.
3. Place `BUILDING_COUNT = 32` buildings around the centroid:
   - Angle: distribute roughly evenly with jitter — `theta_i = (i / N) * 2π + rng() * (2π / N) * 0.5`.
   - Radius: `r_i = lerp(R_MIN, R_MAX, rng())`, with `R_MIN = 55`, `R_MAX = 110`.
   - Footprint: `width, depth ∈ [12, 24]` metres each (independent), so blocks aren't all square.
   - Height: `h ∈ [22, 75]` metres, biased so the median is ~40 m (pick `rng()^1.4 * range`).
   - Shade: `[0.78, 1.0]` multiplier on the base building colour, so individual blocks read as slightly different.
4. Reject any candidate whose AABB intersects the apartment AABB inflated by 35 m (safety margin); resample up to 4 times before giving up on that slot.

Output: deterministic for a given seed. Default seed is a constant in the file; passing a different seed reshuffles the skyline.

### Building rendering

For each `BuildingSpec`, render a `<mesh>` with `<boxGeometry args={[w, h, d]} />` positioned at `[cx + x, h/2, cz + z]`. Material: `meshStandardMaterial` with `color = BASE_COLOR * shade` where `BASE_COLOR = #4a4a52`, plus a window-grid texture as `map` and `emissiveMap`.

Window grid texture: a single 128 × 256 px canvas with a procedural pattern — dark grey base, regular grid of small lighter rectangles representing windows. About 60% of windows are "lit" (slightly brighter); the rest are dark. The same texture is used for both `map` and `emissiveMap` (drei convention; the emissive intensity is what makes the windows glow at night).

Texture `repeat` is set per-material based on the building's footprint and height: `repeat.x = max(1, w / 6)`, `repeat.y = max(1, h / 4)` so windows scale roughly to real-world spacing regardless of block size.

`emissiveIntensity` is driven by `autoFixtureLevel(sun.altitude)` from `altitudeCurve.ts` — the same curve the apartment's fixtures use to ramp on at dusk. Daytime: `emissiveIntensity = 0` (windows look matte). Night: `emissiveIntensity = 1.2` (windows glow yellow).

`emissive` color is set to a warm yellow (`#e8c87a`) so when intensity ramps up, lit cells in the texture multiply that warmth on top of the cool grey base.

`castShadow = false`, `receiveShadow = false`. Buildings are far enough that shadow-mapping them would waste perf and break the directional light's frustum sizing.

### Quality gating

Add `outdoor: boolean` to `QualitySettings` (default `true` across all three quality presets). Wire through `Scene.tsx` so `<OutdoorScene />` only mounts when `quality.outdoor` is `true`.

Settings panel grows a single toggle: "Outdoor scene" on/off.

### Persistence and migration

Schema's `quality` block gets `outdoor: z.boolean().optional()` (missing → `true`). `applySerialized` defaults to `true` so older saves immediately render the skyline.

## Files touched

- `src/scene/outdoor/OutdoorScene.tsx` — new
- `src/scene/outdoor/buildings.ts` — new
- `src/scene/outdoor/buildingTexture.ts` — new
- `src/scene/Scene.tsx` — mount `<OutdoorScene />`
- `src/state/slices/qualitySlice.ts` — add `outdoor` flag
- `src/state/schema.ts` — persist + default
- `src/ui/SettingsPanel.tsx` — toggle
- `TODO.md`

## Tests

- `buildings.test.ts` — `generateBuildings(seed)` is deterministic (two calls with same seed yield identical specs); produces `BUILDING_COUNT` results; no building's AABB intersects the apartment's inflated AABB; widths/heights stay in declared ranges.

## Out of scope

- Real photo-textured 360° panoramas (Approach C).
- Trees, foliage, roads, parked cars.
- Day/night transitions in the texture itself (lit windows pattern is fixed; only emissive intensity ramps).
- Animated occupant lights or moving cars.
- Parallax LOD (single ring at one distance, no farther horizon band).
- Per-orientation skyline customisation — the ring is the same regardless of which way the apartment faces.
