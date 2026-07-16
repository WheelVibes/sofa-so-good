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

### Stage 1b — CSG v2 — ✅ SHIPPED (v0.21.2.30)
- ✅ **Non-destructive combine groups** (`glbEdit/editSpec.ts` `combineGroups[]` +
  `parts[].role: 'solid'|'hole'`): multi-select 2+ parts → Union/Subtract/Intersect records a
  group whose **operands stay editable**; the result is evaluated lazily from their live
  transforms (`glbEdit/csgEval.ts`). Pure helpers `addCombineGroup`/`removeCombineGroup` (ungroup)
  /`bakeCombineGroup`/`setPartRole`/`pruneCombineGroups`, unit-tested.
- ✅ **Multi-operand** folds (`foldCsg`): union/intersect across all operands; subtract carves the
  `hole`-role operands out of the solids (no holes → first-selected is the base). Per-group
  material preservation carried over from v1.
- ✅ **Worker offload** — the third pooled worker (`glbEdit/csgWorkerPool.ts` + `csg.worker.ts`),
  built on the shared `furniture/worker/workerPool.ts`; transferable geometry; debounced preview
  (`useCombineResults`) with a "Computing…" hint; translucent hole ghosts; main-thread fallback.
- ✅ **Bake escape hatch** ("Bake to mesh") → one frozen editable `mesh` part; v1 mesh parts load
  unchanged (back-compat).
- ✅ **Export** bakes each group's evaluated result (holes not exported); `assetSpec` keeps the full
  non-destructive graph. Persistence bumped to **v2** (v1→v2 identity migration).
- Source-GLB-as-operand deferred (the designer never makes the source a part; bake a mesh + combine
  covers the watertight case). TinkerCAD "solid/hole" mental model is the UI vocabulary.

## Stage 2 — Materials: finishes, colours, gradients, sheen, gloss — ✅ SHIPPED (v0.21.2.32)
- ✅ **`MeshPhysicalMaterial` part materials:** optional `PhysicalSurfaceFields` on `ShapePart`
  + `GroupMaterialData` (`editSpec.ts`) — `sheen`/`sheenColor`/`sheenRoughness`,
  `clearcoat`/`clearcoatRoughness`, `transmission`/`ior`/`thickness`, `anisotropy`/
  `anisotropyRotation`; all absent by default (byte-identical output). `buildObject.ts`
  `buildSurfaceMaterial` upgrades to `MeshPhysicalMaterial` ONLY when one of the four primary
  axes is > 0 (`hasPhysicalLook` gate — cost discipline), else the plain `MeshStandardMaterial`.
  `partAsGroupMaterial` + `csgEval.materialKey` carry the fields through combine bakes.
  `PartInspector` → `PartMaterialSection` exposes the raw sliders behind a "Custom finish"
  Disclosure. `specPersist` bumped to **v3** (v2→v3 identity migration; strict field validation).
- ✅ **Finish preset gallery:** pure `glbEdit/finishPresets.ts` — 14 named, colour-agnostic
  physics bundles (Velvet, Satin, Leather, Lacquered wood, Oiled wood, Matte paint, Powder-coat,
  Brushed steel, Polished chrome, Brass, Clear glass, Frosted glass, Ceramic, Rubber), reusing the
  pure `materialRealism.ts` sheen/clearcoat helpers. `PartMaterialSection` renders a `.fin-presets`
  swatch grid (presets FIRST per the research); one tap applies (clears finish + stale fields),
  the matching preset highlights (`matchingFinishPresetId`). Unit-tested (ranges, apply→match
  round-trip, no-stale-field).
- ✅ **Gradients/two-tone:** per-part `gradient: {axis, from, to}` baked as a `COLOR_0` vertex
  attribute (pure `glbEdit/gradient.ts` `applyGradientColors`, applied in `partGeometry` over
  every shape kind) + `vertexColors` on the material. Inspector: axis `Segmented` + two
  `ColorPicker`s behind a "Gradient" Disclosure, **disabled when a textured finish is set** (a
  texture × gradient multiply reads muddy — hint shown). Unit-tested (endpoints, axis, degenerate
  span, every shape kind).

### Export support matrix (verified, `physicalMaterialExport.test.ts` — three r184 GLTFExporter → app GLTFLoader round-trip)
**Every** Stage-2 field bakes AND restores losslessly — nothing is export-only or dropped:

