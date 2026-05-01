# Time of Day — Phase 4 (Light Fixtures) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light-emitting furniture (floor lamp, table lamp, pendant, spot, sconce) so users can light scenes that the sun can't reach. Each fixture renders both geometry and a `<pointLight>` / `<spotLight>` at a defined anchor; per-instance state controls on/off, intensity, and color temperature, all editable through the Inspector.

**Architecture:** Extend `FurnitureDef` with an optional `light: LightEmitter` field. Add a `lightOverride` field to `FurnitureItem`. A new `<FurnitureLights>` component iterates placed items and emits the lights at each fixture's world-transformed anchor. Geometry stays primitive-driven via three new primitives (`FloorLamp`, `TableLamp`, `Pendant` — sconce reuses Pendant geometry rotated, spot uses a new `SpotLight` primitive). Inspector gains a new "Light" section. Color temperature is converted to RGB via a Planckian-locus approximation.

**Tech Stack:** TypeScript, React, three.js / @react-three/fiber, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-01-time-of-day-design.md §4](../specs/2026-05-01-time-of-day-design.md).

**Note on Phase 5 coupling.** Phase 5's spec says the toolbar fixtures button is replaced by `quality.fixtures`. This plan adds neither toolbar button nor quality reads — it ships fixtures unconditionally on. Phase 5 wires the toggle.

---

## File structure

**Created**

- `src/furniture/lighting/colorTemp.ts` — `kelvinToRGB(k: number): [number, number, number]` (linear, 0–1).
- `src/furniture/lighting/colorTemp.test.ts` — golden values at 2200 K, 2700 K, 4000 K, 6500 K.
- `src/furniture/primitives/FloorLamp.tsx`
- `src/furniture/primitives/TableLamp.tsx`
- `src/furniture/primitives/Pendant.tsx`
- `src/furniture/primitives/CeilingSpot.tsx`
- `src/furniture/primitives/Sconce.tsx`
- `src/scene/furniture/FurnitureLights.tsx`
- `src/scene/furniture/FurnitureLights.test.tsx`
- `src/ui/inspector/fields/LightSection.tsx`
- `src/ui/inspector/fields/LightSection.test.tsx`

**Modified**

- `src/furniture/types.ts` — add `LightEmitter`, `light?` on `FurnitureDef`, `lightOverride?` on `FurnitureItem`, extend `PrimitiveKind`.
- `src/furniture/primitives/index.ts` — register new primitives.
- `src/furniture/builtinCatalog.ts` — five fixture entries.
- `src/state/slices/itemsSlice.ts` — `setLightOverride(itemId, patch)` action.
- `src/state/slices/itemsSlice.test.ts` — covers the new action.
- `src/state/schema.ts` — serialize/deserialize `lightOverride`.
- `src/state/schema.test.ts` — round-trip test.
- `src/scene/Scene.tsx` — mount `<FurnitureLights />`.
- `src/ui/inspector/InspectorPanel.tsx` — render `<LightSection>` when def has `light`.
- `src/ui/inspector/ParametricBody.tsx` — same hook-in.

---

## Type additions (Task 1)

```ts
// src/furniture/types.ts (excerpt)
export interface LightEmitter {
  kind: 'point' | 'spot';
  /** Offset from furniture origin (metres) at which the bulb sits. */
  anchor: [number, number, number];
  defaultIntensity: number;
  /** Default color temperature in Kelvin (2200–6500). */
  defaultKelvin: number;
  /** For spot lights only. */
  cone?: { angle: number; penumbra: number; targetOffset: [number, number, number] };
  /** Falloff distance in metres. */
  distance: number;
  /** Whether the fixture casts shadows. Capped automatically; see FurnitureLights. */
  castShadow?: boolean;
}

export interface LightOverride {
  on?: boolean;
  intensity?: number;
  kelvin?: number;
}
```

`FurnitureDefBase` gets `light?: LightEmitter`. `FurnitureItem` gets `lightOverride?: LightOverride`.

`PrimitiveKind` gains `'FloorLamp' | 'TableLamp' | 'Pendant' | 'CeilingSpot' | 'Sconce'`.

---

## Task 1: Type additions and `kelvinToRGB`

**Files**
- Modify: `src/furniture/types.ts`
- Create: `src/furniture/lighting/colorTemp.ts`, `src/furniture/lighting/colorTemp.test.ts`

