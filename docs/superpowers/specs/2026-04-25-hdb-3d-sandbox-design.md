# HDB 4-Room 3D Sandbox — Design

**Date:** 2026-04-25
**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Repository:** `sofa-so-good`

## 1. Goal

Build a browser-based, 1:1 3D interactive sandbox of a Singapore 4-room HDB apartment based on the user-provided floor plan (Serangoon North Vista typology). The app is a full interior design tool with a walk-around viewer in both first-person and orbit camera modes.

The sandbox lets the user:
- Explore the apartment shell from either an orbit camera or a first-person walk camera.
- Add, move, rotate, delete, and configure parametric furniture from a catalog.
- Open and close doors.
- Toggle day / dusk / night lighting.
- Toggle a measurement overlay showing room dimensions.
- Swap floor and wall finishes per room.
- Save and load named layouts (browser-local in v1, with a clean adapter seam for backend persistence later).

## 2. Apartment under construction

| Quantity | Value | Source |
|---|---|---|
| Total area (incl. AC ledge) | 93 m² | User-stated |
| Internal floor area | 90 m² | User-stated |
| AC ledge area | 3 m² | Derived (93 − 90) |
| Floor-to-ceiling height | 2.6 m | User-stated |
| Typology | Serangoon North Vista 4-room | User-stated |

Rooms (per the provided floor plan):
- Main bedroom, bedroom 2, bedroom 3
- Bath/WC 1 (master), bath/WC 2 (common)
- Living / dining (L-shaped, largest space)
- Kitchen, service yard, household shelter
- Air-con ledge (external)

## 3. Scope decisions (locked in during brainstorm)

| Topic | Decision |
|---|---|
| Mode | Full interior design tool + walk-around viewer (orbit + first-person) |
| Visual style | Stylized (clean, simplified materials; readable from any angle) |
| Furniture library | Parametric / configurable primitives (no GLB models in v1) |
| Persistence | Local-only via `localStorage`, behind a `StorageAdapter` interface so a backend can be added without touching consumers |
| Initial state | Pre-populated to match the floor plan, with both "Reset to empty" and "Reset to floor-plan default" buttons available |
| Platform | Desktop only (mouse + keyboard) |
| Doors | Animated, click-to-open and walk-through-to-open |
| Lighting | Day / dusk / night toggle with sun & sky shifts; warm interior lights at night |
| Measurement HUD | Toggleable overlay (off by default, `M` key) |
| Furniture catalog scope | Broad — beds, seating, tables, storage, kitchen, lighting, decor (~15–20 types) |

Out of scope for v1 (designed *around*, not *out*): GLB model imports, multi-user / share-by-URL, mobile / touch controls, postprocessing (SSAO/bloom), additional floor plans.

## 4. Stack

- **Vite + React 18 + TypeScript** — fast dev loop, type safety.
- **Three.js via `@react-three/fiber`** — declarative R3F is significantly cleaner than raw Three for a modular project.
- **`@react-three/drei`** — `OrbitControls`, `PointerLockControls`, `<Html>`, `<Sky>`, helpers.
- **Zustand** — single store for editor state (items, selection, camera mode, time-of-day, doors, finishes).
- **Zod** — versioned save-file schema validation.
- **Tailwind CSS** — UI chrome (toolbar, drawers, inspector). The R3F scene stays pure 3D.
- **No physics engine in v1.** First-person collision is AABB swept-tests against wall segments and (closed) door swing volumes. Adding Rapier later is non-disruptive.

## 5. Architecture

### 5.1 Modular layout

