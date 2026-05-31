# IKEA Product-Image Catalog Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download each IKEA product's 2D image in the scraper and show it as the catalog-card thumbnail in the app (downscaled, stored in IDB, round-tripping through save/load).

**Architecture:** The Python scraper downloads each variant's original-resolution main + contextual image into the group folder and records the filenames in `metadata.json`. On import, the app downscales the main image once to a ~256 px blob, stores it in IndexedDB (`kind:'texture'`, `role:'ikea-image'`) keyed on a per-variant `imageAssetId`, and resolves a `runtimeImageUrl` at import + boot. The catalog card prefers the active variant's `runtimeImageUrl` over the generic category icon.

**Tech Stack:** Python (httpx, Playwright) for the scraper; TypeScript + React + Zustand + IndexedDB + Vitest for the app; pytest for the scraper.

---

## File Structure

- `python/scripts/ikea_model_scraper.py` — add `image_filename`/`download_image` + wire into `process_product_page`; add `main_image`/`context_image` to `variant_entry`.
- `python/scripts/test_image_download.py` (create) — unit tests for the filename/ext/param-strip helper.
- `src/furniture/ikea/metadata.ts` — add `main_image`/`context_image` to `VariantZ`.
- `src/furniture/ikea/thumbnail.ts` (create) — `downscaleImageFile(file, maxEdge)`.
- `src/furniture/ikea/importGroup.ts` — store downscaled main image in IDB, set `imageAssetId` + `runtimeImageUrl`.
- `src/furniture/types.ts` — add `imageAssetId` + `runtimeImageUrl` to `IkeaVariant`.
- `src/state/schema.ts` — round-trip `imageAssetId`, strip `runtimeImageUrl`.
- `src/state/storage/hydrateAssets.ts` — resolve `runtimeImageUrl`; skip `ikea-image` texture records in material rebuild.
- `src/ui/catalog/thumbnails.tsx` — return active variant's `runtimeImageUrl` for IKEA defs.
- `src/catalog/packs/ikeaLive.ts` — fetch image files over HTTP into the import `File[]`.
- `src/furniture/ikea/importGroup.test.ts`, `src/state/schema.test.ts` — extend.
- `src/furniture/ikea/thumbnail.test.ts` (create).
- `CLAUDE.md`, `README.md` — doc updates.

---

## Task 1: Scraper image-filename helper

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py`
- Test: `python/scripts/test_image_download.py` (create)

- [ ] **Step 1: Write the failing test**

Create `python/scripts/test_image_download.py`:

```python
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from ikea_model_scraper import image_filename


def test_strips_query_params_for_original():
    # IKEA serves a resized asset when ?f=/width params are present; we strip
    # them so the saved file is the original master.
    url = "https://www.ikea.com/images/malm-bed.jpg?f=s&w=300"
    assert image_filename(url, "black-brown-main") == "black-brown-main.jpg"


def test_derives_extension_from_path():
    url = "https://www.ikea.com/images/sofa.png"
    assert image_filename(url, "white-main") == "white-main.png"


def test_defaults_to_jpg_when_no_extension():
    url = "https://www.ikea.com/images/asset?id=123"
    assert image_filename(url, "grey-context") == "grey-context.jpg"


def test_sanitises_unsafe_stem_chars():
    url = "https://x/a.jpg"
    assert image_filename(url, "black/brown:main") == "blackbrownmain.jpg"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python/scripts && python -m pytest test_image_download.py -v`
Expected: FAIL — `ImportError: cannot import name 'image_filename'`

- [ ] **Step 3: Write minimal implementation**

In `python/scripts/ikea_model_scraper.py`, add near `download_glb` (after the `finish_slug` helper around line 838 is fine; place it just above `download_glb`):

```python
def image_filename(url, stem):
    """
    Derive a filesystem-safe image filename `<stem>.<ext>` for a product image
    URL. The extension is taken from the URL *path* (query params stripped, so
    the saved name reflects the original master asset, not a resized variant);
    defaults to '.jpg' when the path has no usable image extension.
    """
    path = (url or "").split("?", 1)[0].split("#", 1)[0]
    m = re.search(r'\.(jpg|jpeg|png|webp)$', path, re.I)
    ext = m.group(1).lower() if m else "jpg"
    clean_stem = re.sub(r'[\\/*?:"<>|]', "", (stem or "image").strip().split('\n')[0])
    return f"{clean_stem}.{ext}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python/scripts && python -m pytest test_image_download.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add python/scripts/test_image_download.py python/scripts/ikea_model_scraper.py
