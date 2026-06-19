# Slot-based product configurator — design

**Status:** design / implementer-ready. No code shipped.
**Author:** research worktree (`agent-a5d630f134f745a61`), branch
`claude/interior-design-improvement-niqt2i`.
**Milestone:** TODO "slot-based product configurator (mattress-on-frame, modular sofa)".

A *configurable product* is a **base** plus a set of named **slots**, each slot carrying an
**anchor** (a transform in the base's local frame) and a set of compatible **options** (each
option contributes its own geometry, footprint, and price). The user opens a dialog, picks an
option per slot, sees a live 3D preview + running price, and saves the assembled piece into
the catalog as a regular user item. This is the Coohom / IKEA-Kreativ "configure this product"
pattern (see `REFERENCES.md`).

The design **reuses three existing mechanisms** so it adds no parallel infrastructure:

1. the **parametric generator pipeline** (`src/furniture/parametric/`) — pure
   spec → part model → three.js object → `exportGlb` → `persistUserGlb` — is the closest
   existing "configurable product" and is copied almost wholesale;
2. the **finish-target mechanism** (`src/furniture/gltf/finishTargets.ts`) — named mesh/material
   groups a user can re-skin — is how a GLB-sourced option sub-asset exposes its finishable
   surfaces inside the assembled product;
3. the **GLB-designer persistence channel** (`exportGlb` → `persistUserGlb`, used by
   `saveParametric.ts`) — the assembled product saves as one baked user GLB. **No new
   persistence path is invented**, per the repo rule in `src/furniture/CLAUDE.md`.

---

## 1. What the cited code gives us (study notes)

### 1.1 The parametric pipeline (the template to copy)

`src/furniture/parametric/spec.ts`
- `ParametricSpec` = a typed, flat, serializable description of one product. `clampSpec(raw)`
  is the **single defence** that turns arbitrary (user-mangled) input into a buildable spec;
  it never throws. `defaultSpec(type)`, `specLabel(spec)`, per-type `PARAMETRIC_LIMITS` /
  `DEFAULT_SPECS`. **The configurator gets an analogous `ConfiguredSpec` + `clampConfig`.**

`src/furniture/parametric/buildParts.ts`
- `buildParametric(spec): ParametricModel` — pure, render-agnostic, returns
  `{ parts: ParametricPart[]; bounds; bays; doorCount; ... }`. Each `ParametricPart` is a box
  with a `role` + a footprint-centred `position` + a `size`, **floor-anchored at y=0, front
  toward +Z** (the app convention). **The configurator's composer produces the same
  `parts[]` + `bounds` shape**, so it can feed the identical object-builder.

`src/furniture/parametric/buildObject.ts`
- `buildParametricObject(spec)` → `{ object: Group, model }`: maps each part → a `BoxGeometry`
  mesh with a real three `Material` from `furnitureMaterials.ts` (`partMaterial(role, spec)`).
  `mesh.name = part.role`. Shared by **both** the live preview and the save/export path so the
  preview can never drift from the saved GLB. `disposeParametricObject` frees geometry.

`src/furniture/parametric/price.ts`
- `estimatePrice(model)` — sums board area × rate + per-fitting adders, rounds to $5. Pure.
  **The configurator sums per-option prices instead (options carry explicit prices).**

`src/furniture/parametric/saveParametric.ts`
- `saveParametricAsset(spec, name)`:
  `clampSpec` → `buildParametricObject` → `exportGlb(object)` (GLTFExporter) →
  wrap bytes in a `File` → `persistUserGlb(file, { name, category, footprint: model.bounds,
  price: estimatePrice(model) })`. Each save makes a **new** user def; identical bytes de-dupe
  by SHA-256 hash inside `persistUserGlb`. **This is the persistence channel we reuse verbatim.**

`src/ui/parametric/ParametricDialog.tsx` + `ParametricControls.tsx` + `ParametricPreview.tsx`
- Custom `.modal-overlay` (not the `Modal` primitive) → calls `useModalGuard(open)` itself; own
  Esc listener. Type tabs → controls + price column on the right, a live `<Canvas>` preview
  (`ParametricPreview` reuses `buildParametricObject`) on the left; stacked on mobile
  (`useIsMobile`). "Add to room" arms click-to-place via `setActiveDefId(res.def.id)`; "Save to
  catalog" just persists. Price column gated behind `useFeature('budget')`. Feature-flagged via
  `useFeature('parametricFurniture')`. **The configurator dialog is a near-clone of this.**

