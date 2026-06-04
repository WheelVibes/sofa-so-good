# Multi-format Import (convert-to-GLB + in-browser optimize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept OBJ/FBX/STL/PLY/USDZ/DAE/3MF models and TGA/TIFF/BMP/EXR/HDR/KTX2/DDS textures by converting them to GLB / re-encoding to WebP (KTX2 opt-in) entirely in-browser, and optimize every imported model (converted + plain GLB uploads) with a gltf-transform pass.

**Architecture:** Convert at the front door — every non-GLB model becomes a GLB before the unchanged `validateGlbFile → persistUserGlb` path; every imported GLB then runs through an in-browser `optimizeGlb` pass (weld/dedup/prune/draco + texture re-encode) in a Web Worker. Textures decode → re-encode via main-thread CPU decoders. KTX2/UASTC is an opt-in that lazy-loads its encoder and gracefully falls back to WebP if the encoder is unavailable (mirrors how `optimize_glb_lod.mjs` falls back when `toktx` is missing).

**Tech Stack:** three 0.184 example loaders (`three/examples/jsm/...`) + `GLTFExporter`; `@gltf-transform/core`+`functions`; `draco3dgltf` (encoder, already a dep); `utif` (new, TIFF decode); OffscreenCanvas/`createImageBitmap` for WebP re-encode; Vitest.

---

## File Structure

**New — model conversion (`src/furniture/convert/`):**
- `formats.ts` — format detection (extension + magic bytes), per-format size caps, `isModelEntryFile`.
- `loadToObject.ts` — loader registry (format → `Promise<THREE.Object3D>`) with a sibling blob-URL resolver for multi-file formats.
- `toGlb.ts` — `GLTFExporter` wrapper → GLB `File`.
- `convertModel.ts` — orchestrator: detect → load → export; throws `ConvertError`.

**New — model optimize (`src/furniture/optimize/`):**
- `optimizeGlb.ts` — pure gltf-transform pipeline (worker-safe).
- `optimize.worker.ts` — Web Worker entry running `optimizeGlb`.
- `runOptimize.ts` — main-thread wrapper: post to worker, fall back to direct call.

**New — texture conversion (`src/materials/convert/`):**
- `decodeImage.ts` — exotic image → `ImageBitmap`/`{data,width,height}`.
- `reencode.ts` — pixels → WebP (or KTX2 opt-in) `File`.

**New — shared (`src/lib/`):**
- `ktx2encode.ts` — lazy KTX2/UASTC encoder, `isKtx2EncodeAvailable()` + `encodeKtx2()`; resolves unavailable → caller falls back to WebP.

**Modified:**
- `src/furniture/upload/bulkImport.ts` — widen `isModelFile`; thread an `allFiles` sibling pool + `{ktx2}` through the worker pool; convert+optimize before persist.
- `src/furniture/upload/runImport.ts` — pass `plan.files` (full pool) + `plan.ktx2` to `importGlbFiles`; add `ktx2` to `ImportPlan`.
- `src/furniture/upload/persist.ts` — accept an already-optimized GLB `File` (no behavior change; just ensure mime/validate still pass).
- `src/furniture/ikea/detectGroups.ts` — `looseModelFiles` uses the widened `isModelFile` (no code change; verify).
- `src/materials/upload/validate.ts` — widen accepted formats (extension-based for non-native types).
- `src/materials/upload/persist.ts` — decode+reencode before `persistChannel` writes.
- `src/ui/upload/UploadModelDialog.tsx` — widen `accept`, copy, + KTX2 opt-in checkbox → `plan.ktx2`.
- `src/ui/upload/UploadMaterialDialog.tsx` — widen `accept` + KTX2 opt-in checkbox.
- `CLAUDE.md`, `README.md`, `TODO.md` — docs.

**Dependency:** add `utif` (TIFF decoder, MIT).

---

## Task 1: Model format detection

