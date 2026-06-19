# Import / Conversion / Export pipeline audit — 2026-06-19

Scope: the data in/out paths only — multi-format model import + in-browser conversion
(`src/furniture/convert/`, `src/furniture/upload/`), GLB optimize / LOD generation
(`src/furniture/optimize/`, `src/lib/ktx2encode.ts`), texture decode
(`src/materials/convert/`, `src/materials/upload/`), and all export formats
(`src/export/`, `src/furniture/convert/toGlb.ts`, `src/ui/openSceneExport.ts`,
`src/ui/viewInAr.ts`). Render/materials/state/layout/perf/mobile-a11y were covered by prior
audits and are not re-examined here.

Method: static read of every file in scope plus targeted cross-references of call order
(persist vs. validate, convert vs. size-cap). No dev server, no full suite. Where a claim
depended on runtime ordering it was confirmed by reading both the producer and the consumer.

Overall the pipelines are notably defensive: best-effort optimize/LOD that never drops an
asset, dedup-by-source-hash, decompression-bomb guards on the texture path, batched store
commits, RFC-4180 CSV / escaped HTML / escaped OOXML output, and finite-coordinate guards in
DXF. The findings below are real but mostly edge-case robustness/leak issues; the highest-impact
ones are ordering bugs that let a guard be bypassed and object-URL / GPU leaks on repeated use.

---

## Findings (ranked)

### IO-001 (HIGH) — Texture file-size cap is bypassed: full decode runs before `validateImageFile`
**File:** `src/materials/upload/persist.ts:38-40` (and `src/materials/convert/reencode.ts:31-35`)

`persistChannel` calls `normalizeTextureFile(file)` (which runs `decodeImage` → a *full* decode
+ WebP re-encode) **before** `validateImageFile(normalized)`. The only file-size guard,
`MAX_IMAGE_BYTES = 16 MB` (`src/materials/upload/validate.ts:38`), lives inside
`validateImageFile`, and the upload dialog (`src/ui/upload/UploadMaterialDialog.tsx`) does not
pre-check size. So an arbitrarily large source file (e.g. a 200 MB TIFF/TGA) is read into memory
in full (`file.arrayBuffer()` in `decodeImage`) and decoded before the 16 MB cap is ever
consulted.

**Failure scenario:** user picks a 150 MB TIFF as the albedo channel → `UTIF.decode` +
`toRGBA8` allocate the full pixel buffer, then `validateImageFile` finally rejects it for being
> 16 MB. The cap did nothing to prevent the allocation it exists to prevent.

**Mitigating factor:** `MAX_DECODE_DIM = 4096` (`decodeImage.ts:33`) does bound the *pixel*
allocation to ≤4096², and PNG/JPEG header-probe rejects dimension bombs early. So this is a
file-size-cap-bypass (large compressed input, large intermediate buffers) rather than an
unbounded pixel-allocation. Float formats (EXR/HDR) are the worst case: a 4096² EXR decodes to
4096·4096·4·4 ≈ 268 MB of floats inside `floatToRgba` before any size check.

**Cause:** validation ordered after normalization (deliberate for dimension-after-decode on
KTX2/DDS, but the *size* check should gate first).

**Fix direction:** check `file.size > MAX_IMAGE_BYTES` up front in `persistChannel` (or in
`normalizeTextureFile`) before decode; keep the post-normalize dimension check where it is.

