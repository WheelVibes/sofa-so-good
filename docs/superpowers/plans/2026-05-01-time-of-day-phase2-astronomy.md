# Time of Day — Phase 2 (Astronomy + Geocoding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase-1 hour→preset shim with real astronomical sun positioning. Add a location state slice + first-run prompt (with browser geolocation, manual lat/lon, and Nominatim city search), drive Lighting/Sky from solar altitude rather than a discrete enum, and persist the user's chosen location.

**Architecture:** A new `src/services/geocoding.ts` wraps OpenStreetMap Nominatim (free, no key, polite-use rate-limited). A new `src/scene/lighting/sunPosition.ts` wraps `suncalc` and converts (lat, lon, date) → `(azimuth, altitude)`, then to a scene-space sun direction. A new `src/scene/lighting/altitudeCurve.ts` returns lighting/sky values for a given solar altitude. A new `LocationSlice` carries the user's lat/lon (with optional `label`) and a `locationPromptDismissed` flag. `Lighting.tsx` and `Sky.tsx` are rewritten to read the effective hour, the effective location, build a `Date` for today + that hour, query SunCalc, and feed the result into the altitude curve. `hourToPreset.ts` is deleted.

**Tech Stack:** TypeScript, React, Zustand, Vitest (happy-dom), three.js / @react-three/fiber, `suncalc` (new dep), Nominatim REST (no SDK).

**Spec:** [docs/superpowers/specs/2026-05-01-time-of-day-design.md §2](../specs/2026-05-01-time-of-day-design.md) (Astronomical sun position section).

**Default fallback location:** Singapore (`1.35°N, 103.82°E`) when the user hasn't set one.

---

## File structure

**Created**

- `src/scene/lighting/sunPosition.ts` — `computeSun(date, lat, lon) → { azimuth, altitude }` and `sunDirectionToScene({ azimuth, altitude }) → [x, y, z]`. Wraps `suncalc`.
- `src/scene/lighting/sunPosition.test.ts` — golden-value tests (Singapore noon, London winter solstice, Sydney summer solstice).
- `src/scene/lighting/altitudeCurve.ts` — exports `lightingFromAltitude(alt) → { sun, ambient, sunColor }` and `skyFromAltitude(alt) → { turbidity, rayleigh, mieCoefficient, mieDirectionalG }`. Piecewise-linear interpolation between altitude keyframes.
- `src/scene/lighting/altitudeCurve.test.ts` — boundary + interpolation tests.
- `src/state/slices/locationSlice.ts` — `{ location, locationPromptDismissed, setLocation, dismissLocationPrompt, resetLocationPrompt }` + `LOCATION_INITIAL`.
- `src/state/slices/locationSlice.test.ts` — slice unit tests.
- `src/services/geocoding.ts` — `searchPlaces(q)` and `reverseGeocode(lat, lon)` wrappers around Nominatim.
- `src/services/geocoding.test.ts` — fetch-mocked tests.
- `src/ui/LocationPrompt.tsx` — modal: geolocation / city search / manual lat-lon / skip.
- `src/ui/LocationPrompt.test.tsx` — interaction tests with mocked geocoding + geolocation.

**Modified**

- `src/state/store.ts` — compose `LocationSlice`, re-export `Location` type.
- `src/state/store.test.ts` — assertion that `location` defaults to `null`, `locationPromptDismissed` to `false`.
- `src/state/schema.ts` — serialize `{ location, locationPromptDismissed }`. Both optional with sensible defaults so older saves still parse.
- `src/state/schema.test.ts` — round-trip + missing-field defaults.
- `src/state/storage/autosave.ts` — track `location` and `locationPromptDismissed` in the persistent diff.
- `src/state/storage/LocalStorageAdapter.test.ts` — fixture includes the new fields.
- `src/scene/lighting/Lighting.tsx` — rewrite: drive from `useSunPosition()` + `lightingFromAltitude` instead of `hourToPreset`/`PRESETS`.
- `src/scene/lighting/Sky.tsx` — rewrite: drive from `useSunPosition()` + `skyFromAltitude`.
- `src/App.tsx` — mount `<LocationPrompt />` next to existing modals.
- `src/ui/Toolbar.tsx` — add a "Location" footer row to `TimeDropdown` that reopens the prompt.
- `package.json` — add `suncalc` and `@types/suncalc` (devDep).

**Deleted**

- `src/scene/lighting/hourToPreset.ts`
- `src/scene/lighting/hourToPreset.test.ts`

---

## Task 1: Add SunCalc dep and `sunPosition` module (TDD)

**Files:**
- Modify: `package.json` (add `suncalc`, `@types/suncalc`)
- Create: `src/scene/lighting/sunPosition.ts`
- Create: `src/scene/lighting/sunPosition.test.ts`

- [ ] **Step 1.1: Install dependencies**

Run: `npm install suncalc && npm install -D @types/suncalc`
Expected: clean install, `package.json` and `package-lock.json` updated.

- [ ] **Step 1.2: Write the failing test**

Create `src/scene/lighting/sunPosition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSun, sunDirectionToScene, hoursToDate } from './sunPosition';

const RAD_TO_DEG = 180 / Math.PI;

describe('computeSun', () => {
  it('puts the sun high overhead at Singapore noon on equinox', () => {
    // 2026-03-21 (vernal equinox), local 12:00 SGT (UTC+8) → 04:00 UTC
    const d = new Date('2026-03-21T04:00:00.000Z');
    const sun = computeSun(d, 1.35, 103.82);
    // Altitude should be > 80° (near zenith on equator at noon).
    expect(sun.altitude * RAD_TO_DEG).toBeGreaterThan(80);
  });

  it('returns negative altitude (below horizon) at midnight Singapore', () => {
    const d = new Date('2026-03-20T16:00:00.000Z'); // 00:00 SGT next day
    const sun = computeSun(d, 1.35, 103.82);
    expect(sun.altitude).toBeLessThan(0);
  });

  it('London winter solstice noon: sun is low in the south', () => {
    // 2026-12-21 12:00 UTC, London (51.5°N, 0°)
    const d = new Date('2026-12-21T12:00:00.000Z');
    const sun = computeSun(d, 51.5, 0);
    const altDeg = sun.altitude * RAD_TO_DEG;
    expect(altDeg).toBeGreaterThan(10);
    expect(altDeg).toBeLessThan(20);
    // Azimuth near south (180°) — SunCalc convention is from south,
    // measured westward; near solar noon it should be close to 0.
    expect(Math.abs(sun.azimuth) * RAD_TO_DEG).toBeLessThan(20);
  });

  it('Sydney summer solstice noon: sun is high', () => {
    // 2026-12-21 02:00 UTC = 13:00 AEDT (UTC+11), Sydney (-33.87°, 151.21°)
    const d = new Date('2026-12-21T02:00:00.000Z');
    const sun = computeSun(d, -33.87, 151.21);
    const altDeg = sun.altitude * RAD_TO_DEG;
    expect(altDeg).toBeGreaterThan(75);
  });
});

describe('sunDirectionToScene', () => {
  it('returns +Y up when altitude is 90° (sun at zenith)', () => {
    const dir = sunDirectionToScene({ azimuth: 0, altitude: Math.PI / 2 });
    expect(dir[0]).toBeCloseTo(0, 5);
    expect(dir[1]).toBeCloseTo(1, 5);
    expect(dir[2]).toBeCloseTo(0, 5);
  });

  it('returns the unit vector at altitude 0 azimuth 0 (south)', () => {
    // SunCalc azimuth 0 = due south. Scene Z+ is south, so direction
    // points along +Z.
    const dir = sunDirectionToScene({ azimuth: 0, altitude: 0 });
    expect(dir[0]).toBeCloseTo(0, 5);
    expect(dir[1]).toBeCloseTo(0, 5);
    expect(dir[2]).toBeCloseTo(1, 5);
  });

  it('azimuth π/2 at altitude 0 points west (−X in scene)', () => {
    // SunCalc azimuth measured from south toward west (positive).
    // π/2 west of south = due west. Scene X+ is east, so this is −X.
    const dir = sunDirectionToScene({ azimuth: Math.PI / 2, altitude: 0 });
    expect(dir[0]).toBeCloseTo(-1, 5);
    expect(dir[1]).toBeCloseTo(0, 5);
    expect(dir[2]).toBeCloseTo(0, 5);
  });

  it('azimuth −π/2 at altitude 0 points east (+X in scene)', () => {
    const dir = sunDirectionToScene({ azimuth: -Math.PI / 2, altitude: 0 });
    expect(dir[0]).toBeCloseTo(1, 5);
    expect(dir[1]).toBeCloseTo(0, 5);
    expect(dir[2]).toBeCloseTo(0, 5);
  });

  it('output is a unit vector', () => {
    const dir = sunDirectionToScene({ azimuth: 1.2, altitude: 0.5 });
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    expect(len).toBeCloseTo(1, 5);
  });
});

describe('hoursToDate', () => {
  it('builds a Date for today + the given fractional hour', () => {
    const d = hoursToDate(13.5, new Date('2026-05-01T08:00:00'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(30);
  });
});
```