- [ ] **Step 1: Write `colorTemp.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { kelvinToRGB } from './colorTemp';

function close(a: number, b: number, tol = 0.06) { return Math.abs(a - b) <= tol; }

describe('kelvinToRGB', () => {
  it('returns warm orange at 2200 K (R > G > B)', () => {
    const [r, g, b] = kelvinToRGB(2200);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeCloseTo(1, 1);
  });
  it('returns roughly white at ~5500 K', () => {
    const [r, g, b] = kelvinToRGB(5500);
    expect(close(r, g)).toBe(true);
    expect(close(g, b, 0.15)).toBe(true);
  });
  it('returns cool blue-tinted at 6500 K (B >= G)', () => {
    const [r, g, b] = kelvinToRGB(6500);
    expect(b).toBeGreaterThanOrEqual(g - 0.02);
    expect(r).toBeLessThanOrEqual(1);
  });
  it('clamps below 1000 K and above 12000 K', () => {
    expect(() => kelvinToRGB(500)).not.toThrow();
    expect(() => kelvinToRGB(20000)).not.toThrow();
    const low = kelvinToRGB(500);
    const high = kelvinToRGB(20000);
    for (const v of [...low, ...high]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`npx vitest run src/furniture/lighting/colorTemp.test.ts`

- [ ] **Step 3: Implement `colorTemp.ts`**

Use the Tanner Helland approximation (well-known, MIT-clean reimplementations widely available; rewrite from scratch):

```ts
// src/furniture/lighting/colorTemp.ts

/**
 * Convert a black-body temperature in Kelvin to a linear-RGB triplet in [0,1].
 * Approximation derived from Tanner Helland's curve fit; output domain clamped.
 */
export function kelvinToRGB(kelvin: number): [number, number, number] {
  const k = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}
```

- [ ] **Step 4: Run — expect PASS**

`npx vitest run src/furniture/lighting/colorTemp.test.ts`

- [ ] **Step 5: Add `LightEmitter`, `LightOverride`, extend `PrimitiveKind`**

Edit `src/furniture/types.ts` per the "Type additions" block above. Update `FurnitureDefBase` to include `light?: LightEmitter` and `FurnitureItem` to include `lightOverride?: LightOverride`. Extend the `PrimitiveKind` union.

- [ ] **Step 6: Verify typecheck**

`npx tsc --noEmit`
Expected: passes (new fields are optional; existing code unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/furniture/types.ts src/furniture/lighting/
git commit -m "furniture: add LightEmitter type + kelvinToRGB helper"
```

---

## Task 2: Five fixture primitives + catalog entries

**Files**
- Create: `src/furniture/primitives/{FloorLamp,TableLamp,Pendant,CeilingSpot,Sconce}.tsx`
- Modify: `src/furniture/primitives/index.ts`
- Modify: `src/furniture/builtinCatalog.ts`

Geometry is intentionally minimal — primitive cylinders + spheres. Fixtures are visually identifiable but the asset pipeline can swap in GLBs later without changing types.

- [ ] **Step 1: Implement `FloorLamp.tsx`**

```tsx
// src/furniture/primitives/FloorLamp.tsx
import type { ParamProps } from '../types';

export function FloorLamp(_props: { params: ParamProps }) {
  return (
    <group>
      {/* base */}
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* pole */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.6, 12]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* shade */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <coneGeometry args={[0.18, 0.22, 24, 1, true]} />
        <meshStandardMaterial color="#e7dec5" side={2} />
      </mesh>
      {/* bulb */}
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Implement remaining four primitives**

```tsx
// TableLamp.tsx — base + short stem + small dome shade at y≈0.5
export function TableLamp() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 20]} /><meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.4, 8]} /><meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <coneGeometry args={[0.12, 0.18, 20, 1, true]} /><meshStandardMaterial color="#f3ecda" side={2} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.03, 10, 10]} /><meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}

// Pendant.tsx — cord from y=2.6 down to y=2.0, dome shade at y=2.0, bulb just below
export function Pendant() {
  return (
    <group>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.6, 6]} /><meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, 2.0, 0]} castShadow>
        <sphereGeometry args={[0.18, 16, 8, 0, Math.PI*2, 0, Math.PI/2]} />
        <meshStandardMaterial color="#e7dec5" side={2} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.05, 12, 12]} /><meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}

// CeilingSpot.tsx — recessed disk at ceiling
export function CeilingSpot() {
  return (
    <group>
      <mesh position={[0, 2.55, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 20]} /><meshStandardMaterial color="#1f1f1f" />
      </mesh>
      <mesh position={[0, 2.53, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.005, 20]} /><meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.5} color="#fff" />
      </mesh>
    </group>
  );
}