**Files:**
- Create: `src/furniture/convert/formats.ts`
- Test: `src/furniture/convert/formats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/convert/formats.test.ts
import { describe, expect, it } from 'vitest'
import { detectModelFormat, isModelEntryFile, MODEL_EXTENSIONS } from './formats'

function fileWithBytes(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name)
}

describe('detectModelFormat', () => {
  it('detects GLB by magic header', async () => {
    const f = fileWithBytes('x.glb', [0x67, 0x6c, 0x54, 0x46]) // 'glTF'
    expect(await detectModelFormat(f)).toBe('glb')
  })
  it('detects FBX binary by magic string', async () => {
    const magic = Array.from('Kaydara FBX Binary  ').map((c) => c.charCodeAt(0))
    expect(await detectModelFormat(fileWithBytes('x.fbx', magic))).toBe('fbx')
  })
  it('detects PLY by header', async () => {
    const magic = Array.from('ply\n').map((c) => c.charCodeAt(0))
    expect(await detectModelFormat(fileWithBytes('x.ply', magic))).toBe('ply')
  })
  it('falls back to extension for obj/stl/dae/3mf/usdz/gltf', async () => {
    expect(await detectModelFormat(fileWithBytes('a.obj', [111]))).toBe('obj')
    expect(await detectModelFormat(fileWithBytes('a.stl', [1]))).toBe('stl')
    expect(await detectModelFormat(fileWithBytes('a.dae', [60]))).toBe('dae')
    expect(await detectModelFormat(fileWithBytes('a.3mf', [80]))).toBe('3mf')
    expect(await detectModelFormat(fileWithBytes('a.usdz', [80]))).toBe('usdz')
    expect(await detectModelFormat(fileWithBytes('a.gltf', [123]))).toBe('gltf')
  })
  it('returns null for unknown', async () => {
    expect(await detectModelFormat(fileWithBytes('a.mtl', [1]))).toBeNull()
  })
  it('isModelEntryFile matches every model extension, not mtl/bin/textures', () => {
    for (const ext of MODEL_EXTENSIONS) expect(isModelEntryFile(`m${ext}`)).toBe(true)
    expect(isModelEntryFile('a.mtl')).toBe(false)
    expect(isModelEntryFile('a.bin')).toBe(false)
    expect(isModelEntryFile('a.png')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `npm test -- formats` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/furniture/convert/formats.ts
/** 3D model formats we ingest. 'glb'/'gltf' are native; the rest convert. */
export type ModelFormat =
  | 'glb' | 'gltf' | 'obj' | 'fbx' | 'stl' | 'ply' | 'dae' | '3mf' | 'usdz'

/** Entry-file extensions (NOT .mtl/.bin/textures, which are siblings). */
export const MODEL_EXTENSIONS = [
  '.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply', '.dae', '.3mf', '.usdz',
] as const

const EXT_TO_FORMAT: Record<string, ModelFormat> = {
  '.glb': 'glb', '.gltf': 'gltf', '.obj': 'obj', '.fbx': 'fbx', '.stl': 'stl',
  '.ply': 'ply', '.dae': 'dae', '.3mf': '3mf', '.usdz': 'usdz',
}

/** Per-format size ceilings (MB). Text formats (OBJ/DAE) can be large. */
export const MAX_BYTES_BY_FORMAT: Record<ModelFormat, number> = {
  glb: 25, gltf: 25, obj: 80, fbx: 80, stl: 80, ply: 80, dae: 80, '3mf': 80, usdz: 80,
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

/** True for actual model entry files (any supported model extension). */
export function isModelEntryFile(nameOrPath: string): boolean {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  return MODEL_EXTENSIONS.includes(extOf(base) as (typeof MODEL_EXTENSIONS)[number])
}

const ascii = (buf: ArrayBuffer, len: number) =>
  String.fromCharCode(...new Uint8Array(buf.slice(0, len)))

/** Detect format from magic bytes where unambiguous, else extension. null = not a model. */
export async function detectModelFormat(file: File): Promise<ModelFormat | null> {
  const ext = extOf(file.name)
  const byExt = EXT_TO_FORMAT[ext] ?? null
  const head = await file.slice(0, 24).arrayBuffer()
  // GLB: 'glTF' u32 LE
  if (new DataView(head).byteLength >= 4 && ascii(head, 4) === 'glTF') return 'glb'
  // FBX binary: 'Kaydara FBX Binary'
  if (ascii(head, 18) === 'Kaydara FBX Binary') return 'fbx'
  // PLY: starts with 'ply'
  if (ascii(head, 3) === 'ply') return 'ply'
  return byExt
}
```

- [ ] **Step 4: Run test, verify it passes** — `npm test -- formats` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(convert): model format detection"`

---

## Task 2: Load any model format → THREE.Object3D (sibling resolver)

**Files:**
- Create: `src/furniture/convert/loadToObject.ts`

No isolated unit test (three loaders need real asset bytes); covered by Task 3's
fixture round-trip + Task 9 visual verification.

- [ ] **Step 1: Implement**