- [ ] **Step 1.3: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/sunPosition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 1.4: Implement the module**

Create `src/scene/lighting/sunPosition.ts`:

```ts
import SunCalc from 'suncalc';

/** Solar position in radians.
 *  - `azimuth` follows SunCalc convention: 0 = south, +π/2 = west, −π/2 = east.
 *  - `altitude` is angle above horizon. Negative = sun below horizon. */
export interface SunPosition {
  azimuth: number;
  altitude: number;
}

export function computeSun(date: Date, lat: number, lon: number): SunPosition {
  const { azimuth, altitude } = SunCalc.getPosition(date, lat, lon);
  return { azimuth, altitude };
}

/** Convert a sun position to a scene-space unit vector.
 *
 *  Apartment coordinate system: +X east, +Y up, +Z south.
 *  SunCalc azimuth: 0 = south, positive = westward, negative = eastward.
 *
 *  So sun direction in scene-space:
 *    horizontal projection = cos(alt)
 *    east component  (X) = -sin(azimuth) * cos(alt)
 *    south component (Z) =  cos(azimuth) * cos(alt)
 *    up component    (Y) =  sin(altitude) */
export function sunDirectionToScene(s: SunPosition): [number, number, number] {
  const cosAlt = Math.cos(s.altitude);
  const x = -Math.sin(s.azimuth) * cosAlt;
  const y = Math.sin(s.altitude);
  const z = Math.cos(s.azimuth) * cosAlt;
  return [x, y, z];
}

/** Build a Date for the same calendar day as `today` but with the given
 *  fractional hour (local time). Used to translate the user's effective
 *  hour into a Date that SunCalc can consume. */
export function hoursToDate(hour: number, today: Date = new Date()): Date {
  const h = ((hour % 24) + 24) % 24;
  const minutes = Math.round(h * 60);
  const result = new Date(today);
  result.setHours(0, minutes, 0, 0);
  return result;
}
```

- [ ] **Step 1.5: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/sunPosition.test.ts`
Expected: 8 tests passing. If any golden-value test is off by a few degrees, double-check the SunCalc azimuth convention; minor differences are acceptable but the high-low/sign assertions must hold.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json src/scene/lighting/sunPosition.ts src/scene/lighting/sunPosition.test.ts
git commit -m "$(cat <<'EOF'
sun: add astronomical position via suncalc

Wraps suncalc.getPosition into computeSun(date, lat, lon) and converts
the (azimuth, altitude) result into a scene-space unit vector via
sunDirectionToScene. hoursToDate maps the effective hour-of-day onto
today's calendar date so callers can feed SunCalc a real Date.

Tests cover Singapore noon (sun overhead), Singapore midnight (sun
below horizon), London winter solstice (low southern arc), and Sydney
summer solstice (high overhead).
EOF
)"
```

---

## Task 2: `altitudeCurve` (TDD)

**Files:**
- Create: `src/scene/lighting/altitudeCurve.ts`
- Create: `src/scene/lighting/altitudeCurve.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/scene/lighting/altitudeCurve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lightingFromAltitude, skyFromAltitude } from './altitudeCurve';

const DEG = Math.PI / 180;

describe('lightingFromAltitude', () => {
  it('high overhead (alt ≥ 30°) returns full bright values', () => {
    const v = lightingFromAltitude(45 * DEG);
    expect(v.sun).toBeCloseTo(1.0, 2);
    expect(v.ambient).toBeCloseTo(0.6, 2);
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2);
    expect(v.sunColor[1]).toBeCloseTo(0.96, 2);
    expect(v.sunColor[2]).toBeCloseTo(0.88, 2);
  });

  it('horizon (alt = 0) returns golden values', () => {
    const v = lightingFromAltitude(0);
    expect(v.sun).toBeCloseTo(0.4, 2);
    expect(v.ambient).toBeCloseTo(0.4, 2);
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2);
    expect(v.sunColor[1]).toBeCloseTo(0.72, 2);
    expect(v.sunColor[2]).toBeCloseTo(0.42, 2);
  });

  it('civil twilight (alt = -6°) returns dim dusk values', () => {
    const v = lightingFromAltitude(-6 * DEG);
    expect(v.sun).toBeCloseTo(0.05, 2);
    expect(v.ambient).toBeCloseTo(0.18, 2);
  });

  it('deep night (alt ≤ -12°) returns night floor', () => {
    const v = lightingFromAltitude(-30 * DEG);
    expect(v.sun).toBeCloseTo(0, 2);
    expect(v.ambient).toBeCloseTo(0.12, 2);
  });

  it('linearly interpolates between adjacent keyframes', () => {
    // Halfway between alt=0 (sun=0.4) and alt=10° (sun=0.85)
    const v = lightingFromAltitude(5 * DEG);
    expect(v.sun).toBeCloseTo((0.4 + 0.85) / 2, 2);
  });

  it('clamps at the high end (alt > 30°)', () => {
    const a = lightingFromAltitude(60 * DEG);
    const b = lightingFromAltitude(30 * DEG);
    expect(a.sun).toBeCloseTo(b.sun, 5);
    expect(a.ambient).toBeCloseTo(b.ambient, 5);
  });
});

describe('skyFromAltitude', () => {
  it('produces day-like sky parameters at high altitude', () => {
    const v = skyFromAltitude(45 * DEG);
    expect(v.turbidity).toBeCloseTo(5, 1);
    expect(v.rayleigh).toBeCloseTo(1, 1);
  });

  it('produces dusk-like sky parameters near the horizon', () => {
    const v = skyFromAltitude(0);
    expect(v.turbidity).toBeGreaterThan(6);
    expect(v.rayleigh).toBeGreaterThan(2);
  });

  it('produces night sky parameters when sun is well below horizon', () => {
    const v = skyFromAltitude(-30 * DEG);
    expect(v.turbidity).toBeCloseTo(10, 1);
    expect(v.rayleigh).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts` → FAIL.