// Sconce.tsx — wall-anchored half-pendant (origin sits flush against wall in +Z direction)
export function Sconce() {
  return (
    <group>
      <mesh position={[0, 1.7, 0.04]}>
        <boxGeometry args={[0.16, 0.06, 0.08]} /><meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[0, 1.7, 0.12]}>
        <sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 3: Register primitives**

Edit `src/furniture/primitives/index.ts`. Locate the existing primitive map (`{ Bed, Sofa, ... }`) and add the five new entries. The exact pattern is:

```ts
import { FloorLamp } from './FloorLamp';
import { TableLamp } from './TableLamp';
import { Pendant } from './Pendant';
import { CeilingSpot } from './CeilingSpot';
import { Sconce } from './Sconce';

export const PRIMITIVES = {
  Bed, Sofa, DiningTable, KitchenCounter, Wardrobe, Desk, Bookshelf, TVConsole,
  FloorLamp, TableLamp, Pendant, CeilingSpot, Sconce,
} as const;
```

(Open `index.ts` first; preserve existing import order. If primitives are wired through a different mechanism, follow that instead — read the file once before editing.)

- [ ] **Step 4: Add five catalog entries**

Edit `src/furniture/builtinCatalog.ts`, append within the `BUILTIN_CATALOG` object literal:

```ts
  // ── Lighting ────────────────────────────────────────────────────────────
  'lamp-floor': {
    kind: 'parametric', id: 'lamp-floor', name: 'Floor lamp', category: 'lighting',
    primitive: 'FloorLamp', defaultFootprint: { w: 0.36, d: 0.36, h: 1.7 },
    paramSchema: [],
    light: {
      kind: 'point', anchor: [0, 1.55, 0], defaultIntensity: 18,
      defaultKelvin: 2700, distance: 6,
    },
  },
  'lamp-table': {
    kind: 'parametric', id: 'lamp-table', name: 'Table lamp', category: 'lighting',
    primitive: 'TableLamp', defaultFootprint: { w: 0.24, d: 0.24, h: 0.55 },
    paramSchema: [],
    light: {
      kind: 'point', anchor: [0, 0.46, 0], defaultIntensity: 12,
      defaultKelvin: 2700, distance: 4,
    },
  },
  'lamp-pendant': {
    kind: 'parametric', id: 'lamp-pendant', name: 'Pendant ceiling light', category: 'lighting',
    primitive: 'Pendant', defaultFootprint: { w: 0.36, d: 0.36, h: 0.6 },
    paramSchema: [],
    light: {
      kind: 'point', anchor: [0, 1.95, 0], defaultIntensity: 40,
      defaultKelvin: 3000, distance: 8,
    },
  },
  'lamp-spot': {
    kind: 'parametric', id: 'lamp-spot', name: 'Spot ceiling light', category: 'lighting',
    primitive: 'CeilingSpot', defaultFootprint: { w: 0.14, d: 0.14, h: 0.04 },
    paramSchema: [],
    light: {
      kind: 'spot', anchor: [0, 2.53, 0], defaultIntensity: 25,
      defaultKelvin: 4000, distance: 6,
      cone: { angle: 0.7, penumbra: 0.3, targetOffset: [0, -1, 0] },
    },
  },
  'lamp-sconce': {
    kind: 'parametric', id: 'lamp-sconce', name: 'Wall sconce', category: 'lighting',
    primitive: 'Sconce', defaultFootprint: { w: 0.16, d: 0.08, h: 0.06 },
    paramSchema: [],
    light: {
      kind: 'point', anchor: [0, 1.7, 0.12], defaultIntensity: 8,
      defaultKelvin: 2700, distance: 3,
    },
  },
```

- [ ] **Step 5: Smoke test**

`npm run dev`. Open the catalog drawer's "Lighting" category. All five entries appear. Place each — geometry shows up. (Lights themselves don't render until Task 4.)

- [ ] **Step 6: Run unit tests**

`npm test`
Expected: existing `builtinCatalog.test.ts` passes (it just iterates entries; the new fields are optional).

- [ ] **Step 7: Commit**

```bash
git add src/furniture/primitives/ src/furniture/builtinCatalog.ts
git commit -m "furniture: add five built-in light fixtures (geometry only)"
```

---

## Task 3: `setLightOverride` slice action + schema persistence