**Test:** unit — call `persistChannel`/`persistUserMaterial` with a `File` whose `.size` is
> 16 MB (a sparse blob, bytes don't need to be real image data) and a spy/mock on `decodeImage`;
assert `decodeImage` was never invoked and the result is `{ ok: false }`.

---

### IO-002 (HIGH) — `convertModel` size cap is on the *source* file, not the converted GLB; output silently rejected after full convert+optimize, and the cap differs by 55 MB
**File:** `src/furniture/convert/convertModel.ts:39-44`; `src/furniture/upload/bulkImport.ts:89-97,190-206`; `src/furniture/upload/persist.ts:62-64`

A non-GLB entry (OBJ/FBX/STL/PLY/DAE/3DS/3MF/USDZ) is allowed up to
`MAX_BYTES_BY_FORMAT = 80 MB` (`formats.ts:49-60`). It is converted to GLB and optimized, then
handed to `persistUserGlb`, whose `validateGlbFile` enforces `MAX_GLB_BYTES = 25 MB`
(`validate.ts:11`, `persist.ts:63`). There is **no size check on the converted GLB before
persist**. A dense 60 MB OBJ that converts to a 40 MB GLB (above the 25 MB GLB ceiling even
after optimize) is fully read, converted via three loaders, exported via `GLTFExporter`, run
through the worker optimize + LOD pass, and *then* rejected with "File too large" — after paying
the entire conversion cost.

**Failure scenario:** import a folder of large CAD-exported OBJ/FBX models; each one that
converts above 25 MB burns full convert+optimize CPU/memory and lands in `skipped` with a size
error the user couldn't have predicted (their file was under the 80 MB they were told was the
limit).

**Cause:** two independent caps (`MAX_BYTES_BY_FORMAT` for source, `MAX_GLB_BYTES` for GLB) with
no reconciliation and no early check of the conversion result.

