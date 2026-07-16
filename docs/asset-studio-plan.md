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

### Future: context slicing if the designer grows

The designer's React state today is a single flat context (`ui/glbEditor/designerContext.tsx` —
one `DesignerProvider` owning the whole `AssetEditSpec` + selection + tool state). That is the
**right call at the current size**: the spec is small, edits are coarse-grained (one undo step per
op), and every panel legitimately reads most of it, so a flat context is simplest and fast enough.
Recorded here only as the **scaling boundary** to watch: if the designer later grows many more
independent panels or the spec balloons (large baked meshes, hundreds of parts) such that a single
context value re-renders unrelated panels on every keystroke, split the context into narrower
slices (e.g. selection/tool state vs. the spec, or a Zustand-style store with selector
subscriptions) so a change touches only the panels that read it. No action needed today — this is a
"revisit when the profiler shows it" note, not a debt.

---

## Iteration 2 (user goal 2026-07-16: "keep iterating — geometry, materials, components
## and templates, modular customization, precision, realism, and performance")

### Stage 6a — Content expansion: chair template + structural components — ✅ SHIPPED (v0.21.2.42)
- ✅ **Dining chair template** (the conspicuous archetype gap): seat board + 4 square legs (reuses
  the `leg-straight-square` component) + 4 apron rails + two rear posts reclined ~8° + a lumbar
  back board; ergonomic clamps (seat h 0.42–0.48/0.45, seat w 0.40–0.50/0.44, seat d 0.38–0.45/0.42,
  back-top h 0.80–1.00/0.90).
- ✅ Templates: **Wardrobe** (plinth + tall carcass + 2–3 bar-pull doors + interior steel rail),
  **Desk** (top + 2–3-drawer pedestal one side + 2 legs the other), **TV console** (low open carcass
  + one shelf + short tapered legs). Now **10** archetype starters.
- ✅ Components: a new **Structure** category — **Apron rail** (floor), **Stretcher** (wall, round
  rod), **Slat set** (floor, N slats across a span via one `count` param), **Drawer box** (floor,
  open 5-panel carcass — geometry only, opens nothing), **Shelf pins** (wall, spaced support pair).
  Now **17** fittings across 5 categories. Each 1–3 clamped params + metal/wood finish defaults.
- ✅ Pure builders in `furniture/glbEdit/{templates,components}.ts` (unit-tested), rendered by the
  existing `TemplatesPanel`/`ComponentsPanel` generically (no UI wiring change) — a template/placed
  component is still just parts + a `PartGroup`, already covered by the v4+ envelope (no persistence
  bump). Scenario `scripts/scenarios/glb-designer-stage6a.json`.

### Stage 6b — Geometry ops II — ✅ SHIPPED (v0.21.2.43)
- ✅ **Shell/hollow** (`parts[].shell`, wall thickness m) on box/extrude → open hollow carcass in one
  click. **Implementation ruling: PURE CONSTRUCTION over CSG** — the box shell is 4 walls + a bottom
  slab (5 merged `BoxGeometry` panels): exact, correct per-face normals/UVs, zero CSG cost and no
  worker round-trip; the extrude shell uses `ExtrudeGeometry`'s native hole (outer outline minus an
  inset inner outline via a `Shape` hole) + a bottom cap. The inner outline is a pure miter
  **polygon-offset** (`insetPolygon`, unit-tested) that clamps runaway reflex miters and returns
  `null` on collapse/self-intersection → a too-concave-for-the-thickness outline falls back to a SOLID
  extrude (honest documented limit, never a crash). `shell: 0`/absent = solid (byte-identical). Open
  face: box **+Y** (top); extrude opens along its extrude axis (face-choice follow-up out of scope).
  Inspector: "Hollow (wall)" `SliderField` (hides plump on a hollow box).
- ✅ **Loft** — new `loft` shape kind: bottom + top cross-section outlines (resampled to a common
  count via `resampleProfile`) + height → side-wall quads + centroid-fan caps, built NON-INDEXED so
  cap edges stay crisp and no twisted/inverted faces. Correct outward normals (winding unit-tested),
  planar cap UVs, bbox tracks size; size scales both profiles (no round-forcing). Presets:
  round→square, square→round, taper (square/round). UI: the `ProfileEditor` twice (Bottom/Top) + a
  transition preset seeding both.