```
src/
  apartment/                 # The shell (walls, floor, ceiling, doors, windows, fixtures)
    constants.ts             # ← single source of truth for ALL apartment dimensions
    rooms.ts                 # Room polygons + names + areas (derived from constants)
    Apartment.tsx            # Composes the shell
    Walls.tsx
    Floor.tsx                # Per-room floor (so finishes can vary by room)
    Ceiling.tsx
    Door.tsx                 # Animated, click/walk-through-to-open
    Window.tsx
    Fixtures.tsx             # Toilets, sinks, shower trays — non-movable

  furniture/
    catalog.ts               # Map<FurnitureType, FurnitureDef>
    types.ts                 # FurnitureItem (instance), FurnitureDef (catalog entry)
    Furniture.tsx            # Generic renderer: dispatches to primitive component by type
    primitives/              # Bed, Sofa, ArmChair, DiningTable, Chair, CoffeeTable,
                             #   Wardrobe, Desk, Bookshelf, TVConsole, KitchenCounter,
                             #   Rug, FloorLamp, TableLamp, Plant, WallArt

  scene/
    Scene.tsx                # The R3F <Canvas> root
    cameras/
      CameraRig.tsx          # Switches between orbit & first-person based on store
      OrbitCamera.tsx
      FirstPersonCamera.tsx  # PointerLockControls + WASD + collision check
    lighting/
      Lighting.tsx           # Sun + ambient + interior point lights, driven by timeOfDay
      Sky.tsx                # drei <Sky> with day/dusk/night params
    selection/
      SelectionOutline.tsx
      TransformGizmo.tsx     # Drag-to-move / handle-to-rotate

  ui/                        # 2D React UI overlay (Tailwind, lives outside <Canvas>)
    Toolbar.tsx              # Camera toggle, day/night, measurements, reset, save/load
    CatalogDrawer.tsx        # Browse + drag-to-place
    Inspector.tsx            # Selected item: position, rotation, color, parametric props
    MeasurementOverlay.tsx   # Floating room-dimension labels (R3F <Html>)
    HelpHint.tsx             # First-load keybinding cheatsheet

  state/
    store.ts                 # Zustand: items, selection, cameraMode, timeOfDay,
                             #   showMeasurements, doors, finishes
    schema.ts                # Zod schemas (versioned save format)
    storage/
      StorageAdapter.ts      # interface { save, load, list?, delete? }
      LocalStorageAdapter.ts # v1 implementation
      autosave.ts            # Debounced subscription that persists store changes

  controls/
    keybindings.ts
    useKeyboard.ts

  collision/
    walls.ts                 # AABB swept-test for first-person walking
    placement.ts             # "Does this furniture fit here?" check for drag-place

  utils/
    measurement.ts
    floorplan.ts             # Helpers to anchor furniture to room polygons

  App.tsx
  main.tsx
```

### 5.2 Boundary properties

- `apartment/` knows nothing about `furniture/` or UI. It just renders a parametric shell from constants.
- `furniture/` knows nothing about the apartment beyond receiving a `position` prop. It does not import room polygons.
- `state/` is the only place the two meet — placement logic queries both and writes to a single store.
- `ui/` and `scene/` are siblings — UI is plain React/Tailwind; the Scene is R3F. They share state through Zustand only.

Consequences:
- Swapping the shell to a different floor plan = edit `apartment/constants.ts` only.
- Adding a furniture type = one entry in `catalog.ts` + one primitive component file.
- Swapping persistence = one file under `state/storage/`.

### 5.3 State (Zustand)

```ts
type EditorState = {
  // Furniture instances
  items: FurnitureItem[];
  selectedItemId: string | null;

  // Camera & view
  cameraMode: 'orbit' | 'firstPerson';
  timeOfDay: 'day' | 'dusk' | 'night';
  showMeasurements: boolean;

  // Apartment state
  doors: Record<DoorId, { open: boolean }>;
  finishes: {
    floor: Record<RoomId, FinishId>;
    walls: Record<RoomId, FinishId>;
  };

  // Actions
  addItem, moveItem, rotateItem, deleteItem, updateItemProps, selectItem,
  toggleDoor, setCameraMode, setTimeOfDay, toggleMeasurements,
  setFloorFinish, setWallFinish,
  resetToEmpty, resetToDefault,
  loadState, /* used by storage layer */
};
```

## 6. Apartment dimensions strategy

The user instructed: do not hallucinate dimensions; clarify when unsure. The dimensions in `apartment/constants.ts` are derived in this order:

### 6.1 Sources used without further confirmation

Standard HDB specifications (per HDB *Designing Your Flat* / *Reno Guide*):

| Spec | Value |
|---|---|
| External wall thickness | 200 mm |
| Internal partition wall thickness | 100 mm |
| Door height (standard) | 2100 mm |
| Main entrance door width | 1000 mm |
| Bedroom / bathroom door width | 800 mm |
| Window sill height (bedrooms) | 950 mm |
| Window head height | 2100 mm |
| Bathroom ceiling height (false ceiling) | 2400 mm |
| Living/dining bay window sill | ~450 mm or full-height where shown on plan |

