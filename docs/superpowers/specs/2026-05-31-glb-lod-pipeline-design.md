# Tiered GLB LOD pipeline — design

**Date:** 2026-05-31
**Status:** Design (approved to proceed to plan)
**Relates to:** [IKEA fidelity program](../../ikea-import-app-support.md), milestone 1
(render fidelity + GLTF hardening).

## Problem

The imported IKEA GLBs (`python/scripts/ikea_sg_3d_models/`, ~201 files, non-CC0,
gitignored) are Draco-compressed geometry with **raw JPEG/PNG textures**. On-disk
size (avg 839 KB) badly understates runtime cost. Measured across 140 successfully
parsed files (the rest fail only because the analysis harness lacked the Draco
decoder — they are equivalent):

| Metric | Total | Avg / model |
|---|---|---|
| Triangles | 2.19 M | ~15,600 |
| Decoded texture VRAM (RGBA + mips) | ~5.7 GB | **~30 MB** |
| On disk | 145 MB | 839 KB |

Texture resolution dominates: 224 of 657 textures exceed 1024px, 23 exceed 2048px,
worst individual models carry 68–128 MB of texture VRAM (multiple 4096px maps on
small objects). Nothing uses a GPU-compressed texture format, so each texture takes
full uncompressed VRAM the moment it decodes.

**Impact:** a furnished room with 20–30 *distinct* IKEA models (drei caches by URL,
so cost is per unique model, not per instance) is ~600 MB–1 GB of texture VRAM plus
hundreds of thousands of triangles. On the low/medium hardware targets in
`src/scene/quality.ts` (integrated/CPU GPUs) this causes VRAM pressure,
texture-upload stalls, and sustained sub-30fps — well before the scene looks heavy.
Draco decode is also a per-load main-thread CPU spike.

## Goal

Serve lighter model variants on the **low** and **medium** quality tiers, keep the
**original** untouched on **high** (no visual regression on high). Automatic — driven
by the existing `qualityTier` store state, no new UI.

### Tier budgets (locked)

| Tier | Texture cap (longest edge) | Geometry (triangle ratio) | Texture format |
|---|---|---|---|
| low | 512 px | ~50% | resized WebP (KTX2 optional) |
| medium | 1024 px | ~75% | resized WebP (KTX2 optional) |
| high | original | 100% | original |

Estimated texture VRAM/model after: low ~2 MB, medium ~8 MB, high ~30 MB.

## Architecture — two cooperating halves (hybrid)

### A. Offline pass (primary path)

`python/scripts/optimize_glb_lod.mjs` — a Node script alongside the existing
non-CC0 IKEA tooling. Output GLBs stay in the gitignored `python/scripts` output
area. Uses dependencies **already installed**, no new native binaries:

- `@gltf-transform/core` + `@gltf-transform/functions` — `textureCompress`
  (resize + re-encode), `simplify` (geometry decimation), `weld`, `dedup`, `prune`,
  `draco` (re-compress geometry).
- `sharp` (already present) — backs `textureCompress` resize/WebP encode in Node.
- `meshoptimizer`'s `MeshoptSimplifier` / `MeshoptEncoder` (already present) —
  geometry simplification + optional meshopt re-pack.
- `draco3dgltf` — decoder/encoder for reading and re-writing Draco geometry
  (installed `--no-save` for the analysis; the script declares it as a dev/script
  dependency).

Per file, for each of `low` and `medium`:
1. Read GLB (Draco-decoded).
2. `textureCompress({ resize: [cap, cap], targetFormat: 'webp' })` — only shrinks
   textures larger than the cap; smaller ones pass through.
3. `weld()` then `simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 })`
   to the tier triangle ratio.
4. `dedup()` + `prune()` cleanup.
5. `draco()` re-compress geometry.
6. Write `foo-low.glb` / `foo-medium.glb` **beside** the original.

Behaviour:
- **Idempotent:** skip a variant whose mtime is newer than the source.
- **Reports** before/after triangles + max-texture-dim + decoded-VRAM estimate per
  file and in total, so the win is measurable.
- **Resumable / selective:** accepts an optional glob/path arg to convert a subset
  (e.g. a single freshly-imported group) instead of the whole tree.
- Expected wall-clock: ~3–8 min over all ~201 files; re-run only when new models
  are imported.

