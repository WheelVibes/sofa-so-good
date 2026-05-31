# Per-Room Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IKEA-planner-style mode that isolates one room of the flat for furniture planning — orbit + walk, full catalog/placement/measurement, locked to Performance render tier + full-res assets, no time/sun/shadow/post systems.

**Architecture:** A separate lightweight `<RoomEditorScene>` (own `<Canvas>`, flat ambient/hemisphere light, no lighting/post systems) mounted by `App.tsx` in place of `<Scene>` when `uiSlice.roomEditor.active`. It reuses the store-driven interaction controllers (FurnitureLayer, DragController, PlacementGhost, selection, CameraRig, MeasurementOverlay). A `roomShell()` helper derives the isolated room's walls/openings/footprint rects from `apartment/constants`; `<RoomShell>` renders only those; `FurnitureLayer` filters to items inside the room.

**Tech Stack:** React + TypeScript, @react-three/fiber, Zustand, Vitest.

---

### Task 1: `roomShell` helper — derive a room's walls + footprint rects

**Files:**
- Create: `src/apartment/roomShell.ts`
- Test: `src/apartment/roomShell.test.ts`

A room's footprint is one or two axis-aligned rects (main + optional `extension`).
A wall belongs to the room if the wall segment lies on (is collinear with and
overlaps) any edge of any of the room's rects, within a small tolerance.

- [ ] **Step 1: Write the failing test**

```ts
// src/apartment/roomShell.test.ts
import { describe, expect, it } from 'vitest';
import { roomShell, roomRects } from './roomShell';
import { ROOMS } from './constants';

describe('roomRects', () => {
  it('returns one rect for a plain rectangular room', () => {
    const rects = roomRects(ROOMS.bedroom2);
    expect(rects).toHaveLength(1);
    // bedroom2 interior origin [3.15,0.20], 2.85 x 3.40
    expect(rects[0]).toMatchObject({ x0: 3.15, z0: 0.2 });
    expect(rects[0].x1).toBeCloseTo(6.0, 5);
    expect(rects[0].z1).toBeCloseTo(3.6, 5);
  });

  it('returns two rects for an L-shaped room with an extension', () => {
    const rects = roomRects(ROOMS.mainBedroom);
    expect(rects).toHaveLength(2);
  });
});

describe('roomShell', () => {
  it('includes the room north wall for a north-band bedroom', () => {
    const shell = roomShell('bedroom2');
    expect(shell.wallIds).toContain('wall-ext-N');
    expect(shell.rects.length).toBeGreaterThan(0);
  });

  it('contains a point inside the room and rejects one outside', () => {
    const shell = roomShell('bedroom2');
    expect(shell.contains(4.5, 1.5)).toBe(true); // inside B2
    expect(shell.contains(11.0, 7.0)).toBe(false); // far away in kitchen/LD
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/apartment/roomShell.test.ts`
Expected: FAIL — `roomShell.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/apartment/roomShell.ts
import { ROOMS, WALLS, WINDOWS, DOORS } from './constants';
import type { RoomDef, RoomId } from './types';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const EPS = 0.06; // 6 cm tolerance for wall-on-edge collinearity

/** One or two axis-aligned interior rects covering the room (main + extension). */
export function roomRects(room: RoomDef): Rect[] {
  const rects: Rect[] = [
    {
      x0: room.origin[0],
      z0: room.origin[1],
      x1: room.origin[0] + room.width,
      z1: room.origin[1] + room.depth,
    },
  ];
  if (room.extension) {
    const ox = room.origin[0] + room.extension.offset[0];
    const oz = room.origin[1] + room.extension.offset[1];
    rects.push({ x0: ox, z0: oz, x1: ox + room.extension.width, z1: oz + room.extension.depth });
  }
  return rects;
}

function pointInRects(x: number, z: number, rects: Rect[]): boolean {
  return rects.some(
    (r) => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS,
  );
}

/** True when a wall segment lies on the perimeter of any of the room's rects:
 *  it must be axis-aligned, sit on a rect edge line, and overlap that edge. */
function wallOnRoomEdge(
  start: readonly [number, number],
  end: readonly [number, number],
  rects: Rect[],
): boolean {
  const [sx, sz] = start;
  const [ex, ez] = end;
  const horizontal = Math.abs(sz - ez) < EPS;
  const vertical = Math.abs(sx - ex) < EPS;
  if (!horizontal && !vertical) return false;
  for (const r of rects) {
    if (horizontal) {
      const onEdge = Math.abs(sz - r.z0) < EPS || Math.abs(sz - r.z1) < EPS;
      const lo = Math.min(sx, ex);
      const hi = Math.max(sx, ex);
      const overlaps = Math.min(hi, r.x1) - Math.max(lo, r.x0) > EPS;
      if (onEdge && overlaps) return true;
    }
    if (vertical) {
      const onEdge = Math.abs(sx - r.x0) < EPS || Math.abs(sx - r.x1) < EPS;
      const lo = Math.min(sz, ez);
      const hi = Math.max(sz, ez);
      const overlaps = Math.min(hi, r.z1) - Math.max(lo, r.z0) > EPS;
      if (onEdge && overlaps) return true;
    }
  }
  return false;
}

export interface RoomShell {
  roomId: RoomId;
  rects: Rect[];
  wallIds: string[];
  windowIds: string[];
  doorIds: string[];
  /** Center of the bounding box over all rects, as [x, z]. */
  center: [number, number];
  /** Half-diagonal of the bounding box (camera framing radius). */
  radius: number;
  /** Whether an [x, z] point lies inside the room (with tolerance). */
  contains: (x: number, z: number) => boolean;
}

export function roomShell(roomId: RoomId): RoomShell {
  const room = ROOMS[roomId];
  const rects = roomRects(room);
  const walls = WALLS.filter((w) => wallOnRoomEdge(w.start, w.end, rects));
  const wallIds = walls.map((w) => w.id);
  // Windows/doors belong to the room when their parent wall is a room wall.
  const windowIds = WINDOWS.filter((win) => wallIds.includes(win.wallId)).map((w) => w.id);
  const doorIds = DOORS.filter((d) => wallIds.includes(d.wallId)).map((d) => d.id);

  const x0 = Math.min(...rects.map((r) => r.x0));
  const z0 = Math.min(...rects.map((r) => r.z0));
  const x1 = Math.max(...rects.map((r) => r.x1));
  const z1 = Math.max(...rects.map((r) => r.z1));
  const center: [number, number] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2;

  return {
    roomId,
    rects,
    wallIds,
    windowIds,
    doorIds,
    center,
    radius,
    contains: (x, z) => pointInRects(x, z, rects),
  };
}
```

