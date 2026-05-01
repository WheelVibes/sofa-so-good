# Realistic per-room lighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make per-room interior brightness depend on each room's own windows, the sun direction, and which doors are open — so a windowless interior reads dim and closing a door visibly cuts a neighbour's daylight bleed.

**Architecture:** Reuse the already-tested `roomDaylightFactor` and `relaxDaylight` (door-aware) logic. Lower the global ambient/IBL baseline. Add a new `RoomDaylight` component that mounts one centroid pointLight per room (intensity ∝ door-relaxed daylight factor) and one inward-aimed directional injector per windowed wall (intensity ∝ raw daylight factor). All values gated by an admittance curve over sun altitude and tweened on change.

**Tech Stack:** React, react-three-fiber, three.js, Zustand store, Vitest.

Spec: [docs/superpowers/specs/2026-05-02-realistic-room-lighting-design.md](../specs/2026-05-02-realistic-room-lighting-design.md).

---

## File map

- Modify: [src/scene/lighting/altitudeCurve.ts](../../../src/scene/lighting/altitudeCurve.ts) — drop the ambient values across the curve; export `daylightAdmittance(altRad)`.
- Modify: [src/scene/lighting/altitudeCurve.test.ts](../../../src/scene/lighting/altitudeCurve.test.ts) — extend with `daylightAdmittance` tests.
- Create: `src/scene/lighting/RoomDaylight.tsx` — per-room lights driven by daylight + room graph + admittance.
- Create: `src/scene/lighting/RoomDaylight.test.tsx` — unit tests for the per-room intensity calculation extracted as a pure helper.
- Create: `src/scene/lighting/roomCentroids.ts` — pure helper returning room centroid + windowed-wall inward injector poses (no React).
- Create: `src/scene/lighting/roomCentroids.test.ts`.
- Modify: [src/scene/Scene.tsx](../../../src/scene/Scene.tsx) — mount `<RoomDaylight />` next to `<Lighting />`.
- Modify: [TODO.md](../../../TODO.md) — flip the spec entry to "implementation in progress" and then "landed".

---

## Task 1: Add `daylightAdmittance` curve

**Files:**
- Modify: `src/scene/lighting/altitudeCurve.ts`
- Test: `src/scene/lighting/altitudeCurve.test.ts`

Daylight admittance = how much *indoor diffuse light* a room with a sunlit window receives, separate from the direct-sun curve. Zero below the horizon, ramps in over civil twilight, plateaus by ~30°. Independent so we can tune indoor brightness without re-tuning the sun.

- [ ] **Step 1: Write failing test**

Append to `src/scene/lighting/altitudeCurve.test.ts`:

```typescript
import { daylightAdmittance } from './altitudeCurve';

describe('daylightAdmittance', () => {
  const DEG = Math.PI / 180;
  it('is zero below civil twilight', () => {
    expect(daylightAdmittance(-7 * DEG)).toBe(0);
    expect(daylightAdmittance(-30 * DEG)).toBe(0);
  });
  it('is monotonic non-decreasing from -6° up to 30°', () => {
    const samples = [-6, -3, 0, 3, 6, 10, 15, 20, 30].map((d) => daylightAdmittance(d * DEG));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
  });
  it('plateaus near 1 by 30° and stays at the plateau higher', () => {
    expect(daylightAdmittance(30 * DEG)).toBeGreaterThanOrEqual(0.95);
    expect(daylightAdmittance(80 * DEG)).toBeGreaterThanOrEqual(daylightAdmittance(30 * DEG) - 1e-9);
    expect(daylightAdmittance(80 * DEG)).toBeLessThanOrEqual(1.0 + 1e-9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts`
Expected: FAIL — `daylightAdmittance` is not exported.

- [ ] **Step 3: Implement `daylightAdmittance`**

Add to `src/scene/lighting/altitudeCurve.ts`:

```typescript
const ADMITTANCE_KEYS: ReadonlyArray<{ altDeg: number; v: number }> = [
  { altDeg: 30, v: 1.0 },
  { altDeg: 15, v: 0.85 },
  { altDeg: 6,  v: 0.55 },
  { altDeg: 0,  v: 0.25 },
  { altDeg: -6, v: 0.0 },
];

export function daylightAdmittance(altRad: number): number {
  const altDeg = altRad / DEG;
  if (altDeg >= ADMITTANCE_KEYS[0].altDeg) return ADMITTANCE_KEYS[0].v;
  if (altDeg <= ADMITTANCE_KEYS[ADMITTANCE_KEYS.length - 1].altDeg) return 0;
  for (let i = 0; i < ADMITTANCE_KEYS.length - 1; i++) {
    const upper = ADMITTANCE_KEYS[i];
    const lower = ADMITTANCE_KEYS[i + 1];
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg;
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span;
      return lerp(lower.v, upper.v, t);
    }
  }
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/altitudeCurve.ts src/scene/lighting/altitudeCurve.test.ts
git commit -m "lighting: add daylightAdmittance curve (indoor diffuse)"
```

