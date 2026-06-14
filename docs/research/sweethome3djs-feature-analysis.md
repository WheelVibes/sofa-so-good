# SweetHome3DJS 7.7 Online — feature deep-dive & sofa-so-good integration roadmap

> Research deliverable. Source studied: the **`develop-SweetHome3D-7.7-Online`** branch of
> SweetHome3DJS on SourceForge
> (`branches/develop-SweetHome3D-7.7-Online/SweetHome3DJS/`), the public JS API
> (`sweethome3d.com/jsdoc/`), the Sweet Home 3D feature/user docs, and the
> `luxvitae-eco/SweetHome3DJS` mirror. Registered in `REFERENCES.md`.
>
> **Purpose:** enumerate every SweetHome3DJS feature and judge what is worth integrating into
> sofa-so-good, as a gap analysis (✅ already have / 🟡 partial / ❌ net-new) + a phased roadmap.
> **Headline finding:** sofa-so-good is already *more* capable than SweetHome3DJS in most areas
> (PBR materials, AI surfaces, analysis/checks, drawing sets, IKEA catalog, multi-storey). The
> genuine gaps are narrow and structural. The top gap — **whole-scene 3D export** — is now shipped
> (see `CHANGELOG.md` Q-3DEXPORT).

## 1. SweetHome3DJS architecture (as studied)

SweetHome3DJS is the JavaScript port of the Java Sweet Home 3D desktop app (originally transpiled
with JSweet; the 7.7 Online branch is modernizing to TypeScript + Vite + ESM, dropping the
Ant/`.war`/Tomcat toolchain). Its design is a single source-of-truth **`Home`** model observed by two
synchronized views.

**Model (the `Home` object graph):** `Home`, `Wall` (straight, **round/arc**, and **sloping**
variable-height), `Room`, `Level` (multi-storey), `Polyline`, `DimensionLine`, `Label`, `Compass`,
`Camera` (observer + aerial), `HomePieceOfFurniture`, `HomeDoorOrWindow` (+ `Sash`), `HomeLight`,
`HomeFurnitureGroup`, `Baseboard`.

**Synchronized rendering:** `PlanComponent` (2D vector plan) and `HomeComponent3D` (WebGL) both render
from the same `Home`; an edit fires a property-change event → both views update. Supporting 3D classes:
`Object3DBranch`, `Wall3D`, `Room3D`, `Ground3D`, `HomePieceOfFurniture3D`, `DimensionLine3D`,
`Polyline3D`, `Label3D`, plus `Triangulator`, `ShapeTools`, `graphics2d`/`scene3d`/`HTMLCanvas3D`.

**Controllers:** `PlanController`, `FurnitureController`, `HomeController3D`, `ModelMaterialsController`.

**Model import loaders:** `OBJLoader`, `DAELoader` (Collada), `Max3DSLoader` (3DS), `ModelLoader`,
`ModelManager`, `ModelPreviewComponent`.

**Materials/textures:** `TextureManager`, `DefaultTexturesCatalog`, `ModelMaterialsComponent`,
`TextureChoiceComponent`, `ColorButton`.

**Catalog:** `DefaultFurnitureCatalog`, `FurnitureCatalogListPanel`, `FurnitureTablePanel` — with
**creator/license** and **compressed + uncompressed model-size** columns/tooltips for memory budgeting.

**Serialization/persistence:** `HomeRecorder`, `DirectHomeRecorder`, `IncrementalHomeRecorder` (async
server sync to JSP endpoints), `ContentDigestManager`, `URLContent`, `HomeXMLExporter`. The `.sh3d`/
`.sh3x` file is a ZIP of `Home.xml` (state) + `HomeStructure/Home.obj` (precomputed merged
wall/room/floor geometry, so the viewer loads fast) + per-item models.

## 2. Full feature gap analysis vs sofa-so-good

Legend: ✅ already in sofa-so-good · 🟡 partial · ❌ net-new gap.

