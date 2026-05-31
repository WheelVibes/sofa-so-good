# IKEA product images → catalog thumbnails — design

## Problem

IKEA-imported furniture currently shows only a generic category icon on its
catalog card. Parametric items render an off-screen 3D thumbnail and `pack`
GLBs ship a baked JPEG, but `ikea`-source GLB defs fall through
`useBuiltinThumbnail` to a `<CategoryIcon>`. The scraper already records the
remote IKEA CDN image URLs (`main_image_url`, `contextual_image_url`) in
metadata, but never downloads the image files, so the group folder is not
self-contained for previews.

## Goal

Make the scraper download each variant's 2D product image at **original
resolution** so each group folder is self-contained (works offline, like the
GLBs), store a **downscaled** copy as a catalog thumbnail in IndexedDB on
import, and render that image as the IKEA catalog-card thumbnail (active variant
matched). The contextual (in-room) image is also downloaded for completeness;
the inspector keeps using the remote full-quality `mainImageUrl`.

## Decisions (from brainstorming)

- **Why download:** offline / self-contained group folders, consistent with the
  GLB handling.
- **App handling:** store the thumbnail blob in IDB (full round-trip through
  save/load + boot hydration), like GLB blobs.
- **Image scope:** download BOTH the main (white-bg hero) and contextual
  (in-room) image, **per variant**. Catalog card shows the active variant's
  hero.
- **Resolution:** scraper saves the **original** image (strip IKEA's resize
  query params). The **app** decides quality — it downscales **once at import**
  to a ~256 px thumbnail blob and stores only that in IDB. Full-res stays on
  disk in the group folder; the inspector uses the remote URL.

## Architecture & data flow

```
scraper (Python)                 group folder                 app import            IDB                catalog
─────────────────                ────────────                 ──────────            ───                ───────
main_image_url    ── download ─▶ <finish>-main.jpg    ─pick─▶ downscale 256px ─put─▶ texture rec ─URL─▶ <img> on card
context_image_url ── download ─▶ <finish>-context.jpg          (canvas)              role:ikea-image
                                 metadata.json:
                                   variants[].main_image
                                   variants[].context_image
```

## Components

### 1. Scraper — `python/scripts/ikea_model_scraper.py`

- New `download_image(client, url, group_dir, stem)` helper, mirroring
  `download_glb`:
  - Strip IKEA resize/query params from the URL so the **original** asset is
    fetched (IKEA serves the master when no `f=`/width param is present;
    requesting the bare path returns full size).
  - Derive extension from the URL path (default `.jpg`); filename
    `<stem>.<ext>`. Skip if the file already exists. Return the relative
    filename on success, else `None`.
- In `process_product_page` step 9, after the GLB is saved for the active
  variant, download:
  - `json_fields["main_image_url"]` → `<finish>-main.<ext>`
  - `json_fields["contextual_image_url"]` → `<finish>-context.<ext>`
- Add to `variant_entry`:
  - `"main_image": <filename | None>`
  - `"context_image": <filename | None>`
  (the existing remote `main_image_url` / `contextual_image_url` stay.)
- Emit `emit_progress({... "phase": "image_written"})` after a successful image
  download so the live-scrape UI can narrate it (non-load-bearing).

The live-scrape sidecar already serves the whole
`public/assets/ikea/<group>/` dir over HTTP, so the new image files are served
with no sidecar change.

### 2. Metadata schema — `furniture/ikea/metadata.ts`

Add to `VariantZ` (explicit even though `.passthrough()` tolerates them):

```ts
main_image: z.string().nullable().optional(),
context_image: z.string().nullable().optional(),
```

### 3. Import — `furniture/ikea/importGroup.ts`

For each variant whose `main_image` (or `context_image`) file is present in the
picked/fetched `files`:

- Decode the file to an `Image`/`createImageBitmap`, draw to a canvas scaled so
  the longest edge is ≤ 256 px, export `toBlob('image/webp'|'image/jpeg', 0.8)`.
- `IdbAssetStore.put` the downscaled blob as `kind: 'texture'`, `meta: { source:
  'ikea', groupKey, role: 'ikea-image' }`.