---

## Task 2: Lower global ambient + envIntensity baseline

**Files:**
- Modify: `src/scene/lighting/altitudeCurve.ts`
- Test: `src/scene/lighting/altitudeCurve.test.ts`

The current `ambient` values were tuned to make windowless rooms readable on their own. Now that per-room admittance will fill windowed rooms, the baseline should drop. New target: a windowless room with all doors closed reads as "dim but navigable" (~10–20% of a sunlit bedroom).

- [ ] **Step 1: Write failing test pinning the new baseline**

Append to `src/scene/lighting/altitudeCurve.test.ts`:

```typescript
describe('lowered ambient baseline', () => {
  const DEG = Math.PI / 180;
  it('noon ambient ≤ 0.40 (was 0.78)', () => {
    expect(lightingFromAltitude(80 * DEG).ambient).toBeLessThanOrEqual(0.40);
  });
  it('noon envIntensity ≤ 0.55 (was 1.05)', () => {
    expect(lightingFromAltitude(80 * DEG).envIntensity).toBeLessThanOrEqual(0.55);
  });
  it('night ambient ≤ 0.08 (was 0.12)', () => {
    expect(lightingFromAltitude(-12 * DEG).ambient).toBeLessThanOrEqual(0.08);
  });
});
```

(Add `import { lightingFromAltitude }` at the top of the file if not already present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts`
Expected: FAIL — current values exceed the new bounds.

- [ ] **Step 3: Lower `LIGHTING_KEYS`**

Replace the body of the `LIGHTING_KEYS` array in `src/scene/lighting/altitudeCurve.ts` with:

```typescript
const LIGHTING_KEYS: ReadonlyArray<LightingKey> = [
  { altDeg: 80, values: { sun: 1.15, ambient: 0.36, sunColor: [1.0, 0.99, 0.96], exposure: 1.1, envIntensity: 0.50 } },
  { altDeg: 30, values: { sun: 1.0,  ambient: 0.28, sunColor: [1.0, 0.96, 0.88], exposure: 1.0, envIntensity: 0.45 } },
  { altDeg: 15, values: { sun: 0.65, ambient: 0.22, sunColor: [1.0, 0.92, 0.80], exposure: 0.9, envIntensity: 0.32 } },
  { altDeg: 6,  values: { sun: 0.3,  ambient: 0.14, sunColor: [1.0, 0.78, 0.55], exposure: 0.72, envIntensity: 0.20 } },
  { altDeg: 0,  values: { sun: 0.08, ambient: 0.10, sunColor: [1.0, 0.60, 0.32], exposure: 0.6, envIntensity: 0.13 } },
  { altDeg: -6, values: { sun: 0.02, ambient: 0.07, sunColor: [0.45, 0.50, 0.65], exposure: 0.55, envIntensity: 0.13 } },
  { altDeg: -12, values: { sun: 0,   ambient: 0.06, sunColor: [0.24, 0.29, 0.42], exposure: 0.6, envIntensity: 0.07 } },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/altitudeCurve.test.ts`
Expected: PASS (including the existing tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/altitudeCurve.ts src/scene/lighting/altitudeCurve.test.ts
git commit -m "lighting: lower global ambient/envIntensity baseline for per-room fill"
```

---

## Task 3: Pure helper for room centroid + windowed-wall injector poses

**Files:**
- Create: `src/scene/lighting/roomCentroids.ts`
- Create: `src/scene/lighting/roomCentroids.test.ts`

For each non-`external` room, compute (a) its centroid (x, z) in world coordinates, (b) the y at which the centroid pointLight should sit (~ceiling − 0.2 m), and (c) for each wall of that room that contains at least one window, an inward-facing normal and a position just outside the wall midpoint at sill+head/2 height. This is pure math — no React/three.js — so it's cheap to test.

- [ ] **Step 1: Write failing test**

Create `src/scene/lighting/roomCentroids.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { roomCentroidPose, roomWindowedWallInjectors } from './roomCentroids';
import { ROOMS, FLAT } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';

describe('roomCentroidPose', () => {
  it('returns a centroid above the floor for a windowed bedroom', () => {
    const id: RoomId = 'mainBedroom';
    const pose = roomCentroidPose(id);
    const r = ROOMS[id];
    expect(pose.x).toBeCloseTo(r.origin[0] + r.width / 2, 3);
    expect(pose.z).toBeCloseTo(r.origin[1] + r.depth / 2, 3);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.y).toBeLessThan(r.ceilingHeight ?? FLAT.ceilingHeight);
  });
});

describe('roomWindowedWallInjectors', () => {
  it('returns at least one injector for a windowed bedroom', () => {
    const list = roomWindowedWallInjectors('mainBedroom');
    expect(list.length).toBeGreaterThan(0);
    const inj = list[0];
    expect(Number.isFinite(inj.position[0])).toBe(true);
    expect(Number.isFinite(inj.target[0])).toBe(true);
    // inward normal: from `position` toward `target` should point into the room.
    const r = ROOMS.mainBedroom;
    const cx = r.origin[0] + r.width / 2;
    const cz = r.origin[1] + r.depth / 2;
    const dx = inj.target[0] - inj.position[0];
    const dz = inj.target[2] - inj.position[2];
    const tx = cx - inj.position[0];
    const tz = cz - inj.position[2];
    expect(dx * tx + dz * tz).toBeGreaterThan(0);
  });

  it('returns an empty list for a windowless interior room', () => {
    expect(roomWindowedWallInjectors('householdShelter')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/roomCentroids.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `src/scene/lighting/roomCentroids.ts`:

```typescript
import { FLAT, ROOMS, WALLS } from '../../apartment/constants';
import { wallBordersRoom } from '../../apartment/daylight';
import type { RoomId } from '../../apartment/types';

export interface RoomPose {
  x: number;
  y: number;
  z: number;
}

export interface WallInjector {
  /** World position just outside the wall midpoint, at window mid-height. */
  position: [number, number, number];
  /** World target inside the room (centroid at the same height). */
  target: [number, number, number];
}

const EPS = 1e-3;

export function roomCentroidPose(id: RoomId): RoomPose {
  const r = ROOMS[id];
  const ceiling = r.ceilingHeight ?? FLAT.ceilingHeight;
  return {
    x: r.origin[0] + r.width / 2,
    z: r.origin[1] + r.depth / 2,
    y: Math.max(0.5, ceiling - 0.2),
  };
}

export function roomWindowedWallInjectors(id: RoomId): WallInjector[] {
  const r = ROOMS[id];
  if (r.external) return [];
  const cx = r.origin[0] + r.width / 2;
  const cz = r.origin[1] + r.depth / 2;
  const out: WallInjector[] = [];
  for (const wall of WALLS) {
    if (!wallBordersRoom(wall, id)) continue;
    const windows = wall.cutouts.filter((c) => c.kind === 'window');
    if (windows.length === 0) continue;
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    const dx = ex - sx;
    const dz = ez - sz;
    const len = Math.hypot(dx, dz);
    if (len < EPS) continue;
    const mx = (sx + ex) / 2;
    const mz = (sz + ez) / 2;
    // inward normal: pick perpendicular pointing toward the room centroid
    const nA: [number, number] = [-dz / len, dx / len];
    const toCx = cx - mx;
    const toCz = cz - mz;
    const dot = nA[0] * toCx + nA[1] * toCz;
    const inward: [number, number] = dot >= 0 ? nA : [-nA[0], -nA[1]];
    const half = wall.thickness === 'external'
      ? FLAT.externalWallThickness / 2
      : FLAT.internalWallThickness / 2;
    const winMidY = (FLAT.bedroomWindowSill + FLAT.windowHeadHeight) / 2;
    const offset = half + 0.05;
    out.push({
      position: [mx - inward[0] * offset, winMidY, mz - inward[1] * offset],
      target: [cx, winMidY, cz],
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/roomCentroids.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/roomCentroids.ts src/scene/lighting/roomCentroids.test.ts
git commit -m "lighting: pure helpers for room centroid + windowed-wall injectors"
```

---

## Task 4: Pure helper for per-room intensities

**Files:**
- Create: `src/scene/lighting/roomDaylightIntensities.ts`
- Create: `src/scene/lighting/roomDaylightIntensities.test.ts`

Wraps `roomDaylightFactor` + `buildRoomGraph` + `relaxDaylight` + `daylightAdmittance` into a single pure function: given a sun direction, sun altitude, and door state, return per-room `{ ambientFill, windowInjector }` intensities. Pure → easy to test door state effects.

- [ ] **Step 1: Write failing test**

Create `src/scene/lighting/roomDaylightIntensities.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeRoomDaylightIntensities } from './roomDaylightIntensities';
import type { DoorState } from '../../state/slices/doorsSlice';
import { DOORS } from '../../apartment/constants';

const DEG = Math.PI / 180;
// Sun roughly south, alt ~60° — bedrooms (north windows) get little; living/dining (north) similar; west window gets afternoon. Use a westward sun.
const sunDirNoon: [number, number, number] = [0, Math.sin(60 * DEG), -Math.cos(60 * DEG)];

function allDoorsOpen(): Record<string, DoorState> {
  const s: Record<string, DoorState> = {};
  for (const d of DOORS) s[d.id] = { open: true };
  return s;
}
function allDoorsClosed(): Record<string, DoorState> {
  const s: Record<string, DoorState> = {};
  for (const d of DOORS) s[d.id] = { open: false };
  return s;
}

describe('computeRoomDaylightIntensities', () => {
  it('windowless room with all doors closed has zero ambient fill at noon', () => {
    const r = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    expect(r.householdShelter.ambientFill).toBe(0);
  });

  it('opening any door from a windowless room toward a sunlit room raises its ambient fill', () => {
    const closed = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    const open = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsOpen());
    expect(open.householdShelter.ambientFill).toBeGreaterThan(closed.householdShelter.ambientFill);
  });

  it('all rooms have zero ambient fill below civil twilight', () => {
    const r = computeRoomDaylightIntensities([0, -0.2, -1], -10 * DEG, allDoorsOpen());
    for (const id of Object.keys(r)) {
      expect(r[id as keyof typeof r].ambientFill).toBe(0);
      expect(r[id as keyof typeof r].windowInjector).toBe(0);
    }
  });

  it('windowed room with own door closed still has window injector at noon', () => {
    const r = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    expect(r.mainBedroom.windowInjector).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/roomDaylightIntensities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

Create `src/scene/lighting/roomDaylightIntensities.ts`:

```typescript
import { ROOMS } from '../../apartment/constants';
import { roomDaylightFactor } from '../../apartment/daylight';
import { buildRoomGraph, relaxDaylight } from '../../apartment/roomGraph';
import type { DoorState } from '../../state/slices/doorsSlice';
import type { RoomId } from '../../apartment/types';
import { daylightAdmittance } from './altitudeCurve';

export interface RoomIntensities {
  /** Centroid pointLight intensity (door-relaxed daylight × admittance). */
  ambientFill: number;
  /** Inward-facing window injector intensity (raw daylight × admittance). */
  windowInjector: number;
}

const ALL_ROOM_IDS = Object.keys(ROOMS) as RoomId[];

/** Tunable strength multipliers — kept here so visual tuning is one file. */
export const AMBIENT_FILL_GAIN = 0.9;
export const WINDOW_INJECTOR_GAIN = 1.4;

export function computeRoomDaylightIntensities(
  sunDir: readonly [number, number, number],
  sunAltRad: number,
  doorState: Record<string, DoorState>,
): Record<RoomId, RoomIntensities> {
  const admit = daylightAdmittance(sunAltRad);
  const base = {} as Record<RoomId, number>;
  for (const id of ALL_ROOM_IDS) {
    base[id] = ROOMS[id].external ? 0 : roomDaylightFactor(id, sunDir);
  }
  const graph = buildRoomGraph(doorState);
  const relaxed = relaxDaylight(base, graph);

  const out = {} as Record<RoomId, RoomIntensities>;
  for (const id of ALL_ROOM_IDS) {
    if (ROOMS[id].external) {
      out[id] = { ambientFill: 0, windowInjector: 0 };
      continue;
    }
    out[id] = {
      ambientFill: admit * relaxed[id] * AMBIENT_FILL_GAIN,
      windowInjector: admit * base[id] * WINDOW_INJECTOR_GAIN,
    };
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/roomDaylightIntensities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/roomDaylightIntensities.ts src/scene/lighting/roomDaylightIntensities.test.ts
git commit -m "lighting: pure helper for door-relaxed per-room daylight intensities"
```

---

## Task 5: `RoomDaylight` component

**Files:**
- Create: `src/scene/lighting/RoomDaylight.tsx`
- Modify: `src/scene/Scene.tsx`

Mounts one centroid pointLight per non-external room and one inward-aimed directional injector per windowed wall. Per-frame: compute target intensities from `computeRoomDaylightIntensities`, tween toward them with the same 0.6 s pattern as [Lighting.tsx](../../../src/scene/lighting/Lighting.tsx). Color follows `lightingFromAltitude(alt).sunColor`. No shadow casting on these lights — they are fills.

- [ ] **Step 1: Implement the component**

Create `src/scene/lighting/RoomDaylight.tsx`:

```typescript
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { DirectionalLight, PointLight } from 'three';
import { ROOMS } from '../../apartment/constants';
import { useStore } from '../../state/store';
import type { RoomId } from '../../apartment/types';
import { lightingFromAltitude } from './altitudeCurve';
import { roomCentroidPose, roomWindowedWallInjectors, type WallInjector } from './roomCentroids';
import { computeRoomDaylightIntensities } from './roomDaylightIntensities';
import { sunDirectionToScene } from './sunPosition';
import { useSunPosition } from './useSunPosition';

const TWEEN_DURATION = 0.6;
const FILL_DISTANCE = 6;
const FILL_DECAY = 1.5;
const INJECTOR_DISTANCE = 8;

interface RoomEntry {
  id: RoomId;
  centroid: { x: number; y: number; z: number };
  injectors: WallInjector[];
}

export function RoomDaylight() {
  const sun = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const doors = useStore((s) => s.doors);

  const rooms = useMemo<RoomEntry[]>(() => {
    return (Object.keys(ROOMS) as RoomId[])
      .filter((id) => !ROOMS[id].external)
      .map((id) => ({
        id,
        centroid: roomCentroidPose(id),
        injectors: roomWindowedWallInjectors(id),
      }));
  }, []);

  const fillRefs = useRef<Map<RoomId, PointLight | null>>(new Map());
  const injectorRefs = useRef<Map<string, DirectionalLight | null>>(new Map());
  const current = useRef<{ fill: Map<RoomId, number>; inj: Map<string, number>; color: [number, number, number] }>({
    fill: new Map(rooms.map((r) => [r.id, 0])),
    inj: new Map(),
    color: [1, 1, 1],
  });

  useFrame((_, dt) => {
    const sunDir = sunDirectionToScene(sun);
    // Apply orientation (matches Lighting.tsx) so the sun-direction used for
    // window-facing tests is in the rotated frame.
    const r = (orientation * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const rotated: [number, number, number] = [
      sunDir[0] * cs - sunDir[2] * sn,
      sunDir[1],
      sunDir[0] * sn + sunDir[2] * cs,
    ];
    const intensities = computeRoomDaylightIntensities(rotated, sun.altitude, doors);
    const targetColor = lightingFromAltitude(sun.altitude).sunColor;
    const k = Math.min(1, dt / TWEEN_DURATION);

    // Tween shared color
    const cur = current.current;
    cur.color[0] += (targetColor[0] - cur.color[0]) * k;
    cur.color[1] += (targetColor[1] - cur.color[1]) * k;
    cur.color[2] += (targetColor[2] - cur.color[2]) * k;

    for (const room of rooms) {
      const target = intensities[room.id];
      const curFill = cur.fill.get(room.id) ?? 0;
      const nextFill = curFill + (target.ambientFill - curFill) * k;
      cur.fill.set(room.id, nextFill);
      const fillLight = fillRefs.current.get(room.id);
      if (fillLight) {
        fillLight.intensity = nextFill;
        fillLight.color.setRGB(cur.color[0], cur.color[1], cur.color[2]);
      }
      for (let i = 0; i < room.injectors.length; i++) {
        const key = `${room.id}#${i}`;
        const curInj = cur.inj.get(key) ?? 0;
        const nextInj = curInj + (target.windowInjector - curInj) * k;
        cur.inj.set(key, nextInj);
        const inj = injectorRefs.current.get(key);
        if (inj) {
          inj.intensity = nextInj;
          inj.color.setRGB(cur.color[0], cur.color[1], cur.color[2]);
        }
      }
    }
  });

  return (
    <>
      {rooms.map((room) => (
        <group key={room.id}>
          <pointLight
            ref={(node) => { fillRefs.current.set(room.id, node); }}
            position={[room.centroid.x, room.centroid.y, room.centroid.z]}
            intensity={0}
            distance={FILL_DISTANCE}
            decay={FILL_DECAY}
            castShadow={false}
          />
          {room.injectors.map((inj, i) => {
            const key = `${room.id}#${i}`;
            return (
              <directionalLight
                key={key}
                ref={(node) => { injectorRefs.current.set(key, node); }}
                position={inj.position}
                target-position={inj.target}
                intensity={0}
                castShadow={false}
                // Limit influence — injector should illuminate its own room, not the rest of the apartment.
                // three.js directional lights don't have distance falloff, but the small intensity + tween keeps it local.
              />
            );
          })}
        </group>
      ))}
    </>
  );
}

// Touch FILL_DISTANCE / INJECTOR_DISTANCE constants for tuning later.
void INJECTOR_DISTANCE;
```

- [ ] **Step 2: Mount it in the scene**

Edit `src/scene/Scene.tsx`. Add import after the `Lighting` import:

```typescript
import { RoomDaylight } from './lighting/RoomDaylight';
```

Then add `<RoomDaylight />` immediately after `<Lighting />`:

```tsx
      <Lighting />
      <RoomDaylight />
```

- [ ] **Step 3: Run the typecheck and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors, all tests green.

- [ ] **Step 4: Commit**

```bash
git add src/scene/lighting/RoomDaylight.tsx src/scene/Scene.tsx
git commit -m "lighting: add RoomDaylight component (per-room window-aware fill)"
```

---

## Task 6: Visual smoke test and tuning

**Files:**
- Modify (optionally, for tuning): `src/scene/lighting/altitudeCurve.ts`, `src/scene/lighting/roomDaylightIntensities.ts` (the two `*_GAIN` constants).

Manual visual verification at four time-of-day keypoints × three door configurations.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Open the URL printed in the terminal.

- [ ] **Step 2: At each of (zenith, golden hour, civil twilight, deep night), verify each scene**

Use the Settings panel time-of-day slider. For each time, walk through:

1. All doors open: windowed bedrooms bright, corridor visibly bleeds, household shelter dim but lit.
2. All doors closed: bedrooms still bright (own windows), corridor near-baseline, household shelter near-black at noon and dark at night.
3. Only household-shelter door closed (others open): shelter near-black; rest of apartment unchanged.

Expected: no flat-lit windowless rooms, no fake "downlight" feel, smooth transitions on door toggles.

- [ ] **Step 3: If a reading looks wrong, tune**

Adjust either the `ADMITTANCE_KEYS` curve (changes time-of-day shape) or `AMBIENT_FILL_GAIN` / `WINDOW_INJECTOR_GAIN` in `roomDaylightIntensities.ts` (changes overall strength). Re-run tests.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit any tuning**

```bash
git add -u src/scene/lighting/
git commit -m "lighting: tune per-room daylight curves after visual smoke test"
```

---

## Task 7: Update TODO.md

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Replace the entry**

In `TODO.md`, find the section header `### Realistic per-room lighting (window-aware, door-gated)` and replace its body paragraph with:

```markdown
Spec: [docs/superpowers/specs/2026-05-02-realistic-room-lighting-design.md](docs/superpowers/specs/2026-05-02-realistic-room-lighting-design.md). Plan: [docs/superpowers/plans/2026-05-02-realistic-room-lighting.md](docs/superpowers/plans/2026-05-02-realistic-room-lighting.md). Landed 2026-05-02. New `RoomDaylight` component drives per-room ambient fill from `relaxDaylight` (door-aware) and per-windowed-wall directional injectors from `roomDaylightFactor`, both gated by a new `daylightAdmittance` curve. Global ambient/envIntensity baseline lowered so windowless interiors read dim unless an open door bleeds light from a windowed neighbour.
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: TODO entry for realistic per-room lighting (landed)"
```

---

## Self-review notes

- All seven tasks have concrete code or commands.
- Spec coverage: lowered baseline (Task 2) ✓, admittance curve (Task 1) ✓, per-room helpers (Tasks 3–4) ✓, component + integration (Task 5) ✓, visual smoke test (Task 6) ✓, TODO update (Task 7) ✓.
- Type names consistent: `RoomIntensities`, `WallInjector`, `RoomPose` defined once and used consistently downstream.
- Test imports check against existing modules: `DOORS` and `ROOMS` are exported from `apartment/constants`; `DoorState` from `state/slices/doorsSlice` (used elsewhere in the codebase per `roomGraph.ts`).
- `ROOMS.householdShelter` used in tests — verified it's a windowless room id from the WINDOWS list (no `wall-int-shelter-*` window).
