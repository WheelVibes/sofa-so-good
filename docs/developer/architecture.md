# Architecture

A browser 3D interior-design app for Singapore homes — HDB flats and condominiums
(starter plans for HDB 2/3/4/5-room + Executive/3Gen/Jumbo/Maisonette, condo studio →
penthouse, and a landed terrace; plus a 2D editor for custom plans). The move-in
default is a furnished 4-room HDB.

## Tech stack

- **React 19** + **@react-three/fiber** (R3F) + **three.js** for the 3D scene.
- **Zustand** for state (sliced store).
- **Vite** (build) + **Vitest** (tests) + **Biome** (format/lint).
- **TypeScript** throughout.

## `src/` module map

Condensed from `CLAUDE.md`'s "Layout of the code":

- `state/` — Zustand store split into slices + `storage/` persistence. See
  [State management](./state-management.md).
- `scene/` — the R3F `<Canvas>` and systems (lighting, effects, cameras,
  quality, selection, the render-on-demand pump). See
  [Rendering & scene](./rendering-and-scene.md).
- `apartment/` — the default flat (walls/doors/windows/rooms) + `PlanShell` for
  user plans. See [Apartment & floor plan](./apartment-and-floorplan.md).
- `floorplan/` — the editable floor-plan model + geometry helpers.
- `furniture/` — catalog + rendering (parametric primitives + GLB loader) +
  `gltf/`, `ikea/`, `upload/`, `convert/`, `optimize/`. See
  [Furniture catalog](./furniture-catalog.md) and [Import pipeline](./import-pipeline.md).
- `materials/` — procedural + textured finishes. See
  [Materials & finishes](./materials-and-finishes.md).
- `catalog/` — downloadable packs + remote providers. See
  [Packs & remote catalog](./packs-and-remote-catalog.md).
- `ui/` — DOM overlays (toolbar, catalog drawer, inspector, panels, modals).
  See [UI & design system](./ui-and-design-system.md).
- `styles/` — the design-system CSS (tokens + components).
- `controls/` — keybindings + keyboard handling.
- `collision/`, `layout/` — placement rules and the auto-arranger.

## Boot sequence

`src/main.tsx`:

1. **Registers the GLB decoders** (Draco/KTX2/meshopt) synchronously — must
   precede any model load.
2. **Renders React immediately** — no awaiting hydration, so the page is never a
   blank screen (a static boot loader in `index.html` paints first, then hands
   off to `<LoadingOverlay>`).
3. `App`'s `<BootHydrator>` effect kicks off **`runBootstrap()`**
   (`state/storage/bootstrap.ts`): hydrates IDB user assets + packs, restores
   the autosave, loads prefs, then seeds the default layout — flipping
   `bootPhase` `'hydrating' → 'ready'`.

## Two canvases

The main scene (`scene/Scene.tsx`) renders the full flat. The **per-room
editor** mounts a separate lightweight `<Canvas>` (`scene/RoomEditorScene.tsx`)
in its place while active. The main canvas runs `frameloop="demand"` (see
[Rendering & scene](./rendering-and-scene.md)).

See `CLAUDE.md` for the always-current condensed index.