- ✅ **Free sweep path** — the `sweep` kind gains `sweepPath: 'custom'` + a `sweepPathPoints`
  (normalized XZ) path drawn in the 2D `ProfileEditor`, swept OPEN with the existing cross-section
  presets. Distinct from Stage-5 piping's closed absolute `sweepPoints` (precedence piping > custom >
  preset). Path presets: S-curve / wave / arc / L-bend.
- ✅ **Plumbing**: `editSpec` types + `loft` across `SHAPE_KINDS`/`SHAPE_LABEL`/`DEFAULT_SIZE`/
  `defaultPart` + duplicate/mirror deep-copy; `specPersist` envelope **v7→v8** additive identity
  migration + strict validation for `shell`/`loftBottom`/`loftTop`/`sweepPathPoints`. Scenario
  `scripts/scenarios/glb-designer-stage6b.json`.

### Stage 6c — Materials II — ✅ SHIPPED (v0.21.2.44)
- ✅ **Per-face finishes on boxes** (`parts[].faceFinishes`, THREE zones not six faces:
  `{ top?, bottom?, sides? }`, each an optional `{ color?, finish? }` over the part's base look) —
  tabletop veneer vs **edge banding**, the board-construction cue from the Polyboard/SWOOD research.
  Build: `BoxGeometry`'s six face groups are remapped to three materials (`remapBoxFaceGroups` +
  `boxFaceMaterials` in `buildObject.ts`; sides share one). **Sharp boxes only** — a bevelled box is
  a `RoundedBoxGeometry` with no face groups and a hollow/plumped box is not a flat board, so
  `boxFaceFinishesActive` gates on `bevel`/`shell`/`plump` all 0; the inspector hides the section
  (with a hint) otherwise. **Combine limit:** inside a CSG combine an operand keeps its BASE look
  only (the fold assigns one material per operand — `csgEval` not forked). Multi-material boxes
  export as distinct glTF primitives (round-trip test asserts ≥2 distinct materials).
- ✅ **Texture scale + grain direction** per part (`parts[].finishScale` 0.25–4×, default 1 =
  coarser-when-larger, mirroring `compose:@<scale>`; `parts[].finishRotation` 0/90° — grain Along X /
  Along Z) on any part carrying a `mat:<id>` finish. The finish-material clone swaps each texture
  channel for a cloned + transformed variant from a bounded LRU
  (`materials/finishTextureVariant.ts`, keyed `(source uuid, scale, rotation)`, max 96,
  dispose-on-evict — the shared cache textures are never mutated; a slider drag reuses a handful of
  variants, no per-frame leak). A grain rotation also rotates `anisotropyRotation` where the finish
  set one (brushed metal). Inspector: a "Texture" disclosure (Scale slider + Grain segmented) shown
  only when a texture finish is set.
- ✅ **Plumbing**: envelope **v8 → v9** additive identity migration + strict validation for
  `faceFinishes`/`finishScale`/`finishRotation`; duplicate/mirror deep-copy the fields (grain copied
  verbatim — a reflection preserves the grain axis, so no X↔Z flip needed). Pure ops + cache bound +
  export round-trip unit-tested; scenario `scripts/scenarios/glb-designer-stage6c.json`.

### Stage 6d — Precision II — ✅ SHIPPED (v0.21.2.45)
- ✅ **Face-to-face magnetic snapping** (`glbEdit/faceSnap.ts`, pure + unit-tested): while
  translating a part/group with the gizmo, on drag-END the committed position snaps FLUSH to a
  nearby part's AABB face on any axis within an ~8 mm world threshold. Two flavours per axis —
  **abut** (outer face meets outer face, zero gap — the higher priority) and **align** (same-side
  faces become coplanar). A candidate only fires when the two boxes OVERLAP on the other two axes
  (locality gate), and each axis decides independently (axis isolation). Rides the **existing magnet
  toggle** (grid snap + face snap share it) and **wins over the grid quantisation** it just applied.
  **Live-vs-commit ruling: COMMIT-TIME snap** — the drei `TransformControls` mutates the preview
  mesh directly and the write-back already runs once on `onMouseUp` (`commitGizmoDrag`/
  `commitGroupGizmoDrag`), so snapping the committed value is the clean seam; a live during-drag snap
  would need a per-frame `objectChange` interception that fights the gizmo's own mutation, deferred
  as not worth the risk. **Hint shipped:** a brief (~0.9 s) accent-edge quad (`SnapHintOverlay`)
  flashed on each snapped face plane — green for abut, blue for align — spanning the snapped
  selection's AABB, auto-clearing. Applies to an ungrouped part (world = local) and a whole transform
  group (union bounds vs the parts outside it); a grouped MEMBER individually gizmo'd keeps plain grid
  snap only (documented — its mesh position is group-local).
