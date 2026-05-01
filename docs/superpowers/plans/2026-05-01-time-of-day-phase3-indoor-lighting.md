# Time of Day — Phase 3 (Realistic Indoor Lighting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interior rooms lit realistically: per-room daylight fill, real sun shadows cast through window cutouts, IBL-based bounced-light approximation, and inter-room light bleed through open doors.

**Architecture:** Pure data computations live in `src/apartment/daylight.ts` and `src/apartment/roomGraph.ts` (no React, no three.js). Scene-level renderers (`RoomFillLights`, `Environment`, `PostFx`) consume these results and the existing `useSunPosition` hook. Shadow casting is enabled on the existing directional light + all wall/floor/ceiling/furniture meshes. Each layer ships with sensible defaults baked in via module-local constants; Phase 5 will replace those with reads from `quality.*` settings.

**Tech Stack:** TypeScript, React, three.js / @react-three/fiber, @react-three/drei (`<Environment>`), @react-three/postprocessing (new dep, for SSAO), Vitest.

**Spec:** [docs/superpowers/specs/2026-05-01-time-of-day-design.md §3](../specs/2026-05-01-time-of-day-design.md).

---

## File structure

**Created**

- `src/apartment/daylight.ts` — `roomDaylightFactor(roomId, sunDir): number ∈ [0,1]`. Pure.
- `src/apartment/daylight.test.ts` — golden values for each room under several sun directions.
- `src/apartment/roomGraph.ts` — `buildRoomGraph(doors): RoomGraph`, `relaxDaylight(base, graph): Record<RoomId, number>`. Pure.
- `src/apartment/roomGraph.test.ts` — adjacency + relaxation correctness.
- `src/scene/lighting/RoomFillLights.tsx` — renders one tweened `<pointLight>` per non-external room.
- `src/scene/lighting/Environment.tsx` — wraps drei `<Environment>`, picks HDRI from solar altitude.
- `src/scene/lighting/PostFx.tsx` — wraps `<EffectComposer>` + `<SSAO>`.
- `public/assets/hdri/README.md` — provenance + license notes for the bundled HDRIs.
- `public/assets/hdri/{clear-day,overcast,golden,dusk,night}.hdr` — bundled HDRIs (committed binaries).

**Modified**

- `src/scene/lighting/Lighting.tsx` — bump shadow map size, fit shadow camera frustum to apartment AABB.
- `src/apartment/Apartment.tsx` — wire `RoomFillLights` into the group.
- `src/apartment/floor/Floor.tsx`, `walls/Walls.tsx`, `Ceiling.tsx`, `Door.tsx`, `Window.tsx`, `Fixtures.tsx` — `castShadow` / `receiveShadow` flags on meshes.
- `src/furniture/primitives/*.tsx`, `src/furniture/GltfModel.tsx` — same.
- `src/scene/Scene.tsx` — mount `<Environment>` and `<PostFx>` inside `<Canvas>`.
- `package.json` — add `@react-three/postprocessing`.

**Out of scope for this phase** (deferred to Phase 5)

- Settings UI to toggle each layer.
- Replacing module-local constants (`SHADOW_MAP_SIZE`, `IBL_ENABLED`, `SSAO_ENABLED`, `BLEED_ENABLED`, `FILL_ENABLED`) with `quality.*` reads.

---

## Default constants (this phase)

In each new module, declare a single local constant near the top so Phase 5 has one obvious replacement site:

```ts
// Lighting.tsx
const SHADOW_MAP_SIZE = 1024; // Phase 5 will replace with quality.shadows
const SHADOWS_ENABLED = true;

// RoomFillLights.tsx
const FILL_ENABLED = true;
const BLEED_ENABLED = true;
const FILL_INTENSITY = 0.45;       // multiplier for (1 - daylightFactor)
const FILL_HEIGHT_FRAC = 0.85;      // pointLight height as fraction of ceiling
const FILL_TWEEN_DURATION = 0.6;    // seconds, matches Lighting.tsx

// Environment.tsx
const IBL_ENABLED = true;

// PostFx.tsx
const SSAO_ENABLED = false; // off by default; Phase 5 enables on high-quality preset

// roomGraph.ts
export const BLEED_ATTENUATION = 0.4;   // per door traversal
export const BLEED_MAX_PASSES = 4;
```