**Fix direction:** after `convertModel`/`runOptimize` produces the GLB, check its byte length
against the GLB ceiling *before* the optimize/LOD work (or at least produce a clear "converted
model exceeds 25 MB GLB limit" message); consider raising the GLB cap for converted assets or
making the source caps imply the GLB cap.

**Test:** unit on `bulkImport.prepareGlb` + `persistUserGlb` with a fixture GLB > 25 MB returned
by a mocked `convertModel`; assert the failure reason references the GLB limit, and (perf) that
the LOD/optimize pass is skipped for an over-limit result.

---

### IO-003 (MED) — Scene-export blob URL leaks when the download anchor click throws / never fires
**File:** `src/ui/openSceneExport.ts:10-20`; `src/ui/viewInAr.ts:38-47,52-59`

`downloadBlob` creates an object URL and schedules `URL.revokeObjectURL(url)` via
`setTimeout(..., 0)` *after* `a.click()`. If `a.click()` throws (or the surrounding try block
throws between `createObjectURL` and the `setTimeout`), the URL is never revoked. More concretely
in `viewInAr.ts`, the object URL is created inline (`:38`, `:52`) and only revoked in the
success path's `setTimeout`; an exception after `createObjectURL` but before the `setTimeout`
registration leaks the blob (and its GLB/USDZ bytes — potentially tens of MB) for the page
lifetime. The outer `catch` only toasts; it does not revoke.

**Failure scenario:** repeatedly exporting/AR-previewing a large furnished scene in a session,
with an occasional click/DOM exception, ratchets retained Blob memory upward.

**Cause:** revoke scheduled only on the happy path, not in a `finally`.

**Fix direction:** create the URL, wrap usage in `try { … } finally { schedule revoke }`, or
revoke in the function's outer `catch` too.

**Test:** unit with a fake `document.createElement` whose returned anchor's `click` throws;
assert `URL.revokeObjectURL` is still called (jsdom stubs both URL methods).

---

### IO-004 (MED) — `persistUserGlb` LOD blob URLs and the base `runtimeUrl` are created but never revoked on the failure path
**File:** `src/furniture/upload/persist.ts:104,121,126`

`runtimeUrl = URL.createObjectURL(blob)` (`:104`) and per-tier `lodUrls[tier] =
URL.createObjectURL(lodBlob)` (`:121`) are created during a successful persist. These are
intentionally long-lived (the def renders from them), and eviction is documented to go through
`evictGltfAsset`/`freeResource`. However:
- If an exception is thrown between `:104` and the `def` return (e.g. `addUserFurniture` throws
  synchronously), the already-created `runtimeUrl`/`lodUrls` are orphaned — there is no
  try/finally around the URL creation.
- The duplicate short-circuit at `:71` returns before any URL is created (good), but the LOD
  loop creates a blob URL per tier *before* `registerLodVariants`; a throw inside the loop after
  the first `createObjectURL` would leak the earlier tier URL (the per-tier `put` is in a
  try/catch, so this is narrow).

**Failure scenario:** any synchronous failure in `addUserFurniture` after URL creation orphans
1–3 blob URLs per affected upload.

**Cause:** object-URL creation not paired with cleanup on the error path (contrast the material
path `materials/upload/persist.ts:88-98`, which *does* roll back URLs + IDB on failure).

**Fix direction:** collect created URLs locally and revoke them in a `catch` before re-throwing;
only "hand off" ownership once the def is committed.

**Test:** unit forcing `addUserFurniture` to throw; assert created URLs are revoked.

---

### IO-005 (MED) — Converted/loaded three.js objects from the import path are never disposed
**File:** `src/furniture/convert/loadToObject.ts` (all loaders), `src/furniture/convert/convertModel.ts:54-55`, `src/furniture/convert/toGlb.ts`

`convertModel` does `const object = await loadToObject(format, pool)` then
`await exportGlb(object)` and returns the GLB bytes. The intermediate `THREE.Object3D` (with its
`BufferGeometry`, `Material`, and any decoded `Texture`/`DataTexture` for FBX/DAE/3DS/USDZ) is
**never disposed** — there is no `traverse(... geometry.dispose()/material.dispose())` anywhere
in `convert/` (confirmed by grep: zero `dispose`/`traverse` in the directory). The geometry
lives only in CPU memory (it isn't uploaded to the GPU because it's never added to a live
renderer), so the impact is CPU `ArrayBuffer` retention until GC, not VRAM. But textures parsed
by FBX/USDZ loaders can allocate sizeable typed arrays, and across a bulk import of thousands of
groups the un-disposed intermediates pressure the heap.

**Failure scenario:** a 3000-model bulk import converts each model to an Object3D, exports it,
and drops the reference without `.dispose()`; the geometries/materials are GC-eligible but the
churn is large and there is no deterministic release of the underlying buffers.

**Cause:** no cleanup of the intermediate scene graph after `exportGlb`.

**Fix direction:** after `exportGlb`, `object.traverse` and dispose geometries/materials/maps
(in a `finally`, alongside the existing `revoke(pool)`).

**Test:** unit with a fake Object3D tree whose meshes carry `dispose` spies; assert all are
called once after conversion (mirror `gltfRender`/eviction test style).

---

### IO-006 (MED) — `usdz`/`3mf` import is size-capped on the *compressed* zip, not the decompressed payload (zip-bomb)
**File:** `src/furniture/convert/convertModel.ts:39-44`, `formats.ts:59` (`usdz: 80`), `loadToObject.ts:94-97`

USDZ and 3MF are ZIP containers parsed by three's `USDZLoader` / `ThreeMFLoader`. The 80 MB cap
is on `entry.size` (the zip on disk). A maliciously or accidentally crafted container with highly
compressible internal USDA/XML/geometry could declare a tiny on-disk size yet expand to a far
larger in-memory parse. No post-decompression bound exists.

**Failure scenario:** a 5 MB `.usdz`/`.3mf` whose contents inflate to hundreds of MB OOMs the
tab during `loadAsync`.

**Cause:** size guard applied pre-decompression only; no inflated-size ceiling.

**Fix direction:** hard to bound perfectly without parsing the zip directory; at minimum document
the risk and consider a lower cap for zip-container formats, or wrap the loader in a
memory-watch / timeout. Lower priority than IO-001/002 because it requires a crafted input.

**Test:** hard to test headlessly without a crafted fixture; noted as a known gap.

---

### IO-007 (LOW) — `floatToRgba` assumes 4-channel RGBA stride and silently blackens non-finite HDR samples
**File:** `src/materials/convert/decodeImage.ts:151-162`

`floatToRgba` reads `src[s + c]` with `s = i * 4`, i.e. it hard-assumes a 4-channel interleaved
float buffer. `EXRLoader`/`RGBELoader` with `FloatType` generally produce RGBA, but an EXR with
RGB-only (3-channel) data or a different channel layout would be mis-strided, sampling the wrong
pixels (color smearing) rather than failing. `NaN`/`Infinity` float samples pass through
`Math.max(0, v)` (NaN→NaN→`Math.round(255 * NaN)`→NaN→stored as 0 by Uint8ClampedArray) so they
degrade to black silently rather than being flagged.

**Failure scenario:** import a 3-channel or NaN-containing EXR as a texture → garbled or
silently-blackened output, no error.

**Cause:** rigid stride assumption + no finite-guard.

**Fix direction:** read the loader's reported channel count / format and stride accordingly;
treat non-finite samples as 0 explicitly.

**Test:** unit on `floatToRgba` with a hand-built RGB-stride buffer and a NaN sample; assert
output dimensions/values.

---

### IO-008 (LOW) — `runOptimize` does not handle `messageerror`; a non-deserializable reply hangs the call (and a bulk-import pool slot) forever
**File:** `src/furniture/optimize/runOptimize.ts:53-75,104-110`

`ensureWorker` wires `onmessage` and `onerror` but not `onmessageerror` (structured-clone
deserialization failure on a reply fires `messageerror`, not `error`). If a reply can't be
deserialized, the corresponding `pending` resolver is never called and the `runOptimize` promise
hangs forever — and since it's awaited inside `prepareGlb` inside a bulk-import worker pool, one
hung job stalls a pool slot for the rest of the import. (The worker's own catch posts
`{ ok:false }`, which is handled correctly via `replyToResult` → `null`; the gap is only the
`messageerror`/never-replied case.)

**Failure scenario:** a reply buffer that fails structured clone (rare in practice) leaves
`runOptimize` pending indefinitely; a bulk import never completes.

**Cause:** no `onmessageerror` handler and no per-call timeout.

**Fix direction:** add `worker.onmessageerror` mirroring `onerror`; optionally a timeout that
resolves a stuck call to `null` (falls back to the un-optimized GLB, already the safe default).

**Test:** unit with a fake worker that emits `messageerror`; assert `runOptimize` resolves to the
fallback rather than hanging (bound the test with `Promise.race`).

---

### IO-009 (LOW) — Magic-byte detection misses ASCII-FBX / DAE / 3MF / USDZ; mis-extensioned files route to the wrong loader with an opaque error
**File:** `src/furniture/convert/formats.ts:73-90`

Magic-byte detection only covers GLB, binary-FBX, and PLY. ASCII FBX, DAE (XML), 3DS, 3MF (zip),
USDZ (zip), OBJ, and STL all fall through to extension-only detection (`byExt`). A file named
`model.obj` that is actually an FBX (or vice versa) is dispatched to the wrong three loader,
which then throws a low-level parse error surfaced as a generic
`Failed to convert <name>: <loader message>` (`convertModel.ts:63-65`). Acceptable degradation,
but the user-facing reason is opaque.

**Fix direction:** add cheap signatures where unambiguous (DAE/3MF/USDZ start with `<?xml`/`PK`;
ASCII FBX starts with `; FBX`); otherwise keep the extension fallback. Mostly a UX-clarity
improvement.

**Test:** unit feeding `detectModelFormat` a buffer with a mismatched extension + magic.

---

### IO-010 (LOW) — OBJ `mtllib` parsing takes only the first file of the first line; multi-MTL / spaced filenames lose materials
**File:** `src/furniture/convert/loadToObject.ts:62-73`

The OBJ path matches `^\s*mtllib\s+(.+)$` and uses only the first whitespace-token of the first
match (`split(/\s+/)[0]`). A valid OBJ may list multiple MTL files on one `mtllib` line
(`mtllib a.mtl b.mtl`) or have several `mtllib` lines; only the first file of the first line is
resolved, so materials in the others are dropped silently (the model converts but renders with
the default grey `MeshStandardMaterial`). MTL filenames containing spaces also break (rare).

**Failure scenario:** import an OBJ that splits materials across two `.mtl` files → half the
materials missing, no warning.

**Cause:** single-match, first-token MTL resolution.

**Fix direction:** match all `mtllib` lines, load each present sibling, merge their materials.

**Test:** integration with a two-`mtllib` OBJ fixture.

---

### IO-011 (LOW) — `boqToCsv` does not neutralize CSV/spreadsheet-formula injection from user-controlled names
**File:** `src/export/boq.ts:183-188,224-235`

`csvField` correctly RFC-4180-quotes fields containing `" , \r \n`, but a value beginning with
`=`, `+`, `-`, or `@` (e.g. a furniture name `=HYPERLINK("http://evil")`) is written verbatim;
Excel/Sheets interpret it as a formula on open (classic CSV injection). Names flow from
user-imported model display names, so an attacker-supplied model filename can carry a payload
into a BOQ a designer forwards to a client. The XLSX path (`boqXlsx.ts:33-38`) uses inline
strings (`t="inlineStr"`), which are *not* treated as formulas by Excel, so XLSX is safe; only
CSV is exposed.

**Failure scenario:** import a model named `=cmd|…`, export BOQ CSV, open in Excel → formula
executes / phishing link rendered.

**Cause:** no formula-injection neutralization for CSV (distinct from RFC-4180 quoting).

**Fix direction:** in `csvField`, prefix a leading `= + - @ \t \r` on string fields with `'`.

**Test:** unit asserting a name starting with `=` is neutralized in `boqToCsv` output but left
as a plain inline string in the XLSX cell.

---

## Checked + found sound

- **DXF export (`src/export/dxf.ts`).** All coordinates pass through `num()` (`:37`) which maps
  non-finite → `'0.000000'`; `wallPointAt` clamps `t∈[0,1]` and guards zero-length walls;
  `sanitizeText` strips CR/LF from labels; zero-length walls and <2-point room polygons are
  skipped; `entitiesSection` defensively coerces non-array `walls/rooms/openings` to `[]`. Empty
  plan produces a valid (entity-less) DXF. Robust.
- **`boqToHtml` (`boq.ts:278-337`).** Every interpolated value goes through `escapeHtml`/
  `escapeTemplateText` including descriptions, units, currency, plan name, and template notes;
  empty-section case renders a "No items." note. No unescaped sink found.
- **`boqToXlsx` (`boqXlsx.ts`).** XML-escapes all string cells (`xmlEsc` covers `& < > " '`),
  coerces non-finite numeric cells to 0 (`:35`), uses inline strings (no shared-strings desync),
  `columnLetter` handles the AA+ wrap. Valid 5-part single-sheet OOXML. Empty BOQ still yields
  header + grand-total rows.
- **`buildBoq` / money rounding (`boq.ts:92-181`).** `round2`/`roundLen`/`sgd` all finite-guard
  (non-finite → 0), `sgd` handles negatives and groups thousands correctly, empty input groups
  are omitted (no empty sections), totals sum rounded subtotals.
- **`buildExportRoot` (`sceneGltf.ts:104-113`).** `clone(true)` shares geometry/material refs
  with the live scene (three's Mesh.clone is reference-sharing), so the pruned clone needs **no**
  dispose and disposing it would corrupt the live scene — correctly *not* disposed. Helper/camera
  exclusion is both tag-based and type-based (belt-and-suspenders). Pure predicate is
  unit-testable. Sound.
- **Decompression-bomb guards on the native + TIFF/EXR/HDR/TGA *dimension* path
  (`decodeImage.ts`).** `readImageHeaderDims` rejects PNG/JPEG bombs before `createImageBitmap`;
  `assertDecodable` (≤4096², finite, >0) runs before/after every decode incl. TIFF IFD dims and
  TGA/EXR/HDR reported dims. The JPEG SOF scanner correctly skips standalone markers and
  length-bearing segments. (The *file-size* gap is IO-001; the *pixel-dimension* guard here is
  solid.)
- **`optimizeGlb` / `generateLodVariants` best-effort contract.** Every level is wrapped so a
  failure degrades gracefully (KTX2→WebP→original texture; simplify→textures-only→omit-tier;
  Draco optional; whole-optimize→input unchanged). LOD variants only kept when smaller than
  input. `getIO` memoizes the WebIO+Draco promise. Worker transfers buffers (no copies) and the
  main thread `slice()`s its input copy so the caller's buffer survives transfer. Robust.
- **Bulk-import batching + dedup (`bulkImport.ts`, `runImport.ts`).** Commits batched
  (`COMMIT_BATCH=25`) via `addManyUserFurniture` to avoid the documented O(n²) catalog-rebuild /
  WebGL-loss; per-batch `flush` + tail flush; bounded worker pools; per-file try/catch records
  failures in `skipped` without aborting; `seenHashes` closes the concurrent same-file dedup
  race; source-bytes hash (not optimized output) for stable dedup. Progress coalesced to ~1 store
  write/frame. Well-engineered.
- **`readDroppedItems` (`readDrop.ts`).** Entries captured synchronously before the first await
  (correct — DataTransfer detaches on yield); bounded `READ_CONCURRENCY` pool; `readEntries`
  drain loop handles the ~100-entry batch limit; falls back to `dt.files` when the entries API is
  absent; preserves `webkitRelativePath`. Sound.
- **`validateGlbFile` (`validate.ts`).** Size cap, GLB magic check, and `.gltf` external-URI
  rejection (only `data:` URIs allowed) are all correct and ordered before any heavy work for the
  *GLB* path. (IO-002 is about a different cap mismatch, not this function.)
- **`decodeGpuTexture.ts` (KTX2/DDS).** Uncompressed fast-paths avoid WebGL; renderer created in
  a `try/finally` that always `renderer.dispose()`s; render-target/material/geometry disposed in
  `readbackTexture`; zero-dim / empty-mipmap inputs throw friendly errors caught upstream into a
  toast. R8/RG8 channel expansion is correct. Minor nit: `loader.dispose()` is called on the
  happy paths but not in a `finally` — if `readbackTexture` throws, the `KTX2Loader` worker pool
  isn't disposed (the renderer still is); very low impact, not separately ranked.
- **`persistUserMaterial` rollback (`materials/upload/persist.ts:88-98`).** On a mid-upload
  failure it revokes object URLs and deletes already-written IDB records — correct partial-write
  cleanup (contrast IO-004 on the GLB path, which lacks this).
- **`exportGlb` / `exportSceneObj` / `exportSceneStl` / `exportSceneUsdz`.** Thin, dynamic-import
  wrappers; `exportGlb` correctly promisifies the callback exporter and rejects on error;
  `exportSceneUsdz` feature-detects `parseAsync` vs `parse`; `toGlb` rejects on empty output via
  `convertModel`'s `byteLength === 0` guard. No issues.

---

## Coverage gaps (tests worth adding)

- No test exercises convert→persist size-cap reconciliation (IO-002) or the texture
  size-before-decode ordering (IO-001).
- No test for object-URL revoke on the export/AR error path (IO-003) or the GLB persist error
  path (IO-004).
- `floatToRgba` (IO-007), the OBJ multi-`mtllib` path (IO-010), and CSV formula injection
  (IO-011) are untested.
- `convert/` has no disposal test (IO-005) and `runOptimize` has no `messageerror`/hang test
  (IO-008).