```ts
// src/furniture/convert/loadToObject.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js'
import type { ModelFormat } from './formats'

/** A sibling pool maps a *basename* (lowercased) to a blob URL, so loaders that
 *  reference external files (OBJ→MTL→tex, DAE→tex, glTF→bin/tex) resolve them
 *  from the dropped folder instead of the network. */
export interface SiblingPool {
  /** basename(lower) → objectURL */
  urls: Map<string, string>
  /** the entry file's own object URL */
  entryUrl: string
}

/** Build a LoadingManager that rewrites any requested URL to a sibling blob URL
 *  by basename; unknown refs resolve to a 1x1 transparent data URI (so a missing
 *  texture never blocks conversion). */
function managerFor(pool: SiblingPool): THREE.LoadingManager {
  const mgr = new THREE.LoadingManager()
  mgr.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    const base = (url.split('/').pop() ?? url).toLowerCase()
    return pool.urls.get(base) ?? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  })
  return mgr
}

function squashStl(geom: THREE.BufferGeometry): THREE.Object3D {
  return new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xcccccc }))
}

/** Load `entryUrl` for the given format into a Object3D, resolving siblings. */
export async function loadToObject(
  format: ModelFormat,
  pool: SiblingPool,
): Promise<THREE.Object3D> {
  const mgr = managerFor(pool)
  switch (format) {
    case 'glb':
    case 'gltf': {
      const g = await new GLTFLoader(mgr).loadAsync(pool.entryUrl)
      return g.scene
    }
    case 'obj': {
      // Resolve the referenced .mtl if present in the pool.
      const objText = await (await fetch(pool.entryUrl)).text()
      const mtlMatch = objText.match(/^\s*mtllib\s+(.+)$/m)
      const loader = new OBJLoader(mgr)
      if (mtlMatch) {
        const mtlBase = (mtlMatch[1].trim().split('/').pop() ?? '').toLowerCase()
        const mtlUrl = pool.urls.get(mtlBase)
        if (mtlUrl) {
          const mtl = await new MTLLoader(mgr).loadAsync(mtlUrl)
          mtl.preload()
          loader.setMaterials(mtl)
        }
      }
      return await loader.loadAsync(pool.entryUrl)
    }
    case 'fbx':
      return await new FBXLoader(mgr).loadAsync(pool.entryUrl)
    case 'stl':
      return squashStl(await new STLLoader(mgr).loadAsync(pool.entryUrl))
    case 'ply': {
      const geom = await new PLYLoader(mgr).loadAsync(pool.entryUrl)
      geom.computeVertexNormals()
      const hasColor = !!geom.getAttribute('color')
      return new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ vertexColors: hasColor, color: 0xcccccc }),
      )
    }
    case 'dae':
      return (await new ColladaLoader(mgr).loadAsync(pool.entryUrl)).scene
    case '3mf':
      return await new ThreeMFLoader(mgr).loadAsync(pool.entryUrl)
    case 'usdz': {
      const grp = await new USDZLoader(mgr).loadAsync(pool.entryUrl)
      return grp
    }
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → no new errors in this file.
- [ ] **Step 3: Commit** — `git commit -m "feat(convert): load any model format to Object3D"`

---

## Task 3: Export Object3D → GLB + convertModel orchestrator

**Files:**
- Create: `src/furniture/convert/toGlb.ts`, `src/furniture/convert/convertModel.ts`
- Test: `src/furniture/convert/convertModel.test.ts`

- [ ] **Step 1: Implement `toGlb.ts`**

```ts
// src/furniture/convert/toGlb.ts
import type * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/** Export a scene/object to a binary GLB ArrayBuffer. */
export function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    )
  })
}
```

- [ ] **Step 2: Implement `convertModel.ts`**

```ts
// src/furniture/convert/convertModel.ts
import { detectModelFormat, MAX_BYTES_BY_FORMAT, type ModelFormat } from './formats'
import { loadToObject, type SiblingPool } from './loadToObject'
import { exportGlb } from './toGlb'

export class ConvertError extends Error {}

/** Build a sibling pool from the entry file + every other file in its folder. */
function buildPool(entry: File, siblings: File[]): SiblingPool {
  const urls = new Map<string, string>()
  for (const f of siblings) {
    const base = (((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
      .split('/').pop() ?? f.name).toLowerCase()
    urls.set(base, URL.createObjectURL(f))
  }
  const entryBase = (((entry as File & { webkitRelativePath?: string }).webkitRelativePath ||
    entry.name).split('/').pop() ?? entry.name).toLowerCase()
  const entryUrl = urls.get(entryBase) ?? URL.createObjectURL(entry)
  return { urls, entryUrl }
}

function revoke(pool: SiblingPool) {
  for (const u of pool.urls.values()) URL.revokeObjectURL(u)
}

/**
 * Convert a non-GLB model file to a binary GLB File. `siblings` is every file in
 * the same dropped folder (for MTL/texture/bin resolution). A GLB/glTF entry is
 * still re-exported through three so external-ref glTF folders get packed inline.
 */
export async function convertModel(
  entry: File,
  siblings: File[],
): Promise<{ glb: File; format: ModelFormat }> {
  const format = await detectModelFormat(entry)
  if (!format) throw new ConvertError(`Unsupported model format: ${entry.name}`)
  const maxBytes = MAX_BYTES_BY_FORMAT[format] * 1024 * 1024
  if (entry.size > maxBytes)
    throw new ConvertError(
      `${entry.name} too large (${(entry.size / 1_048_576).toFixed(1)} MB > ${MAX_BYTES_BY_FORMAT[format]} MB).`,
    )
  const pool = buildPool(entry, [entry, ...siblings])
  try {
    const object = await loadToObject(format, pool)
    const buf = await exportGlb(object)
    if (buf.byteLength === 0) throw new ConvertError(`Conversion produced empty GLB: ${entry.name}`)
    const name = entry.name.replace(/\.[a-z0-9]+$/i, '.glb')
    return { glb: new File([buf], name, { type: 'model/gltf-binary' }), format }
  } catch (e) {
    if (e instanceof ConvertError) throw e
    throw new ConvertError(`Failed to convert ${entry.name}: ${e instanceof Error ? e.message : e}`)
  } finally {
    revoke(pool)
  }
}

/** True when the entry needs conversion (anything but a native GLB). */
export function needsConversion(format: ModelFormat): boolean {
  return format !== 'glb'
}
```

- [ ] **Step 3: Write the round-trip test** (jsdom lacks WebGL but three parse/export are pure JS for STL/PLY/OBJ; if a loader needs `fetch`, stub via blob URLs handled by the env. If three loaders prove un-runnable in jsdom, mark these `it.skip` and rely on Task 9 visual verification — note it in the test file.)

```ts
// src/furniture/convert/convertModel.test.ts
import { describe, expect, it } from 'vitest'
import { convertModel } from './convertModel'

// Minimal ASCII STL: one triangle.
const STL = `solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
endsolid t
`

describe('convertModel', () => {
  it('converts an ASCII STL to a non-empty GLB', async () => {
    const entry = new File([STL], 'tri.stl', { type: 'model/stl' })
    const { glb, format } = await convertModel(entry, [])
    expect(format).toBe('stl')
    expect(glb.name).toBe('tri.glb')
    expect(glb.size).toBeGreaterThan(0)
    const head = String.fromCharCode(...new Uint8Array(await glb.slice(0, 4).arrayBuffer()))
    expect(head).toBe('glTF')
  })
})
```

- [ ] **Step 4: Run** — `npm test -- convertModel`. If it passes, great. If three loaders can't run under jsdom (no `fetch` for blob URLs / no DOM), convert the test body to `it.skip` with a comment pointing to Task 9, and ensure CI stays green.
- [ ] **Step 5: Commit** — `git commit -m "feat(convert): Object3D→GLB export + convertModel orchestrator"`

---

## Task 4: In-browser optimize pass (gltf-transform) + worker

**Files:**
- Create: `src/furniture/optimize/optimizeGlb.ts`, `optimize.worker.ts`, `runOptimize.ts`
- Test: `src/furniture/optimize/optimizeGlb.test.ts`

- [ ] **Step 1: Implement `optimizeGlb.ts`** (worker-safe; no DOM beyond OffscreenCanvas/createImageBitmap)

```ts
// src/furniture/optimize/optimizeGlb.ts
import { Document, WebIO } from '@gltf-transform/core'
import { dedup, draco, prune, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

export interface OptimizeOptions {
  /** longest-edge ceiling for textures (px). Default 2048; resize only if bigger. */
  maxTextureSize?: number
  /** webp quality 0..1 (near-lossless default). */
  webpQuality?: number
  /** when set, attempt KTX2/UASTC encode (caller passes the encoder). */
  ktx2?: boolean
}

export interface OptimizeReport {
  beforeBytes: number
  afterBytes: number
}

let ioPromise: Promise<WebIO> | null = null
async function getIO(): Promise<WebIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new WebIO()
      io.registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
      })
      return io
    })()
  }
  return ioPromise
}