- [ ] **Step 2.3: Implement the curve**

Create `src/scene/lighting/altitudeCurve.ts`:

```ts
const DEG = Math.PI / 180;

export interface LightingValues {
  sun: number;
  ambient: number;
  sunColor: [number, number, number];
}

export interface SkyValues {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

interface LightingKey {
  altDeg: number;
  values: LightingValues;
}

interface SkyKey {
  altDeg: number;
  values: SkyValues;
}

/** Sorted by altitude descending. */
const LIGHTING_KEYS: ReadonlyArray<LightingKey> = [
  { altDeg: 30, values: { sun: 1.0, ambient: 0.6, sunColor: [1.0, 0.96, 0.88] } },
  { altDeg: 10, values: { sun: 0.85, ambient: 0.55, sunColor: [1.0, 0.92, 0.78] } },
  { altDeg: 0, values: { sun: 0.4, ambient: 0.4, sunColor: [1.0, 0.72, 0.42] } },
  { altDeg: -6, values: { sun: 0.05, ambient: 0.18, sunColor: [0.45, 0.50, 0.65] } },
  { altDeg: -12, values: { sun: 0, ambient: 0.12, sunColor: [0.24, 0.29, 0.42] } },
];

const SKY_KEYS: ReadonlyArray<SkyKey> = [
  { altDeg: 30, values: { turbidity: 5, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 } },
  { altDeg: 10, values: { turbidity: 6, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82 } },
  { altDeg: 0, values: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.9 } },
  { altDeg: -6, values: { turbidity: 9, rayleigh: 1, mieCoefficient: 0.008, mieDirectionalG: 0.85 } },
  { altDeg: -12, values: { turbidity: 10, rayleigh: 0.1, mieCoefficient: 0.005, mieDirectionalG: 0.8 } },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpLighting(a: LightingValues, b: LightingValues, t: number): LightingValues {
  return {
    sun: lerp(a.sun, b.sun, t),
    ambient: lerp(a.ambient, b.ambient, t),
    sunColor: [
      lerp(a.sunColor[0], b.sunColor[0], t),
      lerp(a.sunColor[1], b.sunColor[1], t),
      lerp(a.sunColor[2], b.sunColor[2], t),
    ],
  };
}

function interpSky(a: SkyValues, b: SkyValues, t: number): SkyValues {
  return {
    turbidity: lerp(a.turbidity, b.turbidity, t),
    rayleigh: lerp(a.rayleigh, b.rayleigh, t),
    mieCoefficient: lerp(a.mieCoefficient, b.mieCoefficient, t),
    mieDirectionalG: lerp(a.mieDirectionalG, b.mieDirectionalG, t),
  };
}

/** Find adjacent keyframes for a given altitude (radians) and return
 *  (upper, lower, t) where t∈[0,1] interpolates from `lower` toward `upper`. */
function bracket<T extends { altDeg: number }>(keys: ReadonlyArray<T>, altRad: number): { upper: T; lower: T; t: number } {
  const altDeg = altRad / DEG;
  if (altDeg >= keys[0].altDeg) return { upper: keys[0], lower: keys[0], t: 0 };
  if (altDeg <= keys[keys.length - 1].altDeg) {
    const k = keys[keys.length - 1];
    return { upper: k, lower: k, t: 0 };
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const upper = keys[i];
    const lower = keys[i + 1];
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg;
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span;
      return { upper, lower, t };
    }
  }
  return { upper: keys[keys.length - 1], lower: keys[keys.length - 1], t: 0 };
}

export function lightingFromAltitude(altRad: number): LightingValues {
  const { upper, lower, t } = bracket(LIGHTING_KEYS, altRad);
  return interpLighting(lower.values, upper.values, t);
}

export function skyFromAltitude(altRad: number): SkyValues {
  const { upper, lower, t } = bracket(SKY_KEYS, altRad);
  return interpSky(lower.values, upper.values, t);
}
```

- [ ] **Step 2.4: Run tests**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts`
Expected: 9 tests passing.

- [ ] **Step 2.5: Commit**

```bash
git add src/scene/lighting/altitudeCurve.ts src/scene/lighting/altitudeCurve.test.ts
git commit -m "$(cat <<'EOF'
sun: add altitudeCurve for sun intensity, color, and sky params

lightingFromAltitude(altRad) → { sun, ambient, sunColor } and
skyFromAltitude(altRad) → { turbidity, rayleigh, mieCoefficient,
mieDirectionalG } via piecewise-linear interpolation between
altitude-keyed keyframes (30°, 10°, 0°, -6°, -12°). Replaces the
discrete day/dusk/night presets used in phase 1.

Lighting/Sky integration follows in a later task.
EOF
)"
```

---

## Task 3: `locationSlice` and store composition (TDD)

**Files:**
- Create: `src/state/slices/locationSlice.ts`
- Create: `src/state/slices/locationSlice.test.ts`
- Modify: `src/state/store.ts`
- Modify: `src/state/store.test.ts`

- [ ] **Step 3.1: Write the failing slice test**

Create `src/state/slices/locationSlice.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('locationSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('starts with location=null and locationPromptDismissed=false', () => {
    const s = useStore.getState();
    expect(s.location).toBeNull();
    expect(s.locationPromptDismissed).toBe(false);
  });

  it('setLocation stores lat/lon (label optional)', () => {
    useStore.getState().setLocation({ lat: 1.35, lon: 103.82 });
    expect(useStore.getState().location).toEqual({ lat: 1.35, lon: 103.82 });
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' });
    expect(useStore.getState().location).toEqual({ lat: 51.5, lon: 0, label: 'London, UK' });
  });

  it('dismissLocationPrompt flips the flag', () => {
    useStore.getState().dismissLocationPrompt();
    expect(useStore.getState().locationPromptDismissed).toBe(true);
  });

  it('resetLocationPrompt clears the dismissal so the prompt can reopen', () => {
    useStore.getState().dismissLocationPrompt();
    expect(useStore.getState().locationPromptDismissed).toBe(true);
    useStore.getState().resetLocationPrompt();
    expect(useStore.getState().locationPromptDismissed).toBe(false);
  });
});
```

- [ ] **Step 3.2: Verify failure**

Run: `npx vitest run src/state/slices/locationSlice.test.ts` → FAIL.

- [ ] **Step 3.3: Implement the slice**

Create `src/state/slices/locationSlice.ts`:

```ts
import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface Location {
  lat: number;
  lon: number;
  /** Optional human-readable label (e.g. "London, UK"). Populated when
   *  the location was selected via the city search; absent for direct
   *  geolocation or manual lat/lon entry. */
  label?: string;
}

export interface LocationSlice {
  location: Location | null;
  /** True once the user has explicitly skipped the prompt or denied
   *  geolocation. The prompt should not auto-open again, but the user
   *  can re-open it from the time dropdown's footer. */
  locationPromptDismissed: boolean;
  setLocation: (loc: Location) => void;
  dismissLocationPrompt: () => void;
  /** Allows the user to reopen the prompt (e.g. via a "Change location"
   *  link). Clears `locationPromptDismissed` so the modal renders again. */
  resetLocationPrompt: () => void;
}

