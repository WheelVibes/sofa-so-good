# Time of Day — System Time, Astronomical Sun, Indoor Occlusion, Light Fixtures

Brainstormed 2026-05-01.

## Goal

Replace the current three-preset toolbar control (`day` / `dusk` / `night`) with a richer, physically-grounded lighting system that:

1. Tracks the user's system clock by default ("System" mode), with four named presets — **Morning (06:00)**, **Noon (12:00)**, **Dusk (18:00)**, **Night (00:00)** — and a **Custom** time picker.
2. Computes the sun's real azimuth + elevation from the user's geographic location and the current date, so morning sun rises in the east and the arc shifts seasonally.
3. Reduces direct daylight in rooms whose walls don't face the sun or have no window line-of-sight to it, so interior rooms get dimmer in the daytime and feel night-like once the sun sets.
4. Lets users place **light fixtures** (lamps, ceiling lights) as a furniture category. Fixtures emit light independent of the sun and are essential for night/evening scenes.

The scene does not auto-advance on its own. System mode is the only mode that follows the wall clock; presets and custom times are static until the user changes them.

This spec is large enough that the implementation plan will likely break into four phases (time model → sun astronomy → indoor occlusion → light fixtures), each independently shippable. They are described together here because they share state, types, and user-visible surface.

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
  location: { lat: number; lon: number } | null;
  locationPromptDismissed: boolean; // user chose "enter manually" or denied geo
  setLocation: (loc: { lat: number; lon: number }) => void;
  dismissLocationPrompt: () => void;
}
```

Persisted in `schema.ts` alongside other slices. Initial state: `{ location: null, locationPromptDismissed: false }`.

### First-run prompt

A small modal `src/ui/LocationPrompt.tsx` shows once when `location === null && !locationPromptDismissed`. Two paths:

1. **Use my location** — calls `navigator.geolocation.getCurrentPosition()`. On success, stores `{ lat, lon }`. On error/denial, falls through to manual.
2. **Enter manually** — two number inputs (lat/lon) with validation (lat ∈ [-90, 90], lon ∈ [-180, 180]). City-name geocoding is out of scope.
3. **Skip** — sets `locationPromptDismissed = true`. Lighting falls back to a baked-in default location (Singapore, `1.35°N, 103.82°E`) so the scene still renders coherently.

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

## 3. Window-aware indoor daylight occlusion

### Model

For each room, determine a *daylight factor* `f ∈ [0, 1]` for the current sun direction. `f = 1` means the room sees the sun fully; `f = 0` means it's interior or the sun is on the wrong side.

The lighting pipeline applies `f` per-room as a multiplier on the directional-light contribution within that room's volume.

### Three.js execution

Three.js doesn't natively support per-volume light masks, so we implement this as **per-room ambient adjustment**:

- The single global `<directionalLight>` continues to light the whole scene as a baseline (it's primarily seen through windows and on the apartment's exterior surfaces).
- Each `RoomDef` gets a *room-local* `<ambientLight>` (or `<hemisphereLight>`) whose intensity scales with `(1 - f) * indoorDarkening + baseAmbient`. Rooms with no sun line-of-sight get more ambient fill (so they don't go pitch black) but no extra direct sun.
- Room-local lights are placed at the room's centroid, only affect meshes within that room's AABB via three.js layers (each room gets a layer; furniture inside the room is added to that layer at placement time).

The per-room layer assignment is the trickiest piece. Rather than tagging every furniture mesh by room at runtime, we use a simpler approach: each room renders its own subtle `<rectAreaLight>` (or `pointLight`) at ceiling height inside the room's volume, with intensity `(1 - f) * indoorDarkening`. This avoids layer plumbing entirely. The fill light is small and warm, simulating bounced indoor ambient.

### Computing `f`

`src/apartment/daylight.ts`:

```ts
export function roomDaylightFactor(
  room: RoomDef,
  walls: WallSpec[],
  sunDir: Vec3, // unit vector, +y up
): number
```

Algorithm:

1. If `sunDir.y <= 0`, return `0` (sun below horizon).
2. If `room.external === true`, return `1` (open balcony / AC ledge).
3. Find walls bordering this room (uses the existing `wallRoomSides.ts` mapping).
4. For each wall, find its outward-facing normal in scene space. If `dot(normal, sunDir.xz) > 0` (wall faces toward sun) AND the wall has at least one `Cutout` of `kind === 'window'`, contribute `windowAreaFraction` to `f`. Doors don't count for daylight even if open.
5. Cap at `1.0`.

So a bedroom with a north-facing window gets daylight when the sun has any northern component; a windowless bath gets `f = 0` always; the L/D with windows on multiple sides usually has `f = 1`.

### Rendering integration

`src/scene/lighting/RoomFillLights.tsx` (new): maps over `ROOMS`, computes `f` from current sun direction (memoized on sun + walls), emits one fill light per room positioned at room centroid + `(0, ceilingHeight - 0.3, 0)`. Intensity is tweened smoothly toward the target value to avoid pops at sunset.

This is purely additive lighting; it does not change the directional-light setup.

### Limitations (deliberate)

- No real shadow ray-casting through window apertures. A room "has sun" if any of its sun-facing walls has a window; we don't check that the sun's actual angle would project light onto the floor through the window. Users won't notice in most cases.
- No accounting for inter-room light bleed through open doors. This is a known simplification; we can revisit with portal techniques later.
- No bounced-light GI. Three.js standard.

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

**Phase 3 — indoor occlusion**

- `src/apartment/daylight.ts` — new (`roomDaylightFactor`)
- `src/scene/lighting/RoomFillLights.tsx` — new

**Phase 4 — light fixtures**

- `src/furniture/types.ts` — `LightEmitter` field on `FurnitureDef`, `lightOverride` on placed instances
- `src/furniture/builtinCatalog.ts` — five fixture entries
- `src/scene/furniture/FurnitureLights.tsx` — new renderer
- `src/ui/inspector/InspectorPanel.tsx` — Light section
- `src/ui/Toolbar.tsx` — global fixtures toggle
- `src/state/schema.ts` — serialize `lightOverride`

**Tests** (one file per phase)

- `timeSlice.test.ts`, `useEffectiveHour.test.ts`
- `sunPosition.test.ts` (golden values for Singapore noon, London winter solstice, Sydney summer solstice), `altitudeCurve.test.ts`
- `daylight.test.ts` (each room: which sun directions yield `f > 0`)
- `furnitureLight.test.ts` (override merge, color-temp conversion)
- `schema.test.ts` extended for new fields and migration

## Out of scope

- Auto-advancing in-world clock.
- City-name geocoding for the location prompt (lat/lon only).
- Real shadow ray-casting through windows (only line-of-sight via wall normals + window presence).
- Bounced-light global illumination.
- Inter-room light bleed through open doors.
- Animated dusk/dawn that's faster than the existing 0.6 s tween.
- Outdoor environment beyond the apartment shell (skybox stays stylistic, no terrain).