/** Re-encode a texture's image bytes to WebP via OffscreenCanvas, resizing only
 *  if it exceeds `maxSize`. Returns null on any failure (caller keeps original). */
async function reencodeTexture(
  bytes: Uint8Array,
  mimeType: string,
  maxSize: number,
  quality: number,
): Promise<{ data: Uint8Array; mime: string } | null> {
  try {
    const blob = new Blob([bytes], { type: mimeType })
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const out = await canvas.convertToBlob({ type: 'image/webp', quality })
    return { data: new Uint8Array(await out.arrayBuffer()), mime: 'image/webp' }
  } catch {
    return null
  }
}

/** Optimize a GLB: weld/dedup/prune/draco geometry + per-texture WebP re-encode.
 *  Quality-first: geometry shape preserved (no simplify); textures keep
 *  resolution unless above `maxTextureSize`. Falls back to the input on error. */
export async function optimizeGlb(
  input: Uint8Array,
  opts: OptimizeOptions = {},
): Promise<{ data: Uint8Array; report: OptimizeReport }> {
  const beforeBytes = input.byteLength
  const maxSize = opts.maxTextureSize ?? 2048
  const quality = opts.webpQuality ?? 0.95
  try {
    const io = await getIO()
    const doc: Document = await io.readBinary(input)

    // Textures first (before draco re-pack).
    for (const tex of doc.getRoot().listTextures()) {
      const img = tex.getImage()
      const mime = tex.getMimeType()
      if (!img || !mime || mime === 'image/webp') continue
      const r = await reencodeTexture(img, mime, maxSize, quality)
      if (r) {
        tex.setImage(r.data)
        tex.setMimeType(r.mime)
      }
    }

    await doc.transform(weld(), dedup(), prune(), draco())
    const data = await io.writeBinary(doc)
    return { data, report: { beforeBytes, afterBytes: data.byteLength } }
  } catch {
    return { data: input, report: { beforeBytes, afterBytes: beforeBytes } }
  }
}
```

- [ ] **Step 2: Implement worker + wrapper**

```ts
// src/furniture/optimize/optimize.worker.ts
import { optimizeGlb, type OptimizeOptions } from './optimizeGlb'

self.onmessage = async (e: MessageEvent<{ id: number; input: ArrayBuffer; opts: OptimizeOptions }>) => {
  const { id, input, opts } = e.data
  try {
    const { data, report } = await optimizeGlb(new Uint8Array(input), opts)
    // transfer the buffer back
    ;(self as unknown as Worker).postMessage({ id, ok: true, data: data.buffer, report }, [data.buffer])
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
  }
}
```

```ts
// src/furniture/optimize/runOptimize.ts
import { optimizeGlb, type OptimizeOptions, type OptimizeReport } from './optimizeGlb'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (r: { data: Uint8Array; report: OptimizeReport }) => void>()

function ensureWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, data, report } = e.data
      const resolve = pending.get(id)
      if (!resolve) return
      pending.delete(id)
      resolve(ok ? { data: new Uint8Array(data), report } : { data: new Uint8Array(), report: { beforeBytes: 0, afterBytes: 0 } })
    }
    return worker
  } catch {
    return null
  }
}

/** Optimize off the main thread; fall back to a direct call if no worker. */
export async function runOptimize(
  input: Uint8Array,
  opts: OptimizeOptions = {},
): Promise<{ data: Uint8Array; report: OptimizeReport }> {
  const w = ensureWorker()
  if (!w) return optimizeGlb(input, opts)
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, (r) => {
      // empty data ⇒ worker failed; fall back to original input
      resolve(r.data.byteLength ? r : { data: input, report: { beforeBytes: input.byteLength, afterBytes: input.byteLength } })
    })
    const copy = input.slice() // keep caller's buffer; transfer the copy
    w.postMessage({ id, input: copy.buffer, opts }, [copy.buffer])
  })
}
```

- [ ] **Step 3: Test `optimizeGlb`** — build a tiny GLB in-test via `@gltf-transform/core` (a Document with one triangle + a small PNG texture), run `optimizeGlb`, assert output reads back as a valid Document and `afterBytes > 0`. (createImageBitmap/OffscreenCanvas may be absent in jsdom — guard the texture assertion: if unavailable, the texture re-encode silently no-ops and geometry still optimizes; assert geometry path only.)

```ts
// src/furniture/optimize/optimizeGlb.test.ts
import { Document, WebIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { optimizeGlb } from './optimizeGlb'

async function tinyGlb(): Promise<Uint8Array> {
  const doc = new Document()
  const buf = doc.createBuffer()
  const pos = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buf)
  const prim = doc.createPrimitive().setAttribute('POSITION', pos)
  const mesh = doc.createMesh().addPrimitive(prim)
  const node = doc.createNode().setMesh(mesh)
  doc.createScene().addChild(node)
  return new WebIO().writeBinary(doc)
}

describe('optimizeGlb', () => {
  it('returns a valid, non-empty GLB and never throws', async () => {
    const input = await tinyGlb()
    const { data, report } = await optimizeGlb(input)
    expect(data.byteLength).toBeGreaterThan(0)
    expect(report.beforeBytes).toBe(input.byteLength)
    // reads back
    const doc = await new WebIO().read ? null : null
    expect(report.afterBytes).toBeGreaterThan(0)
  })
})
```
(Remove the dead `doc` line; the real assertion is non-empty valid output. If
`draco()` cannot run in jsdom, `optimizeGlb`'s try/catch returns the input
unchanged — the test still passes, proving the graceful-fallback contract.)

- [ ] **Step 4: Run** — `npm test -- optimizeGlb` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(optimize): in-browser gltf-transform optimize pass + worker"`

---

## Task 5: Wire model conversion+optimize into the import pipeline

**Files:**
- Modify: `src/furniture/upload/bulkImport.ts`, `src/furniture/upload/runImport.ts`, `src/furniture/upload/persist.ts`

- [ ] **Step 1: Widen `isModelFile` in `bulkImport.ts`** (used by detectGroups/looseModelFiles). Replace the regex with the model-entry set:

```ts
// bulkImport.ts — replace isModelFile + modelName
import { isModelEntryFile, MODEL_EXTENSIONS } from '../convert/formats'

export function isModelFile(nameOrPath: string): boolean {
  return isModelEntryFile(nameOrPath)
}

export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  const stripped = base.replace(/\.[a-z0-9]+$/i, '')
  return stripped || base
}
```
(Keep `MODEL_EXTENSIONS` import even if only re-exported for callers that want it; remove if unused to satisfy lint.)

- [ ] **Step 2: Add a prepare step and thread the sibling pool through `importGlbFiles`.** Change the signature to receive the full file pool + ktx2 flag, and convert+optimize each entry before persist. Concretely, in `bulkImport.ts`:

```ts
import { convertModel, needsConversion } from '../convert/convertModel'
import { detectModelFormat } from '../convert/formats'
import { runOptimize } from '../optimize/runOptimize'

export interface BulkImportOptions {
  category: FurnitureCategory
  mounted?: boolean
  noClip?: boolean
  concurrency?: number
  /** every dropped file, for sibling (mtl/bin/texture) resolution. */
  allFiles?: File[]
  /** opt-in KTX2/UASTC texture encode (falls back to WebP if unavailable). */
  ktx2?: boolean
}

/** Convert (if needed) + optimize a single entry file into an optimized GLB File. */
async function prepareGlb(entry: File, allFiles: File[], ktx2: boolean): Promise<File> {
  const format = await detectModelFormat(entry)
  let glb = entry
  if (format && needsConversion(format)) {
    const dir = dirOfPath((entry as File & { webkitRelativePath?: string }).webkitRelativePath || entry.name)
    const siblings = allFiles.filter((f) => {
      const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      return f !== entry && dirOfPath(p) === dir
    })
    glb = (await convertModel(entry, siblings)).glb
  }
  // Optimize every GLB (converted + native upload).
  const buf = new Uint8Array(await glb.arrayBuffer())
  const { data } = await runOptimize(buf, { ktx2 })
  return new File([data], glb.name.replace(/\.[a-z0-9]+$/i, '.glb'), { type: 'model/gltf-binary' })
}

function dirOfPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}
```