export const LOCATION_INITIAL: Pick<LocationSlice, 'location' | 'locationPromptDismissed'> = {
  location: null,
  locationPromptDismissed: false,
};

export const createLocationSlice: SliceCreator<LocationSlice, RootState> = (set) => ({
  ...LOCATION_INITIAL,
  setLocation: (loc) => set({ location: loc }),
  dismissLocationPrompt: () => set({ locationPromptDismissed: true }),
  resetLocationPrompt: () => set({ locationPromptDismissed: false }),
});
```

- [ ] **Step 3.4: Compose into the store**

In `src/state/store.ts`, add the imports near the existing slice imports (alphabetical order doesn't matter; group near other slices):

```ts
import {
  createLocationSlice,
  LOCATION_INITIAL,
  type LocationSlice,
} from './slices/locationSlice';
```

Add `LocationSlice` to the `RootState` interface — find the `extends` list and add it (e.g. after `TimeSlice`):

```ts
export interface RootState
  extends CameraSlice,
    TimeSlice,
    LocationSlice,
    MeasurementsSlice,
    // ... rest unchanged
```

Add `...LOCATION_INITIAL,` to the `INITIAL` object (e.g. after `...TIME_INITIAL,`):

```ts
const INITIAL = {
  ...CAMERA_INITIAL,
  ...TIME_INITIAL,
  ...LOCATION_INITIAL,
  // ... rest unchanged
```

Add `...createLocationSlice(set, get, api),` to the `useStore` create call (e.g. after `...createTimeSlice(set, get, api),`):

```ts
export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createLocationSlice(set, get, api),
  // ... rest unchanged
```

Add a re-export near the existing `export type` lines:

```ts
export type { Location } from './slices/locationSlice';
```

- [ ] **Step 3.5: Update `store.test.ts`**

Append a test inside the existing `describe('store — Phase 1 slice', …)` block:

```ts
  it('starts with no location and the prompt undismissed', () => {
    const s = useStore.getState();
    expect(s.location).toBeNull();
    expect(s.locationPromptDismissed).toBe(false);
  });
```

- [ ] **Step 3.6: Run state tests**

Run: `npx vitest run src/state/`
Expected: all pass.

- [ ] **Step 3.7: Commit**

```bash
git add src/state/slices/locationSlice.ts src/state/slices/locationSlice.test.ts src/state/store.ts src/state/store.test.ts
git commit -m "$(cat <<'EOF'
location: add locationSlice with set/dismiss/reset actions

Stores { lat, lon, label? } when the user picks a location, plus a
locationPromptDismissed flag so the first-run prompt only auto-opens
once. The label is populated by the city-search path; geolocation
and manual lat/lon entry leave it undefined.

Schema persistence and the LocationPrompt UI follow in later tasks.
EOF
)"
```

---

## Task 4: Persist location in schema

**Files:**
- Modify: `src/state/schema.ts`
- Modify: `src/state/schema.test.ts`
- Modify: `src/state/storage/autosave.ts`
- Modify: `src/state/storage/LocalStorageAdapter.test.ts`

- [ ] **Step 4.1: Add failing schema tests**

In `src/state/schema.test.ts`, append inside the existing `describe('schema', …)`:

```ts
  it('round-trips a location with a label', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' });
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.location).toEqual({ lat: 51.5, lon: 0, label: 'London, UK' });
      expect(parsed.data.locationPromptDismissed).toBe(false);
    }
  });

  it('defaults missing location fields when reading legacy payloads', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.location).toBeNull();
    expect(parsed.locationPromptDismissed).toBe(false);
  });

  it('applySerialized restores location into the store patch', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setLocation({ lat: 35.68, lon: 139.69, label: 'Tokyo' });
    useStore.getState().dismissLocationPrompt();
    const out = serialize(useStore.getState());
    const patch = applySerialized(out, new Set());
    expect(patch.location).toEqual({ lat: 35.68, lon: 139.69, label: 'Tokyo' });
    expect(patch.locationPromptDismissed).toBe(true);
  });
```

- [ ] **Step 4.2: Verify failure**

Run: `npx vitest run src/state/schema.test.ts` → FAIL.

- [ ] **Step 4.3: Update the raw schema**

In `src/state/schema.ts`, find the `RawSerializedStateZ = z.object({...})` definition. Add two new fields **before the `savedAt` line** (both `.optional()` with a `.default(...)`):

```ts
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string().optional(),
    })
    .nullable()
    .optional()
    .default(null),
  locationPromptDismissed: z.boolean().optional().default(false),
```

- [ ] **Step 4.4: Update `serialize` to write the new fields**

In `src/state/schema.ts`, find the `serialize` function. Add these lines next to `cameraMode: state.cameraMode,`:

```ts
    location: state.location,
    locationPromptDismissed: state.locationPromptDismissed,
```

- [ ] **Step 4.5: Update `applySerialized` to read the new fields**

In `applySerialized`, add:

```ts
    location: state.location ?? null,
    locationPromptDismissed: state.locationPromptDismissed ?? false,
```

next to the existing returned fields.

- [ ] **Step 4.6: Update autosave persistent diff**

In `src/state/storage/autosave.ts`, add `location` and `locationPromptDismissed` to the `Persistent` type, `pickPersistent()`, and `shallowEqual`. The full updated trio:

```ts
type Persistent = {
  items: unknown;
  doors: unknown;
  finishes: unknown;
  userFurniture: unknown;
  userMaterials: unknown;
  timeMode: unknown;
  manualHour: unknown;
  cameraMode: unknown;
  location: unknown;
  locationPromptDismissed: unknown;
};

function pickPersistent(): Persistent {
  const s = useStore.getState();
  return {
    items: s.items,
    doors: s.doors,
    finishes: s.finishes,
    userFurniture: s.userFurniture,
    userMaterials: s.userMaterials,
    timeMode: s.timeMode,
    manualHour: s.manualHour,
    cameraMode: s.cameraMode,
    location: s.location,
    locationPromptDismissed: s.locationPromptDismissed,
  };
}

function shallowEqual(a: Persistent, b: Persistent): boolean {
  return (
    a.items === b.items &&
    a.doors === b.doors &&
    a.finishes === b.finishes &&
    a.userFurniture === b.userFurniture &&
    a.userMaterials === b.userMaterials &&
    a.timeMode === b.timeMode &&
    a.manualHour === b.manualHour &&
    a.cameraMode === b.cameraMode &&
    a.location === b.location &&
    a.locationPromptDismissed === b.locationPromptDismissed
  );
}
```

- [ ] **Step 4.7: Update LocalStorageAdapter test fixture**

In `src/state/storage/LocalStorageAdapter.test.ts`, find the `fakeState` helper and add the new fields:

```ts
function fakeState(savedAt: string): SerializedState {
  return {
    version: 1,
    apartmentId: 'serangoon-north-vista-4r',
    items: [],
    doors: {},
    finishes: { floor: {}, walls: {} },
    userFurniture: [],
    userMaterials: [],
    timeMode: 'system',
    manualHour: 12,
    cameraMode: 'orbit',
    location: null,
    locationPromptDismissed: false,
    savedAt,
  };
}
```

- [ ] **Step 4.8: Run all state tests**

Run: `npx vitest run src/state/`
Expected: all pass.

- [ ] **Step 4.9: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts src/state/storage/autosave.ts src/state/storage/LocalStorageAdapter.test.ts
git commit -m "$(cat <<'EOF'
location: persist user location in serialized state

Adds nullable location { lat, lon, label? } and locationPromptDismissed
to SerializedState. Both default to safe values (null / false) so older
saves that predate this commit still parse cleanly. Autosave now
re-fires when either field changes.
EOF
)"
```