| SweetHome3DJS capability | Status | Where it lives / what's missing in sofa-so-good |
| --- | --- | --- |
| Synchronized 2D plan + 3D view off one model | ✅ | `floorPlanEditor` + R3F `Scene`, single Zustand store. |
| Draw walls (straight) | ✅ | `floorplan/` `PlanWall`, `wallOps.ts` (split/reverse/join). |
| Draw **round/arc** walls | ✅ | **shipped — PARITY-CURVEDWALL** (`curvedWalls`): drag a wall's midpoint handle to bow it; `PlanWall.arc` + `wallArc.ts` chord sub-segments through the existing geometry/collision. **Now also hosts doors/windows** — openings are positioned by arc-length and cut per-chord (3D + collision + 2D + door-swing). Follow-up: a true circular arc vs the Bézier approximation (cosmetic). |
| Draw **sloping** (variable-height) walls | ✅ | **shipped — PARITY-SLOPEWALL** (`slopingWalls`): `PlanWall.topHeightEnd` ramps the top start→end, rendered as a prism (`slopedWall.ts`); inspector start/end height fields. Pairs with the sloped ceiling below. |
| Rooms (rect / polygon) + floor/ceiling finishes | ✅ | `PlanRoom` (rect, L-extension, free `polygon`), `roomFinishes`. |
| **Manually draw/edit** an arbitrary room polygon in the editor | ✅ | Drawing via the `polyroom` tool (click vertices → close); **reshape now shipped** — drag the vertex handles on a selected polygon room (`FloorPlanEditor` `movingPolyVertex`). |
| Doors/windows auto-cut wall holes (CSG-like) | ✅ | `PlanOpening` rendered as wall cutouts; door swing + hinge. |
| Dimension lines | ✅ | plan editor dimensions + 3D `AnnotationsOverlay`/tape measure. |
| Text labels / annotations | ✅ | plan notes, `planLabels` (furniture name/price on plan). |
| Polyline markup | ✅ | `planPolyline` (open/closed, dashed, arrow). |
| Compass / North + sun by date+geo location | ✅ | `orientation` slice + SunCalc lighting, manual-hour slider. |
| Multiple levels / storeys + stairs | ✅ | F13 multi-storey (`floorplan/levels.ts`), `Staircase` primitive. |
| Furniture catalog (searchable, categorized) | ✅ | 15 categories + builtin/IKEA/pack/remote/user sources. |
| Import custom 3D models | ✅ | `modelUpload` auto-converts to GLB and **exceeds** SweetHome3DJS's set: GLB/glTF, OBJ, FBX, STL, PLY, DAE/Collada, **3DS** (added — `TDSLoader`, Max3DSLoader parity), 3MF, USDZ. |
| Per-model material/texture editing | ✅ | finishes DLC + `finishOverrides`, drag-to-apply, PBR surfaces. |
| Photoreal render + sunlight time-of-day | ✅ | render presets + `hqRender` path-tracer + day/night. |
| **Video** (keyframed camera-path → file) | ✅ | **shipped — PARITY-VIDEO**: "Record walkthrough video" flies the saved-views cinematic tour while recording → downloads a `.webm` (`recordViewTour` + the existing RecordController); user-set pace via `viewTourLegSeconds`. |
| Lights (fixtures) | ✅ | `FurnitureLights`, `itemAsLight`, lux overlay. |
| Furniture multi-axis rotation (**pitch/roll**) | ✅ | **shipped — PARITY-TILT** (`tiltFurniture`): optional `pitch`/`roll` on `FurnitureItem`, inspector sliders, `furniture/tiltRotation.ts`. |
| Import a blueprint background to trace | 🟡 | reference backdrop + `aiWalls` plan tracing; no scaled blueprint underlay tool. |
| **Whole-scene 3D export (OBJ/glTF)** | ✅ | **shipped — Q-3DEXPORT** (`sceneExport3d`); STL/USDZ still open. |
| Export PDF / SVG / bitmap / DXF | ✅ | report PDF, plan SVG, DXF, drawing set, BOQ/CSV/XLSX, PNG, panorama. |
| Persistence + crash recovery (IndexedDB) | ✅ | localStorage autosave + IndexedDB asset blobs + hydration. |
| Server/cloud sync (IncrementalHomeRecorder) | 🟡 | local autosave + link share; no REST/cloud sync adapter. |
| Undo/redo | ✅ | history slice + `versions`/`history` panels. |
| Length units (metric/imperial) | ✅ | `units` everywhere via `utils/measurement`. |
| Sloped ceiling / roof geometry | ✅ | **shipped — PARITY-SLOPECEIL**: a `sloped` `CeilingConfig` style (pitched plane, `slope: {axis, rise}`) in `ceilingModel.ts` + `RoomCeiling`; per-room picker. Pairs with sloping walls. |
| Catalog **uncompressed model-size** + creator columns | ✅ | **shipped — PARITY-MODELINFO** (`catalogModelInfo`): card tooltip shows model byte size (uploads, captured at upload) + licence/creator (all sourced GLBs), `furniture/modelInfo.ts`. (Bundled-GLB byte size still needs a build manifest — minor.) |