NOTE: confirm `WINDOWS` and `DOORS` are exported from `apartment/constants.ts` with `wallId` fields (they are — see `WindowSpec`/`DoorSpec` and the `WINDOWS`/`DOORS` arrays). If a window/door spec uses a different parent-wall field name, adjust `.wallId` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/apartment/roomShell.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/apartment/roomShell.ts src/apartment/roomShell.test.ts
git commit -m "feat(room-editor): roomShell helper — isolate a room's walls + rects"
```

---

### Task 2: `isItemInRoom` furniture filter

**Files:**
- Create: `src/furniture/roomFilter.ts`
- Test: `src/furniture/roomFilter.test.ts`

Tests an item's footprint center against a room's rects. Items are stored with
`position: [x, z]` (the footprint center on the floor); rugs/mounted items count
the same way (center-in-room).

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/roomFilter.test.ts
import { describe, expect, it } from 'vitest';
import { isItemInRoom } from './roomFilter';
import { roomShell } from '../apartment/roomShell';

describe('isItemInRoom', () => {
  const b2 = roomShell('bedroom2');
  it('keeps an item whose center is inside the room', () => {
    expect(isItemInRoom({ position: [4.5, 1.5] }, b2)).toBe(true);
  });
  it('drops an item whose center is outside the room', () => {
    expect(isItemInRoom({ position: [11, 7] }, b2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/roomFilter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/furniture/roomFilter.ts
import type { RoomShell } from '../apartment/roomShell';

/** An item is "in" a room when its footprint center [x, z] lies inside the
 *  room's rects (with the shell's tolerance). Minimal shape so callers can
 *  pass a full FurnitureItem or a test stub. */
export function isItemInRoom(item: { position: readonly [number, number] }, shell: RoomShell): boolean {
  return shell.contains(item.position[0], item.position[1]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/roomFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/roomFilter.ts src/furniture/roomFilter.test.ts
git commit -m "feat(room-editor): isItemInRoom footprint-center room filter"
```

---

### Task 3: `roomEditor` state on uiSlice