---

## Task 5: Geocoding service (TDD)

**Files:**
- Create: `src/services/geocoding.ts`
- Create: `src/services/geocoding.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `src/services/geocoding.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlaces, reverseGeocode } from './geocoding';

const originalFetch = globalThis.fetch;

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('returns parsed results from Nominatim', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { display_name: 'London, Greater London, England, UK', lat: '51.5073509', lon: '-0.1277583' },
        { display_name: 'London, Ontario, Canada', lat: '42.9869502', lon: '-81.2496256' },
      ],
    } as Response);

    const results = await searchPlaces('London');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      label: 'London, Greater London, England, UK',
      lat: 51.5073509,
      lon: -0.1277583,
    });
  });

  it('rejects with an Error on non-ok responses', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response);

    await expect(searchPlaces('Tokyo')).rejects.toThrow(/429/);
  });

  it('returns an empty array for queries shorter than 2 characters', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const results = await searchPlaces('a');
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes the User-Agent header per Nominatim policy', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    await searchPlaces('Paris');
    const call = mockFetch.mock.calls[0];
    const init = call[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/sofa-so-good/);
  });
});

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the display_name for a coordinate', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ display_name: 'Singapore, Central, Singapore' }),
    } as Response);
    const label = await reverseGeocode(1.35, 103.82);
    expect(label).toBe('Singapore, Central, Singapore');
  });

  it('returns null when Nominatim has no result', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    } as Response);
    const label = await reverseGeocode(0, 0);
    expect(label).toBeNull();
  });

  it('returns null on network errors instead of throwing', async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const label = await reverseGeocode(1.35, 103.82);
    expect(label).toBeNull();
  });
});
```

- [ ] **Step 5.2: Verify failure**

Run: `npx vitest run src/services/geocoding.test.ts` → FAIL.

- [ ] **Step 5.3: Implement the service**

Create `src/services/geocoding.ts`:

```ts
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'sofa-so-good/0.0.0 (https://github.com/cwlroda/sofa-so-good)';

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface NominatimReverseResult {
  display_name?: string;
  error?: string;
}

/** Search for a place by free-text query. Returns up to 5 results.
 *  Empty / very short queries (<2 chars) return [] without hitting the
 *  network. Throws on non-ok HTTP responses (caller renders an error). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '5');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Nominatim search failed: ${res.status} ${res.statusText ?? ''}`.trim());
  }
  const data = (await res.json()) as NominatimSearchResult[];
  return data.map((r) => ({
    label: r.display_name,
    lat: Number.parseFloat(r.lat),
    lon: Number.parseFloat(r.lon),
  }));
}

/** Reverse-geocode a coordinate. Returns the display_name or null when
 *  Nominatim has no result or the request fails. Never throws — callers
 *  treat null as "no label available". */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('zoom', '10');
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimReverseResult;
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5.4: Run tests**

Run: `npx vitest run src/services/geocoding.test.ts`
Expected: 7 tests passing.

- [ ] **Step 5.5: Commit**

```bash
git add src/services/geocoding.ts src/services/geocoding.test.ts
git commit -m "$(cat <<'EOF'
geocoding: add Nominatim wrapper for place search and reverse lookup

searchPlaces(q) returns up to 5 { label, lat, lon } results. Throws
on HTTP errors so the prompt UI can surface the failure. Queries
shorter than 2 chars short-circuit to [] without hitting the network.

reverseGeocode(lat, lon) returns a display_name or null; never throws
(callers fall back to plain coordinates).

Both functions send a User-Agent header per Nominatim's terms.
EOF
)"
```

---

## Task 6: `LocationPrompt` modal component

**Files:**
- Create: `src/ui/LocationPrompt.tsx`
- Create: `src/ui/LocationPrompt.test.tsx`

- [ ] **Step 6.1: Write the failing component test**

Create `src/ui/LocationPrompt.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocationPrompt } from './LocationPrompt';
import { useStore } from '../state/store';

vi.mock('../services/geocoding', () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { searchPlaces, reverseGeocode } from '../services/geocoding';

const mockSearchPlaces = vi.mocked(searchPlaces);
const mockReverseGeocode = vi.mocked(reverseGeocode);

describe('LocationPrompt', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest();
    mockSearchPlaces.mockReset();
    mockReverseGeocode.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render once a location is set', () => {
    useStore.getState().setLocation({ lat: 1.35, lon: 103.82 });
    const { container } = render(<LocationPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render once the prompt is dismissed', () => {
    useStore.getState().dismissLocationPrompt();
    const { container } = render(<LocationPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when location is null and prompt is not dismissed', () => {
    render(<LocationPrompt />);
    expect(screen.getByText(/use my location/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument();
    expect(screen.getByText(/skip/i)).toBeInTheDocument();
  });

  it('clicking Skip dismisses the prompt', () => {
    render(<LocationPrompt />);
    fireEvent.click(screen.getByText(/skip/i));
    expect(useStore.getState().locationPromptDismissed).toBe(true);
    expect(useStore.getState().location).toBeNull();
  });

  it('manual lat/lon submit stores the location', () => {
    render(<LocationPrompt />);
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '51.5' } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText(/save coordinates/i));
    expect(useStore.getState().location).toEqual({ lat: 51.5, lon: 0 });
  });

  it('rejects out-of-range manual lat/lon', () => {
    render(<LocationPrompt />);
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText(/save coordinates/i));
    expect(useStore.getState().location).toBeNull();
    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument();
  });

  it('city search shows Nominatim results and stores the picked one', async () => {
    mockSearchPlaces.mockResolvedValueOnce([
      { label: 'London, UK', lat: 51.5, lon: -0.13 },
      { label: 'London, Ontario', lat: 42.99, lon: -81.25 },
    ]);
    vi.useFakeTimers();
    render(<LocationPrompt />);
    fireEvent.change(screen.getByPlaceholderText(/search city/i), {
      target: { value: 'London' },
    });
    // Advance debounce timer.
    vi.advanceTimersByTime(400);
    await vi.waitFor(() => expect(mockSearchPlaces).toHaveBeenCalledWith('London'));
    vi.useRealTimers();

    const result = await screen.findByText(/London, UK/i);
    fireEvent.click(result);
    expect(useStore.getState().location).toEqual({
      lat: 51.5,
      lon: -0.13,
      label: 'London, UK',
    });
  });

  it('uses geolocation API when "Use my location" is clicked', async () => {
    const mockGetCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        _err?: PositionErrorCallback | null,
      ) => {
        success({
          coords: {
            latitude: 1.35,
            longitude: 103.82,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition);
      },
    );
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    });
    mockReverseGeocode.mockResolvedValueOnce('Singapore');

    render(<LocationPrompt />);
    fireEvent.click(screen.getByText(/use my location/i));
    await waitFor(() => {
      expect(useStore.getState().location).toEqual({
        lat: 1.35,
        lon: 103.82,
        label: 'Singapore',
      });
    });
  });

  it('falls back gracefully when geolocation is denied', async () => {
    const mockGetCurrentPosition = vi.fn(
      (
        _success: PositionCallback,
        err?: PositionErrorCallback | null,
      ) => {
        err?.({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    );
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    });

    render(<LocationPrompt />);
    fireEvent.click(screen.getByText(/use my location/i));
    await screen.findByText(/couldn't get your location/i);
    expect(useStore.getState().location).toBeNull();
  });
});
```

