# Time of Day — System Time, Astronomical Sun, Realistic Indoor Lighting, Light Fixtures

Brainstormed 2026-05-01.

## Goal

Replace the current three-preset toolbar control (`day` / `dusk` / `night`) with a richer, physically-grounded lighting system that:

1. Tracks the user's system clock by default ("System" mode), with four named presets — **Morning (06:00)**, **Noon (12:00)**, **Dusk (18:00)**, **Night (00:00)** — and a **Custom** time picker.
2. Computes the sun's real azimuth + elevation from the user's geographic location and the current date, so morning sun rises in the east and the arc shifts seasonally. Location is set via geolocation, manual lat/lon, or **city-name search**.
3. Renders realistic indoor light: interior rooms dim correctly, sun casts **real shadows through windows** via three.js shadow maps, **bounced light** is approximated via image-based lighting, and **light bleeds between rooms through open doors**.
4. Lets users place **light fixtures** (lamps, ceiling lights) as a furniture category. Fixtures emit light independent of the sun and are essential for night/evening scenes.
5. Exposes **quality toggles** in a Settings panel so users on low-end devices can disable shadows, GI, and inter-room bleed independently.

The scene does not auto-advance on its own. System mode is the only mode that follows the wall clock; presets and custom times are static until the user changes them.

This is a large spec. The implementation plan will break into five independently-shippable phases:

1. **Time model** — state, dropdown, persistence, T cycle.
2. **Astronomy + geocoding** — SunCalc, location prompt with geolocation / lat-lon / city search, altitude-driven lighting.
3. **Realistic indoor lighting** — fast per-room fill (cheap baseline), real shadow maps through window cutouts, IBL bounced-light approximation, open-door light bleed via room graph.
4. **Light fixtures** — light-emitting furniture, inspector controls, global toggle.
5. **Quality settings** — Settings panel and per-feature toggles wired through phases 2–4.

Phase 5's toggles are referenced throughout this spec; the panel itself is specified in §5.

---

## 1. Time model

### State

`src/state/slices/timeSlice.ts` is rewritten:

```ts
export type TimeMode = 'system' | 'manual';

export interface TimeSlice {
  timeMode: TimeMode;
  manualHour: number; // 0–24, fractional. Ignored when timeMode === 'system'.
  setTimeMode: (m: TimeMode) => void;
  setManualHour: (h: number) => void;
  setPresetTime: (preset: 'morning' | 'noon' | 'dusk' | 'night') => void;
  cyclePresetTime: () => void; // T-key: System → Morning → Noon → Dusk → Night → System
}

export const TIME_INITIAL = { timeMode: 'system' as TimeMode, manualHour: 12 };
```

The old `TimeOfDay` enum and `setTimeOfDay`/`cycleTimeOfDay` are removed.

### Effective hour

`src/scene/lighting/useEffectiveHour.ts`:

- `manual` → returns `manualHour` directly.
- `system` → reads `new Date()` on mount and re-reads every 60 s via `setInterval`. Sub-minute precision is unnecessary; the lighting tween (~0.6 s) smooths visible jumps.

`hoursFromDate(d)` returns `d.getHours() + d.getMinutes()/60 + d.getSeconds()/3600`.

### Toolbar dropdown

`src/ui/Toolbar.tsx` replaces the time `SegmentedControl` with a dropdown button.

Closed label reflects current state, e.g. `Time: System (3:45 PM)`, `Time: Morning`, `Time: Custom (10:30 AM)`.

Open menu:

```
┌──────────────────────────┐
│ ● System  (3:45 PM)      │
├──────────────────────────┤
│   Morning   6:00 AM      │
│   Noon      12:00 PM     │
│   Dusk      6:00 PM      │
│   Night     12:00 AM     │
├──────────────────────────┤
│   Custom    [10:30 ▢]    │  ← native <input type="time">
└──────────────────────────┘
```

The Custom row's `<input type="time">` value is bound to the current *effective* hour (so in System mode it shows the live clock; in manual modes it shows `manualHour`). Editing it sets `timeMode='manual'` + the parsed hour. Outside-click closes the dropdown (existing pattern from `LoadButton`).

### Keybinding