If any of these prove wrong for *this* unit during implementation, the constants file changes — not the architecture.

### 6.2 Derivation procedure for per-room dimensions

1. **Web search step (approved by user).** Search for the official Serangoon North Vista BTO floor plan. If HDB published exact dimensions, use them and cite the source URL in a comment in `constants.ts`. If not, fall through to step 2.
2. **Proportional measurement from the provided floor-plan image.** The image is a vector to-scale plan, so pixel ratios between rooms are reliable. Measure each room's pixel width and depth.
3. **Calibrate to the 90 m² internal-area constraint.** Solve for the single scale factor `k` (pixels → metres) such that the sum of room areas equals 90 m² ± rounding tolerance.
4. **Round to 50 mm increments** (HDB plan convention). Re-balance any rounding error into the largest space (living/dining).

Each room entry in `constants.ts` includes a comment block recording: pixel measurement, derived metres, and any rounding adjustment. Where step 1 returned a published value, that value is used and the source cited; where it didn't, step 2-4 governs.

### 6.3 When to ask the user during implementation

The user will be asked to review/confirm before committing constants if any of the following holds:
- The calibration produces a number that diverges >5% from what the floor plan visually implies.
- A web-search result for Serangoon North Vista contradicts the floor plan provided.
- The floor plan reveals a feature with no standard HDB spec (e.g., bay window depth).

### 6.4 Shape of the constants module

```ts
// apartment/constants.ts
export const FLAT = {
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
  // Each entry includes: width, depth, area, position (origin),
  // wall segments (with door/window cutouts), and a comment block
  // with the derivation notes from §6.2.
};
```

Walls, doors, windows, and fixtures are *all* derived from this module — no geometry is hardcoded in components.

## 7. Editor UX

### 7.1 Camera modes

- **Orbit** (default): mouse-drag rotates around scene center, scroll zooms, right-drag pans.
- **First-person:** click canvas → pointer locks. WASD walks; mouse looks. `Esc` exits. Eye height = 1.65 m. Walking speed ≈ 1.4 m/s. Collision: AABB swept-test against wall segments + closed-door swing volumes.

Toolbar toggle switches between them; the same scene is rendered, only the active camera component swaps.

### 7.2 Selection & manipulation

- Click furniture → selected, outlined. Inspector panel opens on the right.
- Drag-along-floor moves the item (snaps to 100 mm grid; hold `Shift` for free-move).
- `R` rotates 90°; `Shift+R` rotates 15°.
- `Del` deletes. `Esc` deselects.
- Inspector exposes the parametric props for the selected type (e.g., sofa: width, seat depth, color, cushion count).

### 7.3 Catalog drawer

- Opens via toolbar button or `C` key.
- Cards grouped by category: beds, seating, tables, storage, kitchen, lighting, decor.
- Drag a card onto the floor → ghost preview follows the cursor; turns red if it would overlap a wall or another item (`collision/placement.ts`). Release to place.

### 7.4 Doors

- **Opening:** click a door, OR walk into its trigger volume in first-person → animated 90° swing open (200 ms). Walking through never *closes* a door — that would be surprising and would interrupt traversal.
- **Closing:** click only (in either camera mode). Doors do not auto-close.
- Door state lives in the store, so save/load preserves it.

### 7.5 Day / dusk / night

- Toolbar segmented control. Sun position + sky tint + ambient intensity tween over 600 ms.
- Night additionally enables interior point lights (one per room, ceiling-mounted) at warm 2700 K colour temperature.

### 7.6 Measurement overlay

- `M` toggles. Renders floating `<Html>` labels at room centroids: `{name}` + `W × D m` + `area m²`.

### 7.7 Reset

- Toolbar "Reset to empty" — clears all furniture, keeps shell.
- Toolbar "Reset to floor-plan default" — reloads pre-populated layout.
- Both confirm before destructive action.

## 8. Persistence

### 8.1 Save format (versioned, Zod-validated)