- [ ] **Step 6.2: Run to verify failure**

Run: `npx vitest run src/ui/LocationPrompt.test.tsx` → FAIL (module not found).

- [ ] **Step 6.3: Implement the modal**

Create `src/ui/LocationPrompt.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { searchPlaces, reverseGeocode, type Place } from '../services/geocoding';

const SEARCH_DEBOUNCE_MS = 300;

export function LocationPrompt() {
  const location = useStore((s) => s.location);
  const dismissed = useStore((s) => s.locationPromptDismissed);
  const setLocation = useStore((s) => s.setLocation);
  const dismiss = useStore((s) => s.dismissLocationPrompt);

  if (location !== null || dismissed) return null;

  return <LocationPromptContent onSetLocation={setLocation} onDismiss={dismiss} />;
}

interface ContentProps {
  onSetLocation: (loc: { lat: number; lon: number; label?: string }) => void;
  onDismiss: () => void;
}

function LocationPromptContent({ onSetLocation, onDismiss }: ContentProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [latStr, setLatStr] = useState('');
  const [lonStr, setLonStr] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced city search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await searchPlaces(search);
        setResults(r);
      } catch (e) {
        setSearchError((e as Error).message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const onUseGeolocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError("Your browser doesn't expose geolocation.");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const label = await reverseGeocode(lat, lon);
        onSetLocation(label ? { lat, lon, label } : { lat, lon });
        setGeoBusy(false);
      },
      () => {
        setGeoError("Couldn't get your location. Search by city or enter coordinates instead.");
        setGeoBusy(false);
      },
    );
  };

  const onSubmitManual = () => {
    const lat = Number.parseFloat(latStr);
    const lon = Number.parseFloat(lonStr);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setManualError('Longitude must be between -180 and 180.');
      return;
    }
    setManualError(null);
    onSetLocation({ lat, lon });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-5 text-sm shadow-lg">
        <h2 className="mb-1 text-base font-semibold">Where are you?</h2>
        <p className="mb-4 text-xs text-neutral-600">
          We use your location to position the sun realistically. The app stores
          this only on your device.
        </p>

        <div className="mb-4 space-y-2">
          <button
            disabled={geoBusy}
            onClick={onUseGeolocation}
            className="w-full rounded bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {geoBusy ? 'Locating…' : 'Use my location'}
          </button>
          {geoError ? <p className="text-xs text-rose-600">{geoError}</p> : null}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Search city
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city, town, or neighbourhood"
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
          {searching ? <p className="mt-1 text-xs text-neutral-500">Searching…</p> : null}
          {searchError ? <p className="mt-1 text-xs text-rose-600">{searchError}</p> : null}
          {results.length > 0 ? (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-neutral-200 bg-white text-xs">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    onClick={() =>
                      onSetLocation({ lat: r.lat, lon: r.lon, label: r.label })
                    }
                    className="block w-full px-2 py-1 text-left hover:bg-neutral-100"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-neutral-700">
            Latitude
            <input
              type="number"
              step="0.0001"
              value={latStr}
              onChange={(e) => setLatStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Longitude
            <input
              type="number"
              step="0.0001"
              value={lonStr}
              onChange={(e) => setLonStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <button
            onClick={onSubmitManual}
            className="col-span-2 rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
          >
            Save coordinates
          </button>
          {manualError ? (
            <p className="col-span-2 text-xs text-rose-600">{manualError}</p>
          ) : null}
        </div>

        <button
          onClick={onDismiss}
          className="mx-auto block text-xs text-neutral-500 underline hover:text-neutral-700"
        >
          Skip — use default location
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: Run tests**

Run: `npx vitest run src/ui/LocationPrompt.test.tsx`
Expected: 9 tests passing. If the geolocation test flakes due to happy-dom not exposing `navigator.geolocation` by default, the `Object.defineProperty` setup in the test handles it.

- [ ] **Step 6.5: Commit**

```bash
git add src/ui/LocationPrompt.tsx src/ui/LocationPrompt.test.tsx
git commit -m "$(cat <<'EOF'
location: add LocationPrompt modal

First-run modal that appears when location is null and the prompt
hasn't been dismissed. Three paths to set a location: browser
geolocation (with reverse-geocoded label), city search via
Nominatim (debounced 300ms), or manual lat/lon entry. Skip closes
the modal and sets locationPromptDismissed so it stops auto-opening.
EOF
)"
```

---

## Task 7: Effective-location helper + `useSunPosition` hook

**Files:**
- Create: `src/scene/lighting/useSunPosition.ts`
- Create: `src/scene/lighting/useSunPosition.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `src/scene/lighting/useSunPosition.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSunPosition, FALLBACK_LOCATION } from './useSunPosition';
import { useStore } from '../../state/store';

describe('FALLBACK_LOCATION', () => {
  it('is Singapore', () => {
    expect(FALLBACK_LOCATION).toEqual({ lat: 1.35, lon: 103.82 });
  });
});

describe('useSunPosition', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T04:00:00.000Z')); // 12:00 SGT
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a SunPosition derived from the fallback when no user location', () => {
    const { result } = renderHook(() => useSunPosition());
    expect(typeof result.current.altitude).toBe('number');
    // Singapore at noon — sun should be high.
    expect(result.current.altitude).toBeGreaterThan(0.8); // > ~46°
  });

  it('uses the user location when set', () => {
    useStore.getState().setLocation({ lat: 51.5, lon: 0 });
    useStore.getState().setManualHour(12); // forces manual mode at noon
    const { result } = renderHook(() => useSunPosition());
    // London at "noon" on May 1: altitude ~57° → < Singapore noon.
    expect(result.current.altitude).toBeLessThan(1.2); // < ~69°
  });

  it('updates when manualHour changes', () => {
    useStore.getState().setManualHour(0); // midnight
    const { result } = renderHook(() => useSunPosition());
    const midnight = result.current.altitude;
    act(() => useStore.getState().setManualHour(12));
    const noon = result.current.altitude;
    expect(midnight).toBeLessThan(0);
    expect(noon).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7.2: Verify failure**

Run: `npx vitest run src/scene/lighting/useSunPosition.test.ts` → FAIL.

- [ ] **Step 7.3: Implement the hook**

Create `src/scene/lighting/useSunPosition.ts`:

```ts
import { useStore } from '../../state/store';
import { useEffectiveHour } from './useEffectiveHour';
import { computeSun, hoursToDate, type SunPosition } from './sunPosition';

/** Used when the user hasn't set a location and the prompt was skipped. */
export const FALLBACK_LOCATION = { lat: 1.35, lon: 103.82 } as const;

/** Resolve the "effective" sun position from the current effective
 *  hour and the user's location (or the Singapore fallback). Re-runs
 *  every render of its caller — the underlying `useEffectiveHour`
 *  controls cadence (60s in system mode; on demand in manual). */