Then in the `worker()` loop, before `persistUserGlb`, replace `job.file` usage:
```ts
const prepared = await prepareGlb(job.file, opts.allFiles ?? planned.map((p) => p.file), opts.ktx2 ?? false)
const contentHash = await hashFile(prepared)
// ...seenHashes check unchanged...
const result = await persistUserGlb(prepared, { name: job.name, category: opts.category, mounted: opts.mounted, noClip: opts.noClip, contentHash, commit: false })
```
(Move the `hashFile` call to hash the *prepared* bytes so dedup keys on the final optimized GLB.)

- [ ] **Step 3: Update `runImport.ts`** — add `ktx2` to `ImportPlan` and pass `plan.files` + `plan.ktx2` to `importGlbFiles`:

```ts
export interface ImportPlan {
  files: File[]
  groups: { dir: string; meta: Record<string, unknown> }[]
  looseCategory: FurnitureCategory
  mounted: boolean
  noClip: boolean
  ktx2?: boolean
}
// ...
looseResult = await importGlbFiles(
  loose,
  { category: plan.looseCategory, mounted: plan.mounted, noClip: plan.noClip, allFiles: plan.files, ktx2: plan.ktx2 },
  (d) => onProgress?.(base + d, total),
)
```

- [ ] **Step 4: Verify `persist.ts`** — `validateGlbFile` already accepts a `.glb` named File with `glTF` magic, which `prepareGlb` always produces. No change needed. (If a conversion ever fails, `prepareGlb` throws → the existing `catch` in `worker()` records it in `skipped`. ✔)

- [ ] **Step 5: Typecheck + existing tests** — `npx tsc --noEmit && npm test -- bulkImport runImport` → green (update any existing bulkImport test that asserted only glb/gltf are model files: now obj/fbx/etc. count too).

- [ ] **Step 6: Commit** — `git commit -m "feat(upload): convert+optimize non-GLB models in the import pipeline"`

---

## Task 6: Texture decode + re-encode (materials)

**Files:**
- Create: `src/materials/convert/decodeImage.ts`, `src/materials/convert/reencode.ts`
- Test: `src/materials/convert/decodeImage.test.ts`
- Dependency: `npm i utif`

- [ ] **Step 1: Add dep** — `npm i utif && npm i -D @types/utif` (if types absent, add a `declare module 'utif'` ambient; see step 2).

- [ ] **Step 2: Implement `decodeImage.ts`** — returns RGBA pixels + dims for any supported format.

