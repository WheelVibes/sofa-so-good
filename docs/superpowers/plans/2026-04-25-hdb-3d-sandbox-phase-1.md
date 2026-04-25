# HDB 4-Room 3D Sandbox — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a walkable, accurate-to-scale empty 3D apartment of the Serangoon North Vista 4-room HDB unit, with both orbit and first-person cameras, animated doors, day/dusk/night lighting, and a toggleable measurement overlay.

**Architecture:** Vite + React + TypeScript single-page app. Three.js rendering through `@react-three/fiber` (declarative R3F). State in Zustand. The apartment shell is fully derived from a single `apartment/constants.ts` module — no geometry is hardcoded inside components. UI chrome (Tailwind) sits outside the `<Canvas>` and shares state with the scene via Zustand only.

**Tech Stack:** Vite, React 18, TypeScript, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, Zod, Tailwind CSS, Vitest.

**Spec:** [`docs/superpowers/specs/2026-04-25-hdb-3d-sandbox-design.md`](../specs/2026-04-25-hdb-3d-sandbox-design.md)

**Scope:** Phase 1 only. Phases 2 (furniture catalog + editor) and 3 (persistence + finishes) get their own plans after Phase 1 ships.

**Commit convention:** every task = one commit. Never bundle modules.

---

## File structure (created in this phase)

```
sofa-so-good/
  package.json, tsconfig.json, vite.config.ts, tailwind.config.js, postcss.config.js, vitest.config.ts
  index.html
  src/
    main.tsx, App.tsx, index.css
    apartment/
      types.ts                # RoomId, RoomDef, WallSpec, DoorSpec, WindowSpec, FlatSpec
      constants.ts            # FLAT, ROOMS, WALLS, DOORS, WINDOWS — single source of truth
      rooms.ts                # Room polygon helpers
      wallSegments.ts         # Wall-segment generation (cutouts → solid spans + headers + sills)
      Apartment.tsx           # Composes Floor/Ceiling/Walls/Doors/Windows/Fixtures
      Floor.tsx, Ceiling.tsx, Walls.tsx, Door.tsx, Window.tsx, Fixtures.tsx
    scene/
      Scene.tsx               # R3F <Canvas> root
      cameras/
        CameraRig.tsx, OrbitCamera.tsx, FirstPersonCamera.tsx
      lighting/
        Sky.tsx, Lighting.tsx
    state/
      store.ts                # Zustand: cameraMode, timeOfDay, showMeasurements, doors
    controls/
      keybindings.ts, useKeyboard.ts
    collision/
      walls.ts                # AABB swept-test + tests
    ui/
      Toolbar.tsx, MeasurementOverlay.tsx, HelpHint.tsx, WebGLFallback.tsx
    utils/
      measurement.ts          # Format meters → human-readable + tests
```

Phase 2 will add `furniture/`, `state/storage/`, `state/schema.ts`, `collision/placement.ts`, more `ui/` panels, and `controls/` extensions. Don't pre-create those folders.

---

## Task 1: Vite + React + TypeScript scaffold

**Files:** Create `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `.gitignore`.

We create the Vite project files manually rather than using `npm create vite@latest .` because the working directory already contains `docs/` and `.git/`, which would trigger an interactive overwrite prompt that subagents can't reliably answer.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sofa-so-good",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>sofa-so-good</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create `src/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center text-neutral-600">
      sofa-so-good — initializing
    </div>
  );
}
```

- [ ] **Step 8: Create `src/index.css`**

```css
:root { color-scheme: light; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; }
body { font-family: ui-sans-serif, system-ui, sans-serif; }
```

- [ ] **Step 9: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 10: Create `.gitignore`**

```
node_modules/
dist/
dist-ssr/
*.local
.DS_Store
*.log
.idea/
.vscode/
.env
.env.local
```

- [ ] **Step 11: Install dependencies**

```bash
npm install
```
Expected: dependencies install cleanly, `node_modules/` populated, `package-lock.json` created.

- [ ] **Step 12: Verify TypeScript resolves**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 13: Verify dev server boots**

```bash
npm run dev
```
Expected: server starts on `http://localhost:5173`. The placeholder text "sofa-so-good — initializing" should render. Stop with Ctrl-C.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/App.tsx src/index.css src/vite-env.d.ts .gitignore
git commit -m "Scaffold Vite + React + TypeScript project"
```

---

## Task 2: Install runtime dependencies (Three / R3F / drei / Zustand / Zod)

**Files:** `package.json`, `package-lock.json`.

- [ ] **Step 1: Install runtime deps**

```bash
npm install three @react-three/fiber @react-three/drei zustand zod
npm install -D @types/three
```
Expected: all packages install successfully.

- [ ] **Step 2: Verify TypeScript still resolves**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add Three.js, R3F, drei, Zustand, Zod deps"
```

---

## Task 3: Tailwind CSS setup

**Files:** `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `package.json`.

- [ ] **Step 1: Install Tailwind**

```bash
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```
Expected: `tailwind.config.js` and `postcss.config.js` are created.

- [ ] **Step 2: Configure content globs**

Overwrite `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: Add Tailwind directives**

Overwrite `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: light; }
html, body, #root { height: 100%; }
body { @apply font-sans antialiased; }
```

- [ ] **Step 4: Verify Tailwind classes render**

Update `src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-700">
      sofa-so-good — initializing
    </div>
  );
}
```
Run `npm run dev` and confirm the page has the light grey background and centered text. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Configure Tailwind CSS"
```

---

## Task 4: Vitest setup

**Files:** `vitest.config.ts`, `src/setupTests.ts`, `package.json`, `src/utils/measurement.ts`, `src/utils/measurement.test.ts`.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/ui happy-dom @testing-library/react @testing-library/jest-dom
```

(Note: we use `happy-dom` rather than `jsdom`. The latest jsdom (v27) has a transitive ESM-only dependency that breaks Vitest's fork pool with the React plugin. `happy-dom` is the documented Vitest alternative and provides the same DOM API surface for these tests.)

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
});
```

- [ ] **Step 3: Create `src/setupTests.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to `package.json`**

In `package.json` `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test against `utils/measurement.ts`**

Create `src/utils/measurement.ts`:
```ts
export function formatMeters(metres: number): string {
  return `${metres.toFixed(2)} m`;
}

export function formatRoomSize(width: number, depth: number, area: number): string {
  return `${width.toFixed(2)} × ${depth.toFixed(2)} m · ${area.toFixed(1)} m²`;
}
```

Create `src/utils/measurement.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatMeters, formatRoomSize } from './measurement';

describe('formatMeters', () => {
  it('formats with two decimals', () => {
    expect(formatMeters(2.6)).toBe('2.60 m');
  });
});