| Field(s) | glTF extension | Bakes + restores | Notes |
|---|---|---|---|
| `sheen` / `sheenColor` / `sheenRoughness` | KHR_materials_sheen | ✅ | — |
| `clearcoat` / `clearcoatRoughness` | KHR_materials_clearcoat | ✅ | — |
| `transmission` | KHR_materials_transmission | ✅ | **Render caveat:** the transmissive pass needs a real GPU, so the in-editor/headless preview reads flat on Performance/Medium (use `SHOT_GPU=1`). The exported GLB is always correct — a PREVIEW limit, not an export one. |
| `ior` | KHR_materials_ior | ✅ | — |
| `thickness` | KHR_materials_volume | ✅ | — |
| `anisotropy` / `anisotropyRotation` | KHR_materials_anisotropy | ✅ | — |
| `gradient` (baked) | core `COLOR_0` + `vertexColors` | ✅ | Combine (CSG) drops COLOR_0 (position+normal only) → gradient not offered on mesh parts. |

## Stage 3 — Components, fittings, templates, groups
### Stage 3a — spec-envelope unification + part grouping/hierarchy — ✅ SHIPPED (v0.21.2.33)
- ✅ **One versioned spec envelope** (`furniture/specEnvelope.ts`, pure + unit-tested): a shared
  `{ kind: 'asset' | 'configured', v, payload }` envelope + `EnvelopeCodec` (strict guard +
  version migration + `parseLegacy` recogniser). `assetSpec` (`glbEdit/specPersist.ts`, kind
  `'asset'`) and `slotSpec` (`configurator/configuredPersist.ts`, kind `'configured'`) both route
  through the single `parseEnvelope`/`serializeEnvelope` path — `parseLegacy` keeps reading the old
  `{v,spec}` (asset) + raw `{productId,selections}` (configured) blobs, re-saved in the envelope on
  next write. The two def FIELDS stay separate for schema stability (the unification is the FORMAT
  + one shared module, not a field merge). Closes the recorded Stage-1 envelope debt.
- ✅ **Named transform groups** (`editSpec.ts` `PartGroup` — **distinct from `CombineGroup`**; UI
  copy "Group" vs. "Combine"): `partGroups[]` with an optional group `position`/`rotation` applied
  ON TOP of member transforms at build time. Pure ops (add / rename / update-transform / duplicate
  (deep-copies members) / mirror / prune) + `groupTransform.ts` (three math: `groupedPartWorldPosition`
  + `ungroupPartGroup` — flatten so nothing jumps). **Flat groups only** (no nesting / `parentGroupId`
  — deliberate scope). A part is in at most one PartGroup AND may be in a CombineGroup independently.
  Persistence bumped to **v4** (v1–v3 → v4 identity migration; strict `partGroups` validation).
- ✅ **Build + gizmo:** `buildEditedObject` nests grouped parts under a three.Group carrying the
  group transform (unit-tested: grouped part world = group transform ∘ part transform). The gizmo
  selects + drags a whole group (LayersPanel group-row click → group proxy → `TransformControls`,
  translate/rotate only, same 5 mm/1° snap via `groupGizmoPatch`).
- ✅ **LayersPanel → shallow tree:** group rows (inline rename, collapse/expand, indented members),
  Group action on the multi-select toolbar, per-group Ungroup / Duplicate / Mirror; combine ⛓ badge
  stays distinct from group membership. Mobile parity.
- ✅ **History/undo:** every group op is one `commit()` entry; undo of ungroup restores the group.

### Stage 3b — fittings/component library + snap-to-surface placement — ✅ SHIPPED (v0.21.2.34)
- ✅ **Component library** (`glbEdit/components.ts`, pure + unit-tested): 13 curated parametric
  FITTINGS — legs (tapered/round/square/hairpin/angled mid-century), handles/pulls (bar, arc,
  round knob, recessed groove), feet (dome, cylinder puck, castor), and a butt hinge — each a
  pure builder emitting an ordinary `ShapePart[]` in a component-local frame with 1–3 clamped
  params + metal/wood/rubber finish defaults (plain `ShapePart` colour/roughness/metalness, no
  `mat:<id>`). A placed component is just parts + a named `PartGroup` (no new part kind).