export function useSunPosition(): SunPosition {
  const hour = useEffectiveHour();
  const location = useStore((s) => s.location) ?? FALLBACK_LOCATION;
  const date = hoursToDate(hour);
  return computeSun(date, location.lat, location.lon);
}
```

- [ ] **Step 7.4: Run tests**

Run: `npx vitest run src/scene/lighting/useSunPosition.test.ts`
Expected: 4 tests passing.

- [ ] **Step 7.5: Commit**

```bash
git add src/scene/lighting/useSunPosition.ts src/scene/lighting/useSunPosition.test.ts
git commit -m "$(cat <<'EOF'
sun: add useSunPosition hook

Combines useEffectiveHour and the user's location (with Singapore
fallback when no location is set) into a SunPosition that downstream
Lighting/Sky components can consume directly. Cadence is governed by
useEffectiveHour: 60s ticks in system mode, immediate updates in
manual mode.
EOF
)"
```

---

## Task 8: Rewrite `Lighting.tsx` to use sun position + altitude curve

**Files:**
- Modify: `src/scene/lighting/Lighting.tsx`

- [ ] **Step 8.1: Replace the file**

Open `src/scene/lighting/Lighting.tsx`. Replace the **entire file** with:

```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight } from 'three';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene } from './sunPosition';
import { lightingFromAltitude } from './altitudeCurve';

/** Distance from origin where the directional light sits (metres). */
const SUN_DISTANCE = 25;
const TWEEN_DURATION = 0.6;

interface Vals {
  sun: number;
  ambient: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
}

// Clockwise around Y when viewed from above, matching compass bearings
// (N=0° → E=90° → S=180° → W=270°). Same convention as Sky.tsx.
function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = pos;
  return [x * c - z * s, y, x * s + z * c];
}

function targetVals(
  sunPos: SunDirAndAlt,
  orientation: number,
): Vals {
  const lighting = lightingFromAltitude(sunPos.altitude);
  const dir = sunDirectionToScene({ azimuth: sunPos.azimuth, altitude: sunPos.altitude });
  const scaled: [number, number, number] = [
    dir[0] * SUN_DISTANCE,
    dir[1] * SUN_DISTANCE,
    dir[2] * SUN_DISTANCE,
  ];
  return {
    sun: lighting.sun,
    ambient: lighting.ambient,
    sunPos: rotateY(scaled, orientation),
    sunColor: lighting.sunColor,
  };
}

interface SunDirAndAlt {
  azimuth: number;
  altitude: number;
}

export function Lighting() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const initial = targetVals(sunPos, orientation);
  const current = useRef<Vals>({
    sun: initial.sun,
    ambient: initial.ambient,
    sunPos: [...initial.sunPos] as [number, number, number],
    sunColor: [...initial.sunColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = targetVals(sunPos, orientation);
    const cur = current.current;
    const dSun = target.sun - cur.sun;
    const dAmb = target.ambient - cur.ambient;
    const dPx = target.sunPos[0] - cur.sunPos[0];
    const dPy = target.sunPos[1] - cur.sunPos[1];
    const dPz = target.sunPos[2] - cur.sunPos[2];
    const dCr = target.sunColor[0] - cur.sunColor[0];
    const dCg = target.sunColor[1] - cur.sunColor[1];
    const dCb = target.sunColor[2] - cur.sunColor[2];
    const settled =
      Math.abs(dSun) < 1e-3 &&
      Math.abs(dAmb) < 1e-3 &&
      Math.abs(dPx) < 1e-2 &&
      Math.abs(dPy) < 1e-2 &&
      Math.abs(dPz) < 1e-2 &&
      Math.abs(dCr) < 1e-3 &&
      Math.abs(dCg) < 1e-3 &&
      Math.abs(dCb) < 1e-3;

    if (settled) return;

    const k = Math.min(1, dt / TWEEN_DURATION);
    cur.sun += dSun * k;
    cur.ambient += dAmb * k;
    cur.sunPos[0] += dPx * k;
    cur.sunPos[1] += dPy * k;
    cur.sunPos[2] += dPz * k;
    cur.sunColor[0] += dCr * k;
    cur.sunColor[1] += dCg * k;
    cur.sunColor[2] += dCb * k;

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient;
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  );
}
```

- [ ] **Step 8.2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors. (`Sky.tsx` will still import the deleted `hourToPreset` until task 9.)

If `tsc` reports errors in `Sky.tsx` that are about `hourToPreset` not existing — that's expected only after task 10. At this point `hourToPreset.ts` still exists.

- [ ] **Step 8.3: Commit**

```bash
git add src/scene/lighting/Lighting.tsx
git commit -m "$(cat <<'EOF'
sun: drive Lighting from astronomical sun position + altitude curve

Lighting.tsx no longer reads a discrete day/dusk/night preset. It now
samples the sun's astronomical position via useSunPosition, converts
to a scene-space direction at SUN_DISTANCE = 25m, and reads
intensity/ambient/color from lightingFromAltitude. The existing
tween-toward-target loop continues to chase the (slowly moving)
target each frame.
EOF
)"
```

---

## Task 9: Rewrite `Sky.tsx` to use sun position + sky curve

**Files:**
- Modify: `src/scene/lighting/Sky.tsx`

- [ ] **Step 9.1: Replace the file**

Replace the entire contents of `src/scene/lighting/Sky.tsx` with:

```tsx
import { Sky as DreiSky } from '@react-three/drei';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene } from './sunPosition';
import { skyFromAltitude } from './altitudeCurve';

/** Sky sun-position is rendered far away so DreiSky's shader places
 *  the disc near the horizon plane. */
const SKY_SUN_DISTANCE = 1000;

// Clockwise around Y when viewed from above, matching compass bearings.
// Same convention as Lighting.tsx.
function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = pos;
  return [x * c - z * s, y, x * s + z * c];
}

export function Sky() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const dir = sunDirectionToScene(sunPos);
  const scaled: [number, number, number] = [
    dir[0] * SKY_SUN_DISTANCE,
    dir[1] * SKY_SUN_DISTANCE,
    dir[2] * SKY_SUN_DISTANCE,
  ];
  const sunPosition = rotateY(scaled, orientation);
  const sky = skyFromAltitude(sunPos.altitude);
  return (
    <DreiSky
      sunPosition={sunPosition}
      turbidity={sky.turbidity}
      rayleigh={sky.rayleigh}
      mieCoefficient={sky.mieCoefficient}
      mieDirectionalG={sky.mieDirectionalG}
    />
  );
}
```

- [ ] **Step 9.2: Run typecheck and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 type errors. The hook + curve tests should pass; lighting + sky have no direct tests but should typecheck.

- [ ] **Step 9.3: Commit**

```bash
git add src/scene/lighting/Sky.tsx
git commit -m "$(cat <<'EOF'
sun: drive Sky from astronomical sun position + sky curve

Sky.tsx now reads sky parameters from skyFromAltitude and positions
the DreiSky sun disc using the same scene-space direction as
Lighting.tsx, scaled to SKY_SUN_DISTANCE = 1000m so the shader places
the disc on the horizon plane.
EOF
)"
```

---

## Task 10: Wire `LocationPrompt` into App + add reopen link in TimeDropdown

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/Toolbar.tsx`

- [ ] **Step 10.1: Mount the prompt**