describe('formatRoomSize', () => {
  it('formats W × D · area', () => {
    expect(formatRoomSize(3.6, 3.4, 12.24)).toBe('3.60 × 3.40 m · 12.2 m²');
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Set up Vitest with measurement utility"
```

---

## Task 5: Apartment domain types

**Files:** Create `src/apartment/types.ts`.

- [ ] **Step 1: Define types**

```ts
// src/apartment/types.ts

export type RoomId =
  | 'mainBedroom'
  | 'bedroom2'
  | 'bedroom3'
  | 'bath1'
  | 'bath2'
  | 'livingDining'
  | 'kitchen'
  | 'serviceYard'
  | 'householdShelter'
  | 'acLedge';

export type DoorId = string;
export type WindowId = string;

/** Position in metres from the apartment origin (0,0 at NW external corner, +X east, +Z south). */
export type Vec2 = readonly [number, number];

export interface RoomDef {
  id: RoomId;
  name: string;
  /** NW corner of the *interior* of the room (after wall thickness). */
  origin: Vec2;
  /** Interior width (X-axis). */
  width: number;
  /** Interior depth (Z-axis). */
  depth: number;
  /** Optional ceiling override; defaults to FLAT.ceilingHeight. */
  ceilingHeight?: number;
  external?: boolean;
  /** Free-form derivation note for traceability (see spec §6.2). */
  derivation?: string;
}

export type CutoutKind = 'door' | 'window';

export interface Cutout {
  kind: CutoutKind;
  /** Distance from wall start at floor level (X-axis along the wall). */
  offset: number;
  /** Cutout width along the wall. */
  width: number;
  /** Bottom edge height above floor. */
  sill: number;
  /** Top edge height above floor. */
  head: number;
  /** Reference to a DoorSpec or WindowSpec id, when relevant. */
  refId?: string;
}

export interface WallSpec {
  id: string;
  start: Vec2;
  end: Vec2;
  thickness: 'external' | 'internal';
  cutouts: Cutout[];
}

export interface DoorSpec {
  id: DoorId;
  /** Wall id this door cuts through. */
  wallId: string;
  /** Distance along the wall (must match a Cutout.offset on that wall). */
  offset: number;
  width: number;
  /** Hinge side relative to wall direction. */
  hinge: 'start' | 'end';
  /** Which side the door swings into. */
  swing: 'left' | 'right';
  /** Initial state. */
  defaultOpen: boolean;
}

export interface WindowSpec {
  id: WindowId;
  wallId: string;
  offset: number;
  width: number;
  sill: number;
  head: number;
}

export interface FlatSpec {
  ceilingHeight: number;
  bathroomCeilingHeight: number;
  externalWallThickness: number;
  internalWallThickness: number;
  doorHeight: number;
  mainDoorWidth: number;
  internalDoorWidth: number;
  bedroomWindowSill: number;
  windowHeadHeight: number;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/apartment/types.ts
git commit -m "Define apartment domain types"
```

---

## Task 6: Derive apartment dimensions and write `constants.ts`

**This is an interactive task** — the user must approve the calibrated dimensions before they're committed (per spec §6.3).

**Files:** Create `src/apartment/constants.ts`. Reference the floor-plan image the user provided in the original conversation.

- [ ] **Step 1: Web-search for the official Serangoon North Vista 4-room floor plan**

Use the WebSearch / WebFetch tools (load via ToolSearch if not already loaded). Search terms to try:
- `Serangoon North Vista 4-room floor plan dimensions`
- `Serangoon North Vista BTO 4-room`
- `HDB Serangoon North Vista site:hdb.gov.sg`

Goal: find an authoritative source (HDB, sales brochure, official plan image) that publishes per-room dimensions for the 4-room layout matching the user's floor plan. Capture every URL and the specific numbers found.

- [ ] **Step 2: Pixel-measure each room from the user's floor plan**

In the floor-plan image (provided in conversation), measure pixel width and depth for each room: `mainBedroom`, `bedroom2`, `bedroom3`, `bath1`, `bath2`, `livingDining` (treat as L-shape: living rectangle + dining rectangle + connector if any), `kitchen`, `serviceYard`, `householdShelter`, `acLedge`.

Record each as `{ pixelW, pixelD }`.

- [ ] **Step 3: Calibrate**

If Step 1 found published dimensions, use them as the source of truth for those rooms. For unpublished rooms (or if Step 1 was empty), solve:
```
Σ (width_i × depth_i) ≈ 90 m²        for internal rooms
acLedge area ≈ 3 m²
```
where `width_i = pixelW_i × k` and `depth_i = pixelD_i × k` for a single global scale `k`.

Round each result to the nearest 50 mm. Re-balance any rounding error into `livingDining` (the largest space).

- [ ] **Step 4: Present calibration to user — INTERACTIVE GATE**

Before writing any code in this task, present the user with a table:
```
Room               Source        Width × Depth      Area
mainBedroom        HDB published 3.60 × 3.40 m      12.24 m²
bedroom2           calibrated    2.70 × 3.00 m       8.10 m²
...
```
Include Step 1's URLs as citations. Ask: *"Approve these dimensions for `constants.ts`, or want any adjustments?"*

Wait for approval. Apply requested adjustments. Do not proceed to Step 5 until approved.

- [ ] **Step 5: Write `src/apartment/constants.ts`**

Use the approved values. The file MUST include:
- `FLAT` — the standard HDB specs (spec §6.1).
- `ROOMS` — the calibrated room dimensions, each with a `derivation` comment recording pixel measurement, source (published vs calibrated), and any rounding adjustment.
- `WALLS` — explicit wall segment list with `start`/`end` coordinates derived from `ROOMS`. Each wall's cutouts are listed inline.
- `DOORS` — one entry per door visible on the floor plan: main entrance (living/dining), main bedroom, bedroom 2, bedroom 3, bath 1, bath 2, kitchen→service yard, household shelter.
- `WINDOWS` — bedroom windows (3 total in top row), living/dining bay window(s) on the east side per floor plan, kitchen window over service yard if present.

Skeleton (fill in approved numbers):
```ts
import type { DoorSpec, FlatSpec, RoomDef, RoomId, WallSpec, WindowSpec } from './types';

export const FLAT: FlatSpec = {
  ceilingHeight: 2.6,
  bathroomCeilingHeight: 2.4,
  externalWallThickness: 0.2,
  internalWallThickness: 0.1,
  doorHeight: 2.1,
  mainDoorWidth: 1.0,
  internalDoorWidth: 0.8,
  bedroomWindowSill: 0.95,
  windowHeadHeight: 2.1,
};

export const ROOMS: Record<RoomId, RoomDef> = {
  mainBedroom: {
    id: 'mainBedroom',
    name: 'Main Bedroom',
    origin: [/* fill in */, /* fill in */],
    width: /* fill in */,
    depth: /* fill in */,
    derivation: 'Pixel: __ × __; source: __; rounded to 50mm.',
  },
  // ... all other rooms ...
};

export const WALLS: WallSpec[] = [
  // External perimeter
  { id: 'wall-ext-N', start: [0, 0], end: [/* total width */, 0], thickness: 'external', cutouts: [/* none on north */] },
  // ... and so on for east, south, west, then internal partitions
];

export const DOORS: DoorSpec[] = [
  { id: 'door-main', wallId: 'wall-ext-E', offset: /* */, width: FLAT.mainDoorWidth, hinge: 'start', swing: 'right', defaultOpen: false },
  // ...
];

export const WINDOWS: WindowSpec[] = [
  { id: 'win-mainBedroom', wallId: 'wall-ext-N', offset: /* */, width: /* */, sill: FLAT.bedroomWindowSill, head: FLAT.windowHeadHeight },
  // ...
];

/** Total interior area (sum of internal rooms). Should be ≈ 90 m² ± 0.5. */
export const INTERIOR_AREA_M2 = /* computed */;
```

- [ ] **Step 6: Add a sanity test**

Create `src/apartment/constants.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ROOMS, WALLS, DOORS, WINDOWS, INTERIOR_AREA_M2 } from './constants';

describe('apartment constants', () => {
  it('total internal area is within 0.5 m² of 90', () => {
    const sum = Object.values(ROOMS)
      .filter(r => !r.external)
      .reduce((acc, r) => acc + r.width * r.depth, 0);
    expect(Math.abs(sum - 90)).toBeLessThan(0.5);
    expect(Math.abs(INTERIOR_AREA_M2 - sum)).toBeLessThan(0.01);
  });

  it('every door references an existing wall', () => {
    const wallIds = new Set(WALLS.map(w => w.id));
    for (const d of DOORS) expect(wallIds.has(d.wallId)).toBe(true);
  });

  it('every window references an existing wall', () => {
    const wallIds = new Set(WALLS.map(w => w.id));
    for (const w of WINDOWS) expect(wallIds.has(w.wallId)).toBe(true);
  });

  it('every door cutout exists on its wall', () => {
    for (const d of DOORS) {
      const wall = WALLS.find(w => w.id === d.wallId)!;
      const matching = wall.cutouts.find(
        c => c.kind === 'door' && Math.abs(c.offset - d.offset) < 0.001 && Math.abs(c.width - d.width) < 0.001
      );
      expect(matching, `door ${d.id} has no matching cutout on ${d.wallId}`).toBeDefined();
    }
  });

  it('every window cutout exists on its wall', () => {
    for (const w of WINDOWS) {
      const wall = WALLS.find(x => x.id === w.wallId)!;
      const matching = wall.cutouts.find(
        c => c.kind === 'window' && Math.abs(c.offset - w.offset) < 0.001 && Math.abs(c.width - w.width) < 0.001
      );
      expect(matching, `window ${w.id} has no matching cutout on ${w.wallId}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 7: Run tests**

```bash
npm test
```
Expected: all tests pass. If they don't, fix `constants.ts` (the test is the contract).

- [ ] **Step 8: Commit**

```bash
git add src/apartment/types.ts src/apartment/constants.ts src/apartment/constants.test.ts
git commit -m "Add calibrated apartment dimensions in constants.ts"
```

---

## Task 7: `apartment/rooms.ts` — room polygon helpers

**Files:** Create `src/apartment/rooms.ts` and `src/apartment/rooms.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/apartment/rooms.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { roomPolygon, roomCentroid, roomArea } from './rooms';
import { ROOMS } from './constants';

describe('roomPolygon', () => {
  it('returns 4 corners in NW-NE-SE-SW order', () => {
    const poly = roomPolygon('mainBedroom');
    expect(poly).toHaveLength(4);
    const r = ROOMS.mainBedroom;
    expect(poly[0]).toEqual(r.origin);
    expect(poly[1]).toEqual([r.origin[0] + r.width, r.origin[1]]);
    expect(poly[2]).toEqual([r.origin[0] + r.width, r.origin[1] + r.depth]);
    expect(poly[3]).toEqual([r.origin[0], r.origin[1] + r.depth]);
  });
});

describe('roomCentroid', () => {
  it('returns the rectangle center', () => {
    const c = roomCentroid('mainBedroom');
    const r = ROOMS.mainBedroom;
    expect(c[0]).toBeCloseTo(r.origin[0] + r.width / 2);
    expect(c[1]).toBeCloseTo(r.origin[1] + r.depth / 2);
  });
});

describe('roomArea', () => {
  it('returns width × depth', () => {
    const r = ROOMS.mainBedroom;
    expect(roomArea('mainBedroom')).toBeCloseTo(r.width * r.depth);
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npm test -- rooms
```
Expected: FAIL — `roomPolygon`, `roomCentroid`, `roomArea` not defined.

- [ ] **Step 3: Implement**

Create `src/apartment/rooms.ts`:
```ts
import { ROOMS } from './constants';
import type { RoomId, Vec2 } from './types';

/** Returns the four corner points of a room's interior, NW→NE→SE→SW. */
export function roomPolygon(id: RoomId): Vec2[] {
  const r = ROOMS[id];
  const [x, z] = r.origin;
  return [
    [x, z],
    [x + r.width, z],
    [x + r.width, z + r.depth],
    [x, z + r.depth],
  ];
}

export function roomCentroid(id: RoomId): Vec2 {
  const r = ROOMS[id];
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2];
}

export function roomArea(id: RoomId): number {
  const r = ROOMS[id];
  return r.width * r.depth;
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npm test -- rooms
```
Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/apartment/rooms.ts src/apartment/rooms.test.ts
git commit -m "Add room polygon and centroid helpers"
```

---

## Task 8: R3F Scene root with empty Canvas

**Files:** Create `src/scene/Scene.tsx`. Modify `src/App.tsx`.

- [ ] **Step 1: Create `src/scene/Scene.tsx`**

```tsx
import { Canvas } from '@react-three/fiber';

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#e9eef2']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <gridHelper args={[20, 20, '#888', '#ccc']} />
      <axesHelper args={[2]} />
    </Canvas>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`**

```tsx
import { Scene } from './scene/Scene';

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Scene />
    </div>
  );
}
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: a 3D viewport with a grid floor and red/green/blue axes. No interactivity yet.

- [ ] **Step 4: Commit**

```bash
git add src/scene/Scene.tsx src/App.tsx
git commit -m "Mount empty R3F Canvas with grid helper"
```

---

## Task 9: Apartment `Floor.tsx`

**Files:** Create `src/apartment/Floor.tsx`. Modify `src/scene/Scene.tsx` to include it.

- [ ] **Step 1: Create `Floor.tsx`**

```tsx
import { ROOMS } from './constants';
import { roomCentroid } from './rooms';

const FLOOR_FINISH: Record<string, string> = {
  livingDining: '#d8c9a8',
  kitchen: '#cfd6d8',
  bath1: '#c7cdd0',
  bath2: '#c7cdd0',
  serviceYard: '#bfc4c6',
  householdShelter: '#cfcfcf',
  default: '#d6c5a0',
};

export function Floor() {
  return (
    <group>
      {Object.values(ROOMS)
        .filter(r => !r.external)
        .map(r => {
          const [cx, cz] = roomCentroid(r.id);
          const color = FLOOR_FINISH[r.id] ?? FLOOR_FINISH.default;
          return (
            <mesh
              key={r.id}
              position={[cx, 0, cz]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[r.width, r.depth]} />
              <meshStandardMaterial color={color} roughness={0.85} />
            </mesh>
          );
        })}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

In `src/scene/Scene.tsx`, replace `<gridHelper>` and `<axesHelper>` with `<Floor />`:
```tsx
import { Floor } from '../apartment/Floor';
// inside <Canvas>:
<Floor />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: per-room coloured floor planes laid out matching the floor plan, viewed from an isometric angle.

- [ ] **Step 4: Commit**

```bash
git add src/apartment/Floor.tsx src/scene/Scene.tsx
git commit -m "Render per-room apartment floor"
```

---

## Task 10: Apartment `Ceiling.tsx`

**Files:** Create `src/apartment/Ceiling.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create `Ceiling.tsx`**

```tsx
import { FLAT, ROOMS } from './constants';
import { roomCentroid } from './rooms';

export function Ceiling() {
  return (
    <group>
      {Object.values(ROOMS)
        .filter(r => !r.external)
        .map(r => {
          const [cx, cz] = roomCentroid(r.id);
          const h = r.ceilingHeight ?? FLAT.ceilingHeight;
          return (
            <mesh
              key={r.id}
              position={[cx, h, cz]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[r.width, r.depth]} />
              <meshStandardMaterial color="#fafafa" roughness={1} />
            </mesh>
          );
        })}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

In `src/scene/Scene.tsx`:
```tsx
import { Ceiling } from '../apartment/Ceiling';
// inside <Canvas>:
<Ceiling />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: a per-room ceiling plane is now drawn at 2.6 m (2.4 m for bathrooms), capping each room. From the default isometric angle you may see ceilings only when looking from above.

- [ ] **Step 4: Commit**

```bash
git add src/apartment/Ceiling.tsx src/scene/Scene.tsx
git commit -m "Render apartment ceilings (2.4 m for bathrooms)"
```

---

## Task 11: Apartment `Walls.tsx`

**Files:** Create `src/apartment/Walls.tsx`. Modify `src/scene/Scene.tsx`.

For each wall: emit one or more box meshes that span from cutout to cutout (skipping the cutout span). Above each cutout, also emit a "header" segment from cutout top to ceiling. Below each window cutout, emit a "sill" segment from floor to cutout bottom.

- [ ] **Step 1: Create the segment-builder helper**

Create `src/apartment/wallSegments.ts`:
```ts
import { FLAT } from './constants';
import type { WallSpec } from './types';

export interface WallSegment {
  /** X-position along the wall axis (start). */
  start: number;
  /** X-position along the wall axis (end). */
  end: number;
  /** Bottom height. */
  bottom: number;
  /** Top height. */
  top: number;
}

/** Returns the solid wall segments to render, given a wall spec. */
export function buildWallSegments(wall: WallSpec, ceilingHeight: number): WallSegment[] {
  const segments: WallSegment[] = [];
  const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const cutouts = [...wall.cutouts].sort((a, b) => a.offset - b.offset);

  // Solid spans between cutouts (full height)
  let cursor = 0;
  for (const c of cutouts) {
    if (c.offset > cursor) {
      segments.push({ start: cursor, end: c.offset, bottom: 0, top: ceilingHeight });
    }
    cursor = c.offset + c.width;
  }
  if (cursor < wallLength) {
    segments.push({ start: cursor, end: wallLength, bottom: 0, top: ceilingHeight });
  }

  // Sill below windows
  for (const c of cutouts) {
    if (c.kind === 'window' && c.sill > 0) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: 0, top: c.sill });
    }
  }

  // Header above doors and windows
  for (const c of cutouts) {
    if (c.head < ceilingHeight) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: c.head, top: ceilingHeight });
    }
  }

  return segments;
}

export function wallThicknessMetres(wall: WallSpec): number {
  return wall.thickness === 'external' ? FLAT.externalWallThickness : FLAT.internalWallThickness;
}
```

- [ ] **Step 2: Test the helper**

Create `src/apartment/wallSegments.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildWallSegments } from './wallSegments';
import type { WallSpec } from './types';

const ceiling = 2.6;

describe('buildWallSegments', () => {
  it('returns one full-height segment for a wall with no cutouts', () => {
    const wall: WallSpec = { id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal', cutouts: [] };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toEqual([{ start: 0, end: 4, bottom: 0, top: ceiling }]);
  });

  it('splits around a door and adds a header above it', () => {
    const wall: WallSpec = {
      id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal',
      cutouts: [{ kind: 'door', offset: 1, width: 0.8, sill: 0, head: 2.1 }],
    };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toContainEqual({ start: 0, end: 1, bottom: 0, top: ceiling });
    expect(seg).toContainEqual({ start: 1.8, end: 4, bottom: 0, top: ceiling });
    expect(seg).toContainEqual({ start: 1, end: 1.8, bottom: 2.1, top: ceiling });
  });

  it('emits sill below a window plus header above', () => {
    const wall: WallSpec = {
      id: 'w', start: [0, 0], end: [4, 0], thickness: 'external',
      cutouts: [{ kind: 'window', offset: 1, width: 1.5, sill: 0.95, head: 2.1 }],
    };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 0, top: 0.95 });
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 2.1, top: ceiling });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- wallSegments
```
Expected: all 3 pass.

- [ ] **Step 4: Create `Walls.tsx`**

```tsx
import { FLAT, WALLS } from './constants';
import { buildWallSegments, wallThicknessMetres } from './wallSegments';
import type { WallSpec } from './types';

function WallRender({ wall }: { wall: WallSpec }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const thickness = wallThicknessMetres(wall);
  const segments = buildWallSegments(wall, FLAT.ceilingHeight);
  // Position: midpoint between start and end at floor; rotate around Y by -angle so wall lies along local X.
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {segments.map((s, i) => {
        const segLen = s.end - s.start;
        const segMid = (s.start + s.end) / 2 - length / 2;
        const segHeight = s.top - s.bottom;
        const segMidY = s.bottom + segHeight / 2;
        return (
          <mesh key={i} position={[segMid, segMidY, 0]} castShadow receiveShadow>
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial color="#f4ede0" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Walls() {
  return (
    <group>
      {WALLS.map(w => <WallRender key={w.id} wall={w} />)}
    </group>
  );
}
```

- [ ] **Step 5: Add to Scene**

In `src/scene/Scene.tsx`:
```tsx
import { Walls } from '../apartment/Walls';
// inside <Canvas>:
<Walls />
```

- [ ] **Step 6: Visual verification**

```bash
npm run dev
```
Expected: walls rise around each room. Doorways and windows show as gaps. Window sills are visible below window openings; door headers above doorways. Use mouse drag (already provided by default camera in next task — for now, refresh and accept what you see) to rotate.

- [ ] **Step 7: Commit**

```bash
git add src/apartment/Walls.tsx src/apartment/wallSegments.ts src/apartment/wallSegments.test.ts src/scene/Scene.tsx
git commit -m "Render apartment walls with door and window cutouts"
```

---

## Task 12: `Window.tsx` — glass panes

**Files:** Create `src/apartment/Window.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create `Window.tsx`**

```tsx
import { WALLS, WINDOWS } from './constants';
import type { WindowSpec, WallSpec } from './types';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find(w => w.id === wallId);
}

function WindowPane({ spec }: { spec: WindowSpec }) {
  const wall = findWall(spec.wallId);
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const localX = spec.offset + spec.width / 2 - length / 2;
  const paneHeight = spec.head - spec.sill;
  const paneCenterY = spec.sill + paneHeight / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <mesh position={[localX, paneCenterY, 0]}>
        <boxGeometry args={[spec.width, paneHeight, 0.04]} />
        <meshPhysicalMaterial
          color="#cfe1ec"
          transmission={0.85}
          roughness={0.05}
          thickness={0.04}
          opacity={0.5}
          transparent
        />
      </mesh>
    </group>
  );
}

export function Windows() {
  return (
    <group>
      {WINDOWS.map(w => <WindowPane key={w.id} spec={w} />)}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

```tsx
import { Windows } from '../apartment/Window';
// inside <Canvas>:
<Windows />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: translucent blue-ish glass panes fill the window cutouts.

- [ ] **Step 4: Commit**

```bash
git add src/apartment/Window.tsx src/scene/Scene.tsx
git commit -m "Render translucent window panes"
```

---

## Task 13: Static `Door.tsx` (geometry only, no animation)

**Files:** Create `src/apartment/Door.tsx`. Modify `src/scene/Scene.tsx`.

This task ships door *geometry* in the closed position. Animation and click-to-open are added in Task 18 once the store exists.

- [ ] **Step 1: Create `Door.tsx`**

```tsx
import { DOORS, FLAT, WALLS } from './constants';
import type { DoorSpec, WallSpec } from './types';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find(w => w.id === wallId);
}

function DoorLeaf({ spec }: { spec: DoorSpec }) {
  const wall = findWall(spec.wallId);
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  // Hinge X (in wall-local coords): start of cutout if hinge==='start', else end.
  const hingeLocalX =
    spec.hinge === 'start'
      ? spec.offset - length / 2
      : spec.offset + spec.width - length / 2;

  // Door swings 0° (closed) to ±90° around its hinge axis (Y).
  const swingSign = spec.swing === 'left' ? 1 : -1;
  const angleY = 0; // closed; animation comes in Task 18.
  const direction = spec.hinge === 'start' ? 1 : -1;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group position={[hingeLocalX, 0, 0]} rotation={[0, swingSign * angleY, 0]}>
        <mesh
          position={[(direction * spec.width) / 2, FLAT.doorHeight / 2, 0]}
          castShadow
        >
          <boxGeometry args={[spec.width, FLAT.doorHeight, 0.04]} />
          <meshStandardMaterial color="#9d7c54" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export function Doors() {
  return (
    <group>
      {DOORS.map(d => <DoorLeaf key={d.id} spec={d} />)}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

```tsx
import { Doors } from '../apartment/Door';
// inside <Canvas>:
<Doors />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: brown door leaves fill door openings. All static.

- [ ] **Step 4: Commit**

```bash
git add src/apartment/Door.tsx src/scene/Scene.tsx
git commit -m "Render static door leaves"
```

---

## Task 14: `Fixtures.tsx` — toilets, sinks, shower trays

**Files:** Create `src/apartment/Fixtures.tsx`. Modify `src/scene/Scene.tsx`.

Use simple primitives. Fixture positions are derived from `ROOMS` (each bathroom gets one toilet + one sink + one shower tray; kitchen gets a counter strip).

- [ ] **Step 1: Create `Fixtures.tsx`**

```tsx
import { ROOMS } from './constants';
import type { RoomId } from './types';

interface FixturePlacement {
  /** Position relative to the room's NW corner. */
  offset: [number, number];
  size: [number, number, number]; // x, y, z (metres)
  color: string;
}

const FIXTURES: Partial<Record<RoomId, FixturePlacement[]>> = {
  bath1: [
    { offset: [0.2, 0.2], size: [0.5, 0.45, 0.7], color: '#fafafa' }, // toilet
    { offset: [0.2, 1.0], size: [0.5, 0.85, 0.45], color: '#fafafa' }, // sink + counter
    { offset: [0.0, 1.5], size: [0.9, 0.05, 0.9], color: '#dfe3e6' }, // shower tray
  ],
  bath2: [
    { offset: [0.2, 0.2], size: [0.5, 0.45, 0.7], color: '#fafafa' },
    { offset: [0.2, 1.0], size: [0.5, 0.85, 0.45], color: '#fafafa' },
    { offset: [0.0, 1.3], size: [0.9, 0.05, 0.9], color: '#dfe3e6' },
  ],
};

export function Fixtures() {
  return (
    <group>
      {Object.entries(FIXTURES).flatMap(([roomId, placements]) => {
        const r = ROOMS[roomId as RoomId];
        return (placements ?? []).map((p, i) => {
          const x = r.origin[0] + p.offset[0] + p.size[0] / 2;
          const z = r.origin[1] + p.offset[1] + p.size[2] / 2;
          const y = p.size[1] / 2;
          return (
            <mesh key={`${roomId}-${i}`} position={[x, y, z]} castShadow receiveShadow>
              <boxGeometry args={p.size} />
              <meshStandardMaterial color={p.color} roughness={0.5} />
            </mesh>
          );
        });
      })}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

```tsx
import { Fixtures } from '../apartment/Fixtures';
// inside <Canvas>:
<Fixtures />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: each bathroom has three white-ish boxes representing toilet, sink, and shower tray. Positions may need adjusting in Step 4 based on the floor plan.

- [ ] **Step 4: Adjust placements to match floor plan**

Compare the rendered fixture positions to the floor-plan image (toilet on the side closer to the bath/WC label, sink against the partition, shower opposite). Edit the `FIXTURES` map in `Fixtures.tsx` until they visually match. Document any non-obvious offsets with a brief comment.

- [ ] **Step 5: Commit**

```bash
git add src/apartment/Fixtures.tsx src/scene/Scene.tsx
git commit -m "Add bathroom fixtures (toilet, sink, shower tray)"
```

---

## Task 15: `Apartment.tsx` composer

**Files:** Create `src/apartment/Apartment.tsx`. Modify `src/scene/Scene.tsx` to use it.

- [ ] **Step 1: Create `Apartment.tsx`**

```tsx
import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Fixtures } from './Fixtures';
import { Floor } from './Floor';
import { Walls } from './Walls';
import { Windows } from './Window';

export function Apartment() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <Walls />
      <Windows />
      <Doors />
      <Fixtures />
    </group>
  );
}
```

- [ ] **Step 2: Replace individual imports in Scene with Apartment**

Update `src/scene/Scene.tsx`:
```tsx
import { Canvas } from '@react-three/fiber';
import { Apartment } from '../apartment/Apartment';

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#e9eef2']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <Apartment />
    </Canvas>
  );
}
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: identical visual output to before, but Scene is much cleaner.

- [ ] **Step 4: Commit**

```bash
git add src/apartment/Apartment.tsx src/scene/Scene.tsx
git commit -m "Compose apartment shell into single Apartment component"
```

---

## Task 16: Zustand store skeleton

**Files:** Create `src/state/store.ts` and `src/state/store.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/state/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';

describe('store — Phase 1 slice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('starts in orbit camera mode at day with measurements off', () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe('orbit');
    expect(s.timeOfDay).toBe('day');
    expect(s.showMeasurements).toBe(false);
  });

  it('switches camera mode', () => {
    useStore.getState().setCameraMode('firstPerson');
    expect(useStore.getState().cameraMode).toBe('firstPerson');
  });

  it('cycles time of day', () => {
    useStore.getState().setTimeOfDay('dusk');
    expect(useStore.getState().timeOfDay).toBe('dusk');
  });

  it('toggles measurements', () => {
    useStore.getState().toggleMeasurements();
    expect(useStore.getState().showMeasurements).toBe(true);
    useStore.getState().toggleMeasurements();
    expect(useStore.getState().showMeasurements).toBe(false);
  });

  it('toggles a door', () => {
    useStore.getState().toggleDoor('door-main');
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
    useStore.getState().toggleDoor('door-main');
    expect(useStore.getState().doors['door-main']?.open).toBe(false);
  });

  it('opens a door explicitly without toggling', () => {
    useStore.getState().setDoorOpen('door-main', true);
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
    useStore.getState().setDoorOpen('door-main', true); // idempotent
    expect(useStore.getState().doors['door-main']?.open).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- store
```
Expected: FAIL — `useStore` not defined.

- [ ] **Step 3: Implement**

Create `src/state/store.ts`:
```ts
import { create } from 'zustand';

export type CameraMode = 'orbit' | 'firstPerson';
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface DoorState { open: boolean }

interface State {
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  showMeasurements: boolean;
  doors: Record<string, DoorState>;

  setCameraMode: (m: CameraMode) => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  toggleMeasurements: () => void;
  toggleDoor: (id: string) => void;
  setDoorOpen: (id: string, open: boolean) => void;
  __resetForTest: () => void;
}

const INITIAL: Pick<State, 'cameraMode' | 'timeOfDay' | 'showMeasurements' | 'doors'> = {
  cameraMode: 'orbit',
  timeOfDay: 'day',
  showMeasurements: false,
  doors: {},
};

export const useStore = create<State>((set) => ({
  ...INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
  setTimeOfDay: (t) => set({ timeOfDay: t }),
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  toggleDoor: (id) =>
    set((s) => ({
      doors: { ...s.doors, [id]: { open: !(s.doors[id]?.open ?? false) } },
    })),
  setDoorOpen: (id, open) =>
    set((s) => ({ doors: { ...s.doors, [id]: { open } } })),
  __resetForTest: () => set({ ...INITIAL, doors: {} }),
}));
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- store
```
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
git commit -m "Add Zustand store with Phase 1 state slice"
```

---

## Task 17: Keybindings + `useKeyboard` hook

**Files:** Create `src/controls/keybindings.ts`, `src/controls/useKeyboard.ts`.

- [ ] **Step 1: Define keybindings table**

Create `src/controls/keybindings.ts`:
```ts
export const KEYBINDINGS = {
  toggleMeasurements: 'KeyM',
  toggleCameraMode: 'KeyV',
  walkForward: 'KeyW',
  walkBack: 'KeyS',
  walkLeft: 'KeyA',
  walkRight: 'KeyD',
} as const;

export type KeybindingId = keyof typeof KEYBINDINGS;
```

- [ ] **Step 2: Create the hook**

Create `src/controls/useKeyboard.ts`:
```ts
import { useEffect } from 'react';

/**
 * Subscribes to keydown events globally. The handler is fired with the
 * raw KeyboardEvent.code (e.g. 'KeyW', 'Escape'). Listeners are removed
 * on unmount.
 */
export function useKeyboard(handler: (code: string, e: KeyboardEvent) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handler(e.code, e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
```

- [ ] **Step 3: Wire `M` key to toggle measurements (smoke usage)**

In `src/App.tsx`:
```tsx
import { useCallback } from 'react';
import { Scene } from './scene/Scene';
import { useStore } from './state/store';
import { KEYBINDINGS } from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore(s => s.toggleMeasurements);
  const onKey = useCallback((code: string) => {
    if (code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
  }, [toggleMeasurements]);
  useKeyboard(onKey);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Scene />
    </div>
  );
}
```

(There's no MeasurementOverlay yet, so this won't have visible effect until Task 28.)

- [ ] **Step 4: Smoke-test in dev server**

```bash
npm run dev
```
Open the page; press `M`. No errors in console. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add src/controls/keybindings.ts src/controls/useKeyboard.ts src/App.tsx
git commit -m "Add keybindings table and useKeyboard hook"
```

---

## Task 18: Animated, click-to-open doors wired to store

**Files:** Modify `src/apartment/Door.tsx`.

- [ ] **Step 1: Animate door rotation toward target angle, driven by store**

Replace `src/apartment/Door.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group } from 'three';
import { DOORS, FLAT, WALLS } from './constants';
import { useStore } from '../state/store';
import type { DoorSpec, WallSpec } from './types';

const SWING_RAD = Math.PI / 2;
const SWING_SECONDS = 0.2;

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find(w => w.id === wallId);
}

function DoorLeaf({ spec }: { spec: DoorSpec }) {
  const wall = findWall(spec.wallId);
  const isOpen = useStore(s => s.doors[spec.id]?.open ?? spec.defaultOpen);
  const toggle = useStore(s => s.toggleDoor);
  const swingRef = useRef<Group>(null!);
  const angleRef = useRef(0); // current animated angle

  useFrame((_, dt) => {
    const target = isOpen ? SWING_RAD : 0;
    const step = (SWING_RAD / SWING_SECONDS) * dt;
    if (Math.abs(target - angleRef.current) < step) {
      angleRef.current = target;
    } else {
      angleRef.current += Math.sign(target - angleRef.current) * step;
    }
    if (swingRef.current) {
      const swingSign = spec.swing === 'left' ? 1 : -1;
      swingRef.current.rotation.y = swingSign * angleRef.current;
    }
  });

  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const hingeLocalX =
    spec.hinge === 'start' ? spec.offset - length / 2 : spec.offset + spec.width - length / 2;
  const direction = spec.hinge === 'start' ? 1 : -1;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group ref={swingRef} position={[hingeLocalX, 0, 0]}>
        <mesh
          position={[(direction * spec.width) / 2, FLAT.doorHeight / 2, 0]}
          onClick={(e) => { e.stopPropagation(); toggle(spec.id); }}
          castShadow
        >
          <boxGeometry args={[spec.width, FLAT.doorHeight, 0.04]} />
          <meshStandardMaterial color="#9d7c54" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export function Doors() {
  return (
    <group>
      {DOORS.map(d => <DoorLeaf key={d.id} spec={d} />)}
    </group>
  );
}
```

- [ ] **Step 2: Visual verification**

```bash
npm run dev
```
Expected: clicking on any door triggers a smooth ~200 ms 90° swing. Clicking again closes it.

- [ ] **Step 3: Commit**

```bash
git add src/apartment/Door.tsx
git commit -m "Animate door open/close on click, driven by store"
```

---

## Task 19: Collision math — AABB swept-test against walls

**Files:** Create `src/collision/walls.ts` and `src/collision/walls.test.ts`.

The first-person camera is treated as a circle of radius `r ≈ 0.25 m` in plan view. We allow it to slide along walls. The swept test is implemented as: for a desired displacement `d`, project against each wall segment, clamp the displacement so the circle does not pass through. Walls are 2D line segments in the X-Z plane (Y unused). We approximate by axis-aligned projections per wall (most walls are axis-aligned in this floor plan).

- [ ] **Step 1: Write the failing tests**

Create `src/collision/walls.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveMovement, type CollisionWall } from './walls';

const wallNS = (x: number, z0: number, z1: number): CollisionWall => ({
  ax: x, az: z0, bx: x, bz: z1,
});

const wallEW = (z: number, x0: number, x1: number): CollisionWall => ({
  ax: x0, az: z, bx: x1, bz: z,
});

describe('resolveMovement', () => {
  const r = 0.25;

  it('passes through a clear path unchanged', () => {
    const next = resolveMovement([0, 0], [0.5, 0], r, []);
    expect(next).toEqual([0.5, 0]);
  });

  it('clamps movement to stop short of a wall in front', () => {
    const wall = wallNS(1, -2, 2); // wall at x=1 running N/S
    const next = resolveMovement([0, 0], [1.0, 0], r, [wall]);
    // We should stop at x = 1 - r = 0.75
    expect(next[0]).toBeCloseTo(1 - r, 3);
    expect(next[1]).toBeCloseTo(0, 3);
  });

  it('allows sliding along a wall when moving diagonally into it', () => {
    const wall = wallNS(1, -2, 2);
    // Try to move to (1.5, 0.5) from (0, 0) — should slide along wall.
    const next = resolveMovement([0, 0], [1.5, 0.5], r, [wall]);
    expect(next[0]).toBeCloseTo(1 - r, 3);
    expect(next[1]).toBeCloseTo(0.5, 3);
  });

  it('blocks at perpendicular E/W wall', () => {
    const wall = wallEW(1, -2, 2);
    const next = resolveMovement([0, 0], [0, 1.5], r, [wall]);
    expect(next[1]).toBeCloseTo(1 - r, 3);
  });

  it('does not block movement past wall endpoints', () => {
    const wall = wallNS(1, 0, 0.4);
    // Moving past the south end of the wall (z=2 is well beyond endpoint z=0.4)
    const next = resolveMovement([0, 2], [2, 2], r, [wall]);
    expect(next[0]).toBeCloseTo(2, 3);
    expect(next[1]).toBeCloseTo(2, 3);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- collision
```
Expected: FAIL — `resolveMovement` not defined.

- [ ] **Step 3: Implement**

Create `src/collision/walls.ts`:
```ts
export interface CollisionWall {
  /** Endpoint A (X). */ ax: number;
  /** Endpoint A (Z). */ az: number;
  /** Endpoint B (X). */ bx: number;
  /** Endpoint B (Z). */ bz: number;
}

type Vec2 = [number, number];

/**
 * Given a current position, a desired position, a player radius, and
 * a list of wall segments in the X-Z plane, returns a new position that
 * does not penetrate any wall. The circle is allowed to slide along walls.
 *
 * Implemented in two passes (X then Z) so the player can slide along
 * axis-aligned walls — sufficient for HDB floor plans where every wall
 * is axis-aligned. For non-axis-aligned walls, swap to a generic
 * circle-vs-segment closest-point projection.
 */
export function resolveMovement(
  from: Vec2,
  to: Vec2,
  radius: number,
  walls: CollisionWall[],
): Vec2 {
  let [x, z] = from;
  const tx = to[0];
  const tz = to[1];

  // Pass 1: move in X.
  let nx = tx;
  for (const w of walls) {
    if (w.ax === w.bx) {
      // N-S wall (constant X)
      const wx = w.ax;
      const zMin = Math.min(w.az, w.bz);
      const zMax = Math.max(w.az, w.bz);
      if (z < zMin - radius || z > zMax + radius) continue;
      if (x < wx && nx > wx - radius) nx = wx - radius;
      else if (x > wx && nx < wx + radius) nx = wx + radius;
    }
  }
  x = nx;

  // Pass 2: move in Z (using updated X).
  let nz = tz;
  for (const w of walls) {
    if (w.az === w.bz) {
      // E-W wall (constant Z)
      const wz = w.az;
      const xMin = Math.min(w.ax, w.bx);
      const xMax = Math.max(w.ax, w.bx);
      if (x < xMin - radius || x > xMax + radius) continue;
      if (z < wz && nz > wz - radius) nz = wz - radius;
      else if (z > wz && nz < wz + radius) nz = wz + radius;
    }
  }
  z = nz;

  return [x, z];
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- collision
```
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/collision/walls.ts src/collision/walls.test.ts
git commit -m "Add AABB swept-collision against wall segments"
```

---

## Task 20: `OrbitCamera.tsx`

**Files:** Create `src/scene/cameras/OrbitCamera.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import { OrbitControls } from '@react-three/drei';

export function OrbitCamera() {
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={3}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[5, 1.3, 5]}
    />
  );
}
```

- [ ] **Step 2: Mount in Scene**

In `src/scene/Scene.tsx`:
```tsx
import { OrbitCamera } from './cameras/OrbitCamera';
// inside <Canvas>, after <Apartment />:
<OrbitCamera />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: dragging the canvas rotates the view; scroll zooms; right-drag pans. Camera target should stay around the apartment center. Stop with Ctrl-C.

(Optional: tweak the `target` to the actual apartment center based on the dimensions you committed in Task 6 — e.g., half the total internal extents.)

- [ ] **Step 4: Commit**

```bash
git add src/scene/cameras/OrbitCamera.tsx src/scene/Scene.tsx
git commit -m "Add orbit camera control"
```

---

## Task 21: `FirstPersonCamera.tsx` with collision

**Files:** Create `src/scene/cameras/FirstPersonCamera.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { WALLS } from '../../apartment/constants';
import { resolveMovement, type CollisionWall } from '../../collision/walls';
import { KEYBINDINGS } from '../../controls/keybindings';

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 1.4; // m/s
const PLAYER_RADIUS = 0.25;

function buildCollisionWalls(): CollisionWall[] {
  // Approximate each WallSpec as a single line segment in X-Z. Cutouts are
  // ignored for collision in this phase (closed doors will be added in Task 23).
  return WALLS.map(w => ({ ax: w.start[0], az: w.start[1], bx: w.end[0], bz: w.end[1] }));
}

export function FirstPersonCamera() {
  const { camera } = useThree();
  const pressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { pressed.current[e.code] = true; };
    const onUp = (e: KeyboardEvent) => { pressed.current[e.code] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    camera.position.set(5, EYE_HEIGHT, 5);
  }, [camera]);

  const collisionWalls = useRef(buildCollisionWalls());
  const tmpForward = useRef(new Vector3());
  const tmpRight = useRef(new Vector3());

  useFrame((_, dt) => {
    const dir = tmpForward.current;
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = tmpRight.current.set(dir.z, 0, -dir.x); // perpendicular in X-Z

    let dx = 0, dz = 0;
    if (pressed.current[KEYBINDINGS.walkForward]) { dx += dir.x; dz += dir.z; }
    if (pressed.current[KEYBINDINGS.walkBack])    { dx -= dir.x; dz -= dir.z; }
    if (pressed.current[KEYBINDINGS.walkRight])   { dx += right.x; dz += right.z; }
    if (pressed.current[KEYBINDINGS.walkLeft])    { dx -= right.x; dz -= right.z; }
    if (dx === 0 && dz === 0) return;

    const len = Math.hypot(dx, dz);
    dx = (dx / len) * WALK_SPEED * dt;
    dz = (dz / len) * WALK_SPEED * dt;
    const from: [number, number] = [camera.position.x, camera.position.z];
    const to: [number, number] = [from[0] + dx, from[1] + dz];
    const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current);
    camera.position.set(next[0], EYE_HEIGHT, next[1]);
  });

  return <PointerLockControls />;
}
```

- [ ] **Step 2: Add a temporary toggle in Scene**

For now, hard-code use of `<FirstPersonCamera />` to verify visually. In `src/scene/Scene.tsx`, replace `<OrbitCamera />` with:
```tsx
import { FirstPersonCamera } from './cameras/FirstPersonCamera';
// ...
<FirstPersonCamera />
```

(We'll wire the actual mode toggle in Task 22.)

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: clicking the canvas locks the pointer; mouse looks around; WASD walks. Walking into walls stops you cleanly; you can slide along walls. `Esc` exits pointer lock. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/scene/cameras/FirstPersonCamera.tsx src/scene/Scene.tsx
git commit -m "Add first-person camera with WASD walking and wall collision"
```

---

## Task 22: `CameraRig.tsx` — toggle between orbit and first-person

**Files:** Create `src/scene/cameras/CameraRig.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create the rig**

```tsx
import { useStore } from '../../state/store';
import { FirstPersonCamera } from './FirstPersonCamera';
import { OrbitCamera } from './OrbitCamera';

export function CameraRig() {
  const mode = useStore(s => s.cameraMode);
  return mode === 'orbit' ? <OrbitCamera /> : <FirstPersonCamera />;
}
```

- [ ] **Step 2: Replace direct camera usage in Scene**

In `src/scene/Scene.tsx`:
```tsx
import { CameraRig } from './cameras/CameraRig';
// inside <Canvas>:
<CameraRig />
```
Remove the direct `<FirstPersonCamera />` import added in Task 21.

- [ ] **Step 3: Wire `V` key to toggle camera mode**

In `src/App.tsx`, extend the keyboard handler:
```tsx
import { useCallback } from 'react';
import { Scene } from './scene/Scene';
import { useStore } from './state/store';
import { KEYBINDINGS } from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore(s => s.toggleMeasurements);
  const cameraMode = useStore(s => s.cameraMode);
  const setCameraMode = useStore(s => s.setCameraMode);
  const onKey = useCallback((code: string) => {
    if (code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
    if (code === KEYBINDINGS.toggleCameraMode) {
      setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit');
    }
  }, [toggleMeasurements, cameraMode, setCameraMode]);
  useKeyboard(onKey);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Scene />
    </div>
  );
}
```

- [ ] **Step 4: Visual verification**

```bash
npm run dev
```
Expected: page starts in orbit mode (drag to rotate). Press `V` → switches to first-person (click canvas to lock pointer, walk with WASD). Press `V` again → returns to orbit.

- [ ] **Step 5: Commit**

```bash
git add src/scene/cameras/CameraRig.tsx src/scene/Scene.tsx src/App.tsx
git commit -m "Toggle between orbit and first-person camera with V key"
```

---

## Task 23: Closed doors block first-person walking

**Files:** Modify `src/scene/cameras/FirstPersonCamera.tsx`.

When a door is *closed* (per store state), its swing arc occupies the doorway and walking through should be blocked. We approximate the closed door as a single line segment along the wall covering the cutout.

- [ ] **Step 1: Update `buildCollisionWalls` to account for door state**

Update the imports at the top of `FirstPersonCamera.tsx` to include `DOORS` and `useStore`:

```tsx
import { DOORS, WALLS } from '../../apartment/constants';
import { useStore } from '../../state/store';
```

Replace the helper inside `FirstPersonCamera.tsx` with a function that takes door state and includes a wall segment for each *closed* door's cutout (effectively re-filling the gap):

```tsx
function buildCollisionWalls(doorState: Record<string, { open: boolean }>): CollisionWall[] {
  const segs: CollisionWall[] = WALLS.map(w => ({
    ax: w.start[0], az: w.start[1], bx: w.end[0], bz: w.end[1],
  }));
  for (const d of DOORS) {
    const isOpen = doorState[d.id]?.open ?? d.defaultOpen;
    if (isOpen) continue;
    const wall = WALLS.find(w => w.id === d.wallId);
    if (!wall) continue;
    // Compute cutout endpoints in world coords
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const sx = wall.start[0] + ux * d.offset;
    const sz = wall.start[1] + uz * d.offset;
    const ex = wall.start[0] + ux * (d.offset + d.width);
    const ez = wall.start[1] + uz * (d.offset + d.width);
    segs.push({ ax: sx, az: sz, bx: ex, bz: ez });
  }
  return segs;
}
```

- [ ] **Step 2: Subscribe `FirstPersonCamera` to door state**

Replace the static `useRef` with a re-derivation when door state changes. Inside the `FirstPersonCamera` component, replace the line `const collisionWalls = useRef(buildCollisionWalls());` with:

```tsx
const doors = useStore(s => s.doors);
const collisionWalls = useRef<CollisionWall[]>([]);
useEffect(() => { collisionWalls.current = buildCollisionWalls(doors); }, [doors]);
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: in first-person mode (`V`), walking into a *closed* door blocks you. Open the door (switch to orbit, click the door, switch back) and you can walk through.

- [ ] **Step 4: Commit**

```bash
git add src/scene/cameras/FirstPersonCamera.tsx
git commit -m "Block first-person walking through closed doors"
```

---

## Task 24: Walking into a door auto-opens it

**Files:** Modify `src/scene/cameras/FirstPersonCamera.tsx`.

Per spec §7.4: walking into a door's trigger volume opens it; walking through never *closes* it. We define a trigger as: when in first-person mode and within `0.7 m` of a closed door's center, set it open.

- [ ] **Step 1: Add trigger logic to the `useFrame` callback**

Inside `FirstPersonCamera.tsx`, after computing `next` in `useFrame`, add:

```tsx
// (after camera.position.set(next[0], EYE_HEIGHT, next[1]);)
const setDoorOpen = useStore.getState().setDoorOpen;
for (const d of DOORS) {
  if (doors[d.id]?.open) continue;
  const wall = WALLS.find(w => w.id === d.wallId);
  if (!wall) continue;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const cx = wall.start[0] + ux * (d.offset + d.width / 2);
  const cz = wall.start[1] + uz * (d.offset + d.width / 2);
  const dist = Math.hypot(camera.position.x - cx, camera.position.z - cz);
  if (dist < 0.7) {
    setDoorOpen(d.id, true);
    break;
  }
}
```

(Note: we use `useStore.getState()` inside the frame loop to avoid creating a subscription that re-renders every frame.)

- [ ] **Step 2: Visual verification**

```bash
npm run dev
```
Expected: in first-person mode, walking up to a closed door causes it to swing open as you approach (~70 cm trigger). It does not close behind you. Pressing `V` to orbit and clicking the door still toggles it.

- [ ] **Step 3: Commit**

```bash
git add src/scene/cameras/FirstPersonCamera.tsx
git commit -m "Auto-open doors when first-person camera enters trigger volume"
```

---

## Task 25: `Sky.tsx` and `Lighting.tsx` (day baseline)

**Files:** Create `src/scene/lighting/Sky.tsx` and `src/scene/lighting/Lighting.tsx`. Modify `src/scene/Scene.tsx` to remove the inline ambient/directional lights.

- [ ] **Step 1: Create `Sky.tsx`**

```tsx
import { Sky as DreiSky } from '@react-three/drei';
import { useStore } from '../../state/store';

const PRESETS = {
  day: { sunPosition: [10, 20, 5] as const, turbidity: 5, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  dusk: { sunPosition: [10, 1.5, 5] as const, turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.9 },
  night: { sunPosition: [10, -5, 5] as const, turbidity: 10, rayleigh: 0.1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
};

export function Sky() {
  const time = useStore(s => s.timeOfDay);
  const p = PRESETS[time];
  return (
    <DreiSky
      sunPosition={p.sunPosition as unknown as [number, number, number]}
      turbidity={p.turbidity}
      rayleigh={p.rayleigh}
      mieCoefficient={p.mieCoefficient}
      mieDirectionalG={p.mieDirectionalG}
    />
  );
}
```

- [ ] **Step 2: Create `Lighting.tsx`**

```tsx
import { useStore } from '../../state/store';

const SETTINGS = {
  day:   { sun: 1.0, ambient: 0.6, sunPos: [10, 20, 5] as [number, number, number],  sunColor: '#fff5e0' },
  dusk:  { sun: 0.4, ambient: 0.4, sunPos: [10, 4, 5] as [number, number, number],   sunColor: '#ffb86b' },
  night: { sun: 0.05, ambient: 0.15, sunPos: [10, -5, 5] as [number, number, number], sunColor: '#3c4a6b' },
};

export function Lighting() {
  const time = useStore(s => s.timeOfDay);
  const s = SETTINGS[time];
  return (
    <>
      <ambientLight intensity={s.ambient} />
      <directionalLight
        position={s.sunPos}
        intensity={s.sun}
        color={s.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
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

- [ ] **Step 3: Update Scene**

```tsx
import { Canvas } from '@react-three/fiber';
import { Apartment } from '../apartment/Apartment';
import { CameraRig } from './cameras/CameraRig';
import { Lighting } from './lighting/Lighting';
import { Sky } from './lighting/Sky';

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <Sky />
      <Lighting />
      <Apartment />
      <CameraRig />
    </Canvas>
  );
}
```

- [ ] **Step 4: Visual verification**

```bash
npm run dev
```
Expected: scene now has a proper sky dome and a directional sun. In the browser console, run `useStore.getState().setTimeOfDay('dusk')` (after exposing it via `window` if needed; otherwise verify via the toolbar in Task 29). Expected: sky shifts to warm tones.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/Sky.tsx src/scene/lighting/Lighting.tsx src/scene/Scene.tsx
git commit -m "Add procedural sky and directional sun, time-of-day driven"
```

---

## Task 26: Interior point lights at night

**Files:** Modify `src/scene/lighting/Lighting.tsx`.

- [ ] **Step 1: Add per-room interior lights**

Append to `Lighting.tsx` (replacing the current export):

```tsx
import { ROOMS, FLAT } from '../../apartment/constants';
import { roomCentroid } from '../../apartment/rooms';
import { useStore } from '../../state/store';

// (keep SETTINGS as-is, add this below it)

function InteriorLights() {
  const time = useStore(s => s.timeOfDay);
  const intensity = time === 'night' ? 1.2 : time === 'dusk' ? 0.4 : 0;
  if (intensity === 0) return null;
  return (
    <group>
      {Object.values(ROOMS).filter(r => !r.external).map(r => {
        const [cx, cz] = roomCentroid(r.id);
        const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) - 0.05;
        return (
          <pointLight
            key={r.id}
            position={[cx, cy, cz]}
            intensity={intensity}
            distance={6}
            color="#ffd9a3" // ~2700K warm
            castShadow={false}
          />
        );
      })}
    </group>
  );
}

export function Lighting() {
  const time = useStore(s => s.timeOfDay);
  const s = SETTINGS[time];
  return (
    <>
      <ambientLight intensity={s.ambient} />
      <directionalLight
        position={s.sunPos}
        intensity={s.sun}
        color={s.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <InteriorLights />
    </>
  );
}
```

- [ ] **Step 2: Visual verification**

```bash
npm run dev
```
Expected: at `night`, each room is lit by a warm point light from the ceiling. At `day`, no interior lights. Toggle via console: `useStore.getState().setTimeOfDay('night')`.

- [ ] **Step 3: Commit**

```bash
git add src/scene/lighting/Lighting.tsx
git commit -m "Add warm interior point lights at dusk and night"
```

---

## Task 27: Smoothly tween between time-of-day presets

**Files:** Modify `src/scene/lighting/Lighting.tsx`.

Per spec §7.5, the day/dusk/night transition must tween over 600 ms (sun position, sun colour, ambient intensity, interior light intensity). The drei `<Sky>` shader-driven backdrop stays a discrete switch — the dominant visual cue is the sun and interior lights, and tweening drei's sky uniforms requires deeper integration that isn't worth the complexity for a backdrop change.

- [ ] **Step 1: Replace the discrete `Lighting.tsx` with a frame-driven tween**

```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight, PointLight } from 'three';
import { ROOMS, FLAT } from '../../apartment/constants';
import { roomCentroid } from '../../apartment/rooms';
import { useStore, type TimeOfDay } from '../../state/store';

interface Vals {
  sun: number;
  ambient: number;
  interior: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number]; // linear RGB 0-1
}

const PRESETS: Record<TimeOfDay, Vals> = {
  day:   { sun: 1.00, ambient: 0.60, interior: 0.0, sunPos: [10, 20, 5],  sunColor: [1.00, 0.96, 0.88] },
  dusk:  { sun: 0.40, ambient: 0.40, interior: 0.4, sunPos: [10,  4, 5],  sunColor: [1.00, 0.72, 0.42] },
  night: { sun: 0.05, ambient: 0.15, interior: 1.2, sunPos: [10, -5, 5],  sunColor: [0.24, 0.29, 0.42] },
};

const TWEEN_DURATION = 0.6; // seconds

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function Lighting() {
  const time = useStore(s => s.timeOfDay);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const interiorRefs = useRef<(PointLight | null)[]>([]);
  const current = useRef<Vals>({
    sun: PRESETS[time].sun,
    ambient: PRESETS[time].ambient,
    interior: PRESETS[time].interior,
    sunPos: [...PRESETS[time].sunPos] as [number, number, number],
    sunColor: [...PRESETS[time].sunColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = PRESETS[time];
    const k = Math.min(1, dt / TWEEN_DURATION);
    const cur = current.current;
    cur.sun = lerp(cur.sun, target.sun, k);
    cur.ambient = lerp(cur.ambient, target.ambient, k);
    cur.interior = lerp(cur.interior, target.interior, k);
    for (let i = 0; i < 3; i++) {
      cur.sunPos[i] = lerp(cur.sunPos[i], target.sunPos[i], k);
      cur.sunColor[i] = lerp(cur.sunColor[i], target.sunColor[i], k);
    }

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient;
    for (const p of interiorRefs.current) if (p) p.intensity = cur.interior;
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <group>
        {Object.values(ROOMS).filter(r => !r.external).map((r, idx) => {
          const [cx, cz] = roomCentroid(r.id);
          const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) - 0.05;
          return (
            <pointLight
              key={r.id}
              ref={(el) => { interiorRefs.current[idx] = el; }}
              position={[cx, cy, cz]}
              distance={6}
              color="#ffd9a3"
              castShadow={false}
            />
          );
        })}
      </group>
    </>
  );
}
```

- [ ] **Step 2: Visual verification**

```bash
npm run dev
```
Expected: clicking Day/Dusk/Night in the toolbar (after Task 29) — or via console `useStore.getState().setTimeOfDay('night')` for now — produces a smooth ~600 ms transition: sun darkens, sun position lowers, sun colour shifts warm→blue, interior lamps fade in. Toggling back to Day reverses it cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/scene/lighting/Lighting.tsx
git commit -m "Tween sun, ambient, and interior lights over 600 ms"
```

---

## Task 28: `MeasurementOverlay.tsx`

**Files:** Create `src/ui/MeasurementOverlay.tsx`. Modify `src/scene/Scene.tsx`.

- [ ] **Step 1: Create the overlay**

```tsx
import { Html } from '@react-three/drei';
import { ROOMS, FLAT } from '../apartment/constants';
import { roomCentroid } from '../apartment/rooms';
import { useStore } from '../state/store';
import { formatRoomSize } from '../utils/measurement';

export function MeasurementOverlay() {
  const show = useStore(s => s.showMeasurements);
  if (!show) return null;
  return (
    <group>
      {Object.values(ROOMS).filter(r => !r.external).map(r => {
        const [cx, cz] = roomCentroid(r.id);
        const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) / 2;
        const area = r.width * r.depth;
        return (
          <Html key={r.id} position={[cx, cy, cz]} center distanceFactor={10}>
            <div className="rounded bg-white/90 px-2 py-1 text-xs text-neutral-800 shadow whitespace-nowrap pointer-events-none">
              <div className="font-semibold">{r.name}</div>
              <div>{formatRoomSize(r.width, r.depth, area)}</div>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
```

- [ ] **Step 2: Add to Scene**

```tsx
import { MeasurementOverlay } from '../ui/MeasurementOverlay';
// inside <Canvas>:
<MeasurementOverlay />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: pressing `M` toggles floating labels at each room's center showing name + dimensions + area. Pressing `M` again hides them.

- [ ] **Step 4: Commit**

```bash
git add src/ui/MeasurementOverlay.tsx src/scene/Scene.tsx
git commit -m "Add toggleable room measurement overlay"
```

---

## Task 29: `Toolbar.tsx`

**Files:** Create `src/ui/Toolbar.tsx`. Modify `src/App.tsx`.

- [ ] **Step 1: Create the toolbar**

```tsx
import { useStore, type CameraMode, type TimeOfDay } from '../state/store';

const TIMES: TimeOfDay[] = ['day', 'dusk', 'night'];

export function Toolbar() {
  const cameraMode = useStore(s => s.cameraMode);
  const setCameraMode = useStore(s => s.setCameraMode);
  const timeOfDay = useStore(s => s.timeOfDay);
  const setTimeOfDay = useStore(s => s.setTimeOfDay);
  const showMeasurements = useStore(s => s.showMeasurements);
  const toggleMeasurements = useStore(s => s.toggleMeasurements);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-2 rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur">
      <SegmentedControl<CameraMode>
        label="Camera"
        value={cameraMode}
        options={[
          { value: 'orbit', label: 'Orbit' },
          { value: 'firstPerson', label: 'Walk' },
        ]}
        onChange={setCameraMode}
      />
      <Divider />
      <SegmentedControl<TimeOfDay>
        label="Time"
        value={timeOfDay}
        options={TIMES.map(t => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
        onChange={setTimeOfDay}
      />
      <Divider />
      <button
        onClick={toggleMeasurements}
        className={`rounded px-3 py-1 text-sm ${showMeasurements ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        Measurements (M)
      </button>
    </div>
  );
}

function Divider() {
  return <div className="w-px bg-neutral-200" />;
}

function SegmentedControl<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">{label}:</span>
      <div className="flex overflow-hidden rounded border border-neutral-200">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 ${value === o.value ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount toolbar in App**

```tsx
import { useCallback } from 'react';
import { Scene } from './scene/Scene';
import { Toolbar } from './ui/Toolbar';
import { useStore } from './state/store';
import { KEYBINDINGS } from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore(s => s.toggleMeasurements);
  const cameraMode = useStore(s => s.cameraMode);
  const setCameraMode = useStore(s => s.setCameraMode);
  const onKey = useCallback((code: string) => {
    if (code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
    if (code === KEYBINDINGS.toggleCameraMode) {
      setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit');
    }
  }, [toggleMeasurements, cameraMode, setCameraMode]);
  useKeyboard(onKey);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Toolbar />
      <Scene />
    </div>
  );
}
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: a centred floating toolbar at the top with Camera (Orbit/Walk), Time (Day/Dusk/Night), and Measurements toggle. Each control updates the scene immediately.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Toolbar.tsx src/App.tsx
git commit -m "Add floating toolbar for camera, time, and measurements"
```

---

## Task 30: `HelpHint.tsx`

**Files:** Create `src/ui/HelpHint.tsx`. Modify `src/App.tsx`.

- [ ] **Step 1: Create the hint**

```tsx
import { useState } from 'react';

export function HelpHint() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm shadow"
      >
        ?
      </button>
    );
  }
  return (
    <div className="absolute bottom-3 right-3 z-10 max-w-xs rounded-lg bg-white/95 p-4 text-xs text-neutral-700 shadow">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Controls</span>
        <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700">×</button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-mono">drag</dt><dd>Rotate (orbit) / look (walk)</dd>
        <dt className="font-mono">scroll</dt><dd>Zoom (orbit only)</dd>
        <dt className="font-mono">WASD</dt><dd>Walk (first-person)</dd>
        <dt className="font-mono">click door</dt><dd>Open / close</dd>
        <dt className="font-mono">V</dt><dd>Toggle camera mode</dd>
        <dt className="font-mono">M</dt><dd>Toggle measurements</dd>
        <dt className="font-mono">Esc</dt><dd>Exit pointer lock</dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Mount in App**

```tsx
// inside the returned <div>, after <Toolbar /> and <Scene />:
import { HelpHint } from './ui/HelpHint';
// ...
<HelpHint />
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: a help panel appears bottom-right on first load. Closing it leaves a `?` button that re-opens the panel.

- [ ] **Step 4: Commit**

```bash
git add src/ui/HelpHint.tsx src/App.tsx
git commit -m "Add controls help hint"
```

---

## Task 31: `WebGLFallback.tsx` for unsupported browsers

**Files:** Create `src/ui/WebGLFallback.tsx`. Modify `src/App.tsx`.

- [ ] **Step 1: Detection helper**

Inside `WebGLFallback.tsx`:

```tsx
function isWebGL2Supported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

export function WebGLFallback({ children }: { children: React.ReactNode }) {
  if (typeof window !== 'undefined' && !isWebGL2Supported()) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 p-8 text-center">
        <div className="max-w-md">
          <h1 className="mb-2 text-xl font-semibold text-neutral-800">WebGL not supported</h1>
          <p className="text-neutral-600">
            sofa-so-good needs WebGL 2 to render the 3D apartment.
            Try a recent version of Chrome, Firefox, Edge, or Safari with hardware acceleration enabled.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap in App**

```tsx
import { WebGLFallback } from './ui/WebGLFallback';

export default function App() {
  // ... existing hooks ...
  return (
    <WebGLFallback>
      <div className="relative h-screen w-screen overflow-hidden">
        <Toolbar />
        <Scene />
        <HelpHint />
      </div>
    </WebGLFallback>
  );
}
```

- [ ] **Step 3: Visual verification**

```bash
npm run dev
```
Expected: page renders normally on a WebGL-capable browser. (You don't need to verify the fallback path unless you have a way to disable WebGL.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/WebGLFallback.tsx src/App.tsx
git commit -m "Add WebGL2 detection fallback"
```

---

## Task 32: Final smoke test and Phase 1 wrap-up commit

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: every test passes (measurement, constants, rooms, wallSegments, store, collision).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Build the production bundle**

```bash
npm run build
```
Expected: clean build, no warnings about missing exports.

- [ ] **Step 4: Manual end-to-end smoke test in dev**

```bash
npm run dev
```
Verify each item below in the browser:
- [ ] Apartment shell renders accurately at scale (compare proportions to floor plan)
- [ ] Orbit camera works (drag, zoom, pan)
- [ ] `V` switches to first-person; click locks pointer; WASD walks
- [ ] Walking into walls stops you (and you can slide along them)
- [ ] Walking up to a closed door opens it (~70 cm trigger)
- [ ] Clicking a door (in either mode) toggles it open/closed
- [ ] Closed doors block first-person walking
- [ ] Toolbar Time control switches Day → Dusk → Night with sky and lighting changes
- [ ] At Night, interior point lights illuminate each room
- [ ] `M` toggles room measurement overlay; values match `constants.ts`
- [ ] Help hint is dismissable and re-openable

- [ ] **Step 5: Final wrap-up commit**

If any small fixes were needed during the smoke test, group them into a single commit:
```bash
git add -A
git commit -m "Phase 1 polish from smoke-test"
```

If nothing needed fixing, skip this step.

---

## Phase 1 done

Hand back to the user. The next step is brainstorming Phase 2 (furniture catalog + editor) — exact pre-populated layout positions, parametric prop ranges per primitive, and any catalog additions/removals.