**KTX2 note (documented optional upgrade):** GPU-compressed KTX2/Basis would further
cut VRAM, but requires a `toktx`/basisu encoder binary that is not installed here.
The dominant VRAM win comes from **resolution** (a 512px texture is 4–64× smaller in
VRAM than a 2048–4096px one) regardless of on-disk codec, so v1 ships resized WebP.
The script detects `toktx` on PATH and, if present, switches `textureCompress` to
KTX2 (`targetFormat: 'ktx2'`) — the app already supports KTX2 decoding (see below),
so enabling it later is config-only, no app change.

### B. Runtime fallback (secondary path)

For a freshly-imported model that has no offline variant yet: load the **original**
GLB, then walk its materials and **downscale any texture whose longest edge exceeds
the tier cap in-place**, disposing the original texture/image. No geometry change at
runtime (proper simplification is ~100–500 ms/model — too slow for the load path; it
stays offline). On **high** this is a no-op. Captures the dominant (texture-VRAM)
win until the offline pass regenerates a real variant.

## App-side integration

### Decoder support — already present (verified)

`src/furniture/gltf/decoders.ts` + `src/main.tsx` already wire Draco (boot-time
path), meshopt (drei auto-wires per load), and KTX2 (renderer-bound via drei's
`useKTX2`/`detectSupport`). **No decoder changes required**, including for the
optional KTX2 upgrade.

### `src/furniture/gltf/lod.ts` (new)

- `lodSuffix(tier)` → `''` for high, `'-low'` / `'-medium'` otherwise.
- `baseUrl(url)` → strips a known tier suffix back to the original (used for caching
  by base identity).
- `lodUrl(url, tier)` → applies the **sibling suffix** convention
  (`foo.glb` → `foo-low.glb`).
- `resolveLodUrl(url, tier)` → async existence probe (cached `fetch`/`HEAD` per
  resolved URL) returning the variant URL if it exists, else the original. The
  cache prevents repeat probes per (url, tier).

### `src/furniture/GltfModel.tsx` (edit)

- Read `qualityTier` from the store.
- Resolve the URL through `resolveLodUrl` and pass the resolved URL to `useGLTF`.
  drei caches by URL, so each *(model, tier)* pair caches independently and a tier
  switch swaps to the variant's URL cleanly.
- When the resolved URL is the **original** (no variant existed) and the tier is not
  high, run `applyTextureBudget(scene, tier)` after load (the runtime fallback).
- **Footprint cache fix:** key `FOOTPRINT_CACHE` off `baseUrl(url)` rather than the
  resolved variant URL. Geometry simplification can shift the bbox slightly; the
  high-tier original is authoritative for collision so footprint stays consistent
  across tiers. (This is the one behavioural change to existing code.)

### `applyTextureBudget(scene, tier)` (new, in `lod.ts` or a sibling)

Walks the scene's materials; for each texture whose `image` longest edge exceeds the
tier cap, resizes via `ImageBitmap`/canvas to the cap, swaps `texture.image`, sets
`needsUpdate`, and disposes the prior GPU resource. No-op on high. Idempotent
(skips textures already within budget).

## Testing

- `lod.test.ts` — `lodSuffix`/`lodUrl`/`baseUrl` round-trips; `resolveLodUrl` returns
  variant when probe succeeds and original when it fails; probe cache hit; footprint
  keyed by base URL across tiers.
- `applyTextureBudget` — resizes only over-budget textures, leaves under-budget
  alone, no-op on high, idempotent.
- Offline script — smoke test on one sample GLB asserting triangle count and
  max-texture-dim drop per tier. Gated/skipped when the script deps aren't available
  in CI.
- Existing `decoders.test.ts`, `gltfSpan.test.ts`, `defaultLayout.test.ts` stay green.

## Scope guards (YAGNI)

- No KTX2 encoder dependency in v1 (resolution is the dominant lever; KTX2 is a
  documented config-only upgrade gated on `toktx` presence).
- No scraper / `metadata.json` schema change — variant discovery is pure filename
  convention.
- No new UI — tier selection is automatic from existing `qualityTier` state.
- Runtime fallback does textures only, never geometry.

## Decisions log

- Strategy: textures **+** geometry (geometry forces an offline step).
- Output: hybrid — build-time variants primary, runtime texture-resize fallback.
- Tier budgets: 512/1024 px caps, 50%/75% triangle ratios, high untouched.
- Variant discovery: sibling filename suffix (`-low` / `-medium`), existence-probed.
- Runtime fallback: in-place texture downscale on load.
- Texture format: resized WebP via `sharp` (KTX2 optional, gated on `toktx`).