- ✅ **Snap-to-surface placement** (`glbEdit/componentPlace.ts`, pure + unit-tested; the SWOOD
  pattern): arm a component in the **Components** panel, then click a face in the preview →
  `componentTransform` maps the component's declared mount axis (`floor` → down for legs/feet,
  `wall` → out for handles/hinges) onto the clicked world normal, 5 mm-snaps the hit point, and
  `addPlacedComponent` lands it as a named group, selected. A ground plane catches floor clicks;
  Esc / re-tap disarms. Real R3F face click (`DesignerViewport`/`PartsPreview`) + a small
  automation seam (`window.__glbDesignerPlaceOnFace`) for the scenario.
- ✅ **Symmetric "Repeat to corners"** (`editSpec.ts:repeatComponentGroup`, pure + unit-tested):
  from the `GroupInspector`, one tap mirrors a placed fitting about the asset bbox centre — Mirror
  X / Mirror Z (2 copies) or Repeat ×4 (all four corners) — deep-copying members with mirrored
  group transforms. Place one leg, get a four-legged table.
- ✅ Scenario `scripts/scenarios/glb-designer-stage3b.json`; persistence unchanged (a component is
  a `PartGroup` — already covered by the v4 `partGroups` envelope).

### Stage 3 — remaining
- **Part grouping/hierarchy:** named groups with group transforms in the spec; layer panel
  becomes a tree; group duplicate/mirror. — ✅ done (3a)
- **Fittings/component library:** curated hardware components + **snap-to-surface placement**
  (SWOOD pattern). — ✅ done (3b)
- **Template-first flows:** archetype starters (sofa, cabinet/wardrobe, table, shelving,
  bed frame) — bridge the existing parametric generator INTO the designer as editable part
  sets, sliders clamped to ergonomic ranges (sofa seat ~0.44 m, counter 0.9 m, …) so
  proportions are right by construction. — ✅ done (3c)
- **Sets & modular customization:** save a designed asset as a configurator product
  (designer → slot-spec export) so a built piece becomes a customizable product family;
  save grouped multi-piece designs as a set. — ✅ done (3d)

### Stage 3d — sets & modular customization — ✅ SHIPPED (v0.21.2.36) — closes Stage 3
- ✅ **Designer → configurable product export** (`furniture/configurator/designerExport.ts`, pure
  planner unit-tested + async baker; UI `ui/glbEditor/MakeConfigurablePanel.tsx`, flag
  `assetConfigurableExport` pro/on). A "Make configurable" panel exposes the design's top-level
  `PartGroup`s: name a **Slot** on a group to offer it as a swappable option; two groups sharing a
  slot name become alternatives (first = default). Blank groups + loose parts bake into the fixed
  base. Emits a `ConfigurableProduct` that opens in the **existing** `ConfiguratorDialog`, swaps
  options live, and bakes through the **unchanged** `saveConfiguredAsset` path.