In `src/App.tsx`, find the JSX block where `Toolbar`, `HelpHint`, and other UI overlays are rendered (search for `<Toolbar` or `<HelpHint`). Add an import at the top:

```ts
import { LocationPrompt } from './ui/LocationPrompt';
```

And mount the prompt anywhere inside the top-level UI overlay container (e.g. directly above `<HelpHint />`):

```tsx
        <LocationPrompt />
```

- [ ] **Step 10.2: Add a "Location" footer row to TimeDropdown**

In `src/ui/Toolbar.tsx`, find the `TimeDropdown` component. Just inside the open dropdown JSX, after the Custom row, add a divider + footer row that lets the user reopen the location prompt:

Find the closing `</div>` that ends the open dropdown content (after the Custom row). Just before it, insert:

```tsx
          <Separator />
          <LocationFooter />
```

Then add the `LocationFooter` helper next to the existing `DropdownRow` / `Separator` helpers:

```tsx
function LocationFooter() {
  const location = useStore((s) => s.location);
  const resetLocationPrompt = useStore((s) => s.resetLocationPrompt);
  const setLocation = useStore((s) => s.setLocation);

  const label = location
    ? location.label ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`
    : 'Default (Singapore)';

  const onClick = () => {
    // Setting location to null re-shows the prompt; reset the dismissed
    // flag so it auto-opens again.
    resetLocationPrompt();
    setLocation as unknown as never; // keep TS happy if unused
  };

  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-neutral-500 hover:bg-neutral-100"
      title="Change location"
    >
      Location: <span className="text-neutral-700">{label}</span>
    </button>
  );
}
```

Actually, replace the `LocationFooter` body with this cleaner implementation (the helper above had a dead-code line):

```tsx
function LocationFooter() {
  const location = useStore((s) => s.location);
  const resetLocationPrompt = useStore((s) => s.resetLocationPrompt);
  const clearLocation = useStore.setState;

  const label = location
    ? location.label ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`
    : 'Default (Singapore)';

  const onClick = () => {
    // Re-show the prompt: clear the user's location and the dismissed flag.
    clearLocation({ location: null });
    resetLocationPrompt();
  };

  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-neutral-500 hover:bg-neutral-100"
      title="Change location"
    >
      Location: <span className="text-neutral-700">{label}</span>
    </button>
  );
}
```

- [ ] **Step 10.3: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors, all tests pass.

- [ ] **Step 10.4: Commit**

```bash
git add src/App.tsx src/ui/Toolbar.tsx
git commit -m "$(cat <<'EOF'
location: mount LocationPrompt + add Location footer in TimeDropdown

App.tsx now renders <LocationPrompt /> alongside other overlays so the
modal auto-opens on first run. The TimeDropdown gets a "Location:
<label>" footer row that, when clicked, clears both the stored
location and the dismissed flag so the prompt reopens — letting users
switch cities without finding a hidden settings page.
EOF
)"
```

---

## Task 11: Delete the phase-1 shim

**Files:**
- Delete: `src/scene/lighting/hourToPreset.ts`
- Delete: `src/scene/lighting/hourToPreset.test.ts`

- [ ] **Step 11.1: Verify no remaining references**

Run: `grep -rn "hourToPreset\|LegacyTimeKey" src/ scripts/ 2>/dev/null`
Expected: zero matches outside of `src/scene/lighting/hourToPreset.ts` and its test. If matches appear elsewhere, fix those imports first (likely missed in tasks 8/9).

- [ ] **Step 11.2: Delete the files**

Run:

```bash
rm src/scene/lighting/hourToPreset.ts src/scene/lighting/hourToPreset.test.ts
```

- [ ] **Step 11.3: Run all tests + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 11.4: Commit**

```bash
git add -A src/scene/lighting/hourToPreset.ts src/scene/lighting/hourToPreset.test.ts
git commit -m "$(cat <<'EOF'
sun: remove phase-1 hour→preset shim

hourToPreset.ts was a temporary expedient so phase 1 could ship
without changing Lighting/Sky visuals. Phase 2 replaces it with
astronomy-driven values, so the shim is no longer used.
EOF
)"
```

---

## Task 12: Final verification + TODO update

- [ ] **Step 12.1: Full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 12.2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 12.3: Manual smoke (when a human is available)**

Run `npm run dev`. Check:

1. On a fresh browser profile (or after clearing localStorage), the LocationPrompt modal appears on first load.
2. Clicking "Use my location" prompts the browser geolocation dialog (deny it to test the fallback path).
3. Typing "Singapore" in the city search shows results within ~500ms; clicking one closes the prompt and persists the choice.
4. Lighting/Sky visibly track the sun arc — set the time via the toolbar dropdown to 06:00 (low-east), 12:00 (high-overhead), 18:00 (low-west). The sun should move across the sky in the right direction for the configured location.
5. The TimeDropdown's "Location: <city>" footer reopens the prompt.
6. Reload the page → location and time mode both persist.

- [ ] **Step 12.4: Update TODO.md**

In `TODO.md`, find the "Time of Day" section and mark phase 2 done by prefixing with `~~`:

```md
- ~~**Time-of-day rework — Phase 2 (astronomy + geocoding)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase2-astronomy.md](docs/superpowers/plans/2026-05-01-time-of-day-phase2-astronomy.md). SunCalc-driven sun position, location prompt with geolocation/Nominatim/manual entry, altitude-driven lighting and sky.
```

(Keep the phase 3–5 bullets unchanged.)

- [ ] **Step 12.5: Commit**

```bash
git add TODO.md
git commit -m "$(cat <<'EOF'
docs: mark time-of-day phase 2 complete in TODO.md

Phase 2 (astronomical sun position + Nominatim-backed location prompt
+ altitude-driven lighting/sky curves) is implemented. Phases 3–5
still pending.
EOF
)"
```

---

## Spec coverage check

| Spec §2 requirement                                         | Task |
|-------------------------------------------------------------|------|
| `LocationSlice` with `setLocation`/`dismissLocationPrompt`  | 3    |
| Optional `label` field on `Location`                        | 3    |
| First-run modal `LocationPrompt`                            | 6    |
| Geolocation path (`getCurrentPosition` + reverseGeocode)    | 6    |
| City-search path (debounced 300ms, Nominatim `/search`)     | 5, 6 |
| Manual lat/lon path with range validation                   | 6    |
| Skip path setting `locationPromptDismissed`                 | 6    |
| `User-Agent: sofa-so-good/...` header on Nominatim          | 5    |
| Reverse geocode for the geolocation path                    | 5, 6 |
| `searchPlaces` rejects on HTTP errors                       | 5    |
| `reverseGeocode` returns null on network errors             | 5    |
| `computeSun(date, lat, lon) → { azimuth, altitude }` (radians) | 1 |
| `sunDirectionToScene` mapping per scene axis convention     | 1    |
| Singapore fallback when no user location                    | 7    |
| Lighting/Sky read from astronomical position + altitude     | 8, 9 |
| Altitude → intensity/color curve table from spec §2         | 2    |
| Altitude → sky params table                                 | 2    |
| Footer "Location" link in TimeDropdown                      | 10   |
| Persistence of location + dismissed flag                    | 4    |
| Migration: legacy payloads default to null/false            | 4    |
| Removal of phase-1 hour→preset shim                         | 11   |

No §2 requirement is unimplemented.
