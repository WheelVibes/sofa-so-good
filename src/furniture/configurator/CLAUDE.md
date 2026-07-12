# src/furniture/configurator — slot-based product configurator (SLOT)

Area rules for the "configure this product" surface (mattress-on-frame, modular sofa). Design:
the (now-removed, shipped) `docs/research/2026-06-19-slot-configurator-design.md` lived here; this
is the lean rule set.

- **A configurable product = base + named slots.** Each `ProductSlot` carries an `anchor` (a
  transform in the base's local frame — floor-anchored, footprint-centred, +Z forward, same
  convention as `ParametricPart`) and `options` (each contributing procedural `parts` OR a `gltfUrl`,
  never both, plus an explicit `price` + `footprint`). Authored products live in `products.ts`
  (`CONFIGURABLE_PRODUCTS`); add one there + give every option a real price.
- **`clampConfig` is the single defence — never throws.** Every slot resolves to a valid option id
  (or null on an `optional` slot); constraints (`mutex`/`requires`/`excludes`) apply in **declared
  order, left wins** (the earlier-declared slot keeps its selection; the later is demoted). Mirror
  `parametric/spec.ts`'s `clampSpec` discipline — all UI + bake paths run through it.
- **`composeProduct` (pure) is the single source of geometry/price/footprint.** It transforms each
  option's parts by its slot anchor (`transformPart` — quarter-turn rotation = x/z swap, v1 only),
  unions the footprint AABB, sums `base.price + Σ option.price`, and emits the re-skin `finishTargets`
  keys. Keep it pure + render-agnostic (no three.js) so it stays exhaustively unit-testable; the
  preview and bake both consume its output so they can't drift.
- **Bake = the GLB-designer channel, no parallel path.** `saveConfiguredAsset` →
  `buildConfiguredObject` (one cloned, **finishKey-named** material per part group so the baked GLB's
  finish targets are discoverable) → `exportGlb` → `persistUserGlb` (with the composed footprint,
  summed price, and `finishTargets`). A configured product is a regular baked `UserGltfDef` — it
  persists, hydrates, collides, prices, and re-skins through the **existing** mechanisms. **Never**
  invent a new persisted asset kind / schema field / hydration branch for it.
- **GLB-sub-asset options (SLOT-203).** A slot option may set `gltfUrl` (a bundled CC0 GLB) instead
  of procedural `parts` — never both. `composeProduct` emits it as a `gltfPiece` (url + anchor +
  `finishPrefix = slot.id` + footprint); `buildObject.ts` loads it (`gltfSlot.ts:loadSlotGltfScene` —
  a raw `GLTFLoader` with Draco (the shared `gltf/decoders.ts:DRACO_DECODER_PATH`, never a second
  hardcoded path) + meshopt behind the shared SEC-1 secure manager, `withBase`'d url; the parse is
  **cached per url** and each attach gets an independent `scene.clone(true)` with **per-attach material
  clones** so `namespaceGltfFinishTargets`'s in-place renaming can't leak between instances or onto
  the cached template), fits it to the option footprint (`fitScaleToFootprint`), reparents it under a
  holder AT the slot anchor (position + quarter-turn), and **namespaces its material groups** to
  `<slot>::<name>` (`namespaceGltfFinishTargets`) so `listFinishTargets` returns them without colliding
  when two slots load the same GLB. Namespacing rides into the exported GLB, so the placed product's
  inspector shows per-slot finish pickers through the **existing** finish-override channel — no new
  schema. **A failed GLB is handled per path:** the PREVIEW (`buildConfiguredPreview`) is fail-soft —
  `console.warn` + skip so one bad/slow asset never blanks the procedural body; the BAKE
  (`buildConfiguredObject` → `saveConfiguredAsset`) fails **loud** — the load error propagates so the
  dialog surfaces an error toast instead of persisting a phantom asset priced/footprinted for a piece
  the GLB doesn't contain. Disposal frees GLB-piece subtrees' per-attach materials + their textures
  (swept generically — any `THREE.Texture`-valued material prop, not a fixed slot list; the parse-cached
  template keeps its own geometry/textures and re-uploads on the next attach; procedural clones share
  cached textures — never disposed). Keep `gltfSlot.ts`'s pure helpers pure +
  unit-tested; a GLB option carries its own `license`/`attribution`/`sourceUrl` (wired like the props'
  `.glb.json` sidecars). First user: the bed's `lamp` slot (bundled Poly Haven CC0 desk lamp).
- **Flag-gated** by `productConfigurator` (simple tier, prod-safe). The dialog (`ui/configurator/`)
  + ⌘K command gate on it; test both modes.
- **Fast-follows (open):** SLOT-204 (re-editable placed items via `item.props['__slotSpec']`).
