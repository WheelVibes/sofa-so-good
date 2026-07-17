# Dropped materials

Drop a folder per material with channel images inside, then run `npm run index-assets`.

## Zero-config: just drop a texture folder (auto-detection)

You can drop a **bare** Poly Haven / ambientCG texture folder — no sidecar needed. The
indexer infers the PBR channel map from the filenames (see
`scripts/asset-pipeline/materialChannels.ts`). Recognised suffixes (case-insensitive,
resolution tokens like `_1k`/`_2k` ignored):

| Channel (runtime-bound) | Filename markers |
| --- | --- |
| albedo (base colour) | `diff`, `diffuse`, `albedo`, `basecolor`, `base`, `col`, `color`, `colour` |
| normal | `nor`, `normal`, `nrm`, `norm` — GL preferred over DX (`NormalGL` vs `NormalDX`) |
| roughness | `rough`, `roughness`, `rgh` |
| ao | `ao`, `occlusion`, `occ` |

Both `dirty_carpet_diff_2k.jpg` (Poly Haven) and `Bricks075A_1K-JPG_Color.jpg` (ambientCG)
styles work. Metalness / displacement / height / combined-ARM maps are **recognised but
skipped** — the runtime binds only the four channels above. `.exr`/`.tif`/`.hdr` sources are
ignored (the browser can't sample them); provide `.png`/`.jpg`/`.webp`.

When auto-detecting, metadata defaults are: `id` = folder name, `name` = title-cased folder
name, `category` = `wall` if the folder name contains `wall` else `floor`, `uvScale` = `[1, 1]`,
`license` = `CC0` (no attribution). If no albedo/diffuse/colour file is found the folder is
skipped with a warning. Each auto-detected folder logs its inferred channels.

## Sidecar JSON (optional — always wins over auto-detection)

For full control (custom id/name/category, `uvScale`, attribution, or non-standard filenames)
place `material.json` inside the material folder. A sidecar always takes precedence:

```json
{
  "id": "my-floor",
  "name": "My floor",
  "category": "floor",
  "uvScale": [1.5, 1.5],
  "channels": {
    "albedo": "albedo.png",
    "normal": "normal.png",
    "rough": "rough.png"
  }
}
```
