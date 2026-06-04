# Furniture catalog

`src/furniture/` holds the catalog model + rendering.

## Two kinds of item

- **Parametric primitives** — a component in `primitives/` (a function taking
  `{ props }`), registered in `primitives/index.ts` + the `PrimitiveKind` union,
  with a `ParametricDef` in `builtinCatalog.ts`. Built at real-world metres,
  floor-anchored, centred on the footprint, facing +Z.
- **GLB items** — bundled CC0, user uploads, and IKEA imports all render through
  one loader, `GltfModel.tsx` (`gltfRender.ts` picks url/scale/tint/finish
  overrides per item).

## Merged catalog

`catalog.ts` merges built-ins, generated (`generatedCatalog.ts`), installed
packs, and user/IKEA defs (footprints resolved). In-render consumers use
`useCatalogGetter` (stable, non-rendering); the unified catalog drawer uses
`ui/catalog/useUnifiedCatalog.ts`.

## Collision flags

Items carry a vertical span + `mounted` (skip wall checks — pendants, wall units)
/ `noClip` (rugs slide under) flags so placement is height-aware
(`collision/placement.ts`).

## Categories

15 categories (`FurnitureCategory`): beds, seating, tables, storage, kitchen,
bathroom, appliances, lighting, decor, textiles, outdoor, electronics, kids,
laundry, others (the auto-detect catch-all). Category is auto-detected for
imports, never hand-entered.

## Performance

Repeated decoration inside a primitive can collapse to one draw call via
`primitives/InstancedBoxes.tsx` (e.g. bookshelf books). Light-emitting items
register in `lightEmitters.ts`; continuously-animated ones (fans) register via
`scene/animatedSources.ts`.

See [Adding features](./adding-features.md) for the add-a-primitive recipe and
`gltf/` (decoders, LOD, texture budget, finish targets) for the GLB plumbing.
