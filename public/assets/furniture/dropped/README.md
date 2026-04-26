# Dropped furniture

Drop GLB files here to add them to the catalog. Run `npm run index-assets` after dropping new files.

## Sidecar JSON (optional)

Place `<filename>.glb.json` next to each GLB to override defaults:

```json
{
  "id": "my-armchair",
  "name": "My Armchair",
  "category": "seating",
  "footprint": { "w": 0.8, "d": 0.85, "h": 0.95 },
  "scale": 1.0,
  "anchor": "floor-center"
}
```

Without a sidecar, the indexer derives:
- `id`: `dropped-<filename-without-extension>`
- `name`: title-cased filename
- `category`: `decor`
- `footprint`: bounding box from the GLB
- `scale`: `1.0`
- `anchor`: `floor-center`

## 3D-FUTURE / 3D-FRONT

If you've accepted the Alibaba research license and have local copies of 3D-FUTURE GLBs, you can drop them here. The assets and any sidecars stay gitignored — nothing is committed or redistributed.
