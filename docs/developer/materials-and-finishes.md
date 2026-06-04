# Materials & finishes

`src/materials/`.

## Procedural finishes

`procedural/generators.ts` paints one tiling tile (albedo + normal + roughness)
per finish from seeded noise (wood / tile / marble / carpet / concrete /
terrazzo / plaster / wallpaper / checker). Surfaces use **world-space UVs**
(`worldUv.ts`) so a finish tiles at a fixed physical scale regardless of surface
size. `builtinCatalog.ts` lists floors/walls.

## Furniture materials

`furnitureMaterials.ts` has tintable grain generators (wood, stone/marble,
fabric/leather/velvet) plus `getSolidMaterial` for metal/plastic, and the
`mat:<id>` DLC-finish resolver.

> **Rule:** a `material=` prop needs a real three `Material` instance (use these
> helpers) — three.js ignores a plain `{ color, roughness }` object.

## DLC materials on furniture

A furniture finish value of `mat:<materialId>` applies any catalog finish —
including a downloaded CC0 PBR set (Poly Haven / ambientCG) — to the piece.
`FurnitureMaterialLoader` (mounted in the scene) watches items, builds the
referenced material into the shared cache (procedural synchronously; textured via
`<Suspense>` + `useTexture`) under a furniture-scoped id, and bumps
`materialEpoch` so memoised furniture re-render. The inspector's surface
`finish` dropdown lists these as "CC0 DLC".

## Texture import

`materials/convert/` decodes exotic uploads (TGA/TIFF/EXR/HDR/BMP) and
re-encodes them to WebP in the browser. See [Import pipeline](./import-pipeline.md)
and the multi-format spec under `docs/superpowers/specs/`.