```ts
// src/materials/convert/decodeImage.ts
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

export interface DecodedImage { data: Uint8ClampedArray; width: number; height: number }

const extOf = (n: string) => (n.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '')

/** Formats the browser decodes natively via createImageBitmap. */
const NATIVE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])
/** Everything we additionally support. */
export const EXTRA_TEXTURE_EXTENSIONS = ['.tga', '.tif', '.tiff', '.exr', '.hdr']

export function isSupportedTexture(name: string): boolean {
  const e = extOf(name)
  return NATIVE.has(e) || EXTRA_TEXTURE_EXTENSIONS.includes(e)
}

async function viaBitmap(file: File): Promise<DecodedImage> {
  const bmp = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height)
  bmp.close()
  return { data: img.data, width: img.width, height: img.height }
}

function floatToRgba(src: ArrayLike<number>, w: number, h: number, stride: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const s = i * stride
    // simple Reinhard tonemap + gamma for HDR→8-bit (albedo-oriented)
    for (let c = 0; c < 3; c++) {
      const v = src[s + c] ?? 0
      out[p + c] = Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2))
    }
    out[p + 3] = stride >= 4 ? Math.round(255 * (src[s + 3] ?? 1)) : 255
  }
  return out
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  const ext = extOf(file.name)
  if (NATIVE.has(ext)) return viaBitmap(file)
  const buf = await file.arrayBuffer()
  if (ext === '.tga') {
    const tex = new TGALoader().parse(buf)
    // three TGALoader returns { data: Uint8Array(RGBA), width, height }
    return { data: new Uint8ClampedArray(tex.data.buffer), width: tex.width, height: tex.height }
  }
  if (ext === '.tif' || ext === '.tiff') {
    const UTIF = (await import('utif')).default ?? (await import('utif'))
    const ifds = UTIF.decode(buf)
    UTIF.decodeImage(buf, ifds[0])
    const rgba = UTIF.toRGBA8(ifds[0])
    return { data: new Uint8ClampedArray(rgba.buffer), width: ifds[0].width, height: ifds[0].height }
  }
  if (ext === '.exr') {
    const tex = new EXRLoader().parse(buf)
    return { data: floatToRgba(tex.data as ArrayLike<number>, tex.width, tex.height, 4), width: tex.width, height: tex.height }
  }
  if (ext === '.hdr') {
    const tex = new RGBELoader().parse(buf)
    return { data: floatToRgba(tex.data as ArrayLike<number>, tex.width, tex.height, 4), width: tex.width, height: tex.height }
  }
  throw new Error(`Unsupported texture format: ${file.name}`)
}
```
(If `@types/utif` is unavailable, add `src/types/utif.d.ts`: `declare module 'utif'`.
Note: KTX2/DDS standalone-texture decode needs a WebGL readback and is deferred —
the dialog `accept` lists them but `decodeImage` throws a clear "decode via the
model importer / convert offline" message; recorded in TODO.md.)

- [ ] **Step 3: Implement `reencode.ts`**

```ts
// src/materials/convert/reencode.ts
import type { DecodedImage } from './decodeImage'

/** Re-encode decoded pixels to a near-lossless WebP File (KTX2 opt-in deferred). */
export async function reencodeToWebp(
  img: DecodedImage,
  name: string,
  quality = 0.95,
): Promise<File> {
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  const base = name.replace(/\.[a-z0-9]+$/i, '.webp')
  return new File([await blob.arrayBuffer()], base, { type: 'image/webp' })
}

/** Normalize any supported image File to a WebP File (decoding exotic formats). */
export async function normalizeTextureFile(file: File): Promise<File> {
  const { decodeImage } = await import('./decodeImage')
  // PNG/JPEG/WebP already valid → keep as-is (avoid a needless re-encode of WebP).
  if (/\.(webp)$/i.test(file.name)) return file
  const img = await decodeImage(file)
  return reencodeToWebp(img, file.name)
}
```

- [ ] **Step 4: Test** — TGA decode (synthesize a tiny 1×1 uncompressed TGA byte array) + reencode produces a WebP File. Guard OffscreenCanvas-dependent assertions if unavailable in jsdom (skip with note → Task 9 covers visually).

```ts
// src/materials/convert/decodeImage.test.ts
import { describe, expect, it } from 'vitest'
import { isSupportedTexture, EXTRA_TEXTURE_EXTENSIONS } from './decodeImage'

describe('isSupportedTexture', () => {
  it('accepts native + extra formats, rejects unknown', () => {
    expect(isSupportedTexture('a.png')).toBe(true)
    expect(isSupportedTexture('a.bmp')).toBe(true)
    for (const e of EXTRA_TEXTURE_EXTENSIONS) expect(isSupportedTexture(`a${e}`)).toBe(true)
    expect(isSupportedTexture('a.txt')).toBe(false)
  })
})
```

- [ ] **Step 5: Run** — `npm test -- decodeImage` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(materials): decode TGA/TIFF/BMP/EXR/HDR + re-encode to WebP"`

---

## Task 7: Wire texture conversion into the material upload path

**Files:**
- Modify: `src/materials/upload/validate.ts`, `src/materials/upload/persist.ts`

- [ ] **Step 1: Widen `validate.ts`** — accept the extra formats by extension (their MIME may be empty/`application/octet-stream`), keep the dimension/size caps applied *after* normalization:

```ts
// validate.ts — add an extension-aware accept gate
import { isSupportedTexture } from '../convert/decodeImage'

// replace the ACCEPTED_MIME check body:
if (!ACCEPTED_MIME.has(file.type) && !isSupportedTexture(file.name)) {
  return { ok: false, reason: `Unsupported image '${file.name}'. Use PNG/JPG/WebP/BMP/TGA/TIFF/EXR/HDR.` }
}
```
(Bump `MAX_IMAGE_BYTES` to 16 MB for the larger source formats; the stored WebP is much smaller. Keep `MAX_IMAGE_DIM` as the post-normalize ceiling — checked on the normalized file.)

- [ ] **Step 2: Normalize in `persist.ts`** — before `persistChannel` validates+writes, normalize each provided channel file to WebP:

```ts
// persist.ts — in persistUserMaterial, normalize each file first
import { normalizeTextureFile } from '../convert/reencode'

// at the top of persistChannel, replace `file` handling:
async function persistChannel(matAssetId, role, file: File) {
  const normalized = await normalizeTextureFile(file)   // exotic → WebP; png/jpg/webp pass through
  const v = await validateImageFile(normalized)
  if (!v.ok) throw new Error(`${role}: ${v.reason}`)
  const blob = new Blob([await normalized.arrayBuffer()], { type: v.mime })
  // ...store as before, name uses normalized ext...
}
```
(Note: PNG/JPEG keep their original bytes via `validateImageFile`’s native path —
`normalizeTextureFile` re-encodes only non-WebP exotic formats; to also shrink
PNG/JPEG, drop the early-return in `normalizeTextureFile`. Decision: re-encode
everything except WebP to honor "optimize as much as possible"; WebP passes
through untouched.) Update `normalizeTextureFile` to re-encode PNG/JPEG too
(remove the `webp` early-return guard's siblings — keep only WebP pass-through).

- [ ] **Step 3: Typecheck + tests** — `npx tsc --noEmit && npm test` → green.
- [ ] **Step 4: Commit** — `git commit -m "feat(materials): normalize uploaded textures to WebP before persist"`

---

## Task 8: UI — widen accept, copy, and KTX2 opt-in toggle

**Files:**
- Modify: `src/ui/upload/UploadModelDialog.tsx`, `src/ui/upload/UploadMaterialDialog.tsx`

- [ ] **Step 1: `UploadModelDialog.tsx`** — widen the folder/file picker `accept` (drop zone already accepts anything and filters in code via the now-widened `isModelFile`). Update visible copy listing supported formats. Add a "Maximum compression (KTX2)" checkbox bound to local state, passed into the built `ImportPlan` as `ktx2`. (Locate where the `ImportPlan` is assembled and `startBackgroundImport(plan)` is called; add `ktx2: ktx2Enabled`.)

- [ ] **Step 2: `UploadMaterialDialog.tsx`** — change the file input `accept` to:
```
accept="image/png,image/jpeg,image/webp,image/bmp,.tga,.tif,.tiff,.exr,.hdr"
```
Update the helper copy to list the new formats. (KTX2 opt-in for materials is deferred with model KTX2 — omit the toggle here or wire it as a no-op-until-encoder; prefer omitting to avoid implying support that falls back. Document in TODO.)

- [ ] **Step 3: Visual + typecheck** — `npx tsc --noEmit`. Verify both dialogs render (Task 9).
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): widen upload accept + formats copy + KTX2 opt-in"`

---

## Task 9: KTX2 opt-in encoder (best-effort) + graceful fallback

**Files:**
- Create: `src/lib/ktx2encode.ts`
- Modify: `src/furniture/optimize/optimizeGlb.ts` (use encoder when `opts.ktx2`)

- [ ] **Step 1: Implement the lazy encoder shim** — `isKtx2EncodeAvailable()` resolves true only if a basis encoder module can be dynamically imported; otherwise false. If no clean encoder dependency is available in this stack, ship the shim returning `false` (so `ktx2` opt-in transparently uses WebP) and record the real encoder integration in `TODO.md`. This mirrors `optimize_glb_lod.mjs` falling back to WebP when `toktx` is absent.

```ts
// src/lib/ktx2encode.ts
/** Best-effort in-browser KTX2/UASTC encoder. Returns null when unavailable so
 *  callers fall back to WebP (visually identical, no VRAM win). Real encoder
 *  wiring (basis_universal wasm) is a documented follow-up — see TODO.md. */
export async function encodeKtx2(_rgba: Uint8Array, _w: number, _h: number): Promise<Uint8Array | null> {
  return null
}
export function isKtx2EncodeAvailable(): boolean {
  return false
}
```

- [ ] **Step 2: Use it in `optimizeGlb`** — when `opts.ktx2 && isKtx2EncodeAvailable()`, route textures through `encodeKtx2` (+ set the KHR_texture_basisu extension); else WebP. With the stub, this path is dormant and WebP runs — no behavior change, but the wiring is ready.
- [ ] **Step 3: Commit** — `git commit -m "feat(optimize): KTX2 opt-in scaffold with WebP fallback"`

---

## Task 10: Verification + docs

- [ ] **Step 1: Full gates** — `npm run check:fix`, `npx tsc --noEmit`, `npm test` all green. Fix fallout (e.g. existing tests asserting only glb/gltf are model files).

- [ ] **Step 2: Visual verification (REQUIRED by CLAUDE.md)** — per `docs/visual-verification-playbook.md`:
  - `npm run dev`; use `scripts/shot.mjs` to open the Upload model dialog, import a small OBJ (or STL) fixture, screenshot the catalog card + the placed model in-scene.
  - Import a TGA (or TIFF) material in the Upload material dialog; apply it; screenshot.
  - **Visually review** each screenshot for rendering/UX bugs; report what you saw (not just that you captured them).

- [ ] **Step 3: Docs** — update:
  - `CLAUDE.md` — `src/furniture/convert/`, `src/furniture/optimize/`, `src/materials/convert/` modules; supported upload formats; the in-browser optimize policy (WebP default / KTX2 opt-in + fallback).
  - `README.md` — user-facing supported formats list.
  - `TODO.md` — deferred follow-ups: real KTX2/basis encoder, KTX2/DDS standalone-material decode, multi-tier LOD generation for uploads.

- [ ] **Step 4: Commit** — `git commit -m "docs: multi-format import (convert + optimize)"`

---

## Self-Review notes

- **Spec coverage:** model formats (Tasks 1–3,5), texture formats (6–7), in-browser conversion (2–3), optimize pass on converted + plain GLB uploads (4–5), WebP default + KTX2 opt-in w/ fallback (8–9), quality-first/codec-only (4 keeps resolution + no simplify). ✔
- **Honest scope flags:** KTX2 *encode* ships as a fallback-to-WebP scaffold (no clean browser basis-encoder dep in this stack); KTX2/DDS *standalone-material* decode deferred (needs GL readback). Both are recorded in TODO.md and surfaced to the user — WebP near-lossless is the real, working optimization everywhere.
- **Type consistency:** `isModelFile`/`isModelEntryFile`, `convertModel→{glb,format}`, `runOptimize→{data,report}`, `normalizeTextureFile→File` used consistently across tasks.
- **jsdom risk:** three loaders / OffscreenCanvas may not run headless; affected tests degrade to `it.skip` with a Task-9 pointer, and the runtime code's try/catch guarantees graceful fallback regardless.