---

## Task 1: Daylight factor — pure function

**Files**
- Create: `src/apartment/daylight.ts`
- Test: `src/apartment/daylight.test.ts`

**Algorithm** (spec §3.1)

1. If `sunDir.y <= 0` (sun below horizon), return `0`.
2. If room is `external === true`, return `1`.
3. For each `WallSpec` in `WALLS` whose centerline borders the room (use `wallBordersRoom(wall, room)` — implemented inline below), compute the wall's outward-facing 2D normal (away from the room interior). If `dot(normal, sunDir.xz_normalized) > 0` and the wall has any window cutout, accumulate `Σ(window.width) / wallLength`.
4. Return `min(sum, 1)`.

`wallBordersRoom` test: wall centerline is collinear with one of the four room edges (NW→NE, NE→SE, SE→SW, SW→NW after applying wall thickness inset). Use a tolerance of `1e-3`. For walls of `external` thickness the centerline sits `externalWallThickness/2 = 0.1 m` outside the room interior; for `internal` walls it sits `internalWallThickness/2 = 0.05 m` outside. Compare against the room's exterior bounding rectangle (origin minus those offsets, plus width+offset etc.).

- [ ] **Step 1: Write failing tests**

```ts
// src/apartment/daylight.test.ts
import { describe, it, expect } from 'vitest';
import { roomDaylightFactor } from './daylight';

const downSun: [number, number, number] = [0, -1, 0];
const noonSun: [number, number, number] = [0.1, 1, 0];
// Singapore noon-ish: sun roughly south, high altitude. Scene +Z is south.
const noonFromSouth: [number, number, number] = [0, 0.95, 0.31];
const morningEast: [number, number, number] = [0.7, 0.7, 0]; // east + up
const westernSun: [number, number, number] = [-0.7, 0.7, 0];

describe('roomDaylightFactor', () => {
  it('returns 0 when sun is below horizon', () => {
    expect(roomDaylightFactor('mainBedroom', downSun)).toBe(0);
  });

  it('returns 1 for external rooms (acLedge) when sun is up', () => {
    expect(roomDaylightFactor('acLedge', noonSun)).toBe(1);
  });

  it('returns 0 for fully interior rooms (corridor) under any sun', () => {
    expect(roomDaylightFactor('corridor', noonSun)).toBe(0);
    expect(roomDaylightFactor('corridor', morningEast)).toBe(0);
  });

  it('lights the main bedroom when sun comes from its window-bearing wall', () => {
    // mainBedroom has windows on the north external wall.
    const northSun: [number, number, number] = [0, 0.7, -0.7];
    expect(roomDaylightFactor('mainBedroom', northSun)).toBeGreaterThan(0);
  });

  it('does not light the main bedroom when sun comes from the opposite side', () => {
    const southSun: [number, number, number] = [0, 0.7, 0.7];
    expect(roomDaylightFactor('mainBedroom', southSun)).toBe(0);
  });

  it('clamps to 1', () => {
    expect(roomDaylightFactor('mainBedroom', noonFromSouth)).toBeLessThanOrEqual(1);
  });

  it('returns a finite number for every room', () => {
    const rooms: import('./types').RoomId[] = [
      'mainBedroom','bedroom2','bedroom3','bath1','bath2',
      'livingDining','kitchen','corridor','serviceYard','householdShelter','acLedge',
    ];
    for (const r of rooms) {
      const f = roomDaylightFactor(r, westernSun);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

Run: `npx vitest run src/apartment/daylight.test.ts`
Expected: fails to import `./daylight`.

- [ ] **Step 3: Implement `daylight.ts`**

```ts
// src/apartment/daylight.ts
import { ROOMS, WALLS, FLAT } from './constants';
import type { RoomId, WallSpec, Vec2 } from './types';

type Vec3 = readonly [number, number, number];

const EPS = 1e-3;