### 1.2 The finish-target mechanism (`src/furniture/gltf/finishTargets.ts`)

- A `FinishTarget = { key; label }` is a named group of meshes sharing a material — the unit a
  user re-skins. `listFinishTargets(root)` walks a GLB and keys by **material name** (fallback:
  mesh name). `meshMatchesTarget(mesh, key)` tests membership.
- `UserGltfDef.finishTargets` + `finishOverrides: Record<key, value>` persist via IDB meta
  (JSON-encoded in `persist.ts`, decoded in `hydrateAssets.ts`) and the save schema
  (`schema.ts` line 66–67). `GltfModel`/`gltfRender.ts` apply overrides at render.
- **Reuse #1 (per-product re-skin):** the assembled GLB exposes its base + option meshes as
  finish targets so a placed configured product is still re-skinnable like any user GLB —
  *for free*, because we route through `persistUserGlb` with `finishTargets` populated.
- **Reuse #2 (GLB-sourced options):** an option whose geometry is a GLB sub-asset (not
  procedural boxes) is positioned at its slot anchor and its finishable surfaces are discovered
  with `listFinishTargets`, namespaced per slot (`<slotId>:<key>`) so two options don't collide.

### 1.3 Catalog / def / item types (`src/furniture/types.ts`)

- `FurnitureDef` is `ParametricDef | GltfDef`. A configured product **saves as a `UserGltfDef`**
  (kind `'gltf'`, source `'user'`) — exactly what `persistUserGlb` returns. No new `kind`.
- `FurnitureItem.props: ParamProps` (`Record<string, number|string>`) is the free-form per-
  instance bag that round-trips through `schema.ts` (`FurnitureItemZ.props`, line 46:
  `z.record(string, number|string)`). This is the **only place a placed item carries config**.
- `itemPrice` (`furniturePrices.ts` line 171–173): a `UserGltfDef.price` wins over the static
  tables — so the configured product's summed option price rides into the budget automatically.

### 1.4 Persistence reality check (decides the model — see §4)

- A configured product is **baked to a single GLB at save time** and stored as a `UserGltfDef`.
  The **`ConfiguredSpec` (the recipe) is not, by default, stored on the placed item** — once
  baked, the placed item is an ordinary GLB instance (re-skinnable via finish overrides, not
  re-configurable). This matches how `saveParametric.ts` already works (the `ParametricSpec`
  is *not* round-tripped onto placed items either).