- ✅ **Pivot control** (`glbEdit/pivot.ts`, pure + unit-tested): a **Centre / Base / Corner**
  segmented in the viewport (top-left, under the gizmo-mode switch) changes the reference point for
  **numeric rotation** (part + group inspector fields) and **gizmo rotate/scale** of a part (and
  group). Implemented as position compensation on write-back — rotating about base keeps the bottom
  face in place (`C' = C + R_old·o − R_new·o`), scaling from base grows upward (bottom stays), corner
  keeps the −X −Y −Z corner fixed. **Default Centre = today's behaviour byte-identical** (the compensation
  is skipped entirely). Ephemeral (not saved). For a group, `centre` maps to the group origin (today);
  `base`/`corner` use the members' local union bounds.
- ✅ Scenario `scripts/scenarios/glb-designer-stage6d.json` (two boxes → flush abut with gap 0; base
  pivot + rotate keeps minY; scale from base keeps the floor). No persistence change (both features are
  ephemeral UI state, no spec/envelope field).

### Stage 6e — Realism II — ✅ SHIPPED (v0.21.2.46)
- ✅ **Procedural fabric wrinkle normals** on plumped cushions
  (`furniture/glbEdit/wrinkleTexture.ts`, pure height field + bounded texture cache, no
  bespoke art). A plumped box/capsule gains a seeded procedural normal map — soft
  low-frequency creases that **gather toward the pinned seam corners** (a `cornerness` mask
  that peaks at the tile corners / zero at the crowned centre — where a stuffed cushion
  actually creases) plus a **fine fabric nap** over the whole face (value-noise fbm, seeded
  deterministically from the part id so the wrinkles are stable across renders + save/reload).
  A **"Wrinkles (fabric)"** slider sits next to Plump in the inspector, **default ON at a
  subtle level** (`DEFAULT_WRINKLES = 0.6`, the realism default) whenever `plump > 0`; an
  explicit `0` disables it. Visible intensity is the material's `normalScale`, ≈ `0.15…0.4`
  following the plump depth × the Wrinkles setting (`wrinkleNormalScale`). The map is a
  `DataTexture` (baked straight from the RGBA buffer — no 2D canvas needed to generate it, so
  the spec→material wiring is fully headless-testable), linear + repeat-wrapped + anisotropic;
  `GLTFExporter` embeds it as a PNG on export — the `normalTexture` + `scale` survive the
  round-trip (verified by reading the exported GLB's JSON chunk directly, since happy-dom has
  no 2D canvas to encode/decode a real PNG — the same limitation the decal export test notes).
- ✅ **Cache discipline**: baked maps go through a bounded dispose-on-evict `LruCache`
  (max 48) keyed by a coarse `(seed, intensity-bucket)` — intensity bucketed to 0.1 steps —
  mirroring `finishTextureVariant.ts` (AUD-002), so a Plump/Wrinkles slider **drag reuses a
  handful of tiles instead of minting a GPU texture per frame** (unit-tested).
- ✅ **Interplay**: wrinkles compose with the velvet/sheen finish presets (velvet + plump +
  wrinkles = the sofa-cushion look). When a textured `mat:<id>` finish is applied the finish's
  clone owns the normal channel, so wrinkles are **skipped** (`part.finish` present → skip,
  never clobbering the finish map) and the inspector shows a one-line hint in place of the
  slider — documented, no shader fight.
- ⏭️ **AO extra (seam-line corner-pinch darkening) — NOT shipped, deliberately.** The plan's
  optional extra was to bake subtle AO into `COLOR_0` vertex colours at the pinned corners of
  `plumpBoxGeometry`. Skipped: a plumped part can already carry a two-tone **gradient** baked
  into the SAME `COLOR_0` channel (Stage 2), so corner AO would fight the gradient's vertex
  colours; the wrinkle normal + its `normalScale` already give the cushion its fabric read at
  the corners without a channel conflict. Left as a future item if a gradient-free variant proves
  worthwhile.