`T` calls `cyclePresetTime`. `HelpHint.tsx` updates the T-key copy to "Cycle time of day".

### Persistence

`schema.ts` serializes `{ timeMode, manualHour }` instead of `timeOfDay`. Migration:

| Old `timeOfDay` | New shape                                    |
|-----------------|----------------------------------------------|
| `'day'`         | `{ timeMode: 'manual', manualHour: 12 }`     |
| `'dusk'`        | `{ timeMode: 'manual', manualHour: 18 }`     |
| `'night'`       | `{ timeMode: 'manual', manualHour: 0 }`      |
| missing         | defaults                                     |

---

## 2. Astronomical sun position

### Location state

New slice `src/state/slices/locationSlice.ts`:

```ts
export interface LocationSlice {
  location: { lat: number; lon: number; label?: string } | null;
  locationPromptDismissed: boolean; // user chose "skip" or denied geo
  setLocation: (loc: { lat: number; lon: number; label?: string }) => void;
  dismissLocationPrompt: () => void;
}
```

Persisted in `schema.ts` alongside other slices. Initial state: `{ location: null, locationPromptDismissed: false }`.

### First-run prompt

A small modal `src/ui/LocationPrompt.tsx` shows once when `location === null && !locationPromptDismissed`. Three paths:

1. **Use my location** — calls `navigator.geolocation.getCurrentPosition()`. On success, stores `{ lat, lon, label?: string }` (label populated by reverse-geocoding the result; see below).
2. **Search by city** — text input that queries `https://nominatim.openstreetmap.org/search?format=json&q=<query>&limit=5` (debounced 300 ms, 2-character minimum). Results render as a small dropdown of `{ display_name, lat, lon }`. Picking one stores `{ lat, lon, label: display_name }`. Nominatim's free public endpoint is rate-limited (1 req/s) and requires a `User-Agent`/`Referer` header; we set `User-Agent: sofa-so-good/<version>` per their policy. No API key.
3. **Enter manually** — two number inputs (lat/lon) with validation (lat ∈ [-90, 90], lon ∈ [-180, 180]). Stored without a label.
4. **Skip** — sets `locationPromptDismissed = true`. Lighting falls back to a baked-in default location (Singapore, `1.35°N, 103.82°E`).

The location is shown in the time-of-day dropdown footer as the city `label` if present, else `lat°, lon°`. Clicking it reopens the prompt to change.

**Geocoding wrapper** — `src/services/geocoding.ts` exposes `searchPlaces(q: string): Promise<Place[]>` and `reverseGeocode(lat, lon): Promise<string | null>`. Errors and rate-limit (429) are surfaced as a small inline error in the prompt; the modal stays usable for manual entry. Nominatim queries are not retried.

The prompt is also reachable later from a "Location" entry in the time-of-day dropdown's footer, so users who skipped can come back.

### Sun computation