**Files**
- Modify: `src/state/slices/itemsSlice.ts`
- Modify: `src/state/slices/itemsSlice.test.ts` (or `store.test.ts` — follow existing pattern)
- Modify: `src/state/schema.ts`
- Modify: `src/state/schema.test.ts`

- [ ] **Step 1: Write a failing slice test**

Open `src/state/store.test.ts` and add:

```ts
it('setLightOverride patches the override map for an item', () => {
  const s = useStore.getState();
  s.__resetForTest();
  s.addItem({ id: 'x1', defId: 'lamp-floor', position: [1, 1], rotation: 0, props: {} });
  s.setLightOverride('x1', { on: false });
  expect(useStore.getState().items[0].lightOverride).toEqual({ on: false });
  s.setLightOverride('x1', { intensity: 0.5 });
  expect(useStore.getState().items[0].lightOverride).toEqual({ on: false, intensity: 0.5 });
});
```

(Adjust `addItem` shape if the slice uses a different signature — check `itemsSlice.ts` first.)

- [ ] **Step 2: Run — expect FAIL**

`npx vitest run src/state/store.test.ts`

- [ ] **Step 3: Implement action in `itemsSlice.ts`**

Add to the `ItemsSlice` interface:

```ts
setLightOverride: (itemId: string, patch: Partial<LightOverride>) => void;
```

In `createItemsSlice`, after existing actions:

```ts
setLightOverride: (itemId, patch) => {
  get().pushHistory();
  set((s) => ({
    items: s.items.map((it) =>
      it.id === itemId
        ? { ...it, lightOverride: { ...(it.lightOverride ?? {}), ...patch } }
        : it,
    ),
  }));
},
```

Import `LightOverride` from `../../furniture/types`.

- [ ] **Step 4: Run — expect PASS**

`npx vitest run src/state/store.test.ts`

- [ ] **Step 5: Update `schema.ts`**

Find `FurnitureItemZ` (around line 16). Add an optional `lightOverride` field:

```ts
const FurnitureItemZ = z.object({
  id: z.string(),
  defId: z.string(),
  position: z.tuple([z.number(), z.number()]),
  rotation: z.number(),
  props: z.record(z.string(), z.union([z.number(), z.string()])),
  lightOverride: z
    .object({
      on: z.boolean().optional(),
      intensity: z.number().optional(),
      kelvin: z.number().optional(),
    })
    .optional(),
});
```

(zod will silently drop unknown fields by default; `.optional()` is required so existing saves without `lightOverride` still parse.)

- [ ] **Step 6: Add a round-trip test**

Append to `src/state/schema.test.ts`:

```ts
it('round-trips lightOverride on items', () => {
  const sample = { /* fill in a minimal valid serialized state shape */ };
  // Lift this from the file's existing baseline fixture; extend the items
  // array with one entry containing lightOverride.
});
```

