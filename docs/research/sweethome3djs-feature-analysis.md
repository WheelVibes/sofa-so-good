# SweetHome3DJS 7.7 Online — feature deep-dive & sofa-so-good integration roadmap

> Research deliverable. Source studied: the **`develop-SweetHome3D-7.7-Online`** branch of
> SweetHome3DJS on SourceForge
> (`branches/develop-SweetHome3D-7.7-Online/SweetHome3DJS/`), the public JS API
> (`sweethome3d.com/jsdoc/`), the Sweet Home 3D feature/user docs, and the
> `luxvitae-eco/SweetHome3DJS` mirror. Registered in `REFERENCES.md`.
>
> **Purpose:** enumerate every SweetHome3DJS feature and judge what is worth integrating into
> sofa-so-good, as a gap analysis + a roadmap of the remaining open work (shipped parity lives in
> `CHANGELOG.md`). **Headline finding:** sofa-so-good is already *more* capable than SweetHome3DJS in
> most areas (PBR materials, AI surfaces, analysis/checks, drawing sets, IKEA catalog, multi-storey);
> the genuine remaining gaps are narrow and structural (see §2–§3).

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

## 2. Feature gap analysis vs sofa-so-good — remaining gaps

The full feature-by-feature study found **near-complete parity** — every capability we now match is
recorded in `CHANGELOG.md` (walls incl. arc/sloping, polygon rooms, openings, dimensions/annotations,
multi-storey, catalog + broad import, per-model finishes, photoreal render, video, furniture
tilt/elevation/resize, whole-scene 3D export, PDF/SVG/DXF/CSV, undo/redo, units, sloped ceilings,
catalog model-info, …). Only these gaps remain:

- **Server/cloud sync** (SH3D's `IncrementalHomeRecorder`) — we have local autosave + link share, but
  no REST/cloud-sync adapter (backend-dependent). See §3.
- Minor tails tracked in `TASKS.md` (e.g. `.sh3f` furniture libraries, legacy archive import).

## 3. Roadmap — remaining open items

(Shipped SH3D-parity items live in `CHANGELOG.md` — this list is open work only.)

- **Dual-format save** — precompute a merged `HomeStructure.glb` alongside the JSON state for fast
  load (the `.sh3d` model; reuses the scene exporter). Lower priority.
- **DAE/3DS import** loaders to round out `modelUpload`.
- Optional **REST cloud-sync** adapter (mirrors `IncrementalHomeRecorder`) behind the existing
  storage-adapter seam. (Backend-dependent.)
- **Android Scene Viewer** AR (needs an https-hosted model → a backend); iOS AR Quick Look + GLB
  fallback already ship.

## 4. Notes on integration style
Every item above is gated behind a `FEATURE_FLAGS` entry with a `simple`/`pro` tier, follows the
existing module seams (`floorplan/`, `collision/`, `export/`, `furniture/`), keeps pure logic
render-agnostic + unit-tested, and ships with a scenario ladder (`scripts/scenarios/`). Anything
analytical/authoring/advanced is `pro`-tier; only the core furnish/finish/view/share/budget loop is
`simple`.