- ✅ **Option-representation ruling (baked GLB `data:` URL):** a configurator `SlotOption` holds a
  box-only `ConfiguredPart` OR a `gltfUrl` — it can't carry arbitrary designer `ShapePart`s
  (lathe/cylinder legs, CSG, sweeps, bevels, gradients). So each option **and** the base is baked to
  its own small GLB embedded as a self-contained `data:` URL on the existing `gltfUrl` field. This
  preserves full shape fidelity and touches the configurator's `model`/`compose`/`buildObject`/
  `saveConfigured` **zero** (they already load/fit/namespace/re-skin `gltfUrl` options — SLOT-203).
  Each option GLB is baked in product-world space (group transform flattened into every part) with
  an **identity slot anchor**, so the v1 quarter-turn `SlotAnchor` limit never bites; footprints are
  symmetric world spans (a provable superset for compose's origin-centred bounds). Per-option price
  inputs default 0. Rejected: box-restriction (lossy — can't hold the tapered/round legs) and
  forking the configurator model to understand designer parts.
- ✅ **User products registry** (`state/slices/userProductsSlice.ts`): exported products register in
  `userConfigurableProducts` and appear alongside authored `CONFIGURABLE_PRODUCTS` wherever
  configurable products are browsed (`ConfiguratorDialog` tabs) + resolve for the SLOT-204 re-edit
  seed. Self-persists to localStorage (`hdb_user_products`, the per-device authored-library pattern
  shared with `userSetsSlice`); the products it bakes into the catalog persist via the normal
  user-furniture path.
- ✅ **Sets** (`furniture/glbEdit/setSplit.ts`, pure + unit-tested; `SavePanel` switch, flag
  `assetSets` pro/on): "Save groups as separate assets" splits a multi-piece design so **each
  top-level group also saves as its own catalog asset** (named after the group, group transform
  flattened in) alongside the whole. A placed set is just the individual assets — no new runtime
  concept.
- ✅ Scenario `scripts/scenarios/glb-designer-stage3d.json`; both flags both-modes tested.

### Stage-1 review debts (recorded during the v0.21.2.31 review-fix cluster — address BEFORE Stage 3 lands)
- ✅ **Unify the persisted specs under one versioned envelope.** DONE (Stage 3a, v0.21.2.33):
  `furniture/specEnvelope.ts` `{ kind, v, payload }` + `EnvelopeCodec`; `assetSpec` (kind `'asset'`)
  and `slotSpec` (kind `'configured'`) both route through it with `parseLegacy` back-compat.
- ✅ **Disambiguate `CombineGroup` vs. Stage-3 transform groups.** DONE (Stage 3a, v0.21.2.33):
  the transform feature is `PartGroup` / "Group" in the UI; the boolean feature stays `CombineGroup`
  / "Combine" (⛓). A part can be in one of each independently.
- ✅ **Define the parametric→designer bridge recipe representation.** RULED (Stage 3c,
  v0.21.2.35): **flatten to plain `ShapePart`s at insertion (option b)**. A live parametric
  recipe embedded in the spec would be a FOURTH spec concept (alongside parts / combineGroups /
  partGroups) and fights the whole part-level editing model — once inserted the user owns the
  parts (drag, recolour, combine, ungroup), so a re-derivable recipe has nowhere to live without
  the spec learning to reconcile hand-edits back into generator params. Templates instead **seed
  an editable starting point** (Tylko "start from a working piece") and then get out of the way.
  The approachability win is preserved by making the **template dialog itself parametric**: the
  user adjusts ergonomic sliders BEFORE inserting, with a live viewport preview, and the insert
  flattens the previewed geometry into `ShapePart`s + one wrapping `PartGroup`. No new spec field,
  no persistence-version bump (a template is just parts+group — already covered by the v4
  `partGroups` envelope, exactly like a placed component).

### Stage 3c — template-first flows — ✅ SHIPPED (v0.21.2.35)
- ✅ **Template library** (`glbEdit/templates.ts`, pure + unit-tested): 6 archetype starters —
  **Dining table**, **Coffee table**, **Bookshelf**, **Cabinet/sideboard**, **Bed frame**,
  **Sofa frame** — each a pure builder (clamped dims → `ShapePart[]` + one wrapping `PartGroup`).
  Every param is clamped to an ergonomic range (seat 0.40–0.48 m, dining 0.72–0.78 m, shelf depth
  0.25–0.40 m, SG mattress presets …) with defaults at the sweet spot; each carries a `hint`
  naming the standard. Bookshelf **reuses `parametric/buildParts.ts`** (its bookshelf `ParametricPart[]`
  map cleanly to box `ShapePart`s via a thin adapter — no rewrite); cabinet/table/bed/sofa reuse
  `components.ts` fittings (tapered/square legs, bar pulls, puck feet) where natural; sofa cushions
  carry the `finishPresets.ts` **Velvet** bundle.
- ✅ **Template picker** (`ui/glbEditor/TemplatesPanel.tsx`, above Components): tap a template →
  a compact parametric step (its 2–4 sliders, each showing unit + range + the ergonomic hint) with
  a **live viewport preview** (the dialog renders the would-be-inserted spec) → **Use template**
  flattens it in. Empty spec **replaces**; a non-empty spec **inserts alongside** (offset on +X, no
  confirm — least surprising). Cancel backs out cleanly. One undo step.
- ✅ Scenario `scripts/scenarios/glb-designer-stage3c.json`; no persistence change (v4 envelope).

## Stage 4 — Precision & pro UX
- ✅ **Stage 4a — pre-Stage-4 refactor (shipped, v0.21.2.38, 2026-07-16):** `GlbDesignerDialog`
  had accreted ~99 hand-threaded props across 11 child panels (SourcePanel/DesignerToolbar/
  TemplatesPanel/ComponentsPanel/LayersPanel/PartInspector/GroupInspector/CombinePanel/
  MakeConfigurablePanel/SavePanel/DesignerViewport). Introduced a designer **context**
  (`ui/glbEditor/designerContext.tsx` — `DesignerProvider`/`useDesigner()`) owning spec +
  history + selection + gizmo/preview registries + armed component/template state + live combine
  eval + make-configurable assignments + every handler; the panels consume it directly and the
  dialog is pure composition. Behaviour-preserving (no feature/UI change): panel prop bindings
  ~99 → 0; all designer scenarios (stage0/1a/1b/2/3a/3b/3c/3d) stay green. Do this BEFORE adding
  any Stage-4 surface — otherwise every new tool widens the prop firehose further.
- ✅ **Stage 4b — precision & pro UX (shipped, v0.21.2.39, 2026-07-16):** all riding the
  `glbDesigner` flag, all on the Stage-4a `useDesigner()` context (zero new prop threading):
  - ✅ **Align & distribute** (`glbEdit/arrange.ts`, pure + tested) — align min/centre/max on
    X/Y/Z (≥2 selected) + distribute equal-gap (≥3) in a compact "Arrange" section; kind-aware
    rotation-projected AABB extents (`partWorldExtent`). One undo step each.
  - ✅ **Grid snap toggle + step** (`ui/glbEditor/gridSnapPref.ts`) — viewport magnet toggle +
    1 mm/5 mm/1 cm/5 cm step Select; drives the gizmo write-back snap (`gizmoWriteBack` now takes
    an optional length step, default 5 mm) AND the inspector's numeric stepping; persisted
    per-device to localStorage (not the save schema).
  - ✅ **Live dimension readout** — viewport-corner W×D×H (cm) overlay, live during a gizmo drag
    (in-canvas `useFrame` Box3 union over the selected preview objects).
  - ✅ **Arbitrary-axis mirror** — Mirror X / Mirror Z for a single part AND a multi-selection,
    reusing the shared `mirroredTransform` conjugation (`editSpec.mirrorPartAxis`/`mirrorPartsAxis`)
    — not re-derived. The inspector's single-part mirror stays (thin X alias).
  - ✅ **Linear & radial array** (`glbEdit/arrayBuild.ts`, pure + tested) — duplicate the selection
    into a named "Array" group. **Reuse verdict:** the radial path reuses room
    `radialArrayPlacements` verbatim (XZ `{position,rotation}` maps onto a part's `[x,y,z]` + yaw);
    the linear path is implemented directly (room `arrayOffsets` is XZ-plane + FurnitureItem-shaped
    + rotation-relative — the wrong fit for an axis-aligned X/Y/Z array). One undo step.
  - ✅ **Ortho view presets + Home** — Front/Side/Top/Home buttons reposition the (kept) perspective
    camera to fit-framed axis poses via an in-canvas responder; no persistence. (Camera "bookmarks"
    beyond the presets weren't needed for the core loop — deferred, not blocking.)
  - ✅ **Part search & rename** — layers-tree filter (case-insensitive name substring, shows matched
    rows + their groups, force-expands under filter) + inline part rename; `ShapePart.name` added,
    spec envelope **v5 → v6** (additive identity migration). Default label falls back to `kind N`.
  - Measure tool: the live dimension readout covers the "how big is this" need in-editor; a separate
    click-two-points measure was **deferred** as lower-value than the shipped surfaces.
  - Scenario `scripts/scenarios/glb-designer-stage4.json`.

## Stage 5 — Realism detail layer — ✅ SHIPPED (v0.21.2.40) — closes the program
- ✅ **Decal/detail layer** (`glbEdit/decals.ts` + `decalTexture.ts`, pure + unit-tested; UI
  `ui/glbEditor/DetailsPanel.tsx`): a **Details** section arms a curated detail — **Button**,
  **Stitch line**, **Seam**, **Round patch**, **Wear spot** — then a click on a part's surface in
  the preview projects it (the Stage-3b place-on-face raycast seam, reused; the dev-gated automation
  seam is `window.__glbDesignerPlaceDecal`). Spec: `decals: {id, partId, position, normal, size,
  kind, color?, rotation?}[]` on `AssetEditSpec` (envelope **v6→v7** additive migration + strict
  validation). Each decal's `position`/`normal` live in the TARGET PART'S LOCAL frame (the raycast
  hit via `worldToLocal` + the geometry-local face normal), so it's built with `DecalGeometry`
  against the part geometry at identity and rendered as a CHILD of the part mesh — it follows a
  grouped/moved part automatically, and `removePart` prunes a deleted part's decals (`pruneDecals`).
  Zero z-fighting: each decal vertex is physically offset a hair (0.7 mm) along its normal (survives
  the GLB round-trip, which drops `polygonOffset`) + `depthWrite:false`. Patterns are small
  procedural **canvas** textures (button/stitch/seam/patch/wear), headless-guarded (flat-tint
  fallback when no 2D canvas). Decals are REAL geometry → they EXPORT into the GLB and reimport
  intact (verified, `decalExport.test.ts` — GLTFExporter → app GLTFLoader round-trip: the decal
  overlay mesh survives with position + uv).
- ✅ **Piping/seam preset** (`glbEdit/piping.ts`, pure + unit-tested): one-tap **Add piping** on a
  selected box/extrude traces its top-face perimeter as a rounded-rect path (`roundedRectPathPoints`,
  pure math) rendered as a thin round **`sweep`** welt (Stage-1 sweep reused — a new explicit
  `sweepPoints` override on the sweep part feeds `sweepGeometry`), grouped with the host (joins its
  existing group or mints a "Piping" group over the pair), finish defaulting to the host colour
  darkened. Params: tube diameter + edge inset (`DetailsPanel` sliders). Covers sofa/cushion piping
  with no manual path work.
- ✅ **Cushion realism ruling — SHIPPED option (b)** (`glbEdit/plump.ts`, pure + unit-tested): a
  `plump` 0…1 param on box/capsule kinds applies a sine-falloff vertex bulge — the top/bottom crown,
  the sides bow, the corners stay pinned (the seam line), normals recomputed; a plumped box builds on
  a tessellated `RoundedBoxGeometry` so there are interior vertices to displace. Verified to read
  convincingly as a stuffed cushion (Stage-5 scenario `02-cushion-plump`), so option (b) shipped over
  (a) offline-baked cloth-sim GLB variants (needs asset production — out of scope for pure code) and
  (c) skip. Ruling recorded in `PHOTOREALISM.md`. Inspector: a **Plump (cushion)** slider on
  box/capsule parts.
- ✅ Scenario `scripts/scenarios/glb-designer-stage5.json` (plump → Add piping → 3 button decals →
  save/restore round-trip asserts the envelope embeds plump + Piping welt + 3 decals + export
  sanity). All pure ops unit-tested (`decals.test.ts` / `piping.test.ts` / `plump.test.ts`).

---

**Status:** Stage 0 **shipped** (v0.21.2.28); Stage 1 **fully shipped** — Stage 1a
(v0.21.2.29) + Stage 1b / CSG v2 (v0.21.2.30, 2026-07-16); Stage 2 / materials **shipped**
(v0.21.2.32, 2026-07-16); Stage 3a / spec-envelope unification + transform groups **shipped**
(v0.21.2.33, 2026-07-16); Stage 3b / fittings-component library + snap-to-surface placement
**shipped** (v0.21.2.34, 2026-07-16); Stage 3c / template-first flows **shipped**
(v0.21.2.35, 2026-07-16 — parametric→designer bridge ruled: flatten at insertion, dialog
parametric); Stage 3d / sets & modular customization **shipped** (v0.21.2.36, 2026-07-16 —
designer→configurable-product export via baked-GLB `data:`-URL options + user-products registry +
"save groups as separate assets" sets). **Stage 3 fully shipped.** Stage 4 (precision & pro UX)
**fully shipped** — Stage 4a (designer context refactor, v0.21.2.38) + Stage 4b (precision & pro
UX, v0.21.2.39, 2026-07-16: align/distribute, grid-snap toggle+step, live dimension readout,
arbitrary-axis mirror, linear/radial array, ortho view presets + Home, part search/rename).
Stage 5 (realism detail layer) **fully shipped** (v0.21.2.40, 2026-07-16: decal/detail layer via
`DecalGeometry` — buttons/stitches/seams/patches/wear projected on part faces, exported into the
GLB; one-tap piping welt tracing a box/extrude top-face perimeter; cushion "plump" vertex-bulge —
ruling (b) shipped). **The Asset Studio program is COMPLETE — all stages (0–5) shipped.** Each
stage landed as its own commit train with an end-of-stage adversarial review; this file tracks
stage state.