- **Optional re-editability (SLOT-204, deferred):** to let a user re-open the configurator on a
  placed item, stash the JSON spec as a single string prop
  `item.props['__slotSpec'] = JSON.stringify(spec)` — `props` round-trips through schema with no
  version bump (it's a `Record<string,string|number>`). This is additive and back-compatible.
  Recommended as a fast-follow, **not** core, to keep SLOT-101 small.

### 1.5 Existing modular-sofa metadata (informs, doesn't block)

`src/furniture/types.ts` `IkeaModular` + `src/furniture/ikea/placementSemantics.ts`
(`placementKind`: `vertical` / `around` / `modular`) already model how IKEA sofa sections snap
edge-to-edge and how a mattress rests *on* a frame. The configurator is the **authoring** side
of the same idea but for **bundled/procedural** products: it does not depend on the IKEA scrape
(so it ships in prod), but its slot vocabulary (`seat`/`corner`/`chaise`/`armrest`,
mattress-on-frame) is deliberately aligned with `IkeaModular.role` and `PlacementKind` so the
two can converge later.

---

## 2. The configurator data model

All pure, serializable, dependency-free (sits in `src/furniture/configurator/`). Mirrors the
`spec.ts` discipline: a typed product definition + a typed user selection + a `clampConfig`
that always yields something buildable.

### 2.1 Product definition (authored, static — the "template")

```ts
// src/furniture/configurator/model.ts

/** A transform in the BASE's local frame (metres / radians). Floor-anchored,
 *  footprint-centred, +Z forward — same convention as ParametricPart. */
export interface SlotAnchor {
  position: [number, number, number]   // where the option's local origin sits
  rotationY?: number                    // yaw of the option about Y (default 0)
}

/** One option that can fill a slot. Geometry is EITHER procedural box parts
 *  OR a GLB sub-asset (bundled CC0 url); never both. */
export interface SlotOption {
  id: string                            // unique within its slot
  label: string
  price: number                         // SGD, explicit (no estimator guesswork)
  /** Procedural geometry contribution, in the OPTION's own local frame
   *  (floor-anchored, centred, +Z fwd). The composer transforms it by the
   *  slot anchor. Mutually exclusive with `gltfUrl`. */
  parts?: ConfiguredPart[]
  /** GLB sub-asset (bundled, CC0/CC-BY). Mutually exclusive with `parts`. */
  gltfUrl?: string
  /** Footprint this option contributes, in its own frame (for bounds union). */
  footprint: { w: number; d: number; h: number }
  /** Tags an option declares; a slot's `accepts` filters on these. */
  tags?: string[]
}

export interface ProductSlot {
  id: string                            // stable key, used in ConfiguredSpec + props
  label: string
  anchor: SlotAnchor
  options: SlotOption[]
  /** Default option id (must exist in `options`). */
  defaultOptionId: string
  /** Whether the slot may be left empty (e.g. "no headboard"). Default false. */
  optional?: boolean
  /** Tag filter: an option is offered only if every tag here is in option.tags.
   *  Empty/absent = all options offered. (Forward-compat with shared option pools.) */
  accepts?: string[]
}

export interface ConfigurableProduct {
  id: string                            // 'mattress-frame', 'modular-sofa', ...
  label: string
  category: FurnitureCategory
  /** The always-present base geometry, in product-local frame. */
  base: { parts?: ConfiguredPart[]; gltfUrl?: string; footprint: {w,d,h}; price: number }
  slots: ProductSlot[]
  /** Cross-slot constraints (mutual exclusions / requirements). See §2.4. */
  constraints?: SlotConstraint[]
}
```

`ConfiguredPart` is **structurally identical to `ParametricPart`** (a `role` + `position` +
`size` box) so the composed part list feeds the existing object builder unchanged. We re-export
the type rather than duplicate it:

```ts
export type ConfiguredPart = import('../parametric/buildParts').ParametricPart
```

### 2.2 User selection (per-instance — the "recipe", serializable)

```ts
export interface ConfiguredSpec {
  productId: string
  /** slotId → chosen option id, or null for an empty optional slot. */
  selections: Record<string, string | null>
}
```

This is small and JSON-serializable. It is the thing the dialog edits and (optionally,
SLOT-204) the thing stashed in `item.props['__slotSpec']`.

### 2.3 Clamping (the single defence — never throws)

```ts
export function clampConfig(product: ConfigurableProduct,
                            raw: Partial<ConfiguredSpec> | null | undefined): ConfiguredSpec
```
- Unknown `productId` → ignored (caller passes the resolved product).
- For each slot: a selection naming an option not in `slot.options` → falls back to
  `defaultOptionId`. `null` allowed only when `slot.optional`. Missing slot → default.
- A selection that violates a `constraint` → resolved deterministically (see §2.4).
- Output always names a valid option (or null on an optional slot) for **every** slot.

### 2.4 Constraints

```ts
export type SlotConstraint =
  | { kind: 'mutex'; slots: string[] }                 // at most one of these slots filled
  | { kind: 'requires'; ifSlot: string; ifOption: string; thenSlot: string; thenOption: string }
  | { kind: 'excludes'; slot: string; option: string; conflictsWith: { slot: string; option: string } }
```
`clampConfig` applies them in declared order, **left wins** (the earlier-declared slot keeps its
selection; the later one is demoted to its default or, for `mutex`, emptied if optional). This
keeps clamping pure and deterministic — the same discipline as `clampSpec`.

---

## 3. Composition (pure, render-agnostic, unit-tested)

`src/furniture/configurator/compose.ts`:

```ts
export interface ComposedModel {
  parts: ComposedPart[]                       // ParametricPart + optional `finishKey`
  gltfPieces: { url: string; anchor: SlotAnchor; finishPrefix: string }[]
  bounds: { w: number; d: number; h: number } // union of base + filled slots
  price: number                               // base.price + Σ selected option.price
  finishTargets: { key: string; label: string }[]  // for re-skin after baking
}

export function composeProduct(product: ConfigurableProduct, spec: ConfiguredSpec): ComposedModel
```

Algorithm:
1. `spec = clampConfig(product, spec)`.
2. Start with the base's parts/gltf at identity; seed `bounds` from `base.footprint`.
3. For each slot with a non-null selection: take the chosen `SlotOption`, **transform its parts
   by the slot anchor** (translate by `anchor.position`, rotate the part's `position` + swap
   w/d if `rotationY` is a quarter-turn — a small `transformPart(part, anchor)` helper, pure +
   unit-tested), then concat. GLB options append a `gltfPieces` entry instead.
4. **Bounds union:** expand the running AABB to include each filled option's footprint placed
   at its anchor. (Reuse a box-AABB-union helper if one exists under `layout/`; otherwise a
   trivial min/max over the 8 transformed corners — pure, testable.)
5. **Price:** `base.price + Σ option.price` over filled slots (no estimator — options carry
   explicit prices, which is more honest for a fixed-SKU configurator).
6. **Finish targets:** each procedural part gets a `finishKey` (e.g. `base:frame`,
   `mattress:cover`); GLB options' finish keys are discovered later (at bake) with
   `listFinishTargets` and namespaced `<slotId>:<materialName>`. `composeProduct` returns the
   procedural ones; the bake step (§4) appends the GLB ones after the GLB sub-assets are loaded.

`composeProduct` is **the SLOT-101 core**: given a product + a clamped spec it yields everything
the preview, the price line, and the bake need. Fully unit-testable with no three.js (assert
part counts, bounds, price, finish-target keys for known products + specs).

### 3.1 Object builder (browser-only)

`src/furniture/configurator/buildObject.ts`:
```ts
export function buildConfiguredObject(product, spec):
  Promise<{ object: Group; model: ComposedModel; finishTargets }>
```
- Build procedural parts with the **existing** `partMaterial` mapping (re-export from
  `parametric/buildObject.ts`) → boxes, `mesh.name = finishKey ?? role`.
- For each `gltfPieces` entry, load the GLB (the app already has a GLTF loader path used by
  `GltfModel`/`gltfRender.ts`; reuse it), reparent under a `Group` positioned at the anchor,
  rename its meshes' materials so `listFinishTargets` keys are namespaced per slot, and add to
  the root group. Collect the namespaced finish targets.
- Returns the assembled `Group` (used by both preview and bake) + the full finish-target list.
- Async because GLB options load asynchronously; the all-procedural products (both worked
  examples in §6) resolve synchronously-fast (no network — bundled urls).

---

## 4. Persistence (reuse the GLB-designer channel — no parallel path)

`src/furniture/configurator/saveConfigured.ts` — a near-copy of `saveParametric.ts`:

```ts
export async function saveConfiguredAsset(product, spec, name?): Promise<PersistResult> {
  const clamped = clampConfig(product, spec)
  const { object, model, finishTargets } = await buildConfiguredObject(product, clamped)
  let buffer: ArrayBuffer
  try { buffer = await exportGlb(object) } finally { disposeGroup(object) }
  const display = name?.trim() || productLabel(product, clamped)
  const file = new File([buffer], `${safe(display)}.glb`, { type: 'model/gltf-binary' })
  return persistUserGlb(file, {
    name: display,
    category: product.category,
    footprint: model.bounds,
    price: model.price,
    finishTargets,                       // ← re-skinnable after baking, via existing channel
  })
}
```

What this buys us for free, all through **existing** code:
- de-dupe by content hash (identical configuration → reuse existing def);
- IDB blob + `UserGltfDef` registration, footprint + price in IDB meta;
- **boot hydration already handled** by `hydrateAssets.ts` (it decodes `footprint`,
  `finishTargets`, `finishOverrides`, `price` from IDB meta — no change needed);
- save-file round-trip already handled by `schema.ts` `UserGltfDefZ` (footprint, finishTargets,
  finishOverrides, price all present);
- `itemPrice` returns `def.price` for user GLBs → budget integration free;
- collision uses the saved footprint immediately.

**Decision: bake-to-GLB is the persistence model.** A configured product is a baked
`UserGltfDef`. The `ConfiguredSpec` recipe is *not* core-persisted on the placed item (matching
`saveParametric`). Re-editability (SLOT-204) is an additive `item.props['__slotSpec']` string,
deferred. This honours the repo rule ("don't invent a parallel persistence channel for
generated geometry") — we add **zero** new persisted asset kinds, schema fields, or hydration
branches for the core path.

---

## 5. UI

`src/ui/configurator/ConfiguratorDialog.tsx` (+ `SlotList.tsx`, `OptionPicker.tsx`,
`ConfiguratorPreview.tsx`) — a structural clone of `ParametricDialog.tsx`:

- Custom `.modal-overlay` portal to `document.body`; `useModalGuard(open)`; own Esc handler
  (same as `ParametricDialog`).
- **Product picker** (tabs, like the parametric type tabs) → choose `mattress-frame` /
  `modular-sofa` from a registry.
- **Left:** live `<Canvas>` preview (`ConfiguratorPreview` reuses `buildConfiguredObject` so it
  can't drift from the bake), `Bounds`-framed; stacked on top on mobile (`useIsMobile`).
- **Right (`SlotList`):** one row per slot → `OptionPicker` (segmented control / swatch row over
  the `.seg`/`.swatch` token classes — **no hardcoded colour**, per `src/ui/CLAUDE.md`); optional
  slots get a "None" choice. Constraint-disabled options render disabled with a one-line reason.
- Running **price** line gated behind `useFeature('budget')` (same as the parametric dialog),
  labelled "Configured price" (sum of base + options, not an estimate).
- **Buttons:** "Add to room" (save → `setActiveDefId(def.id)` to arm placement, diving into a
  room via `firstEditableRoomId` if in overview — copy from `ParametricDialog.save`) and "Save to
  catalog".
- Empty/none states use the shared `EmptyState`. All spacing on the standard scale; verify in
  light + dark across the 5 themes.
- Entry points: a Catalog drawer button + a ⌘K command, both behind `useFeature` /
  `COMMAND_FLAGS`, desktop **and** mobile (toolbar + accordion parity), exactly like
  `parametricFurniture`.

### Feature flag

Add to `src/features/flags/registry.ts` + `types.ts`:
```ts
productConfigurator: {
  label: 'Configurable products',
  description: 'Build mattress-on-frame and modular sofas by picking options per slot',
  default: true,         // pure procedural geometry (+ bundled CC0 GLB options) → prod-safe
  tier: 'simple',        // a core "buy a configured product" surface, like parametricFurniture
}
```
Rationale for `simple`: it is a furnishing surface a casual user reaches for (parallels
`parametricFurniture` / `kitchenCabinets`, both `simple`). If a product later depends on a
licensed sidecar GLB, that *product* can be hidden in prod via the existing `devOnly` mechanism
on a per-product basis — but the flag itself stays prod-safe. Tests must assert it in **both**
modes (Simple shows it; Pro shows it — both `true`), per the repo's "test both modes" rule.

---

## 6. Worked examples (end-to-end)

### 6.1 Mattress-on-frame (`mattress-frame`, category `beds`)

All-procedural (no GLB options) — the simplest end-to-end product.

- **Base:** a queen bed frame, parts = side rails + headboard mount + slatted base, footprint
  `{ w: 1.6, d: 2.1, h: 0.30 }`, support surface top at y≈0.30. `price: 220`.
- **Slot `mattress`** (required), anchor `{ position: [0, 0.30, 0] }` (rests **on** the frame's
  slat surface — the `placementKind: 'vertical'` relationship, authored directly):
  - `m-foam` "Foam 20 cm" — box parts, footprint `{1.5, 2.0, 0.20}`, price `260`, default.
  - `m-pocket` "Pocket-spring 25 cm" — footprint `{1.5, 2.0, 0.25}`, price `480`.
  - `m-hybrid` "Hybrid 30 cm" — footprint `{1.5, 2.0, 0.30}`, price `640`.
- **Slot `headboard`** (optional), anchor `{ position: [0, 0.30, -1.05] }` (back edge of frame):
  - `null` "No headboard" (default-eligible because optional).
  - `hb-panel` "Padded panel" — footprint `{1.6, 0.08, 0.7}`, price `150`, default option.
  - `hb-slatted` "Slatted timber" — footprint `{1.6, 0.06, 0.6}`, price `120`.
- **Constraints:** none (headboard fits any mattress). Finish keys: `base:frame`,
  `mattress:cover`, `headboard:face` → all re-skinnable after baking.

### 6.2 Modular sofa (`modular-sofa`, category `seating`)

Demonstrates a repeated/linear slot layout + mutex constraints. Aligns with `IkeaModular.role`
(`seat`/`corner`/`chaise`/`armrest`).

- **Base:** a single 3-seater seat platform (cushioned box parts), footprint
  `{ w: 2.1, d: 0.95, h: 0.85 }`, price `520`. Seat surface +Z forward, armrest anchors at the
  left/right edges.
- **Slot `leftEnd`** anchor `{ position: [-1.05, 0, 0] }` (left edge):
  - `arm-std` "Armrest" footprint `{0.20, 0.95, 0.65}` price `90` (default).
  - `chaise-l` "Left chaise" footprint `{0.95, 1.6, 0.45}` price `380`.
  - `null` "Open end" (optional).
- **Slot `rightEnd`** anchor `{ position: [1.05, 0, 0], rotationY: Math.PI }` (right edge,
  mirrored): same option set (`arm-std`, `chaise-r`, `null`), default `arm-std`.
- **Slot `corner`** (optional) anchor `{ position: [1.05, 0, -0.95] }` (extends back-right into
  an L): `corner-1` "Corner section" footprint `{0.95, 0.95, 0.85}` price `420`; default `null`.
- **Constraints:**
  - `{ kind: 'mutex', slots: ['rightEnd', 'corner'] }` — a corner section replaces the right
    armrest/chaise (can't have both at the right edge). `clampConfig` keeps the earlier-declared
    `rightEnd` and empties `corner` if both are set.
  - `{ kind: 'excludes', slot: 'leftEnd', option: 'chaise-l',
       conflictsWith: { slot: 'corner', option: 'corner-1' } }` — no L-on-both-ends (footprint
    would overflow an HDB living room).
- Finish keys: `base:upholstery`, `leftEnd:upholstery`, `rightEnd:upholstery`,
  `corner:upholstery` — one re-skin per module after baking.

Both examples are **pure procedural** → no GLB-loading needed for v1, so SLOT-201/202 don't
depend on the GLB-option codepath (which can land later as SLOT-203 with a bundled CC0 option).

---

## 7. Task breakdown (SLOT-xxx)

Effort: **S** ≤ ~150 LOC + tests · **M** a few files · **L** multi-file / new UI surface.
Conflict groups flag files multiple tasks touch (sequence within a group; parallel across groups).

| ID | One-line | Effort | Conflict group | Depends on |
|----|----------|--------|----------------|------------|
| **SLOT-101** | Core model + `clampConfig` + constraints + `composeProduct` (pure), unit tests | **M** | `configurator-core` | — |
| **SLOT-102** | `buildConfiguredObject` + `ConfiguratorPreview` (three.js, reuse `partMaterial`/exportGlb), procedural-only | **M** | `configurator-core` | SLOT-101 |
| **SLOT-103** | `saveConfiguredAsset` via `persistUserGlb` (+ `finishTargets`); round-trip/hydration tests | **S** | `configurator-core`, `persist` (read-only) | SLOT-102 |
| **SLOT-104** | Feature flag `productConfigurator` (registry+types+resolve), both-modes flag tests | **S** | `feature-flags` | — |
| **SLOT-105** | `ConfiguratorDialog` + `SlotList` + `OptionPicker`; store open-flag; ⌘K cmd + catalog/toolbar entries (desktop+mobile) | **L** | `configurator-ui`, `store-open-flags`, `commands` | 101,102,104 |
| **SLOT-201** | Product registry + `mattress-frame` product (§6.1); composition + price unit tests | **M** | `configurator-products` | SLOT-101 |
| **SLOT-202** | `modular-sofa` product (§6.2) incl. mutex/excludes constraints; tests both products in dialog (both modes) | **M** | `configurator-products` | SLOT-101, SLOT-201 |
| **SLOT-203** | GLB-sub-asset option codepath (bundled CC0): load + per-slot `listFinishTargets` namespacing; add one GLB option to a product | **M** | `configurator-core`, `configurator-products` | SLOT-102, SLOT-201 |
| **SLOT-204** | (deferred, additive) Re-editable placed items: stash `__slotSpec` in `props`, "Edit configuration" entry | **S** | `configurator-ui` | SLOT-103, SLOT-105 |
| **SLOT-301** | Docs: ARCHITECTURE.md + `configurator/CLAUDE.md` + user-guide entry; scenario ladder JSON | **S** | `docs` | 105, 201, 202 |

Recommended order: **101 → 102 → 103 → 104 → 201 → 202 → 105 → 203 → 301 → (204)**.
(104 can go anytime; 105 needs the core + at least one product; 203/204 are fast-follows.)

### Headless verification per task
- **101 / 201 / 202:** pure Vitest — assert `composeProduct` part counts, `bounds` union, summed
  `price`, finish-target keys, and `clampConfig` for malformed/constraint-violating specs.
- **102:** Vitest with a stub three.js group — assert mesh count == parts + gltf pieces, names ==
  finish keys; `disposeGroup` frees geometry. Visual: `scripts/shot.mjs --scenario` to render the
  preview canvas for both example products and eyeball (per the visual-verification rule).
- **103:** Vitest — mock `persistUserGlb`; assert it's called with the composed `footprint`,
  summed `price`, and `finishTargets`; assert de-dupe on identical spec. Then a boot-hydration
  test (existing `hydrateAssets` path already covered — assert the def reappears with price +
  finish targets).
- **104:** `resolveFlags(..., 'simple')` and `'pro')` both `true`; `devOnly` undefined.
- **105:** RTL test the dialog opens, lists slots, picking an option updates the price line, "Add
  to room" arms `activeDefId`; test **both** Simple and Pro (flag is `simple` so visible in both).
  Then `scripts/shot.mjs --scenario` to screenshot the dialog (light + dark) and **visually
  review** (toolbar/menu/mobile parity).

---

## 8. Risks / unknowns (honest)

1. **Biggest risk — anchor/footprint math for non-axis-aligned options.** The modular-sofa
   `rightEnd` mirror (`rotationY: π`) and the corner (an L that extends in −Z) make the
   `transformPart` + bounds-union the trickiest pure code. Mitigation: keep `transformPart`
   tiny and exhaustively unit-tested (the rotation is restricted to quarter-turns in v1, which
   is just an x/z swap + sign flip — no general matrix needed); verify the assembled bounds
   against hand-computed values in SLOT-202's tests, and **visually confirm** the preview
   (parts must connect, no floating members — the structural-soundness rule).
2. **GLB-option finish-target collisions.** Two GLB options reusing the same material name would
   alias finish targets. Mitigation: namespace every GLB option's discovered keys with its
   `slotId` at bake (SLOT-203); v1 products are all-procedural so this risk is deferred, not on
   the critical path.
3. **Re-editability vs bake.** Baking to one GLB means a placed configured product is *not*
   re-configurable by default (only re-skinnable). If the product wants in-place reconfigure as a
   *core* feature, SLOT-204's `__slotSpec` prop must be promoted to core and the renderer would
   need to compose live from the spec (a bigger change — effectively a new parametric primitive).
   The recommended design treats bake as core and reconfigure as an additive fast-follow; flag
   this trade-off to the product owner before SLOT-101.
4. **Estimate vs explicit price.** Unlike `parametric/price.ts` (area estimate), options carry
   explicit prices — cleaner for fixed SKUs but means authored products need real numbers. Use
   `furniturePrices.ts` category bases as the sourcing reference so authored prices stay
   consistent with the rest of the catalog.
5. **GLTFExporter cost on large assemblies.** A modular sofa with several GLB sub-assets bakes a
   sizeable GLB; `persistUserGlb` runs LOD generation in-browser. Likely fine (parametric
   kitchen-runs already bake bigger geometry) but worth a perf check in SLOT-203.
