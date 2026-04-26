# Asset population: free CC0 furniture and materials

**Date:** 2026-04-26
**Status:** Design — pending implementation plan
**Related:** [Phase 1 plan](../plans/2026-04-25-hdb-3d-sandbox-phase-1.md), [src/furniture/builtinCatalog.ts](../../../src/furniture/builtinCatalog.ts), [src/materials/builtinCatalog.ts](../../../src/materials/builtinCatalog.ts)

## Goal

Populate the furniture and material catalogs with real CC0 assets from Kenney, Poly Haven, ambientCG, and Quaternius, and provide a generic "drop folder" path so users can add their own compatible assets (including 3D-FUTURE, which cannot be redistributed).

## Non-goals

- Auto-fetching 3D-FRONT / 3D-FUTURE. Their license forbids redistribution; users obtain it themselves and use the drop folder.
- Streaming/LOD per-asset variants. The runtime already lazy-loads GLBs on first use; that is sufficient.
- Replacing the parametric primitives. Real GLBs add accent pieces, not structural staples.

## Constraints and prior decisions

- **Delivery:** build-time fetch script. Repo stays small; reproducible; no CDN infra.
- **Licensing:** only CC0 assets are fetched automatically. Drop folder is generic, format-driven.
- **Metadata authoring:** hand-curated manifest entries for the fetch list; sidecar JSON convention (with bbox + filename fallbacks) for the drop folder. Same indexer handles both.
- **Format:** GLBs are Draco-compressed. Textures are 2K KTX2 (Basis-compressed). `gltf-transform` does both.
- **v1 scope:** Starter set, ~25 assets, ~30 MB processed.
- **Attribution:** inspector panel per-item + dedicated Credits modal; both fed from a generated `CREDITS.json`. `CREDITS.md` also written for the repo.

## Architecture

Five components.

### 1. Manifest

Two JSON files under `assets/manifest/`:

- `furniture.json` — array of furniture entries
- `materials.json` — array of material entries

Each entry pins source URL(s), license metadata, and the runtime metadata the catalog needs. Validated with zod (already a dependency). Manifest is the contract: source URL changes are handled by editing the manifest, not by fix-up code.

Furniture entry shape:

```ts
{
  id: string;                    // unique catalog id, e.g. "kenney-armchair"
  source: 'kenney' | 'polyhaven' | 'quaternius' | 'ambientcg';
  sourceUrl: string;             // human-facing landing page
  downloadUrl: string;           // direct GLB url
  license: 'CC0';
  attribution: string;           // e.g. "Kenney"
  name: string;
  category: FurnitureCategory;   // existing enum
  footprint: { w: number; d: number; h: number };
  scale?: number;                // default 1.0
  anchor?: 'floor-center' | 'origin'; // default 'floor-center'
}
```

Material entry shape:

```ts
{
  id: string;
  source: 'polyhaven' | 'ambientcg';
  sourceUrl: string;
  downloads: {
    albedo: string;
    normal?: string;
    rough?: string;
    ao?: string;
  };
  license: 'CC0';
  attribution: string;
  name: string;
  category: 'floor' | 'wall';
  uvScale: [number, number];
}
```

### 2. Fetch script

`scripts/fetch-assets.ts`, exposed as `npm run fetch-assets`.

Behavior:

1. Reads both manifests; validates with zod.
2. Downloads each `downloadUrl` to `.asset-cache/<sha-of-url>/<basename>` (cache is gitignored).
3. Processes:
   - GLBs → `gltf-transform optimize --texture-compress ktx2 --compress draco` → `public/assets/furniture/<id>.glb`
   - Textures → `gltf-transform` (or direct `toktx`) → `public/assets/materials/<id>/<channel>.ktx2`
4. Writes a sidecar `<id>.json` next to each processed output containing the manifest entry (so the indexer can stay source-of-manifest-agnostic).
5. Emits `public/assets/CREDITS.json` (machine-readable, consumed by the in-app modal) and `CREDITS.md` at repo root.
6. Re-runs are idempotent: skips entries whose source URL hash matches a cache marker.

Flags:
- `--quick` — skip KTX2/Draco, copy raw files. For dev iteration without the toolchain.
- `--only <id>` — fetch a single entry (dev convenience).
- `--clean` — wipe `public/assets/furniture/`, `public/assets/materials/`, and the cache before fetching.

### 3. Drop folder

Two paths inside `public/assets/`:

- `furniture/dropped/<name>.glb` (+ optional `<name>.glb.json` sidecar)
- `materials/dropped/<name>/{albedo,normal,rough,ao}.{png,jpg,ktx2}` (+ optional `<name>/material.json` sidecar)

Both `dropped/` directories are gitignored except for a checked-in `.gitkeep` and a `README.md` documenting the convention. The README explains the sidecar schema and notes that 3D-FUTURE assets, if licensed by the user, can be dropped here.

Sidecar fallback rules (per drop entry):