git commit -m "feat(ikea-scraper): image_filename helper (strips resize params)"
```

---

## Task 2: Scraper downloads images + records filenames

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py`

No new test (network download mirrors the untested `download_glb`; the pure
helper is covered in Task 1). This task wires the download into the flow.

- [ ] **Step 1: Add the `download_image` coroutine**

In `python/scripts/ikea_model_scraper.py`, immediately after `download_glb`
(ends ~line 924), add:

```python
async def download_image(client, url, product_dir, stem):
    """Download a product image at original resolution into product_dir as
    <stem>.<ext>. Strips resize query params so the master asset is fetched.
    Returns the relative filename on success, else None. Best-effort: any
    failure is logged and yields None (the variant simply has no image)."""
    if not url:
        return None
    if url.startswith("//"):
        url = f"https:{url}"
    elif url.startswith("/"):
        url = f"https://www.ikea.com{url}"
    fetch_url = url.split("?", 1)[0]  # original master, no resize params
    filename = image_filename(url, stem)
    filepath = os.path.join(product_dir, filename)
    if os.path.exists(filepath):
        return filename
    try:
        resp = await client.get(fetch_url, timeout=60.0)
        if resp.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(resp.content)
            print(f"[+] Saved product image: {filepath}")
            return filename
    except Exception as e:
        print(f"[-] Image download failed ({stem}): {e}")
    return None
```

- [ ] **Step 2: Download images in `process_product_page`**

In `process_product_page`, in the `if glb_filename:` block (after
`emit_progress({... "glb_written"})` at ~line 1160, before the
`description = ...` line), insert:

```python
                # Product images (original resolution) — self-contained group
                # folder. Catalog uses the main image; contextual kept for later.
                main_image = await download_image(
                    http_client, json_fields.get("main_image_url"),
                    group_dir, f"{glb_stem}-main")
                context_image = await download_image(
                    http_client, json_fields.get("contextual_image_url"),
                    group_dir, f"{glb_stem}-context")
                if main_image or context_image:
                    emit_progress({"group": group_key, "finish": active_finish,
                                   "phase": "image_written"})
```

- [ ] **Step 3: Record filenames on the variant entry**

In the `variant_entry = { ... }` dict (~line 1197), add after the existing
`"contextual_image_url": json_fields.get("contextual_image_url"),` line:

```python
                    "main_image": main_image,
                    "context_image": context_image,
```

- [ ] **Step 4: Smoke-check the module still imports + existing tests pass**

