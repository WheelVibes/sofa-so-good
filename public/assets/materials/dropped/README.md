# Dropped materials

Drop a folder per material with channel images inside (`albedo.png`, optional `normal.png`, `rough.png`, `ao.png`). Run `npm run index-assets` after.

## Sidecar JSON (required)

Place `material.json` inside each material folder:

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

The indexer skips material folders that lack a sidecar — there is no useful fallback for material metadata without one.