function wallNormalOutward(wall: WallSpec, roomId: RoomId): Vec2 | null {
  const r = ROOMS[roomId];
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz);
  if (len < EPS) return null;
  // Two candidate normals (perpendicular in 2D).
  const nA: Vec2 = [-dz / len, dx / len];
  const nB: Vec2 = [dz / len, -dx / len];
  // Choose the one pointing AWAY from the room centroid.
  const cx = r.origin[0] + r.width / 2;
  const cz = r.origin[1] + r.depth / 2;
  const midX = (sx + ex) / 2;
  const midZ = (sz + ez) / 2;
  const toRoomX = cx - midX;
  const toRoomZ = cz - midZ;
  const pickA = nA[0] * toRoomX + nA[1] * toRoomZ < 0;
  return pickA ? nA : nB;
}

function wallBordersRoom(wall: WallSpec, roomId: RoomId): boolean {
  // True iff the wall's centerline lies along one of the room's four edges,
  // offset outward by the appropriate wall half-thickness.
  const r = ROOMS[roomId];
  const half =
    wall.thickness === 'external'
      ? FLAT.externalWallThickness / 2
      : FLAT.internalWallThickness / 2;
  const [x0, z0] = r.origin;
  const x1 = x0 + r.width;
  const z1 = z0 + r.depth;
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const horizontal = Math.abs(sz - ez) < EPS;
  const vertical = Math.abs(sx - ex) < EPS;
  if (horizontal) {
    const z = sz;
    const onNorth = Math.abs(z - (z0 - half)) < EPS;
    const onSouth = Math.abs(z - (z1 + half)) < EPS;
    if (!onNorth && !onSouth) return false;
    const lo = Math.min(sx, ex);
    const hi = Math.max(sx, ex);
    return lo <= x1 + EPS && hi >= x0 - EPS;
  }
  if (vertical) {
    const x = sx;
    const onWest = Math.abs(x - (x0 - half)) < EPS;
    const onEast = Math.abs(x - (x1 + half)) < EPS;
    if (!onWest && !onEast) return false;
    const lo = Math.min(sz, ez);
    const hi = Math.max(sz, ez);
    return lo <= z1 + EPS && hi >= z0 - EPS;
  }
  return false;
}