- **Furniture** missing sidecar → footprint derived from GLB bounding box, category `decor`, name from filename (kebab case → title case), scale 1.0, anchor `floor-center`.
- **Materials** missing sidecar → category inferred from parent path (`materials/dropped/floors/...` vs `materials/dropped/walls/...`), uvScale `[1, 1]`, name from folder name.
- Sidecar values, when present, override every fallback field-by-field.

### 4. Indexer

`scripts/index-assets.ts`, exposed as `npm run index-assets`. Also invoked at the end of `fetch-assets`.

1. Walks `public/assets/furniture/**.glb` and `public/assets/materials/**/`.
2. For each entry, resolves metadata in this precedence:
   1. Sidecar JSON (manifest-fetched or user-dropped).
   2. Drop-folder fallback (bbox / filename / parent path).
3. Validates uniqueness of ids across (built-in catalog ∪ generated). Hard error on collision.
4. Emits two TypeScript modules:
   - `src/furniture/generatedCatalog.ts` — `GENERATED_FURNITURE: FurnitureDef[]`
   - `src/materials/generatedCatalog.ts` — `GENERATED_MATERIALS: MaterialDef[]`

Both modules are committed (git tracks the generated catalog, not the binary assets). Bbox derivation uses `@gltf-transform/core` (already pulled in as a dep of the fetch script).

### 5. Runtime integration

- `useCatalog()` (currently merges `BUILTIN_CATALOG` ∪ user uploads) gains a third source: `GENERATED_FURNITURE`.
- Material loading does the same with `GENERATED_MATERIALS`.
- Material rendering switches from "solid swatch only" to "load KTX2 maps if `kind === 'textured'`". The texture pipeline placeholder noted in [src/materials/builtinCatalog.ts:7-10](../../../src/materials/builtinCatalog.ts#L7-L10) lands here.
- Inspector panel renders a "Source" line per selected item using the existing `license` / `attribution` / `sourceUrl` fields.
- New Credits modal: small UI affordance (footer link or settings menu) opens a modal that fetches `/assets/CREDITS.json` and lists every bundled asset grouped by source, each linking out to its `sourceUrl`.

## Data flow

```
manifest/*.json ──┐
                  ├──> fetch-assets ──> public/assets/<id>.{glb,ktx2}
                  │                     + sidecars
                  │                     + CREDITS.json / CREDITS.md
drop-folder ──────┤
                  └──> index-assets ──> src/{furniture,materials}/generatedCatalog.ts
                                                   │
                                                   ▼
                            useCatalog() ∪ BUILTIN ∪ GENERATED ∪ uploads
                                                   │
                                                   ▼
                                  Furniture drawer / Material picker / Inspector
```

## v1 contents (Starter, ~25 assets, ~30 MB target)

| Source | Count | Items |
|---|---|---|
| Kenney Furniture Kit | ~10 | armchair, stool, floor lamp, table lamp, small/large plants, side table, dining chair, office chair, rug |
| Poly Haven models | ~5 | potted plant, ceiling lamp, refrigerator, modern armchair, persian rug |
| Poly Haven textures | 8 | oak/walnut planks, white tile, marble, terrazzo (URLs already in `builtinCatalog.ts`), plus concrete plaster / wood panel / brick walls |
| ambientCG textures | 4 | carpet grey, light vinyl, painted plaster, wallpaper |

The manifest schema scales to a Standard set (~80 assets) without code changes — only manifest entries.

## Failure modes

| Failure | Behavior |
|---|---|
| Network error during fetch | Log failed entries, exit non-zero, partial cache preserved; re-run resumes |
| Source URL 404 / changed | Manifest is the contract; user edits the manifest |
| Drop-folder GLB missing sidecar | Bbox fallback applied, warning logged, not an error |
| KTX2 toolchain not installed | Detect and error with install instructions; suggest `--quick` for dev |
| Manifest id collision with built-in | Indexer hard-errors at build time |
| Manifest schema invalid | zod parse fails fast with field-level error message |

## Testing

- **Unit:** bbox derivation, sidecar merge precedence, manifest zod schemas, id uniqueness check.
- **Integration:** a 2-entry fixture manifest pointing at the existing demo Khronos GLBs (already CC0, already in `public/assets/furniture/`). Full fetch → process → index → import cycle runs in CI offline by pre-seeding the cache.
- **Visual smoke:** existing `defaultLayout.test.ts` style — render one generated entry in jsdom and assert primitive structure.

## Open questions

None at design time. Implementation plan will surface concrete sequencing.

## Risks

- **Toolchain weight.** `gltf-transform` + KTX2 binaries add ~50 MB to `node_modules`. Acceptable; only contributors run `fetch-assets`.
- **Source URL drift.** Poly Haven and ambientCG do version asset slugs; pinning to exact paths is essential. Manifest entries should reference stable per-asset URLs, not search results.
- **Bbox-derived footprints can be wrong** when a GLB has an off-floor anchor or non-uniform scale. Mitigated by allowing sidecar override; documented in the drop-folder README.