## 3. Roadmap (phased)

### Phase 1 — done
- **3D scene export (glTF/GLB + OBJ).** Shipped (Q-3DEXPORT). Pure extract/filter core
  (`export/sceneGltf.ts`) + live-scene access controller; reuses `convert/toGlb.ts`. Highest-value
  gap, lowest risk, fully additive.

### Phase 2 — net-new, low/medium effort
- ~~**Uncompressed-model-size + creator catalog metadata.**~~ **Shipped (PARITY-MODELINFO)** — the
  catalog card tooltip shows model byte size (uploads, captured at upload) + licence/creator (all
  sourced GLBs) via `furniture/modelInfo.ts`, behind `catalogModelInfo`. Bundled-GLB byte size would
  need a build-time manifest (minor follow-up).
- ~~**Manual room-polygon drawing/editing.**~~ **Shipped** — `polyroom` tool draws polygons; vertex
  reshape handles (`FloorPlanEditor` `movingPolyVertex`) edit them after creation.

### Phase 3 — net-new, structural / higher risk
- ~~**Multi-axis rotation (pitch/roll).**~~ **Shipped (PARITY-TILT)** — optional `pitch`/`roll` on
  `FurnitureItem` + inspector sliders, applied via a pure `[pitch, yaw, roll, 'YXZ']` Euler
  (`furniture/tiltRotation.ts`); collision stays yaw-OBB (tilt doesn't change the plan footprint, as in
  SweetHome3DJS); structural/locked items excluded. Gizmo + 2D tilt-handle remain a follow-up.
- **Round/arc walls.** **Shipped (PARITY-CURVEDWALL)** — `PlanWall.arc` bulge + `wallArc.ts` chord
  expansion through the existing geometry/collision; 2D bulge handle; **openings on curves** (arc-length
  positioned, per-chord cut). Remaining: a true circular arc (vs the Bézier approximation — cosmetic).
- ~~**Sloping (variable-height) walls + sloped ceiling / roof geometry.**~~ **Shipped** —
  `PlanWall.topHeightEnd` prism walls (PARITY-SLOPEWALL) + a `sloped` `CeilingConfig` pitched plane
  (PARITY-SLOPECEIL); set both to match for a shed roof.

### Phase 4 — portability/fidelity (lower priority; mostly already-strong areas)
- Dual-format save (precompute a merged `HomeStructure.glb` alongside the JSON state for fast load — the
  `.sh3d` model; reuses the Phase-1 exporter).
- ~~Keyframed camera-path **video** export~~ **Shipped (PARITY-VIDEO)** — records the saved-views
  cinematic tour to a `.webm` with a user-set pace.
- **DAE/3DS import** loaders to round out `modelUpload`.
- Optional **REST cloud-sync** adapter (mirrors `IncrementalHomeRecorder`) behind the existing storage
  adapter seam.
- ~~STL / USDZ export~~ **Shipped** (Q-3DEXPORT now does GLB/OBJ/STL/USDZ). ~~AR "view in your room"~~
  **Shipped (PARITY-AR)** — iOS AR Quick Look + GLB fallback (`viewInAr`); only Android Scene Viewer
  (needs an https-hosted model → a backend) remains.

## 4. Notes on integration style
Every item above is gated behind a `FEATURE_FLAGS` entry with a `simple`/`pro` tier, follows the
existing module seams (`floorplan/`, `collision/`, `export/`, `furniture/`), keeps pure logic
render-agnostic + unit-tested, and ships with a scenario ladder (`scripts/scenarios/`). Anything
analytical/authoring/advanced is `pro`-tier; only the core furnish/finish/view/share/budget loop is
`simple`.