export function roomDaylightFactor(roomId: RoomId, sunDir: Vec3): number {
  if (sunDir[1] <= 0) return 0;
  const room = ROOMS[roomId];
  if (room.external) return 1;

  // Project sun onto XZ plane and normalize.
  const sxz = Math.hypot(sunDir[0], sunDir[2]);
  if (sxz < EPS) {
    // Sun straight up — no horizontal direction; rooms with any window get a
    // small base factor (skylight-equivalent). Keep behavior conservative: 0.
    return 0;
  }
  const sx = sunDir[0] / sxz;
  const sz = sunDir[2] / sxz;

  let sum = 0;
  for (const wall of WALLS) {
    if (!wallBordersRoom(wall, roomId)) continue;
    const windows = wall.cutouts.filter((c) => c.kind === 'window');
    if (windows.length === 0) continue;
    const normal = wallNormalOutward(wall, roomId);
    if (!normal) continue;
    if (normal[0] * sx + normal[1] * sz <= 0) continue;
    const wallLen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const winWidth = windows.reduce((s, c) => s + c.width, 0);
    sum += Math.min(1, winWidth / wallLen);
  }
  return Math.min(1, sum);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/apartment/daylight.test.ts`
Expected: all pass. If a test fails because the room's actual wall geometry doesn't match the assumption, adjust the test's expected sun direction (open `src/apartment/constants.ts` and check which walls border the room and which carry windows) — do NOT loosen `wallBordersRoom`.

- [ ] **Step 5: Commit**

```bash
git add src/apartment/daylight.ts src/apartment/daylight.test.ts
git commit -m "lighting: add roomDaylightFactor for per-room daylight sums"
```

---

## Task 2: Room adjacency graph + bleed relaxation

**Files**
- Create: `src/apartment/roomGraph.ts`
- Test: `src/apartment/roomGraph.test.ts`

**Data shape**

```ts
export interface RoomGraph {
  /** roomId → list of edges to neighbour rooms via doors, with each edge's open state. */
  edges: Record<RoomId, { neighbour: RoomId; doorId: string; open: boolean }[]>;
}
```

**Adjacency build:** iterate `DOORS`, find the wall that owns each door, identify the two rooms on either side of that wall (call `wallBordersRoom` from `daylight.ts` — export it from `daylight.ts` so `roomGraph.ts` can reuse). If exactly two rooms border the wall, add a bidirectional edge between them tagged with `doorId`. If only one borders (door to outside), skip — outside contributes via §3.1 already.

**Relaxation** (spec §3.4):

```
for pass in 0..BLEED_MAX_PASSES:
  changed = false
  for each room r:
    best = base[r]
    for each edge (r, n, doorId, open):
      if !open: continue
      candidate = result[n] * BLEED_ATTENUATION
      if candidate > best: best = candidate
    if best > result[r] + EPS:
      result[r] = best
      changed = true
  if !changed: break
```

- [ ] **Step 1: Tests**

```ts
// src/apartment/roomGraph.test.ts
import { describe, it, expect } from 'vitest';
import { buildRoomGraph, relaxDaylight, BLEED_ATTENUATION } from './roomGraph';
import type { RoomId } from './types';

describe('buildRoomGraph', () => {
  it('connects livingDining to corridor when their shared door exists', () => {
    const g = buildRoomGraph({});
    const ld = g.edges['livingDining'] ?? [];
    expect(ld.some((e) => e.neighbour === 'corridor')).toBe(true);
  });
  it('marks edges open when doorState says so', () => {
    const g = buildRoomGraph({});
    const someDoorId = (g.edges['livingDining'] ?? [])[0]?.doorId;
    expect(someDoorId).toBeTruthy();
    const g2 = buildRoomGraph({ [someDoorId]: { open: true } });
    const edge = g2.edges['livingDining'].find((e) => e.doorId === someDoorId)!;
    expect(edge.open).toBe(true);
  });
});

describe('relaxDaylight', () => {
  const base: Record<RoomId, number> = {
    mainBedroom: 0, bedroom2: 0, bedroom3: 0, bath1: 0, bath2: 0,
    livingDining: 1, kitchen: 0, corridor: 0,
    serviceYard: 0, householdShelter: 0, acLedge: 1,
  };

  it('leaves base values when all doors closed', () => {
    const g = buildRoomGraph({});
    const out = relaxDaylight(base, g);
    expect(out.corridor).toBe(0);
  });

  it('bleeds light from livingDining into corridor when their door is open', () => {
    const all = buildRoomGraph({});
    const ldDoor = all.edges['livingDining'].find((e) => e.neighbour === 'corridor')!.doorId;
    const g = buildRoomGraph({ [ldDoor]: { open: true } });
    const out = relaxDaylight(base, g);
    expect(out.corridor).toBeCloseTo(BLEED_ATTENUATION, 5);
  });

  it('attenuates over multiple hops', () => {
    // open every door
    const allOpen: Record<string, { open: boolean }> = {};
    const g0 = buildRoomGraph({});
    for (const list of Object.values(g0.edges)) {
      for (const e of list) allOpen[e.doorId] = { open: true };
    }
    const g = buildRoomGraph(allOpen);
    const out = relaxDaylight(base, g);
    // every reachable room sees at least BLEED_ATTENUATION^k for some small k
    expect(out.mainBedroom).toBeGreaterThan(0);
    expect(out.mainBedroom).toBeLessThanOrEqual(BLEED_ATTENUATION ** 1 + 1e-9);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/apartment/roomGraph.test.ts`

- [ ] **Step 3: Export `wallBordersRoom` from `daylight.ts`**

Edit `src/apartment/daylight.ts` — change `function wallBordersRoom` to `export function wallBordersRoom`.

- [ ] **Step 4: Implement `roomGraph.ts`**

```ts
// src/apartment/roomGraph.ts
import { DOORS, ROOMS, WALLS } from './constants';
import { wallBordersRoom } from './daylight';
import type { DoorState } from '../state/slices/doorsSlice';
import type { RoomId } from './types';

export const BLEED_ATTENUATION = 0.4;
export const BLEED_MAX_PASSES = 4;

export interface RoomEdge {
  neighbour: RoomId;
  doorId: string;
  open: boolean;
}
export interface RoomGraph {
  edges: Record<RoomId, RoomEdge[]>;
}

const ALL_ROOM_IDS: RoomId[] = Object.keys(ROOMS) as RoomId[];

function emptyEdgeMap(): Record<RoomId, RoomEdge[]> {
  const out = {} as Record<RoomId, RoomEdge[]>;
  for (const id of ALL_ROOM_IDS) out[id] = [];
  return out;
}

export function buildRoomGraph(doorState: Record<string, DoorState>): RoomGraph {
  const edges = emptyEdgeMap();
  for (const door of DOORS) {
    const wall = WALLS.find((w) => w.id === door.wallId);
    if (!wall) continue;
    const bordering = ALL_ROOM_IDS.filter((r) => wallBordersRoom(wall, r));
    if (bordering.length !== 2) continue;
    const [a, b] = bordering;
    const open = doorState[door.id]?.open ?? door.defaultOpen;
    edges[a].push({ neighbour: b, doorId: door.id, open });
    edges[b].push({ neighbour: a, doorId: door.id, open });
  }
  return { edges };
}

export function relaxDaylight(
  base: Record<RoomId, number>,
  graph: RoomGraph,
): Record<RoomId, number> {
  const out = { ...base };
  for (let pass = 0; pass < BLEED_MAX_PASSES; pass++) {
    let changed = false;
    for (const r of ALL_ROOM_IDS) {
      let best = out[r];
      for (const e of graph.edges[r]) {
        if (!e.open) continue;
        const cand = out[e.neighbour] * BLEED_ATTENUATION;
        if (cand > best) best = cand;
      }
      if (best > out[r] + 1e-6) {
        out[r] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}
```

- [ ] **Step 5: Run — expect PASS**

`npx vitest run src/apartment/roomGraph.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/apartment/roomGraph.ts src/apartment/roomGraph.test.ts src/apartment/daylight.ts
git commit -m "lighting: add room adjacency graph + bleed relaxation"
```

---

## Task 3: `RoomFillLights` component

**Files**
- Create: `src/scene/lighting/RoomFillLights.tsx`
- Modify: `src/apartment/Apartment.tsx`

Renders one `<pointLight>` per non-external room at the room centroid, ceiling-height. Intensity = `(1 - relaxedDaylightFactor[room]) * FILL_INTENSITY`. Tweens via `useFrame` to avoid pops.

- [ ] **Step 1: Implementation**

```tsx
// src/scene/lighting/RoomFillLights.tsx
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { PointLight } from 'three';
import { useStore } from '../../state/store';
import { ROOMS, FLAT } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';
import { roomDaylightFactor } from '../../apartment/daylight';
import { buildRoomGraph, relaxDaylight } from '../../apartment/roomGraph';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene } from './sunPosition';

const FILL_ENABLED = true;
const BLEED_ENABLED = true;
const FILL_INTENSITY = 0.45;
const FILL_HEIGHT_FRAC = 0.85;
const FILL_TWEEN_DURATION = 0.6;

const ROOM_IDS = (Object.keys(ROOMS) as RoomId[]).filter((id) => !ROOMS[id].external);

export function RoomFillLights() {
  if (!FILL_ENABLED) return null;
  const sun = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const doors = useStore((s) => s.doors);

  const target = useMemo(() => {
    const dir = sunDirectionToScene(sun);
    // Apply orientation: rotate dir on XZ by -orientation (lights live in scene-space).
    const rad = (-orientation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const sceneDir: [number, number, number] = [
      dir[0] * cos - dir[2] * sin,
      dir[1],
      dir[0] * sin + dir[2] * cos,
    ];
    const base: Record<RoomId, number> = {} as Record<RoomId, number>;
    for (const id of Object.keys(ROOMS) as RoomId[]) {
      base[id] = roomDaylightFactor(id, sceneDir);
    }
    const relaxed = BLEED_ENABLED
      ? relaxDaylight(base, buildRoomGraph(doors))
      : base;
    const intensities: Record<RoomId, number> = {} as Record<RoomId, number>;
    for (const id of ROOM_IDS) {
      intensities[id] = (1 - relaxed[id]) * FILL_INTENSITY;
    }
    return intensities;
  }, [sun, orientation, doors]);

  const refs = useRef<Record<RoomId, PointLight | null>>({} as Record<RoomId, PointLight | null>);
  const current = useRef<Record<RoomId, number>>(
    Object.fromEntries(ROOM_IDS.map((id) => [id, target[id]])) as Record<RoomId, number>,
  );

  useFrame((_, dt) => {
    const k = Math.min(1, dt / FILL_TWEEN_DURATION);
    for (const id of ROOM_IDS) {
      const t = target[id];
      const c = current.current[id];
      const next = c + (t - c) * k;
      current.current[id] = next;
      const light = refs.current[id];
      if (light) light.intensity = next;
    }
  });

  return (
    <>
      {ROOM_IDS.map((id) => {
        const r = ROOMS[id];
        const cx = r.origin[0] + r.width / 2;
        const cz = r.origin[1] + r.depth / 2;
        const ceiling = r.ceilingHeight ?? FLAT.ceilingHeight;
        const y = ceiling * FILL_HEIGHT_FRAC;
        return (
          <pointLight
            key={id}
            ref={(o) => { refs.current[id] = o; }}
            position={[cx, y, cz]}
            intensity={target[id]}
            distance={Math.max(r.width, r.depth) * 1.2}
            decay={2}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Wire into `Apartment.tsx`**

```tsx
// src/apartment/Apartment.tsx
import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Floor } from './floor/Floor';
import { Walls } from './walls/Walls';
import { Windows } from './Window';
import { RoomFillLights } from '../scene/lighting/RoomFillLights';

export function Apartment() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <Walls />
      <Windows />
      <Doors />
      <RoomFillLights />
    </group>
  );
}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Verify the corridor (interior) reads as dimmer than the living/dining (window-bearing). Open `livingDining ↔ corridor` door — corridor brightens. Close it — corridor darkens. If the dev server already runs, hot-reload suffices.

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: all green; no test imports `RoomFillLights` directly (it relies on @react-three/fiber `useFrame`, which is awkward to unit-test — coverage comes from `daylight.test.ts` + `roomGraph.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/RoomFillLights.tsx src/apartment/Apartment.tsx
git commit -m "lighting: add per-room fill lights driven by daylight factor"
```

---

## Task 4: Real shadow casting through window cutouts

**Files**
- Modify: `src/scene/lighting/Lighting.tsx`
- Modify: `src/scene/Scene.tsx`
- Modify: every mesh-emitting component (list below)

Spec §3.2. Strategy: enable `castShadow`/`receiveShadow` on all wall/floor/ceiling/door/furniture meshes. Because `wallSegments` already builds solid panels around window cutouts, shadows naturally project through windows.

Fit the shadow camera frustum to the apartment AABB once at mount.

- [ ] **Step 1: Compute apartment AABB constant**

Add to `src/apartment/constants.ts` (append at end):

```ts
import { ROOMS as _ROOMS_FOR_AABB } from './constants';
// (skip if circular — instead define inline in Lighting.tsx)
```

If circular, just compute in `Lighting.tsx`:

```ts
import { ROOMS } from '../../apartment/constants';
function apartmentAABB() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of Object.values(ROOMS)) {
    minX = Math.min(minX, r.origin[0]);
    maxX = Math.max(maxX, r.origin[0] + r.width);
    minZ = Math.min(minZ, r.origin[1]);
    maxZ = Math.max(maxZ, r.origin[1] + r.depth);
  }
  return { minX, maxX, minZ, maxZ };
}
```

- [ ] **Step 2: Update `Lighting.tsx` directional light**

Replace the existing `<directionalLight>` JSX block:

```tsx
const SHADOW_MAP_SIZE = 1024;
const SHADOWS_ENABLED = true;
const aabb = apartmentAABB();
const margin = 4;
const halfX = (aabb.maxX - aabb.minX) / 2 + margin;
const halfZ = (aabb.maxZ - aabb.minZ) / 2 + margin;
const shadowExtent = Math.max(halfX, halfZ);

return (
  <>
    <ambientLight ref={ambientRef} />
    <directionalLight
      ref={sunRef}
      castShadow={SHADOWS_ENABLED}
      shadow-mapSize-width={SHADOW_MAP_SIZE}
      shadow-mapSize-height={SHADOW_MAP_SIZE}
      shadow-camera-near={0.5}
      shadow-camera-far={SUN_DISTANCE * 2.5}
      shadow-camera-left={-shadowExtent}
      shadow-camera-right={shadowExtent}
      shadow-camera-top={shadowExtent}
      shadow-camera-bottom={-shadowExtent}
      shadow-bias={-0.0005}
    />
  </>
);
```

The shadow camera target is the origin (default for directional lights with `position`-only). If shadows look offset, set `target.position` to apartment centre via a hidden `<object3D>` and `target={ref}`; defer that until smoke-test reveals a problem.

- [ ] **Step 3: Confirm `<Canvas shadows>` already on**

Read `src/scene/Scene.tsx` — `<Canvas shadows ...>` already enables shadow rendering. No change needed.

- [ ] **Step 4: Add `castShadow receiveShadow` to apartment meshes**

For each file below, add `castShadow receiveShadow` props to every `<mesh>` (or to the `<primitive>` wrapping a GLTF). If a file uses `<Instances>` / `<Instanced...>`, `castShadow receiveShadow` go on the parent.

Files (search for `<mesh` in each):
- `src/apartment/floor/Floor.tsx` (floor receives only — `receiveShadow`)
- `src/apartment/walls/Walls.tsx` (cast + receive)
- `src/apartment/Ceiling.tsx` (receive only)
- `src/apartment/Door.tsx` (cast + receive)
- `src/apartment/Window.tsx` (skip — windows are visual only; their parent walls already cast)
- `src/apartment/Fixtures.tsx` (cast + receive)
- `src/furniture/GltfModel.tsx` — set `castShadow receiveShadow` on the loaded `<primitive object={scene} />`, then traverse to mark child meshes (drei's `useGLTF` returns shared scene; clone first or use `Bvh`-style traversal):

  ```tsx
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        (o as Mesh).castShadow = true;
        (o as Mesh).receiveShadow = true;
      }
    });
  }, [scene]);
  ```
- All files under `src/furniture/primitives/*.tsx` — `<mesh castShadow receiveShadow>`.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Set time to 09:00 manually. Verify visible shadow stripes from window mullions on the floor of bedrooms / living/dining. Cast-edge alignment may need `shadow-bias` tuning (`-0.0001` to `-0.001`).

- [ ] **Step 6: Commit**

```bash
git add src/scene/lighting/Lighting.tsx src/apartment/ src/furniture/
git commit -m "lighting: cast real sun shadows through window cutouts"
```

---

## Task 5: IBL environment via drei `<Environment>`

**Files**
- Create: `src/scene/lighting/Environment.tsx`
- Create: `public/assets/hdri/{clear-day,overcast,golden,dusk,night}.hdr`
- Create: `public/assets/hdri/README.md`
- Modify: `src/scene/Scene.tsx`

**HDRI sourcing.** Use Poly Haven CC0 1K HDRIs (small files, ~1–3 MB each):

| Slot | Recommended Poly Haven slug | Notes |
|------|------------------------------|-------|
| `clear-day` | `kloofendal_43d_clear` | bright daylight |
| `overcast`  | `cloudy` | low-altitude / overcast |
| `golden`    | `golden_gate_hills` | golden hour |
| `dusk`      | `kloppenheim_06_puresky` (dusk variant) | civil twilight |
| `night`     | `moonlit_golf` | dark with moonlight |

Download manually (or via the asset pipeline) and commit as `*.hdr` (1K). Add `public/assets/hdri/README.md` listing each file's source URL, slug, author, and CC0 license.

- [ ] **Step 1: Drop HDRI files**

Place the five `.hdr` files under `public/assets/hdri/`. Total budget ≤ 10 MB.

- [ ] **Step 2: Write `README.md`**

```markdown
# HDRI environments

Loaded by `src/scene/lighting/Environment.tsx` to approximate bounced light. All CC0.

| File | Source | Author |
|------|--------|--------|
| clear-day.hdr | https://polyhaven.com/a/kloofendal_43d_clear | Greg Zaal |
| overcast.hdr  | https://polyhaven.com/a/cloudy                 | Sergej Majboroda |
| golden.hdr    | https://polyhaven.com/a/golden_gate_hills       | Greg Zaal |
| dusk.hdr      | https://polyhaven.com/a/kloppenheim_06_puresky  | Greg Zaal |
| night.hdr     | https://polyhaven.com/a/moonlit_golf            | Sergej Majboroda |
```

- [ ] **Step 3: Implement `Environment.tsx`**

```tsx
// src/scene/lighting/Environment.tsx
import { Environment as DreiEnvironment } from '@react-three/drei';
import { useSunPosition } from './useSunPosition';

const IBL_ENABLED = true;

function altitudeToHdri(altitudeRad: number): string {
  const altDeg = (altitudeRad * 180) / Math.PI;
  if (altDeg <= -6) return '/assets/hdri/night.hdr';
  if (altDeg <= 2) return '/assets/hdri/dusk.hdr';
  if (altDeg <= 12) return '/assets/hdri/golden.hdr';
  if (altDeg <= 30) return '/assets/hdri/overcast.hdr';
  return '/assets/hdri/clear-day.hdr';
}

export function Environment() {
  if (!IBL_ENABLED) return null;
  const sun = useSunPosition();
  const file = altitudeToHdri(sun.altitude);
  return <DreiEnvironment files={file} background={false} />;
}
```

- [ ] **Step 4: Mount in `Scene.tsx`**

```tsx
import { Environment } from './lighting/Environment';
// inside <Canvas>, after <Sky />:
<Environment />
```

- [ ] **Step 5: Smoke test**

`npm run dev` — verify glossy materials show subtle reflection variation across the day. Walls/ceiling pick up a faint warm tint at golden, blue at dusk, near-black at night.

- [ ] **Step 6: Commit**

```bash
git add src/scene/lighting/Environment.tsx src/scene/Scene.tsx public/assets/hdri/
git commit -m "lighting: add IBL environment driven by solar altitude"
```

---

## Task 6: Optional SSAO via @react-three/postprocessing

**Files**
- Modify: `package.json`
- Create: `src/scene/lighting/PostFx.tsx`
- Modify: `src/scene/Scene.tsx`

- [ ] **Step 1: Install dep**

```bash
npm install @react-three/postprocessing
```

- [ ] **Step 2: Implement `PostFx.tsx`**

```tsx
// src/scene/lighting/PostFx.tsx
import { EffectComposer, SSAO } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

const SSAO_ENABLED = false; // Phase 5 toggles this on for high quality

export function PostFx() {
  if (!SSAO_ENABLED) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={16}
        radius={0.2}
        intensity={20}
        luminanceInfluence={0.6}
        worldDistanceThreshold={1}
        worldDistanceFalloff={0.1}
        worldProximityThreshold={1}
        worldProximityFalloff={0.1}
      />
    </EffectComposer>
  );
}
```

- [ ] **Step 3: Mount in `Scene.tsx`**

```tsx
import { PostFx } from './lighting/PostFx';
// inside <Canvas>, last child:
<PostFx />
```

- [ ] **Step 4: Verify nothing breaks with SSAO_ENABLED=false (default)**

Run: `npm run dev`. Verify scene renders identically to pre-Task-6.

Temporarily flip `SSAO_ENABLED = true` and confirm corner darkening appears, no console errors. Revert to `false`.

- [ ] **Step 5: Run tests**

`npm test` — should still pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/scene/lighting/PostFx.tsx src/scene/Scene.tsx
git commit -m "lighting: scaffold SSAO post-fx (default off)"
```

---

## Task 7: Update TODO.md

**Files**
- Modify: `TODO.md`

- [ ] **Step 1: Edit**

Mark phase 3 done in the "Time of Day" section, link this plan:

```markdown
- ~~**Time-of-day rework — Phase 3 (realistic indoor lighting)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase3-indoor-lighting.md](docs/superpowers/plans/2026-05-01-time-of-day-phase3-indoor-lighting.md). Per-room daylight fill, real shadow casting through window cutouts, IBL via drei `<Environment>`, inter-room light bleed via room adjacency graph. SSAO scaffolded but default-off until Phase 5 wires the toggle.
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark time-of-day phase 3 complete in TODO.md"
```

---

## Self-review checklist

- [x] Daylight factor: §3.1
- [x] Shadow casting: §3.2
- [x] IBL: §3.3 (SSAO scaffolded, off by default — Phase 5 enables)
- [x] Door bleed: §3.4
- [x] Each layer ships behind a single module-local constant — Phase 5 has one obvious replacement site per module
- [x] No placeholders; every step has runnable code or commands