**Files:**
- Modify: `src/state/slices/uiSlice.ts`
- Test: `src/state/slices/uiSlice.roomEditor.test.ts`

Add `roomEditor: { active, roomId }`, `enterRoomEditor`, `exitRoomEditor`.
Entering pins `qualityTier='performance'` + `qualityUserSet=true`, pins
`assetTier='high'` (Original), and stashes prior values to restore on exit.
Entering also resets camera mode to `'orbit'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/state/slices/uiSlice.roomEditor.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('roomEditor state', () => {
  beforeEach(() => {
    useStore.setState({
      roomEditor: { active: false, roomId: null },
      qualityTier: 'high',
      qualityUserSet: false,
      assetTier: null,
      cameraMode: 'firstPerson',
    });
  });

  it('enter pins performance + Original assets and sets orbit', () => {
    useStore.getState().enterRoomEditor('bedroom2');
    const s = useStore.getState();
    expect(s.roomEditor).toEqual({ active: true, roomId: 'bedroom2' });
    expect(s.qualityTier).toBe('performance');
    expect(s.assetTier).toBe('high');
    expect(s.cameraMode).toBe('orbit');
  });

  it('exit restores the prior render + asset tier', () => {
    useStore.getState().enterRoomEditor('bedroom2');
    useStore.getState().exitRoomEditor();
    const s = useStore.getState();
    expect(s.roomEditor.active).toBe(false);
    expect(s.qualityTier).toBe('high');
    expect(s.assetTier).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/slices/uiSlice.roomEditor.test.ts`
Expected: FAIL — `enterRoomEditor` is not a function.

- [ ] **Step 3: Implement on uiSlice**

In `src/state/slices/uiSlice.ts`:

(a) Add the import for `RoomId` at the top:
```ts
import type { RoomId } from '../../apartment/types';
```

(b) Add to the `UiSlice` interface (after `showcaseAccumulating`/its setter):
```ts
  /** Per-room editor: isolates a single room (IKEA-planner style). Ephemeral. */
  roomEditor: { active: boolean; roomId: RoomId | null };
  /** Enter the room editor for `roomId`: pins Performance + Original assets
   *  (remembering prior tiers), resets camera to orbit. */
  enterRoomEditor: (roomId: RoomId) => void;
  /** Leave the room editor, restoring the render + asset tiers in effect on enter. */
  exitRoomEditor: () => void;
```

(c) Add a module-level stash (after the `LIGHTS_CYCLE` const near the top of the file body):
```ts
/** Render/asset tiers in effect when the room editor was entered, restored on exit. */
let priorTiers: { tier: RenderTier; userSet: boolean; asset: AssetTier | null } | null = null;
```

(d) Add `roomEditor: { active: false, roomId: null }` to `UI_INITIAL` — first widen the `Pick<UiSlice, ...>` union with `| 'roomEditor'`, then add the value to the object literal.

(e) Add the actions in the slice creator (alongside `setCatalogOpen`, etc.):
```ts
  roomEditor: { active: false, roomId: null },
  enterRoomEditor: (roomId) => {
    const s = get();
    priorTiers = { tier: s.qualityTier, userSet: s.qualityUserSet, asset: s.assetTier };
    set({
      roomEditor: { active: true, roomId },
      qualityTier: 'performance',
      qualityUserSet: true,
      qualityOverrides: {},
      assetTier: 'high',
      cameraMode: 'orbit',
    });
  },
  exitRoomEditor: () => {
    const restore = priorTiers;
    priorTiers = null;
    set({
      roomEditor: { active: false, roomId: null },
      ...(restore
        ? { qualityTier: restore.tier, qualityUserSet: restore.userSet, assetTier: restore.asset }
        : {}),
    });
  },
```