`src/scene/lighting/sunPosition.ts` exports `computeSun(date, lat, lon)` returning `{ azimuth: number; altitude: number }` in radians. Uses the [SunCalc](https://github.com/mourner/suncalc) library (small, MIT-licensed, dependency-free) as `getPosition(date, lat, lon)`. Adding `suncalc` to `package.json` is part of phase 2.

### Mapping astronomy to scene

The apartment's coordinate system is `+X east, +Z south, +Y up` (per `src/apartment/types.ts`). Sun direction in scene-space:

```
x = sin(azimuth) * cos(altitude)        // east component
y = sin(altitude)                        // up component
z = -cos(azimuth) * cos(altitude)        // south component (azimuth measured from north)
```

The scene's directional light position is `sunDir * SUN_DISTANCE` (existing `[10, 20, 5]` magnitude → use `~25` units). When `altitude < 0`, the sun is below the horizon: position drops below the floor and intensity tapers (see next).

### Driving lighting from altitude

`src/scene/lighting/Lighting.tsx` and `Sky.tsx` no longer use the four hour-keyframes for sun position — the sun is computed from astronomy. *Intensity* and *color* are derived from solar altitude using a single curve, so the look is consistent regardless of season:

| Altitude (deg) | Sun intensity | Ambient | Sun color (approx) |
|----------------|---------------|---------|--------------------|
| ≥ 30 (noon-ish) | 1.0          | 0.6     | warm-white `(1.0, 0.96, 0.88)` |
| 10              | 0.85         | 0.55    | `(1.0, 0.92, 0.78)` |
| 0 (horizon)     | 0.4          | 0.4     | golden `(1.0, 0.72, 0.42)` |
| -6 (civil twilight) | 0.05     | 0.18    | dusk blue `(0.45, 0.50, 0.65)` |
| ≤ -12 (night)   | 0.0          | 0.12    | `(0.24, 0.29, 0.42)` |

`computeLightingFromAltitude(alt)` is a piecewise lerp over this table. Sky `turbidity`/`rayleigh`/`mieCoefficient` use a parallel small table. The four named **Morning/Noon/Dusk/Night** presets in the UI are now just hour values (06/12/18/00); their *visual* characteristics emerge from the astronomy + altitude curve.

### Reactive update cadence

In manual mode, sun is recomputed when `manualHour` changes (and once per second-of-day, since within the same hour the sun moves visibly — actually only on hour change is fine; the tween smooths). In system mode, sun recomputes every 60 s alongside the effective hour.

The directional-light tween in `Lighting.tsx` keeps working — it now chases an astronomy-derived target instead of a keyframe.

---

## 3. Realistic indoor lighting

This phase has four layered features. Each can be toggled on/off independently in Settings (§5). The cheapest layer (per-room fill) is always on; everything above it costs FPS and is opt-in based on user-selected quality.

### 3.1 Per-room fill light (always on, baseline)

For each room, compute a *daylight factor* `f ∈ [0, 1]` for the current sun direction. `f = 1` means the room sees the sun; `f = 0` means it's fully interior. Each room gets one small `<pointLight>` at ceiling height inside its volume with intensity `(1 - f) * indoorDarkening`, simulating bounced indoor ambient. This is the cheap baseline that keeps interiors readable without any expensive features.

`src/apartment/daylight.ts` exposes `roomDaylightFactor(room, walls, sunDir): number`:

1. If `sunDir.y <= 0`, return `0`.
2. If `room.external === true`, return `1`.
3. For each wall bordering the room (via `wallRoomSides.ts`), compute outward-facing normal. If `dot(normal, sunDir.xz) > 0` AND the wall has at least one `Cutout` of `kind === 'window'`, contribute `windowAreaFraction` (clamped sum of cutout widths / wall length).
4. Cap at `1.0`.

`src/scene/lighting/RoomFillLights.tsx` (new) renders one fill light per room. Intensity tweens smoothly to avoid pops at sunset.

### 3.2 Real shadows through window cutouts (toggleable)

When the **Shadows** quality setting is `'on'`, the global directional light becomes a real three.js shadow caster, and walls/floor/ceiling/furniture become shadow casters and receivers. Because `wallSegments.ts` already builds wall geometry as solid panels with rectangular window cutouts, the shadow map naturally projects sun beams through windows onto interior floors — no extra modelling required.

Concretely:

- `Lighting.tsx`'s `<directionalLight>` gains `castShadow={shadows !== 'off'}` and `shadow.mapSize` driven by setting (`512` low / `2048` high). Shadow camera frustum is fit to the apartment AABB plus a margin, recomputed when the apartment changes.
- All meshes in `Apartment.tsx` (`Floor`, `Walls`, `Ceiling`, `Door`, `Fixtures`) and in furniture renderers get `castShadow receiveShadow` flags, gated on the same setting.
- The `<Canvas>` in `App.tsx` enables `shadows={shadows !== 'off' ? 'soft' : false}`.
- When shadows are `'off'`, behavior matches the current code (no shadow maps).

The 3.1 fill light continues to render in all modes; with shadows on, it lifts dim corners that the directional light's shadow doesn't reach.

**Performance notes** — shadow-map cost is the single biggest FPS lever for indoor scenes. The setting offers `'off' | 'low' | 'high'` (mapping to map size + PCF filter + soft-shadow toggle). Default is `'low'` on first load; users can downgrade.

### 3.3 Bounced-light global illumination (toggleable)

When **Global illumination** is enabled, the scene gains an image-based-lighting (IBL) environment that approximates indirect bounce. Three.js does not ship real-time GI, so we use the standard pragmatic approach:

- A small set of pre-baked HDRI environments (one per "lighting mood" — clear day, overcast, golden, dusk, night) shipped under `public/assets/hdri/` as compressed `.hdr` files. We pick one based on solar altitude using the same curve from §2.
- `<Environment>` from `@react-three/drei` loads the chosen HDRI and tints all PBR materials with its irradiance. This produces visibly bouncier-looking surfaces (especially walls/ceilings) and proper specular reflections in glossy materials.
- An optional second pass uses `@react-three/postprocessing`'s `<SSAO>` (screen-space ambient occlusion) for contact-shadow darkening in corners. SSAO lives behind its own setting because it requires `EffectComposer` and adds a render pass.

When GI is `'off'`, the scene uses the existing constant ambient light only.

**Performance notes** — IBL itself is essentially free at runtime (one cubemap sample per material). HDRI download is the cost (each ~1–4 MB). SSAO costs ~1–3 ms/frame depending on resolution. The setting's three levels are `'off' | 'ibl' | 'ibl+ssao'`.

### 3.4 Inter-room light bleed through open doors (toggleable)

When **Inter-room bleed** is enabled, daylight reaching one room can spill into adjacent rooms through open doors. Implementation is a graph relaxation:

1. Build a **room adjacency graph**: nodes are rooms, edges are doors (each edge knows which two rooms it connects, gated by `Door.open`). Built once from `WALLS`/`DOORS` constants and rebuilt only if the apartment changes.
2. Compute the base daylight factor `f₀` per room from §3.1.
3. Relax: for each room, `f = max(f₀, max over open-door neighbors of f_neighbor * BLEED_ATTENUATION)` where `BLEED_ATTENUATION = 0.4` per door traversal. Iterate until stable (≤4 passes for our 11-room flat).
4. Use the relaxed `f` to drive room fill lights from §3.1.

Open/closed door state already exists in `doorSlice.ts` (verified in code). The graph rebuilds when door state changes, which is rare; the relaxation is O(rooms × doors × 4) ≈ trivial.

When the bleed setting is off, only `f₀` is used — corridor stays dark even with all doors open.

**Performance notes** — pure CPU, negligible cost (microseconds). The setting is on/off only and on by default.

### 3.5 Limitations (deliberate)

- Shadow casting through windows is correct geometrically but doesn't account for window glass refraction, tinting, or curtains.
- IBL is a single global environment; it doesn't truly localize bounce per-room. For most indoor architecture views this is acceptable.
- Door light bleed is uniform attenuation per traversal — no directional weighting based on door orientation.

---

## 4. Light fixtures

### Furniture category

A new field on `FurnitureDef`: `light?: LightEmitter`. When present, the placed furniture instance also emits light from a fixture-relative anchor point.

```ts
export interface LightEmitter {
  kind: 'point' | 'spot';
  /** Offset from furniture origin where the bulb sits. */
  anchor: Vec3;
  /** Default values; instance can override. */
  defaultIntensity: number;
  defaultColor: [number, number, number]; // linear RGB, 0–1
  /** For spot lights only. */
  cone?: { angle: number; penumbra: number; targetOffset: Vec3 };
  /** Indicative range / falloff distance in metres. */
  distance: number;
}
```

### Per-instance state

Each `PlacedFurniture` instance gains optional `lightOverride`:

```ts
interface PlacedFurniture {
  // …existing
  lightOverride?: {
    on: boolean;          // default true when fixture is placed
    intensity?: number;   // override default
    colorTemp?: number;   // 2200–6500 K; converted to RGB at render time
  };
}
```

### Built-in fixtures (initial set)

Five entries in `src/furniture/builtinCatalog.ts`, all using `light`:

1. **Floor lamp** — point light, warm 2700 K, 18 W equivalent.
2. **Table lamp** — point light, warm 2700 K, 12 W equivalent (anchor at lamp head, ~0.5 m above origin).
3. **Pendant ceiling light** — point light at ceiling height, warm-white 3000 K, 40 W equivalent.
4. **Spot ceiling light** — spot light pointing down, neutral 4000 K.
5. **Wall sconce** — point light just off a wall, warm 2700 K, 8 W equivalent.

Geometry can start as primitive shapes (cylinder + sphere) until proper GLBs land; the GLB pipeline will swap them in later. Mesh quality is not in this spec's scope.

### Rendering

`src/scene/furniture/FurnitureLights.tsx` (new): iterates placed furniture, for any with `light` and `lightOverride.on !== false` emits a `<pointLight>` or `<spotLight>` at the fixture's world-transformed anchor.

three.js light count caveat: on most GPUs more than ~8 active dynamic lights starts to cost per-pixel. Cap rendered fixtures at 16 (sorted by distance to camera, off-camera-frustum first culled) and dim the rest, with a small console warning. Acceptable for v1.

### Inspector controls

`src/ui/inspector/InspectorPanel.tsx` gains a *Light* section when the selected furniture has a `light` field:

- Toggle on/off
- Intensity slider (0 – 2× default)
- Color-temperature slider (2200 K warm → 6500 K cool), converted via Planckian locus approximation

Per-instance values persist via `lightOverride` and serialize through `schema.ts`.

### Global fixtures toggle

Toolbar gets a small "Lights" button next to the time dropdown that flips a global "fixtures on/off" override. Used when the user wants pure-daylight screenshots.

---

---

## 5. Quality settings

### State

New slice `src/state/slices/qualitySlice.ts`:

```ts
export interface QualitySettings {
  shadows: 'off' | 'low' | 'high';
  globalIllumination: 'off' | 'ibl' | 'ibl+ssao';
  interRoomBleed: boolean;
  fixtures: boolean;       // global fixtures on/off (replaces toolbar button from §4)
}

export interface QualitySlice {
  quality: QualitySettings;
  setQuality: (patch: Partial<QualitySettings>) => void;
}
```

Defaults differ by device: on first load, query `navigator.hardwareConcurrency` and `navigator.deviceMemory` (best-effort) to pick presets:

- **Low**: `shadows: 'off', globalIllumination: 'off', interRoomBleed: true, fixtures: true`
- **Medium** (default): `shadows: 'low', globalIllumination: 'ibl', interRoomBleed: true, fixtures: true`
- **High**: `shadows: 'high', globalIllumination: 'ibl+ssao', interRoomBleed: true, fixtures: true`

Stored individually (not as a preset name) so users can mix.

### Settings panel UI

`src/ui/SettingsPanel.tsx` (new) — a modal opened from a small "Settings" button in the toolbar (gear icon). Sections:

- **Quality preset** — three buttons (Low / Medium / High) that bulk-set the four flags.
- **Shadows** — segmented control: Off / Low / High. Tooltip: "Sun shadows through windows. Big FPS impact."
- **Global illumination** — segmented control: Off / IBL / IBL + SSAO. Tooltip: "Bounced light approximation. IBL is cheap; SSAO costs ~1–3 ms/frame."
- **Inter-room light bleed** — toggle. Tooltip: "Light spills through open doors. Free."
- **Fixtures** — toggle. Tooltip: "Render placed lamps and ceiling lights."

Each section shows current FPS reading inline (re-using the existing FPS counter source) so users can see the immediate cost when toggling.

### Wiring through phases

- **Phase 2** Lighting/Sky check `quality.shadows` to set `castShadow` props.
- **Phase 3.2** uses `quality.shadows` for map size + soft-shadow filter.
- **Phase 3.3** uses `quality.globalIllumination` to mount/unmount `<Environment>` and `<EffectComposer>`.
- **Phase 3.4** uses `quality.interRoomBleed` to switch between relaxed `f` and base `f₀`.
- **Phase 4** uses `quality.fixtures` to gate `<FurnitureLights>` rendering. The toolbar fixtures button from §4 is replaced by this setting.

### Persistence

`schema.ts` serializes the entire `QualitySettings` object. Migration: missing → device-detected defaults (so existing saves don't pin themselves to whatever was current at save time; quality is a per-device preference, not a per-layout one).

---

## Files touched

**Phase 1 — time model**

- `src/state/slices/timeSlice.ts` — rewrite
- `src/state/store.ts` — re-export `TimeMode`, drop `TimeOfDay`
- `src/state/schema.ts` — serialize/migrate
- `src/scene/lighting/useEffectiveHour.ts` — new
- `src/ui/Toolbar.tsx` — dropdown
- `src/ui/HelpHint.tsx`, `src/controls/keybindings.ts`, `src/App.tsx` — T cycle

**Phase 2 — astronomy**

- `src/state/slices/locationSlice.ts` — new
- `src/state/schema.ts` — persist location
- `src/ui/LocationPrompt.tsx` — new modal
- `src/ui/Toolbar.tsx` — "Location" footer link in dropdown
- `src/scene/lighting/sunPosition.ts` — new (SunCalc wrapper)
- `src/scene/lighting/altitudeCurve.ts` — new (intensity/color/sky tables)
- `src/scene/lighting/Lighting.tsx`, `Sky.tsx` — drive from altitude
- `package.json` — add `suncalc`

**Phase 3 — realistic indoor lighting**

- `src/apartment/daylight.ts` — new (`roomDaylightFactor`)
- `src/apartment/roomGraph.ts` — new (door-adjacency + bleed relaxation)
- `src/scene/lighting/RoomFillLights.tsx` — new
- `src/scene/lighting/Lighting.tsx` — `castShadow`/shadow-map size driven by quality
- `src/apartment/Apartment.tsx`, `Floor.tsx`, `Walls.tsx`, `Ceiling.tsx`, `Door.tsx`, `Fixtures.tsx` — `castShadow`/`receiveShadow` flags
- `src/App.tsx` — `<Canvas shadows>` driven by quality
- `src/scene/lighting/Environment.tsx` — new (drei `<Environment>` + altitude→HDRI selection)
- `src/scene/lighting/PostFx.tsx` — new (`<EffectComposer>` + SSAO)
- `public/assets/hdri/` — pre-baked HDRIs (`clear-day.hdr`, `overcast.hdr`, `golden.hdr`, `dusk.hdr`, `night.hdr`)
- `package.json` — `@react-three/postprocessing`

**Phase 4 — light fixtures**

- `src/furniture/types.ts` — `LightEmitter` field on `FurnitureDef`, `lightOverride` on placed instances
- `src/furniture/builtinCatalog.ts` — five fixture entries
- `src/scene/furniture/FurnitureLights.tsx` — new renderer
- `src/ui/inspector/InspectorPanel.tsx` — Light section
- `src/state/schema.ts` — serialize `lightOverride`

**Phase 5 — quality settings**

- `src/state/slices/qualitySlice.ts` — new
- `src/state/schema.ts` — persist quality
- `src/ui/SettingsPanel.tsx` — new modal
- `src/ui/Toolbar.tsx` — Settings (gear) button
- Wiring across Lighting, Environment, PostFx, RoomFillLights, FurnitureLights to read `quality.*`

**Tests** (per phase)

- `timeSlice.test.ts`, `useEffectiveHour.test.ts`
- `sunPosition.test.ts` (golden values for Singapore noon, London winter solstice, Sydney summer solstice), `altitudeCurve.test.ts`
- `geocoding.test.ts` (Nominatim response parsing, error handling — no live HTTP)
- `daylight.test.ts` (each room: which sun directions yield `f > 0`)
- `roomGraph.test.ts` (adjacency build; bleed relaxation reaches stable values; closed-door isolation)
- `furnitureLight.test.ts` (override merge, color-temp conversion)
- `qualitySlice.test.ts` (defaults from device hints; partial patch updates)
- `schema.test.ts` extended for new fields and migration

## Out of scope

- Auto-advancing in-world clock.
- Window glass tinting / curtains affecting shadow color.
- Localized per-room IBL probes (single global environment is used).
- Directional weighting of door bleed based on door orientation (uniform attenuation).
- Animated dusk/dawn that's faster than the existing 0.6 s tween.
- Outdoor environment beyond the apartment shell (skybox stays stylistic, no terrain).
- Real-time path-traced GI / RTX. IBL + SSAO is the target.
