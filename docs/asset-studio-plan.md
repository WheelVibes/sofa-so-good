# Asset Studio — GLB designer → professional furniture asset builder

**Goal (user, 2026-07-16):** turn the crude GLB editor into a professional asset-building tool
for creating high-fidelity, realistic custom furniture in-app: custom complex shapes,
components, templates, materials, finishes, colours, gradients, sheen, gloss, fittings,
parts, groups, sets, modular customization.

**Research base:** current-capability map (three authoring systems — GLB designer,
parametric generator, slot configurator — all baking through `exportGlb → persistUserGlb`;
engine already supports clearcoat/sheen/anisotropy/transmission via `furnitureMaterials.ts`
but the designer exposes none of it) + external survey (Tylko/Shapr3D/Plasticity/Womp/
TinkerCAD/SWOOD/Polyboard + three.js state of the art). Full reports in the 2026-07-16
session; key conclusions inlined per stage. Reference-tool additions land in
`REFERENCES.md` with Stage 0 (repo rule: record research in the same change that acts on it).

**Paradigm decision (from research):** professional furniture tools converge on
**parametric + component-library construction with automatic detailing** (Tylko, SWOOD,
Polyboard) — not free-form vertex editing. Realism comes from the system: correct
proportions, bevelled edges, correct PBR response, hardware detail. A browser app
reproduces that with three.js-native geometry (Extrude/Lathe/Tube with bevels),
`MeshPhysicalMaterial` finishes, three-bvh-csg composition, and template/slider flows.
Ruled OUT for now: OCCT/B-rep WASM kernels (~4–15 MB payload; revisit only if true NURBS
fillets become a hard requirement) and live cloth simulation (offline-bake territory).

**Program rules (every stage):** feature-flagged (`FEATURE_FLAGS` + tier, tested in BOTH
modes), pure geometry/spec logic in `src/furniture/glbEdit/` with unit tests, heavy CPU on
the shared `workerPool`, SEC-1 loader for any GLB fetch, demand-frameloop respected,
UI on token classes + shared primitives, visual verification per playbook, docs + CHANGELOG
+ version bump per commit, adversarial review at stage end. Keep `GlbDesignerDialog.tsx`
shrinking — every stage extracts modules, never grows the monolith.

---

## Stage 0 — Foundations & hygiene (prerequisites everything else builds on) — ✅ SHIPPED (v0.21.2.28)
- ✅ **`glbDesigner` feature flag** (pro tier, default on) — closes the every-feature-behind-a-flag
  violation; gates the dialog mount, the ⌘K `glb-designer` command (`COMMAND_FLAGS`) and the catalog
  "Design" button; both-modes tests (`features/flags/glbDesigner.test.ts`).
- ✅ **Undo/redo** for `AssetEditSpec` — bounded (~50) history reducer `glbEdit/specHistory.ts`
  (pure, tested; ~300 ms same-key coalescing so a drag is one step); ⌘Z/⇧⌘Z (+⌘Y) in-dialog +
  toolbar ↶/↷ buttons with disabled states.
- ✅ **Editable saves (spec persistence):** the edit spec is embedded on the saved def as a
  versioned JSON `assetSpec` (`glbEdit/specPersist.ts` `{ v, spec }`, mirroring the configurator's
  `slotSpec`/SLOT-204 round-trip — IDB meta + save schema, additive, no schema-version bump). Picking
  a designer-built source offers **Restore editable parts** (full part list re-opens editable);
  absent spec → today's frozen-source behaviour.
- ✅ **Dialog decomposition:** `GlbDesignerDialog.tsx` is now composition + state wiring; UI split
  into `DesignerViewport` / `DesignerToolbar` / `LayersPanel` / `SourcePanel` / `CombinePanel` /
  `SavePanel` (+ `PartsPreview`), all pure logic in `furniture/glbEdit/`.
- ✅ **REFERENCES.md**: furniture-modeling tool section added (with the staged plan, v0.21.2.27).