NOTE: `cameraMode` lives on `cameraSlice` but all slices share one store object, so `set({ cameraMode: 'orbit' })` works (verify `cameraMode` is a valid root key — it is). `assetTier`/`qualityTier`/`qualityUserSet`/`qualityOverrides` are all on this slice.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/slices/uiSlice.roomEditor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/state/slices/uiSlice.ts src/state/slices/uiSlice.roomEditor.test.ts
git commit -m "feat(room-editor): roomEditor state + enter/exit on uiSlice"
```

---

### Task 4: `FurnitureLayer` optional room filter

**Files:**
- Modify: `src/furniture/FurnitureLayer.tsx`

Add an optional `room?: RoomShell` prop; when present, only render items passing
`isItemInRoom`. Default (no prop) is unchanged — renders all items.

- [ ] **Step 1: Modify FurnitureLayer**

Add imports:
```ts
import type { RoomShell } from '../apartment/roomShell';
import { isItemInRoom } from './roomFilter';
```

Change the signature + the map filter:
```ts
export function FurnitureLayer({ room }: { room?: RoomShell } = {}) {
```
and inside the `.map`, after `const def = catalog[item.defId]; if (!def) return null;` add:
```ts
        if (room && !isItemInRoom(item, room)) return null;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (existing `<FurnitureLayer />` call sites pass no prop — still valid).

- [ ] **Step 3: Commit**

```bash
git add src/furniture/FurnitureLayer.tsx
git commit -m "feat(room-editor): optional room filter on FurnitureLayer"
```

---

### Task 5: `<RoomShell>` renderer (room walls/floor/openings)

**Files:**
- Create: `src/apartment/RoomShell.tsx`

Renders only the isolated room: a floor plane per rect, the room's wall segments,
its windows + doors, and a grounding slab. Reuses existing building blocks
(`WallSegment`, `Window`/`Windows`, `Door`/`Doors`, floor) filtered by the shell's
id sets. Inspect `src/apartment/Window.tsx`, `src/apartment/Door.tsx`, and
`src/apartment/floor/Floor.tsx` for their per-item component exports before
wiring; the pattern below mirrors `Walls.tsx` (map the registry, render one
segment per entry) but filtered to `shell.wallIds`.

- [ ] **Step 1: Write the component**

```tsx
// src/apartment/RoomShell.tsx
import { WALLS } from './constants';
import { WallSegment } from './walls/WallSegment';
import type { RoomShell as RoomShellData } from './roomShell';

/** Renders only the walls of an isolated room plus a floor plane per rect.
 *  Windows/doors render through their existing components, filtered to the
 *  room's openings. Lightweight: no ceiling, no skirting trim, no exterior. */
export function RoomShell({ shell }: { shell: RoomShellData }) {
  const wallSet = new Set(shell.wallIds);
  return (
    <group>
      {/* Per-rect floor plane (flat, performance look). */}
      {shell.rects.map((r, i) => {
        const w = r.x1 - r.x0;
        const d = r.z1 - r.z0;
        return (
          <mesh
            key={`floor-${i}`}
            position={[(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow={false}
          >
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial color="#cfc9bf" roughness={0.95} metalness={0} />
          </mesh>
        );
      })}
      {WALLS.filter((w) => wallSet.has(w.id)).map((w) => (
        <WallSegment key={w.id} wall={w} />
      ))}
    </group>
  );
}
```

NOTE on openings: `WallSegment` already renders its wall body with cutouts; the
window/door fill components (`<Windows/>`/`<Doors/>` in `apartment/Window.tsx`/
`apartment/Door.tsx`) iterate the full `WINDOWS`/`DOORS` registries. If their
per-item components are exported, render them filtered to `shell.windowIds`/
`shell.doorIds`; if only the aggregate `<Windows/>`/`<Doors/>` are exported,
render those aggregates as-is (they only fill cutouts that exist on the rendered
walls, so extra openings on non-rendered walls have no visible wall to attach to
— acceptable for a first cut, and the floor plane hides any stray ground geometry).
Pick the filtered-per-item path if available; fall back to aggregates otherwise.
Document which path you took in the commit body.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/apartment/RoomShell.tsx
git commit -m "feat(room-editor): RoomShell renderer (isolated walls + floor)"
```

---

### Task 6: `<RoomEditorScene>` — lightweight Canvas

**Files:**
- Create: `src/scene/RoomEditorScene.tsx`

Own `<Canvas>`, DPR 1, no shadows/tone-post. Flat hemisphere + ambient light.
Mounts `RoomShell`, room-filtered `FurnitureLayer`, the interaction controllers,
and `CameraRig`. Omits Sky/CityBackdrop/SceneEnvironment/Lighting/FurnitureLights/
Effects/Showcase/QualityController/RecordController.

- [ ] **Step 1: Write the component**

```tsx
// src/scene/RoomEditorScene.tsx
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { useStore } from '../state/store';
import { roomShell } from '../apartment/roomShell';
import { RoomShell } from '../apartment/RoomShell';
import { CameraRig } from './cameras/CameraRig';
import { CameraForwardTracker } from './cameras/cameraForward';
import { FurnitureLayer } from '../furniture/FurnitureLayer';
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader';
import { SelectionOutline } from './selection/SelectionOutline';
import { HoverHighlight } from './selection/HoverHighlight';
import { MarqueeCameraTracker } from './selection/MarqueeSelector';
import { PlacementGhost } from './PlacementGhost';
import { GridOverlay } from './GridOverlay';
import { AlignmentGuides } from './AlignmentGuides';
import { ClearanceOverlay } from './ClearanceOverlay';
import { DragController } from './DragController';
import { ScreenshotController } from './ScreenshotController';
import { MeasurementOverlay } from '../ui/MeasurementOverlay';
import { DevCameraExpose } from './DevCameraExpose';

/** Lightweight per-room editor scene. Renders one isolated room with a flat,
 *  Performance-tier look (no sun/IBL/post). Reuses every store-driven
 *  interaction controller so catalog/placement/measurement work unchanged. */
export function RoomEditorScene() {
  const roomId = useStore((s) => s.roomEditor.roomId);
  const showFps = useStore((s) => s.showFps);
  if (!roomId) return null;
  const shell = roomShell(roomId);
  return (
    <Canvas
      dpr={1}
      shadows={false}
      camera={{ position: [shell.center[0] + shell.radius * 1.6, shell.radius * 1.8, shell.center[1] + shell.radius * 1.6], fov: 45, near: 0.05, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true }}
    >
      <hemisphereLight args={['#ffffff', '#b9b4aa', 2.2]} />
      <ambientLight intensity={0.6} />
      <RoomShell shell={shell} />
      <GridOverlay />
      <AlignmentGuides />
      <ClearanceOverlay />
      <FurnitureLayer room={shell} />
      <FurnitureMaterialLoader />
      <SelectionOutline />
      <HoverHighlight />
      <PlacementGhost />
      <DragController />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      <ScreenshotController />
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
      {showFps ? <Stats /> : null}
    </Canvas>
  );
}
```

NOTE: the initial camera position frames the room from a 3/4 angle scaled to the
room radius. If `CameraRig`/`OrbitCamera` overrides the camera on mount via its
own initial effect (it sets `[12,8,12]`), Task 8 wires a room-framing nonce; for
now the Canvas `camera` prop gives a reasonable first frame.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scene/RoomEditorScene.tsx
git commit -m "feat(room-editor): lightweight RoomEditorScene canvas"
```

---

### Task 7: Mount RoomEditorScene from App + Exit bar

**Files:**
- Modify: `src/App.tsx`
- Create: `src/ui/RoomEditorBar.tsx`

- [ ] **Step 1: RoomEditorBar component**

```tsx
// src/ui/RoomEditorBar.tsx
import { useStore } from '../state/store';
import { ROOMS } from '../apartment/constants';

/** Top-left pill shown while the per-room editor is active: room name + exit. */
export function RoomEditorBar() {
  const active = useStore((s) => s.roomEditor.active);
  const roomId = useStore((s) => s.roomEditor.roomId);
  const exitRoomEditor = useStore((s) => s.exitRoomEditor);
  if (!active || !roomId) return null;
  const name = ROOMS[roomId]?.name ?? 'Room';
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(20,20,22,0.82)',
        color: '#fff',
        font: '500 13px system-ui, sans-serif',
        backdropFilter: 'blur(6px)',
      }}
    >
      <button
        type="button"
        onClick={exitRoomEditor}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
          font: 'inherit',
          padding: 0,
        }}
        aria-label="Exit room editor"
      >
        ← Exit room
      </button>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{name}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire App.tsx**

Add imports:
```ts
import { RoomEditorScene } from './scene/RoomEditorScene';
import { RoomEditorBar } from './ui/RoomEditorBar';
```

Read the flag near the other store reads in `App()`:
```ts
const roomEditorActive = useStore((s) => s.roomEditor.active);
```

Swap the scene mount — find where `<Scene />` is rendered in App's JSX and replace with:
```tsx
{roomEditorActive ? <RoomEditorScene /> : <Scene />}
```

Add `<RoomEditorBar />` among the DOM overlays (e.g. next to `<Toolbar />`).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/ui/RoomEditorBar.tsx
git commit -m "feat(room-editor): mount RoomEditorScene + exit bar from App"
```

---

### Task 8: Room framing + Esc-to-exit + toolbar entry

**Files:**
- Modify: `src/ui/toolbar/menus/ViewMenu.tsx` (verify exact path under `src/ui/toolbar/menus/`)
- Modify: `src/controls/keybindings.ts`
- Modify: `src/controls/useKeyboard.ts`

- [ ] **Step 1: Toolbar "Rooms" entry**

Inspect `src/ui/toolbar/menus/` to find the View menu file and the `MenuItem`
pattern. Add a Rooms section listing non-external rooms, each calling
`enterRoomEditor(room.id)`:

```tsx
import { ROOMS } from '../../../apartment/constants';
// ...inside the View menu body, after existing items:
const enterRoomEditor = useStore((s) => s.enterRoomEditor);
// ...
{Object.values(ROOMS)
  .filter((r) => !r.external)
  .map((r) => (
    <MenuItem key={r.id} label={r.name} onClick={() => enterRoomEditor(r.id)} />
  ))}
```

Match the actual `MenuItem` prop names/imports used by the sibling menu items.

- [ ] **Step 2: Esc exits the editor**

In `src/controls/useKeyboard.ts`, in the keydown handler, before other Escape
handling, add:
```ts
if (e.key === 'Escape' && useStore.getState().roomEditor.active) {
  useStore.getState().exitRoomEditor();
  return;
}
```
(Place it so it doesn't break existing Escape behaviour — read the handler first;
if Escape already clears selection, gate the room-exit branch first and `return`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/toolbar src/controls/useKeyboard.ts src/controls/keybindings.ts
git commit -m "feat(room-editor): toolbar Rooms entry + Esc-to-exit"
```

---

### Task 9: Full test + typecheck + build gate

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all green (new roomShell/roomFilter/uiSlice tests included).

- [ ] **Step 2: Typecheck + production build**

Run: `npm run build`
Expected: `tsc` clean, Vite build succeeds.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test(room-editor): suite + build green"
```

---

### Task 10: Visual verification (REQUIRED — see CLAUDE.md)

Read `docs/visual-verification-playbook.md` first.

- [ ] **Step 1: Drive + screenshot orbit view**

Start dev server, then use `scripts/shot.mjs` with an evalFile that calls
`window.__store.getState().enterRoomEditor('bedroom2')`, wait for assets, and
capture. Repeat for an L-shaped room (`enterRoomEditor('mainBedroom')`) and one
large room (`enterRoomEditor('livingDining')` — confirm the exact RoomId key).

- [ ] **Step 2: Screenshot walk mode in-room**

After entering a room, `setCameraMode('firstPerson')`, capture; verify the player
is bounded to the room.

- [ ] **Step 3: Visually review**

Confirm: only the selected room's walls + floor render; only its furniture shows;
flat Performance look (no shadows/sun); catalog/inspector/measurement overlays
work; exit pill returns to full apartment. Report what the screenshots show.

- [ ] **Step 4: Update docs**

Update `CLAUDE.md` (add a **Per-room editor** bullet under Key systems) and
`README.md` (user-facing feature note) in the same change. Add any new
interaction gotcha discovered to `docs/visual-verification-playbook.md`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/visual-verification-playbook.md
git commit -m "docs(room-editor): document per-room editor + visual verification"
```

---

## Self-review notes

- **Spec coverage:** architecture (T6/T7), isolation rendering (T1/T5), furniture
  filter (T2/T4), shared items (no scratch — T4 filters live store), entry/exit
  (T8 toolbar + Esc, T7 pill), Performance+Original pin (T3), walk collision
  (uses existing `buildCollisionWalls` — note: FirstPersonCamera builds collision
  from `floorPlan`/state walls, NOT from the room shell, so in v1 walk collision
  follows the full flat's walls; the room's own walls still block. If strict
  room-bounded walk is required, a follow-up task feeds `shell.wallIds` to the
  collision builder — flagged as a known limitation, not a blocker).
- **Type consistency:** `RoomShell` (data type from `roomShell.ts`) vs `RoomShell`
  (component in `RoomShell.tsx`) share a name across files — the scene imports the
  component and the data type is referenced as `RoomShellData` via alias in
  `RoomShell.tsx`. Keep these aliases to avoid collisions.
- **Known v1 limitation:** walk-mode collision uses the existing full-flat wall
  set (the room's walls are a subset, so they still block the player). True
  room-only bounding is a follow-up.
```