- ✅ **Wood grain direction** — **already shipped in Stage 6c** (`parts[].finishRotation`
  0/90°, grain Along X / Along Z, via `finishTextureVariant.ts`). No further work here; the
  "grain continuity hint across parts" idea is not pursued (per-part grain control is the
  shipped scope).
- ✅ **Plumbing**: `parts[].wrinkles?` (0…1) on box/capsule; envelope **v9 → v10** additive
  identity migration + strict validation (non-finite rejected); duplicate/mirror carry it
  verbatim (a symmetric scalar). No new feature flag — like plump/faceFinishes it rides the
  existing `glbDesigner` gate. Scenario `scripts/scenarios/glb-designer-stage6e.json`.

### Stage 6f — Performance — ✅ SHIPPED (v0.21.2.47)
- ✅ **Save-time GLB optimization** (`glbEdit/saveOptimize.ts`) — `exportAndSaveAsset` routes the raw
  GLTFExporter output through the shared optimize pipeline (`optimize/runOptimize` → weld/dedup/prune +
  Draco geometry pack + near-lossless WebP texture re-encode, off the main thread) before persist, with
  a **keep-smaller guard** (adopt the optimized bytes only when strictly smaller — procedural geometry
  is tiny where Draco's per-primitive overhead can otherwise grow it). **Measured**: an untextured
  4-leg table 20552 B → 2248 B (**89.1% smaller**); textured assets (mat:<id> finishes / decal /
  wrinkle maps) save more from the WebP re-encode (browser path — the scenario measures it).
- ✅ **Feature-safety proven first** (`saveOptimize.test.ts`, the round-trip gate written BEFORE
  wiring): the pass preserves **all four** at-risk features — KHR physical extensions
  (sheen/clearcoat/transmission/ior/volume/anisotropy), multi-material primitives (6c per-face boxes),
  vertex-colour gradients (Stage 2 COLOR_0), embedded normal maps (6e wrinkles / decals). **Enabler +
  latent-bug fix**: `optimizeGlb.ts` now `registerExtensions(ALL_EXTENSIONS)` on its WebIO —
  gltf-transform DROPS any unregistered extension on read, so before this the pass silently stripped
  those KHR extensions (also affected the upload/convert optimize path — fixed). No per-spec gate was
  needed (nothing is stripped), so optimize runs for every save.
- ✅ **Instanced array preview** (`glbEdit/groupInstance.ts` pure `groupInstanceable` detector +
  `ui/glbEditor/PartsPreview.tsx` `InstancedParts`): a transform group of ≥4 geometry- AND
  material-identical members (what `linearArray`/`radialArray` produce) renders as ONE `InstancedMesh` —
  **N draw calls → 1** (a 20-leg array: 20 group draw calls → 1). **Selection rule (documented,
  simplest honest):** clicking any instance selects the whole GROUP (members are identical); selecting
  an individual member falls back to non-instanced rendering so the per-member gizmo attaches to a real
  mesh. The group gizmo works in both modes (the InstancedMesh lives in the group's transform
  container). Excluded from instancing: combined `mesh` parts, per-face (multi-material) boxes, parts
  carrying decals (per-part child overlays). Preview-only — the exported GLB is unchanged.
- ⏭️ **Context slicing — RULED OUT with numbers** (`designerContext.perf.test.tsx`): a React `Profiler`
  probe measured a name keystroke at 30 parts — the cascade fires (12 consumer re-renders over 12
  keystrokes) but per-keystroke cost is **~0 ms** (a `setName` never touches `spec.parts`, so `PartMesh`
  geometry memoised on part identity rebuilds nothing — pure reconciliation). Well under the plan's
  5 ms/keystroke threshold → **no split shipped**, matching the "revisit when the profiler shows it"
  note above. The probe stays as a regression guard.
- ✅ Scenario `scripts/scenarios/glb-designer-stage6f.json` (20-leg array → assert
  `renderer.info.render.calls` drops vs the non-instanced control; save a textured asset → assert the
  persisted blob is smaller than the raw export while the reloaded def still renders).

Each stage: same program rules (flags, pure+tested logic, worker rule, visual verification,
docs, per-commit versioning) + stage-end adversarial review.

### Iteration 2 — review-fix cluster — ✅ COMPLETE-WITH-REVIEW (v0.21.2.48)
Adversarial review of the Stage-6 iteration-2 work, findings fixed in one cluster:
- ✅ **Loft winding twist** — `loftGeometry` now aligns the top profile's start index to the bottom
  via a best-offset search (`alignTopToBottom`, minimises total vertex-pair XZ distance over the N
  cyclic rotations), so a CW-authored top lofts to the SAME untwisted body as a CCW top (test:
  vertical side-wall edges, zero horizontal pairing offset).
- ✅ **Dead bevel slider on hollow extrudes** — `PartInspector` hides the Corner-radius slider when
  an extrude has `shell > 0` (the shell disables the bevel), with a "Hollow disables the corner
  bevel" hint (plump/wrinkles-gate idiom).
- ✅ **insetPolygon duplication** — the designer's inset is RENAMED `insetOutline` and moved to a new
  `glbEdit/polygonOffset.ts`, with cross-reference comments in both it and `floorplan/insetRoom.ts`.
  Kept separate (not merged): their required behaviours genuinely differ — the designer clamps a
  runaway reflex miter to a bevel (so a mildly-concave outline still hollows) + is inset-only, while
  the floorplan one is signed (inset/outset) + returns null on any over-run.
- ✅ **Carcass triplication** — `templates.ts` extracts `buildCarcass` / `buildDoorRow` / `buildPlinth`
  shared by the cabinet/wardrobe/TV-console builders (behaviour-preserving; template tests unchanged).
  The desk drawer pedestal stays bespoke (a vertical stack, not a horizontal door row — `buildDoorRow`
  doesn't fit).
- ✅ **shapeProfiles.ts split** (911→~465 lines) into `shapeProfiles.ts` (profile utils + presets +
  box/wedge/lathe/extrude builders), `polygonOffset.ts` (`insetOutline` + friends) and `shellLoft.ts`
  (shell/loft/sweep builders); test files split to match.
- ✅ **pivot/groupTransform helper duplication** — shared `clean` / `cleanVec` / `DEG` /
  `rotationMatrix` / `trsMatrix` extracted into `glbEdit/transformMath.ts`.
- ✅ **Wrinkle cache budget** — the wrinkle normal map is halved to **128px** (64 KB/tile, LRU ≤ 48 →
  ~3 MB ceiling vs ~12 MB at 256px) with **mipmaps disabled** — verified against the stage6e scenario
  that it still reads as sewn fabric; byte budget documented in the header.
- ✅ **insetPolygon bowtie gap** — `insetOutline` now runs an O(n²) segment-segment self-intersection
  check (`polygonSelfIntersects`) on the result and returns null (→ solid fallback) on a same-
  orientation bowtie the area/edge-reversal guards miss.

---

## Iteration 3 (continuing the standing enhancement goal, 2026-07-16)

### Stage 7a — Robustness: optimize-on-save guard (AS-OPT-GUARD) — ✅ SHIPPED (v0.21.2.49)
Bounded timeout + fail-soft around `saveOptimize` (a wasm/network failure must never hang a
save — raw GLB fallback); fix the hardcoded scenario ports (stage5/stage6b).
- ✅ **Fail-soft `optimizeSavedGlb`** wraps `runOptimize` in a `Promise.race` against a documented
  20 s ceiling (`OPTIMIZE_SAVE_TIMEOUT_MS`); on timeout OR rejection it `console.warn`s and persists
  the **raw** GLB (`optimized: false`), restoring the shrink-or-no-op contract even when the
  Draco/Basis WASM stack hangs. A unique symbol sentinel separates the timeout arm from a slow-but-
  real result; `try/finally` always clears the timer.
- ✅ **Worker-leak documented, not fought**: `runOptimize` has no cancel API, so a timed-out job is
  abandoned; its pool worker returns idle + reused (or torn down by the existing 30 s idle-teardown).
  Bounded by `POOL_MAX`, self-healing — no cancellation infra built.
- ✅ **Unit tests** `saveOptimize.guard.test.ts` (timeout → raw within test timeout via fake timers;
  rejection → raw; success adopted; not-smaller → raw). Existing feature-survival matrix unchanged.
- ✅ **Scenarios**: stripped dead hardcoded `url` ports (:5301/:5310/:5312) from every
  `glb-designer-stage*.json` (resolve `SHOT_URL`/default 5173 instead); fixed `glb-designer-stage6b`'s
  stale `env.v === 8` save assert → `env.v >= 8` (the envelope bumped to v10; the save-step "hang"
  was the assert never passing, not the WASM warning — the asset saves in ~2 s). Re-ran stage6b green
  through the save step (GPU, isolated worktree at HEAD).

### Stage 7b — Precision III: live during-drag face snapping — ✅ SHIPPED (v0.21.2.50)
The 6d deferral: intercept TransformControls' `objectChange` to preview the snap DURING the
drag (the shape jumps flush + the hint shows live), not only at commit. Keep commit-time snap as
the source of truth.
- ✅ **Pure `dragSnapSession.ts`** (start → per-frame `updateDragSnap` → discard) over the existing
  `snapFaces` engine, with **memoised targets** (captured once at drag start — they can't move
  mid-drag, so the per-frame pass stays a cheap `O(n)` AABB scan) and **per-axis hysteresis**: an
  axis engages within the tight 8 mm threshold and holds flush until pulled past a wider **1.5×
  release band** (`DRAG_SNAP_RELEASE_FACTOR`, ≈12 mm), so it doesn't flicker at the boundary. Fully
  unit-tested (`dragSnapSession.test.ts` — engage, hold, release-then-re-engage, axis independence,
  targets-stay-fixed, custom threshold).
- ✅ **Live wiring** in `designerContext.tsx` + `DesignerViewport.tsx`: `TransformControls`'
  `onMouseDown` opens the session (translate mode, magnet on, Alt not held), `onObjectChange`
  (rAF-gated — one snap computation per frame, the 6e ProfileEditor precedent) snaps the dragged
  mesh IN PLACE and shows the hint live, `onMouseUp` commits through the **unchanged Stage-6d
  authority path** (committed value equals what the user saw). Works for a **single part and a whole
  group** (the group-proxy union bounds). The live hint state updates only when the engaged-snap
  signature changes, so a per-frame drag doesn't re-render the flat context each frame.
- ✅ **Alt escape hatch** (CAD convention) disables the magnet live for that drag (skips both the
  live and the commit-time snap); documented in `docs/user/importing-models.md`.
- ✅ **Scenario** `scripts/scenarios/glb-designer-stage7b.json` drives the live seam
  (`window.__glbDesignerPrecision.liveDrag`) through a far → engage → hysteresis-hold sequence and
  asserts the mid-drag position is **flush BEFORE any commit** (the spec still shows the un-moved
  origin), screenshots the live hint during the open drag, then commits and asserts the committed
  position matches. Behind the existing `glbDesigner` pro flag; no persistence/envelope change.

### Stage 7c — Realism III: tufting generator + more archetypes — ✅ SHIPPED (v0.21.2.51)
- ✅ **One-tap tufting** (`glbEdit/tufting.ts`, pure + unit-tested): a `TuftGrid {rows, cols, depth}`
  (1–6 × 1–6, depth 0…1) on a plumped **box** does two coordinated things — (a) `plumpVertexDelta`
  subtracts smooth **gaussian dimples** from the plump crown at each button point (weighted by the
  SAME `ry²·cos·cos` falloff as the crown, so the four seam **corners stay pinned** and the dimple is
  **top-face only**), and (b) `setTuftGrid` regenerates a matching grid of **button decals** (the
  Stage-5 decal system reused) sitting IN the dimples (local Y from `plumpTopSurfaceY`, so a button
  reads as centred in its dimple). Tuft decals are **tagged** (`Decal.tuft`) so editing rows/cols/depth
  REPLACES only the tuft buttons and never touches user-placed decals. **Rectangular grid only** — the
  diamond/Chesterfield look is OUT of scope (documented). The plump crown/bow/dimple scalar math moved
  into `tufting.ts` (pure, three-free); `plump.ts` delegates to it (byte-identical without a tuft
  grid). Inspector: a "Tufting (buttons)" toggle + Rows/Columns/Dimple-depth sliders next to Plump
  (`PartInspector.tsx`), shown only for a plumped box.
- ✅ **Archetype templates** (`glbEdit/templates.ts`, now **14** starters): **Bench** (upholstered top
  plumped + tufted default ON — the showcase — on square legs + rails), **Bar stool** (round lathe seat
  + tall tapered legs + a swept foot ring, seat 0.65–0.78 m), **Floating shelf** (wall-mounted board +
  concealed cleats; a `placement: 'wall'` hint the Save panel applies), **Bathroom vanity** (reuses the
  6a-refactored `buildCarcass`/`buildDoorRow`/`buildPlinth` + ships WITH a built-in **subtract
  combine** — countertop minus a basin-hole cylinder). Ergonomic clamps: bench seat ~0.45, stool
  0.65–0.78, vanity 0.85. `TemplateResult` gained optional `decals` + `combineGroups`; `insertTemplate`
  attaches both (part ids minted in `build()`, so the combine members share the wrapping group's home —
  the vanity is the first template shipping WITH a built-in combine group, round-trip verified).
- ✅ **Persistence**: envelope **v10 → v11** (`specPersist.ts`) — additive identity migration + strict
  validation for `parts[].tuft` + `decals[].tuft`. Older v10 specs load unchanged.
- ✅ **Tests**: `tufting.test.ts` (grid math/positions/inset, dimple-below-crown + monotonic depth +
  corner pinning + top-only, decal tagging, `setTuftGrid` regeneration/replacement + user-decal safety
  + deep-copy on duplicate) + `templates.test.ts` (each archetype buildable + bbox; the vanity's
  built-in combine round-trips through insert AND evaluates to a mesh). Scenario
  `scripts/scenarios/glb-designer-stage7c.json` (SHOT_GPU=1): bench tufted (dimples + centred buttons),
  bar stool + vanity alongside (basin cavity carved by the combine preview), bump tufting rows (button
  grid regenerates + old tuft decals replaced), save → v11 envelope embeds `parts[].tuft` + tuft decals.

### Stage 7d — Modular II: slot constraints authoring — ✅ SHIPPED (v0.21.2.52)
Make-configurable gains per-option requires/excludes authoring (the configurator's `clampConfig`
already enforces constraints — this exposes AUTHORING), so exported product families encode real
compatibility rules.
- ✅ **Constraint authoring reuses the configurator's exact model** — no parallel system. Each
  exposed option (a `PartGroup` assigned a slot) carries `rules: { kind: 'requires' | 'excludes';
  target: <group id> }[]` on its `GroupAssignment`; `designerExport.ts:mapRulesToConstraints` maps
  them into the existing `model.ts` `SlotConstraint` vocabulary (`requires`/`excludes`) at plan
  time (an option id IS its group id, a slot id IS its slot key, so the mapping is exact), carried
  onto the exported `ConfigurableProduct.constraints`. Only **cross-slot** targets are emitted
  (a same-slot or non-exposed/base target is dropped — a slot holds one option). `ConfiguratorDialog`'s
  existing `clampConfig` enforcement then makes invalid combos auto-resolve (verified end-to-end:
  picking Glass top auto-flips Legs → Steel).
- ✅ **UI** (`MakeConfigurablePanel.tsx`): a compact per-option **Rules** `Disclosure` — a
  kind Select (requires/excludes) + a cross-slot target Select (labelled "<slot> · <option>") per
  rule, with add/remove; only options in OTHER slots are offered as targets. `Disclosure` gained an
  optional `style` prop for the nested indent.
- ✅ **Validation** (`configurator/constraints.ts`, pure + unit-tested): `validateProductConstraints`
  returns human-readable problems — **contradiction** (an option both requires AND excludes the same
  target), **unsatisfiable / circular requires** (following the requires closure forces one slot to
  two options at once, or forces a forbidden excludes pair), and **dangling** references. Export
  validates a cheap product SHELL BEFORE the GLB bake and **blocks with a toast** naming the first
  problem. `pruneProductConstraints` drops constraints referencing a removed slot/option (+ a
  per-removal warning) so a stale rule self-heals.
- ✅ **Persistence**: constraints live in the exported product (`userProductsSlice` path unchanged);
  re-export via the stable `spec.exportedProductId` preserves/updates rules; **re-edit seeding** —
  `restoreSpec` reconstructs the panel's assignments (slot / label / price / **rules**) from the
  matching user product via `reconstructAssignments`, pruning any rule whose target group was deleted.
- ✅ **Tests**: constraint mapping designer→product + `reconstructAssignments` round-trip
  (`designerExport.test.ts`); `validateProductConstraints`/`pruneProductConstraints` cases — ok,
  contradiction, circular, dangling (`constraints.test.ts`); `clampConfig` integration (a requires
  rule flips the dependent slot). Scenario `scripts/scenarios/glb-designer-stage7d.json`. No new
  feature flag (rides the existing `assetConfigurableExport` pro gate); no persistence/envelope bump
  (a product already persists its `constraints`).