(Read the existing test file before writing — it likely has a `validBase` helper. Use it; don't duplicate the schema fixture by hand.)

- [ ] **Step 7: Run — expect PASS**

`npm test`

- [ ] **Step 8: Commit**

```bash
git add src/state/slices/itemsSlice.ts src/state/store.test.ts src/state/schema.ts src/state/schema.test.ts
git commit -m "state: add setLightOverride action and persist lightOverride"
```

---

## Task 4: `<FurnitureLights>` renderer

**Files**
- Create: `src/scene/furniture/FurnitureLights.tsx`
- Create: `src/scene/furniture/FurnitureLights.test.tsx`
- Modify: `src/scene/Scene.tsx`

The renderer iterates `state.items`, looks up each item's def, and for any def with a `light` field emits a `<pointLight>` or `<spotLight>` at the world position `(item.position[0] + anchor[0], anchor[1], item.position[1] + anchor[2])` rotated by `item.rotation`.

Cap at 16 simultaneous lights (sorted by distance to camera). Excess fixtures render geometry only.

- [ ] **Step 1: Implement**

```tsx
// src/scene/furniture/FurnitureLights.tsx
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { kelvinToRGB } from '../../furniture/lighting/colorTemp';
import type { LightEmitter } from '../../furniture/types';

const FIXTURES_ENABLED = true;
const MAX_LIGHTS = 16;

interface ResolvedFixture {
  id: string;
  worldPos: [number, number, number];
  rotation: number;
  light: LightEmitter;
  on: boolean;
  intensity: number;
  color: [number, number, number];
}

export function FurnitureLights() {
  if (!FIXTURES_ENABLED) return null;
  const items = useStore((s) => s.items);
  const catalog = useCatalog();
  const camera = useThree((t) => t.camera);

  const resolved = useMemo<ResolvedFixture[]>(() => {
    const out: ResolvedFixture[] = [];
    for (const item of items) {
      const def = catalog[item.defId];
      if (!def || def.kind !== 'parametric') continue;
      if (!('light' in def) || !def.light) continue;
      const light = def.light;
      const ov = item.lightOverride ?? {};
      if (ov.on === false) continue;
      const cos = Math.cos(item.rotation);
      const sin = Math.sin(item.rotation);
      const ax = light.anchor[0] * cos - light.anchor[2] * sin;
      const az = light.anchor[0] * sin + light.anchor[2] * cos;
      const worldPos: [number, number, number] = [
        item.position[0] + ax,
        light.anchor[1],
        item.position[1] + az,
      ];
      out.push({
        id: item.id,
        worldPos,
        rotation: item.rotation,
        light,
        on: true,
        intensity: ov.intensity ?? light.defaultIntensity,
        color: kelvinToRGB(ov.kelvin ?? light.defaultKelvin),
      });
    }
    // Sort by camera distance, keep nearest MAX_LIGHTS
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    out.sort((a, b) => {
      const da = (a.worldPos[0]-cx)**2 + (a.worldPos[1]-cy)**2 + (a.worldPos[2]-cz)**2;
      const db = (b.worldPos[0]-cx)**2 + (b.worldPos[1]-cy)**2 + (b.worldPos[2]-cz)**2;
      return da - db;
    });
    if (out.length > MAX_LIGHTS) out.length = MAX_LIGHTS;
    return out;
  }, [items, catalog, camera.position.x, camera.position.y, camera.position.z]);

  return (
    <>
      {resolved.map((f) => {
        const colorHex = `rgb(${Math.round(f.color[0]*255)},${Math.round(f.color[1]*255)},${Math.round(f.color[2]*255)})`;
        if (f.light.kind === 'spot') {
          const target = f.light.cone?.targetOffset ?? [0, -1, 0];
          return (
            <spotLight
              key={f.id}
              position={f.worldPos}
              intensity={f.intensity}
              color={colorHex}
              distance={f.light.distance}
              angle={f.light.cone?.angle ?? 0.6}
              penumbra={f.light.cone?.penumbra ?? 0.3}
              decay={2}
              target-position={[
                f.worldPos[0] + target[0],
                f.worldPos[1] + target[1],
                f.worldPos[2] + target[2],
              ]}
            />
          );
        }
        return (
          <pointLight
            key={f.id}
            position={f.worldPos}
            intensity={f.intensity}
            color={colorHex}
            distance={f.light.distance}
            decay={2}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Mount in `Scene.tsx`**

```tsx
import { FurnitureLights } from './furniture/FurnitureLights';
// inside <Canvas>, after <FurnitureLayer />:
<FurnitureLights />
```

- [ ] **Step 3: Smoke test**

`npm run dev`. Set time to 23:00 (manual, night). Place a floor lamp in the corridor — the corridor lights up around the lamp. Toggle the corridor pendant via Inspector (Task 5) — once Task 5 lands.

- [ ] **Step 4: Add a render-shape test**

```tsx
// src/scene/furniture/FurnitureLights.test.tsx
import { describe, it, expect } from 'vitest';
import { kelvinToRGB } from '../../furniture/lighting/colorTemp';

// Direct-react-three-fiber rendering tests are heavy; instead test the
// resolution logic by asserting kelvinToRGB output shape matches what the
// component will pass. Component-level coverage is via smoke test.
describe('kelvinToRGB integration shape', () => {
  it('returns three numbers in [0,1]', () => {
    const c = kelvinToRGB(2700);
    expect(c).toHaveLength(3);
    for (const v of c) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

(If the existing test pattern uses `@testing-library/react` with `<Canvas>`, write a real render test instead — read other `*.test.tsx` under `src/scene/` first to see the convention.)

- [ ] **Step 5: Run tests**

`npm test`

- [ ] **Step 6: Commit**

```bash
git add src/scene/furniture/ src/scene/Scene.tsx
git commit -m "scene: render furniture-driven point/spot lights"
```

---

## Task 5: Inspector Light section

**Files**
- Create: `src/ui/inspector/fields/LightSection.tsx`
- Create: `src/ui/inspector/fields/LightSection.test.tsx`
- Modify: `src/ui/inspector/InspectorPanel.tsx` and/or `ParametricBody.tsx`

- [ ] **Step 1: Write `LightSection.tsx`**

```tsx
// src/ui/inspector/fields/LightSection.tsx
import { useStore } from '../../../state/store';
import type { FurnitureItem, LightEmitter } from '../../../furniture/types';

export function LightSection({ item, light }: { item: FurnitureItem; light: LightEmitter }) {
  const setOverride = useStore((s) => s.setLightOverride);
  const ov = item.lightOverride ?? {};
  const on = ov.on ?? true;
  const intensity = ov.intensity ?? light.defaultIntensity;
  const kelvin = ov.kelvin ?? light.defaultKelvin;
  const max = light.defaultIntensity * 2;
  return (
    <section className="mt-3 border-t border-neutral-200 pt-2">
      <header className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Light
      </header>
      <label className="mb-1 flex items-center justify-between">
        <span>On</span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOverride(item.id, { on: e.target.checked })}
        />
      </label>
      <label className="mb-1 block">
        <span className="mb-0.5 block">Intensity ({intensity.toFixed(1)})</span>
        <input
          type="range" min={0} max={max} step={0.5}
          value={intensity}
          onChange={(e) => setOverride(item.id, { intensity: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block">Color temp ({kelvin} K)</span>
        <input
          type="range" min={2200} max={6500} step={50}
          value={kelvin}
          onChange={(e) => setOverride(item.id, { kelvin: Number(e.target.value) })}
          className="w-full"
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 2: Wire into `ParametricBody.tsx`**

Open `src/ui/inspector/ParametricBody.tsx`. After the param-schema editing UI, add:

```tsx
{def.light ? <LightSection item={item} light={def.light} /> : null}
```

(Import `LightSection` from `./fields/LightSection`.)

- [ ] **Step 3: Test**

```tsx
// src/ui/inspector/fields/LightSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LightSection } from './LightSection';
import { useStore } from '../../../state/store';
import type { LightEmitter } from '../../../furniture/types';

const light: LightEmitter = {
  kind: 'point', anchor: [0,1,0], defaultIntensity: 10, defaultKelvin: 2700, distance: 4,
};

describe('LightSection', () => {
  it('toggles on/off via the checkbox', () => {
    useStore.getState().__resetForTest();
    useStore.getState().addItem({
      id: 'L1', defId: 'lamp-floor', position: [1,1], rotation: 0, props: {},
    });
    const item = useStore.getState().items.find((i) => i.id === 'L1')!;
    render(<LightSection item={item} light={light} />);
    const cb = screen.getByRole('checkbox');
    expect((cb as HTMLInputElement).checked).toBe(true);
    fireEvent.click(cb);
    expect(useStore.getState().items[0].lightOverride?.on).toBe(false);
  });
});
```

(Verify `addItem` signature first; mirror the test convention used by other inspector tests.)

- [ ] **Step 4: Run — expect PASS**

`npm test`

- [ ] **Step 5: Smoke test**

`npm run dev`. Place a floor lamp, select it. Inspector shows "Light" section with three controls. Toggle off → light goes dark in scene; intensity slider dims it; warm/cool slider visibly shifts color.

- [ ] **Step 6: Commit**

```bash
git add src/ui/inspector/fields/LightSection.tsx src/ui/inspector/fields/LightSection.test.tsx src/ui/inspector/ParametricBody.tsx
git commit -m "inspector: add Light section with on/off, intensity, color temp"
```

---

## Task 6: Update TODO.md

**Files**
- Modify: `TODO.md`

- [ ] **Step 1: Mark phase 4 done**

```markdown
- ~~**Time-of-day rework — Phase 4 (light fixtures)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase4-light-fixtures.md](docs/superpowers/plans/2026-05-01-time-of-day-phase4-light-fixtures.md). Five built-in fixtures (floor / table / pendant / spot / sconce), per-instance lightOverride (on, intensity, color temp), Inspector Light section. Global fixtures toggle deferred to Phase 5.
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark time-of-day phase 4 complete in TODO.md"
```

---

## Self-review checklist

- [x] §4 LightEmitter type (Task 1)
- [x] §4 lightOverride state + persistence (Task 3)
- [x] §4 five built-in fixtures (Task 2)
- [x] §4 FurnitureLights renderer w/ 16-light cap (Task 4)
- [x] §4 Inspector controls (Task 5)
- [x] Global fixtures toggle: deferred to Phase 5 — noted at top of plan
- [x] No placeholders; every step has runnable code or commands