Run: `cd python/scripts && python -m pytest -v`
Expected: PASS (existing set-decomposition + image-download tests all green; no import errors)

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py
git commit -m "feat(ikea-scraper): download per-variant main + contextual product images"
```

---

## Task 3: Metadata schema accepts image filenames

**Files:**
- Modify: `src/furniture/ikea/metadata.ts`
- Test: `src/furniture/ikea/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikea/metadata.test.ts` (inside the existing top-level
`describe`, or add one). First check the file's existing structure with the
imports already present; add:

```ts
it('parses variant main_image / context_image filenames', () => {
  const r = parseMetadata({
    group_key: 'g', product_name: 'P',
    design: { category: 'beds', placement: 'floor' },
    variants: [{
      article_number: '1', finish: 'white', url: 'https://x/p/1', glb: 'white.glb',
      glb_materials: [], main_image: 'white-main.jpg', context_image: 'white-context.jpg',
    }],
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.data.variants[0].main_image).toBe('white-main.jpg');
  expect(r.data.variants[0].context_image).toBe('white-context.jpg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikea/metadata.test.ts -t "main_image"`
Expected: FAIL — `r.data.variants[0].main_image` is `undefined` (field stripped by zod since not in schema).

Note: zod `.passthrough()` is on `VariantZ`, so the field may actually survive. If the test unexpectedly PASSES at this step, that's acceptable — proceed to Step 3 to make the field explicit/typed anyway (the type is what the importer relies on).

- [ ] **Step 3: Add the fields to `VariantZ`**

In `src/furniture/ikea/metadata.ts`, in `VariantZ`, after the
`contextual_image_url: z.string().optional(),` line, add:

```ts
  main_image: z.string().nullable().optional(),
  context_image: z.string().nullable().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikea/metadata.test.ts -t "main_image"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/metadata.ts src/furniture/ikea/metadata.test.ts
git commit -m "feat(ikea): metadata schema accepts variant image filenames"
```

---

## Task 4: Image downscale helper

**Files:**
- Create: `src/furniture/ikea/thumbnail.ts`
- Test: `src/furniture/ikea/thumbnail.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/thumbnail.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fitDimensions } from './thumbnail';

describe('fitDimensions', () => {
  it('scales the longest edge down to maxEdge, preserving aspect', () => {
    expect(fitDimensions(1000, 500, 256)).toEqual({ w: 256, h: 128 });
    expect(fitDimensions(400, 800, 256)).toEqual({ w: 128, h: 256 });
  });
  it('never upscales a small image', () => {
    expect(fitDimensions(100, 80, 256)).toEqual({ w: 100, h: 80 });
  });
  it('handles a square image', () => {
    expect(fitDimensions(512, 512, 256)).toEqual({ w: 256, h: 256 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikea/thumbnail.test.ts`
Expected: FAIL — cannot import `fitDimensions`.

- [ ] **Step 3: Write the implementation**

Create `src/furniture/ikea/thumbnail.ts`:

```ts
/** Compute target dimensions so the longest edge is <= maxEdge, preserving
 *  aspect ratio. Never upscales. Pure — unit-tested without a canvas. */
export function fitDimensions(
  w: number,
  h: number,
  maxEdge: number,
): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w, h };
  const scale = maxEdge / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Downscale an image File to a thumbnail Blob whose longest edge is
 *  <= maxEdge (default 256). Decodes via createImageBitmap, draws to a
 *  canvas, and exports WebP (q=0.8). Resolves to the original file's blob
 *  if the browser image APIs are unavailable (e.g. jsdom) so callers can
 *  treat it as best-effort. */
export async function downscaleImageFile(
  file: File,
  maxEdge = 256,
): Promise<Blob> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.8),
  );
  return blob ?? file;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikea/thumbnail.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/thumbnail.ts src/furniture/ikea/thumbnail.test.ts
git commit -m "feat(ikea): image downscale helper for catalog thumbnails"
```

---

## Task 5: IkeaVariant carries image asset ids

**Files:**
- Modify: `src/furniture/types.ts`

- [ ] **Step 1: Add fields to `IkeaVariant`**

In `src/furniture/types.ts`, locate the `IkeaVariant` interface (the one with
`footprint?` + `glbMaterials` around line 303). After `glbMaterials: IkeaGlbMaterial[];`
add:

```ts
  /** Downscaled catalog-thumbnail blob in IDB (kind:'texture', role:'ikea-image').
   *  Null/absent when no product image was scraped for this finish. Persisted. */
  imageAssetId?: string | null;
  /** Runtime blob URL for the thumbnail; hydrated from imageAssetId, NOT persisted. */
  runtimeImageUrl?: string;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors — the fields are optional, no consumer breaks).

- [ ] **Step 3: Commit**

```bash
git add src/furniture/types.ts
git commit -m "feat(ikea): IkeaVariant carries image asset id + runtime url"
```

---

## Task 6: Import stores the downscaled thumbnail

**Files:**
- Modify: `src/furniture/ikea/importGroup.ts`
- Test: `src/furniture/ikea/importGroup.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/furniture/ikea/importGroup.test.ts`, add a `png` file helper near the
`glb` helper (after line 49):

```ts
function img(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/jpeg' });
}
```

Then add a test inside the `describe('importGroup', ...)` block:

```ts
it('stores a downscaled thumbnail for the active variant when an image file is supplied', async () => {
  const meta = JSON.parse(JSON.stringify(META));
  meta.variants[0].main_image = 'black-brown-main.jpg';
  const parsed = parseMetadata(meta);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const r = await importGroup(parsed.data, [glb('black-brown.glb'), img('black-brown-main.jpg')]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const active = r.def.variants.find((v) => v.finish === 'black-brown')!;
  expect(active.imageAssetId).toBeTruthy();
  expect(active.runtimeImageUrl).toBe('blob:x');
  // one GLB blob + one image blob
  expect(put).toHaveBeenCalledTimes(2);
});

it('imports fine when no image file is present (imageAssetId null)', async () => {
  const parsed = parseMetadata(META);
  if (!parsed.ok) return;
  const r = await importGroup(parsed.data, [glb('black-brown.glb')]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const active = r.def.variants.find((v) => v.finish === 'black-brown')!;
  expect(active.imageAssetId ?? null).toBeNull();
});
```

The `downscaleImageFile` helper short-circuits to the original file under jsdom
(no `createImageBitmap`/canvas), so the test exercises the IDB-store + assetId
path without needing real image decoding.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikea/importGroup.test.ts -t "downscaled thumbnail"`
Expected: FAIL — `active.imageAssetId` is `undefined`, `put` called once.

- [ ] **Step 3: Implement image storage in `importGroup`**

In `src/furniture/ikea/importGroup.ts`:

Add the import at the top (after the existing imports):

```ts
import { downscaleImageFile } from './thumbnail';
```

Inside the `for (const v of meta.variants)` loop, after the GLB-writing block
(after the closing `}` of `if (v.glb) { ... }`, before `variants.push({`),
insert:

```ts
    // Catalog thumbnail: downscale the scraped main image once and store the
    // small blob in IDB. Best-effort — any failure leaves imageAssetId null and
    // the card falls back to the category icon.
    let imageAssetId: string | null = null;
    let runtimeImageUrl: string | undefined;
    if (v.main_image) {
      const imgFile = fileByBasename(files, v.main_image);
      if (imgFile) {
        try {
          const thumb = await downscaleImageFile(imgFile, 256);
          imageAssetId = newId();
          await IdbAssetStore.put({
            assetId: imageAssetId, kind: 'texture', mime: thumb.type || 'image/webp',
            name: `${meta.product_name} — ${finishKey} thumb`,
            uploadedAt: new Date().toISOString(), blob: thumb,
            meta: { source: 'ikea', groupKey: meta.group_key, role: 'ikea-image' },
          });
          runtimeImageUrl = URL.createObjectURL(thumb);
        } catch {
          imageAssetId = null;
          runtimeImageUrl = undefined;
        }
      }
    }
```

Then add the two fields to the `variants.push({ ... })` object (after
`glbMaterials: matsFrom(v),`):

```ts
      imageAssetId,
      runtimeImageUrl,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikea/importGroup.test.ts`
Expected: PASS (all importGroup tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/importGroup.ts src/furniture/ikea/importGroup.test.ts
git commit -m "feat(ikea): store downscaled product image as catalog thumbnail on import"
```

---

## Task 7: Schema round-trips imageAssetId

**Files:**
- Modify: `src/state/schema.ts`
- Test: `src/state/schema.test.ts`

- [ ] **Step 1: Write the failing test**

First inspect `src/state/schema.test.ts` for an existing IKEA round-trip test to
mirror its setup. Add a test that builds a state with one IKEA def whose active
variant has `imageAssetId: 'img-1'` and `runtimeImageUrl: 'blob:y'`, serializes,
re-parses, and asserts:

```ts
it('round-trips IKEA variant imageAssetId and strips runtimeImageUrl', () => {
  // Build a minimal IkeaGltfDef-bearing state (mirror the existing IKEA
  // round-trip test's construction in this file).
  const def = {
    id: 'ikea-g', name: 'P', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'g', activeVariant: 'white',
    variants: [{
      finish: 'white', label: 'White', articleNumber: '1', url: 'https://x',
      assetId: 'a-1', glbMaterials: [], imageAssetId: 'img-1', runtimeImageUrl: 'blob:y',
    }],
    defaultFootprint: { w: 1, d: 1, h: 1 },
    uploadedAt: 'now', license: 'IKEA', attribution: 'IKEA',
  } as any;
  const serialized = serializeState({ ...baseState(), userFurniture: [def] } as any);
  const json = JSON.parse(JSON.stringify(serialized));
  const variant = json.userFurniture[0].variants[0];
  expect(variant.imageAssetId).toBe('img-1');
  expect(variant.runtimeImageUrl).toBeUndefined();
  // and it re-parses cleanly
  const parsed = parseSavedState(json);
  expect(parsed.ok ?? !!parsed).toBeTruthy();
});
```

Adapt `serializeState` / `parseSavedState` / `baseState` names to whatever the
existing test file imports and uses (read the file first).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/schema.test.ts -t "imageAssetId"`
Expected: FAIL — `variant.imageAssetId` is `undefined` (stripped: not in `IkeaVariantZ`, and the serializer maps a fixed field set).

- [ ] **Step 3: Add `imageAssetId` to the schema + serializer**

In `src/state/schema.ts`:

(a) In `IkeaVariantZ` (around line 53-80), after the `assetId: z.string().nullable(),`
line add:

```ts
  imageAssetId: z.string().nullable().optional(),
```

(b) In the serializer's variant map (around line 254:
`variants: d.variants.map(({ runtimeUrl, ...v }) => {`), also strip
`runtimeImageUrl`. Change the destructure to:

```ts
              variants: d.variants.map(({ runtimeUrl, runtimeImageUrl, ...v }) => {
```

(Read the body of that map to confirm it returns the rest spread `...v`; if it
explicitly lists fields, add `imageAssetId: v.imageAssetId` to the returned
object instead. The `IkeaVariantZ` schema must include `imageAssetId` either
way for re-parse.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/schema.test.ts`
Expected: PASS (all schema tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts
git commit -m "feat(ikea): round-trip variant imageAssetId, strip runtimeImageUrl"
```

---

## Task 8: Hydration resolves the thumbnail URL

**Files:**
- Modify: `src/state/storage/hydrateAssets.ts`

- [ ] **Step 1: Resolve `runtimeImageUrl` in `resolveIkeaRuntimeUrls`**

In `src/state/storage/hydrateAssets.ts`, in `resolveIkeaRuntimeUrls`, replace the
inner variant map (lines ~40-46) so it also resolves the image asset:

```ts
    const variants = await Promise.all(
      def.variants.map(async (v) => {
        let next = v;
        if (v.assetId) {
          const rec = await IdbAssetStore.get(v.assetId).catch(() => null);
          if (rec) next = { ...next, runtimeUrl: URL.createObjectURL(rec.blob) };
        }
        if (v.imageAssetId) {
          const imgRec = await IdbAssetStore.get(v.imageAssetId).catch(() => null);
          if (imgRec) next = { ...next, runtimeImageUrl: URL.createObjectURL(imgRec.blob) };
        }
        return next;
      }),
    );
```

- [ ] **Step 2: Skip `ikea-image` texture records in the material rebuild**

In `hydrateUserAssets`, in the `else if (m.kind === 'texture')` branch (line ~101),
add a guard at the top of the branch so IKEA thumbnail records aren't treated as
PBR material channels:

```ts
    } else if (m.kind === 'texture') {
      // IKEA catalog thumbnails share the texture kind but are owned by the
      // IKEA def (resolved via resolveIkeaRuntimeUrls), not a user material.
      if (m.meta?.['role'] === 'ikea-image') continue;
      const matId = m.meta?.['matId'];
```

- [ ] **Step 3: Typecheck + run the storage/asset tests**

Run: `npx tsc --noEmit && npx vitest run src/state`
Expected: PASS (typecheck clean; state tests green).

- [ ] **Step 4: Commit**

```bash
git add src/state/storage/hydrateAssets.ts
git commit -m "feat(ikea): hydrate variant thumbnail blob url on boot"
```

---

## Task 9: Catalog card shows the IKEA product image

**Files:**
- Modify: `src/ui/catalog/thumbnails.tsx`

- [ ] **Step 1: Prefer the active variant's thumbnail in `useBuiltinThumbnail`**

In `src/ui/catalog/thumbnails.tsx`, in `useBuiltinThumbnail` (around line 48),
add an IKEA branch before the existing `pack` branch (after the `rendered`
`useSyncExternalStore` call, before `if (def.kind === 'gltf' && def.source === 'pack' ...)`):

```ts
  if (def.kind === 'gltf' && def.source === 'ikea') {
    const active = def.variants.find((v) => v.finish === def.activeVariant);
    if (active?.runtimeImageUrl) return active.runtimeImageUrl;
  }
```

(This sits after the hooks so hook order stays stable.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/catalog/thumbnails.tsx
git commit -m "feat(ikea): show product image as catalog-card thumbnail"
```

---

## Task 10: Live-scrape fetches images into the import file set

**Files:**
- Modify: `src/catalog/packs/ikeaLive.ts`

- [ ] **Step 1: Fetch image files in `registerGroup`**

In `src/catalog/packs/ikeaLive.ts`, in `registerGroup`, extend the
`for (const v of meta.variants)` loop so it also fetches the image files (after
the GLB fetch block, still inside the loop):

```ts
    for (const name of [v.main_image, v.context_image]) {
      if (!name) continue;
      const imgRes = await fetch(`${baseUrl}/${name}`);
      if (!imgRes.ok) continue;
      const imgBlob = await imgRes.blob();
      files.push(new File([imgBlob], name, { type: imgBlob.type || 'image/jpeg' }));
    }
```

(Place this inside the existing `for (const v of meta.variants)` loop body; do
not gate it behind the `if (!v.glb) continue;` — a variant could in principle
have an image without a GLB, though `importGroup` only stores the image for
variants it keeps.)

Note: `importGroup` only reads `context_image` for nothing today (not stored),
but fetching it keeps the served `File[]` symmetric with the Upload dialog and
is cheap; `importGroup` ignores files it doesn't reference.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/packs/ikeaLive.ts
git commit -m "feat(ikea-live): fetch product images for self-contained import"
```

---

## Task 11: Full test + typecheck + build gate

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 2: Run the Python tests**

Run: `cd python/scripts && python -m pytest -v`
Expected: PASS.

- [ ] **Step 3: Build (tsc + Vite)**

Run: `npm run build`
Expected: PASS (no type errors, build succeeds).

- [ ] **Step 4: Commit (only if anything was fixed during the gate)**

```bash
git add -A && git commit -m "chore(ikea): fix-ups from full-suite gate" || echo "nothing to commit"
```

---

## Task 12: Visual verification (REQUIRED by CLAUDE.md)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — note the URL (http://localhost:5173).

- [ ] **Step 2: Inject an IKEA def with a thumbnail + open the catalog**

The store is exposed on `window.__store` in dev. Use an eval file with
`scripts/shot.mjs` that:
1. builds a tiny `IkeaGltfDef` whose active variant has a `runtimeImageUrl`
   pointing at a small data/blob URL (or import a real scraped group folder via
   the Upload dialog if one is available under `python/scripts/ikea_sg_3d_models/`),
2. adds it via `useStore.getState().setUserFurniture([...])` (or
   `replaceUserFurniture`),
3. opens the catalog drawer.

Capture: `node scripts/shot.mjs /tmp/ikea-thumb.png 1500 <evalFile> <actionsJson>`

- [ ] **Step 3: Visually review the screenshot**

Open `/tmp/ikea-thumb.png` and confirm:
- The IKEA catalog card shows the **product photo** in the 80 px thumbnail box,
  not the generic grey category icon.
- The image is `object-contain` (not stretched/cropped oddly).
- No console/render errors; other cards unaffected.

Report what the screenshot actually shows (per the visual-verification memory),
not merely that it was captured.

- [ ] **Step 4: If a real scraped group exists, prefer importing it**

If `python/scripts/ikea_sg_3d_models/<group>/` has a `metadata.json` with images
already downloaded (re-run the scraper on one product if not), import via the
Upload dialog and screenshot the catalog to verify the end-to-end path
(scraper → import → downscale → thumbnail).

---

## Task 13: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update CLAUDE.md**

In the **IKEA scraper (offline)** section, note that `ikea_model_scraper.py`
also downloads each variant's main + contextual product image (original
resolution) and records `main_image`/`context_image` filenames.

In the **IKEA model import** section, note that the importer downscales the
main image to a ~256 px thumbnail stored in IDB (`role:'ikea-image'`) and that
the catalog card uses it as the preview (falling back to the category icon).

- [ ] **Step 2: Update README.md**

Add a one-line note (scraper/feature list) that IKEA imports show real product
photos as catalog thumbnails.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: IKEA product-image catalog thumbnails"
```

---

## Self-Review Notes

- **Spec coverage:** scraper download (T1–T2), metadata schema (T3), downscale
  (T4), types (T5), import storage (T6), schema round-trip (T7), hydration
  (T8), catalog card (T9), live-scrape (T10), gate (T11), visual (T12), docs
  (T13). All spec sections mapped.
- **Type consistency:** `imageAssetId` / `runtimeImageUrl` names used
  identically across types.ts, importGroup.ts, schema.ts, hydrateAssets.ts,
  thumbnails.tsx; metadata field `main_image`/`context_image` consistent across
  scraper, metadata.ts, importGroup.ts, ikeaLive.ts.
- **Contextual image:** downloaded + recorded, deliberately not stored in IDB
  (matches spec Out-of-scope); inspector keeps remote `mainImageUrl`.