- Store `imageAssetId` on the `IkeaVariant` and set a `runtimeImageUrl` blob URL
  immediately (so the card shows it without a reload).
- Downscaling helper lives in a small `furniture/ikea/thumbnail.ts`
  (`downscaleImageFile(file, maxEdge): Promise<Blob>`), unit-testable.
- The contextual image is downloaded by the scraper but **not** stored in IDB in
  this change (the inspector uses the remote URL); recorded on disk + metadata
  for future use. (YAGNI — revisit if the inspector wants an offline in-room
  shot.)

Failure of the image step never fails the import — it is best-effort, wrapped so
a decode/IDB error just leaves `imageAssetId` null and the card falls back to the
category icon.

### 4. Types + round-trip — `furniture/types.ts`, `state/schema.ts`

- `IkeaVariant`: add
  - `imageAssetId?: string | null` (persisted)
  - `runtimeImageUrl?: string` (NOT persisted — rebuilt at hydration)
- `schema.ts` `IkeaVariantZ`: add `imageAssetId: z.string().nullable().optional()`;
  strip `runtimeImageUrl` in the serializer alongside `runtimeUrl`.

### 5. Hydration — `state/storage/hydrateAssets.ts`

- `resolveIkeaRuntimeUrls`: for each variant with an `imageAssetId`, fetch the
  record and set `runtimeImageUrl = URL.createObjectURL(rec.blob)`.
- `hydrateUserAssets`: skip texture records with `meta.role === 'ikea-image'` in
  the PBR-channel rebuild loop (they are not material channels). They are owned
  by the IKEA def and resolved via `resolveIkeaRuntimeUrls`.

### 6. Catalog card — `ui/catalog/thumbnails.tsx`

`useBuiltinThumbnail(def)`: if `def.kind === 'gltf' && def.source === 'ikea'`,
return the active variant's `runtimeImageUrl` when present:

```ts
const active = def.variants.find(v => v.finish === def.activeVariant);
if (active?.runtimeImageUrl) return active.runtimeImageUrl;
```

falling through to the existing logic (→ null → `<CategoryIcon>`) otherwise.
`CatalogCard.tsx` already renders `<img src={thumb}>` — no card change.

### 7. Live-scrape — `catalog/packs/ikeaLive.ts`

In `registerGroup`, after collecting GLB files, also fetch each variant's
`main_image` (and `context_image`) over HTTP and push them into the `File[]`
passed to `importGroup`, so the served-asset path and the Upload-dialog path
behave identically.

## Error handling

- Scraper image download mirrors `download_glb`: network/timeout errors are
  caught, logged, and yield `None`; the variant simply has no `main_image`.
- Import downscale/IDB errors are caught per-variant; the def still imports with
  a null `imageAssetId` and the card shows the category icon.
- Hydration guards a missing IDB record (returns the variant unchanged), same as
  the GLB path.

## Testing

- **Unit (Python):** `download_image` URL→filename/extension derivation and
  resize-param stripping (pure-ish; can factor the name logic into a helper to
  test without network).
- **Unit (TS):** `downscaleImageFile` returns a blob with longest edge ≤ 256
  (jsdom + a stub canvas, or skip-in-jsdom guard); `importGroup` sets
  `imageAssetId` + `runtimeImageUrl` when a main-image file is supplied;
  schema round-trip preserves `imageAssetId` and drops `runtimeImageUrl`.
- **Visual (required by CLAUDE.md):** run the app, import a scraped group (or
  inject an `IkeaGltfDef` with a `runtimeImageUrl` via `window.__store`),
  screenshot the catalog drawer, and confirm the IKEA card shows the product
  photo rather than the generic category icon. Report what the screenshot shows.

## Out of scope (YAGNI)

- KTX2 / multi-tier image LOD — one 256 px thumbnail is enough for an 80 px card.
- Storing the contextual image in IDB — downloaded + recorded only.
- Per-variant thumbnail switching animation — the card re-renders on
  `activeVariant` change for free.

## Docs

Update `CLAUDE.md` (IKEA scraper + IKEA model import sections) and `README.md`
to note the scraper downloads product images and the catalog shows them as
thumbnails.