```ts
{
  version: 1,
  apartmentId: "serangoon-north-vista-4r",
  items: FurnitureItem[],
  doors: { [doorId: string]: { open: boolean } },
  finishes: {
    floor: { [roomId: string]: FinishId },
    walls: { [roomId: string]: FinishId },
  },
  timeOfDay: 'day' | 'dusk' | 'night',
  cameraMode: 'orbit' | 'firstPerson',
  savedAt: ISO8601,
}
```

### 8.2 Behavior

- **Autosave:** debounced 500 ms after any store change. Single slot keyed `sofa-so-good:autosave`.
- **Manual saves:** "Save as…" → named slot. List exposed in a "Load" dropdown. Up to 10 named saves; older ones are evicted with a warning toast.
- **Schema version mismatch on load:** run a registered migration if available; otherwise show a "this save is from a newer version" toast and refuse to load.
- **Corrupted JSON:** caught, ignored, app starts fresh with a one-time toast.

### 8.3 Adapter seam

```ts
interface StorageAdapter {
  save(slot: string, state: SerializedState): Promise<void>;
  load(slot: string): Promise<SerializedState | null>;
  list(): Promise<{ slot: string; savedAt: string }[]>;
  delete(slot: string): Promise<void>;
}
```

`LocalStorageAdapter` is the v1 implementation. A future `ServerAdapter` (Supabase or otherwise) is a one-file change; nothing else in the app imports `localStorage` directly.

## 9. Phased delivery

Each phase ends in an independently runnable, demoable build. The user gives the green light at each boundary.

**Commit granularity (applies across all phases):** every independent module or feature ships as its own commit. The git history mirrors the modular structure — never bundle "the apartment shell" and "the catalog drawer" into one commit. Examples of acceptable single-commit scopes: scaffolding the project, `apartment/constants.ts`, `Walls.tsx`, `OrbitCamera`, `FirstPersonCamera + collision`, a single furniture primitive (e.g. `Bed`), the `StorageAdapter` interface, `LocalStorageAdapter`. A commit may touch multiple files only when they belong to the same module or feature (e.g., a primitive + its catalog entry + its tests).

### Phase 1 — Apartment shell + camera modes
- Vite/React/R3F scaffold with TypeScript, Tailwind, Zustand, drei.
- `apartment/constants.ts` populated with calibrated dimensions (incl. the §6.2 web search step and any required user confirmations).
- Walls, floor, ceiling, animated doors, windows, bathroom fixtures.
- Orbit + first-person cameras with collision.
- Day / dusk / night lighting.
- Measurement overlay.
- *Outcome: walkable empty apartment, accurate to scale.*

### Phase 2 — Furniture catalog + editor
- All ~18 parametric furniture types in `furniture/primitives/`.
- Selection, inspector, drag-place, rotate, delete.
- Pre-populated default layout matching the floor plan (beds in all bedrooms; sofa, armchair, coffee table, dining table + chairs in the living/dining; kitchen counter/sink/stove; etc.).
- Reset-to-empty / reset-to-default.
- *Outcome: fully usable design tool.*

### Phase 3 — Persistence + finishes
- `StorageAdapter` interface + `LocalStorageAdapter`.
- Autosave + named saves + load dropdown.
- Floor & wall finish swaps per room.
- *Outcome: shippable v1.*

## 10. Testing

- **Vitest** for state logic: store reducers, save/load round-trip, schema migration, placement collision math, dimension calibration math.
- **No browser/E2E tests in v1.** First-person walking and drag-place are visual interactions where unit-testing the underlying math (collision, snapping) gives most of the value at a fraction of the cost.

## 11. Error handling

| Surface | Strategy |
|---|---|
| `localStorage` quota exceeded | Catch, show toast: "Couldn't autosave — local storage is full." |
| Corrupted save | Catch parse / Zod errors, fall back to default layout, one-time toast. |
| Schema version mismatch | Run migration if registered, else refuse to load with toast. |
| WebGL unsupported | Show a static fallback page with the floor plan image and a message. |
| First-person collision math edge cases | Walking speed is bounded; if a swept test fails, fall back to "do not move this frame" rather than risk clipping through walls. |

## 12. Open questions / known unknowns

None blocking. The remaining unknowns are surfaced naturally during implementation:
- Exact per-room dimensions (handled by §6).
- Which finish presets to ship in Phase 3 (a small finite list to be proposed during Phase 3 brainstorm).
- Pre-populated default layout exact placement (proposed during Phase 2).
