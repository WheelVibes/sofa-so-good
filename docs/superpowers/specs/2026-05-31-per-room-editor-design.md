# Per-Room Editor — design

## Goal

An IKEA-room-planner-style mode that isolates a single room of the HDB flat for
furniture planning: orbit + walk navigation, full catalog/placement/measurement
features, locked to the **Performance** render tier and **full-resolution
(Original)** assets, with all time-of-day / sun / shadow / IBL / post-processing
machinery omitted entirely. It is a focused, lightweight view of the **same**
furniture layout as the main apartment (single source of truth — no scratch/sync
model).

## Decisions (from brainstorming)

- **Architecture**: a separate, lightweight `<RoomEditorScene>` with its own
  `<Canvas>`, mounted by `App.tsx` instead of `<Scene>` when the editor is
  active. It omits the heavy render systems and reuses the store-driven
  interaction controllers (no duplication). Rationale: the whole point is
  lightness; bypassing every lighting/post system inside the one `<Scene>` would
  litter it with `roomEditor ?` branches, whereas the interaction controllers
  (DragController, PlacementGhost, MeasurementOverlay, FurnitureLayer, selection,
  CameraRig) read Zustand and have no lighting dependency, so they mount in both.
- **Isolation**: show **only the selected room's** shell (walls/floor/window/
  door) and **only furniture whose footprint center is inside the room rect**.
  Everything else is hidden (truest planner feel, simplest mental model).
- **Data model**: **same shared items**, live. The editor is a filtered view of
  `store.items`; edits apply immediately to the real layout. No import/export,
  no merge.
- **Entry/exit**: a **Rooms** entry in the toolbar **View** menu opens a room
  picker; an on-screen **"← Exit room"** pill (+ room name) and **Esc** exit.
  Keyboard shortcut wired through `controls/keybindings.ts` (never hardcoded).
- **Quality**: entering forces `renderTier='performance'` (pinned) and
  `assetTier='high'` (Original), remembering prior tiers to restore on exit.

## State

`uiSlice` gains:

```ts
roomEditor: { active: boolean; roomId: RoomId | null }
enterRoomEditor(roomId: RoomId): void   // pins performance+Original, remembers prior, sets orbit
exitRoomEditor(): void                   // restores prior tiers
```

Prior render/asset tier values are stashed on enter and restored on exit. Camera
mode resets to `orbit` on enter.

## Room isolation helper

`apartment/roomShell.ts` — `roomShell(roomId): { walls, doors, windows, rect }`
derives from `apartment/constants` the subset of `WALLS`/`DOORS`/`WINDOWS` that
bound the given room plus its footprint rectangle(s) (main + `extension`). A wall
is included if it lies on the room's perimeter (within tolerance). The `rect`
(or rects, for L-shaped rooms with an extension) drives both the furniture
filter and the camera framing.

`furniture/roomFilter.ts` — `isItemInRoom(item, def, rect): boolean` tests the
item's footprint center against the room rect(s).

## Rendering

`scene/RoomEditorScene.tsx` — own `<Canvas>` (DPR 1, no shadows, no tone-mapping
post). Mounts:
- a flat `<hemisphereLight>` / `<ambientLight>` pair (performance-style flat look)
- `<RoomShell roomId>` (new; renders only the isolated walls/floor/window/door
  using the existing `walls/`, `floor/`, `Window`, `Door` building blocks)
- `FurnitureLayer` (with room-filter prop), `FurnitureMaterialLoader`
- `GridOverlay`, `AlignmentGuides`, `ClearanceOverlay`
- `SelectionOutline`, `HoverHighlight`, `PlacementGhost`, `DragController`
- `CameraRig`, `CameraForwardTracker`, `MeasurementOverlay`, `ScreenshotController`
- DEV: `DevCameraExpose`; `Stats` when `showFps`

Explicitly **omitted**: `Sky`, `CityBackdrop`, `SceneEnvironment`, `Lighting`,
`FurnitureLights`, `Effects`, `ShowcaseController`, `QualityController`,
`RecordController` (recording is a presentation feature; out of scope here).

`FurnitureLayer` gains an optional `roomRect`/`roomId` prop; when set, only items
passing `isItemInRoom` render and are interactable.

## Camera

Reuse `CameraRig` (orbit + first-person) verbatim. On enter, frame the orbit
camera on the room center, distance sized to room bounds (reuse the existing
focus/home framing path with a room-derived target + radius). Walk mode drops the
player inside the room; collision uses the **isolated room's** walls fed through
the existing `buildCollisionWalls` / `resolveMovement` path so the player is
bounded to the room.

## UI

- `ui/toolbar/menus/ViewMenu.tsx` (or the View cluster): a **Rooms** submenu /
  entry listing `ROOMS` (non-external), each entering the editor for that room.
- `ui/RoomEditorBar.tsx` — top-left pill: **"← Exit room"** + room name. Esc
  exits (wire in `useKeyboard`).
- While `roomEditor.active`, hide toolbar clusters that are meaningless here
  (Scene/time, sun-direction), consistent with how Walk mode already trims the
  toolbar. Catalog/Inspector/Finish/measurement overlays stay.

## App wiring

`App.tsx`: `roomEditor.active ? <RoomEditorScene/> : <Scene/>`. All DOM overlays
remain mounted and unchanged.

## Testing + visual verification

- Unit: `roomShell` returns the correct walls/bounds per representative room
  (a rectangular room + an L-shaped room with an `extension`); `isItemInRoom`
  in/out cases.
- Required visual pass (per CLAUDE.md): run the app, drive `window.__store` to
  `enterRoomEditor('bedroom2')`, screenshot orbit + walk, switch rooms, and
  visually review for isolation correctness, framing, and rendering artifacts.

## Out of scope (YAGNI)

- Per-room scratch/draft layouts and merge/sync.
- Ghosted neighbor walls.
- Recording / sun study / time-of-day inside the editor.
- Editing the room's geometry here (that remains the Floor-plan editor's job).