## Stage 1 — Geometry: custom complex shapes
### Stage 1a — new shape kinds + ubiquitous bevels — ✅ SHIPPED (v0.21.2.29)
- ✅ **New parametric shape kinds** in `editSpec.ts`/`buildObject.ts` (pure geometry in
  `glbEdit/shapeProfiles.ts`, unit-tested — finite verts, correct normals + UVs, bbox tracks `size`):
  - ✅ `extrude` — normalized 2D `outline` (centred [-0.5,0.5]) → `ExtrudeGeometry`, **bevel ON by
    default**; presets rounded-rect / ellipse / L / T / arch.
  - ✅ `lathe` — normalized `profile` (x = radius fraction, y = height fraction) + `segments` →
    `LatheGeometry`; presets turned-leg / tapered-leg / bowl / vase / column.
  - ✅ `sweep` — preset cross-section (circle/half-round/ogee/rectangle) × preset path
    (straight/L/U/ring) → `TubeGeometry` (circle) / `ExtrudeGeometry(extrudePath)` (others).
    Presets-only param surface (arbitrary path editing deferred).
  - ✅ **Profile editor UI** (`ui/glbEditor/ProfileEditor.tsx`): draggable SVG points (44px touch
    targets — mobile-usable) + numeric X/Y entry + add/remove + preset dropdown seeding.
- ✅ **Ubiquitous bevels**: `bevel` (m) on box (three `RoundedBoxGeometry`) + wedge (bevel-enabled
  extrude); `bevel` 0/absent is byte-identical to the old sharp geometry. Extrudes default bevel on.
  Inspector "Corner radius" `SliderField` for bevelable kinds.
- ✅ **Plumbing**: `SHAPE_KINDS`/`SHAPE_LABEL`/`DEFAULT_SIZE`/`defaultPart` + duplicate/mirror
  deep-copy + `gizmoWriteBack` (lathe/sweep stay round under scale) + `specPersist` round-trip
  (tested) + `DesignerToolbar` "More shapes" cluster.

### Stage 1b — CSG v2 (OPEN)
- **CSG v2:** multi-select booleans; ops recorded in the spec (non-destructive — operands
  stay editable, result rebuilt lazily); heavy combines moved to the worker pool; source-GLB
  as operand where watertight. Keep the TinkerCAD "solid/hole" mental model in the UI.

## Stage 2 — Materials: finishes, colours, gradients, sheen, gloss
- **`MeshPhysicalMaterial` part materials:** expose sheen (fabric/velvet), clearcoat
  (lacquer/gloss), transmission + IOR + thickness (glass), anisotropy (brushed metal) on
  `ShapePart` + `PartInspector` sliders; exports via glTF KHR extensions (verify per-ext
  exporter support; document what bakes).
- **Finish preset gallery:** named presets (velvet, satin, leather, lacquered wood,
  oiled wood, glass, brushed steel, powder-coat…) = curated parameter bundles over the
  existing `mat:<id>`/procedural vocabulary — swatch grid UI, one tap to apply.
- **Gradients/two-tone:** per-part vertex-colour gradient (axis + two colours) baked into
  geometry; survives GLB export losslessly.

## Stage 3 — Components, fittings, templates, groups
- **Part grouping/hierarchy:** named groups with group transforms in the spec; layer panel
  becomes a tree; group duplicate/mirror.
- **Fittings/component library:** curated hardware components (legs ×N styles, handles,
  knobs, feet, hinges, castors) as parametric mini-builders + CC0 GLB parts;
  **snap-to-surface placement** (SWOOD pattern: click a face, component lands oriented,
  with spacing presets).
- **Template-first flows:** archetype starters (sofa, cabinet/wardrobe, table, shelving,
  bed frame) — bridge the existing parametric generator INTO the designer as editable part
  sets, sliders clamped to ergonomic ranges (sofa seat ~0.44 m, counter 0.9 m, …) so
  proportions are right by construction.
- **Sets & modular customization:** save a designed asset as a configurator product
  (designer → slot-spec export) so a built piece becomes a customizable product family;
  save grouped multi-piece designs as a set.

## Stage 4 — Precision & pro UX
- Alignment/distribution (align faces/centres, distribute), grid-snap toggle + step,
  live dimension readouts + measure tool, arbitrary-axis mirror, linear/radial array
  (reuse room-editor helpers), ortho view presets + camera bookmarks, part search/rename.

## Stage 5 — Realism detail layer
- Decal/detail layer (`DecalGeometry`): seams, stitches, buttons, logos, wear.
- Piping/seam presets along cushion edges (Stage-1 sweep reused).
- Cushion realism ruling: evaluate baked-deformation variants vs cost; record ruling.

---

**Status:** Stage 0 **shipped** (v0.21.2.28); Stage 1a **shipped** (v0.21.2.29, 2026-07-16) —
Stage 1b (CSG v2) next. Each stage lands as its own
commit train with an end-of-stage adversarial review; this file tracks stage state.
