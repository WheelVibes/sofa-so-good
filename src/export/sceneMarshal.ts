/**
 * Marshal a live three.js scene graph into a `postMessage`-transportable
 * form, and reconstruct a real three.js `Object3D` tree from it on the other
 * side — the plumbing that lets the heavy `GLTFExporter`/`OBJExporter`/
 * `STLExporter`/`USDZExporter` call itself run inside a Worker for very large
 * scenes (see `exportThreshold.ts` for the size gate, `runSceneExport.ts` for
 * the orchestration).
 *
 * three's live `Object3D`/`Mesh`/`Material`/`Texture` instances are class
 * instances with methods and aren't structured-cloneable, so they can't be
 * `postMessage`d directly. three already ships a JSON round-trip for exactly
 * this (`Object3D.toJSON()` + `ObjectLoader`) — reused here almost as-is, with
 * one deliberate change:
 *
 * - `BufferGeometry.toJSON()` (used internally by `Object3D.toJSON()`) boxes
 *   every attribute/index typed array into a plain `Array` of numbers
 *   (`Array.from`) — the ONE part of the JSON round-trip whose cost scales
 *   with scene size (total vertex/index count), which is exactly what we're
 *   trying to move off the main thread. `fastBufferGeometryToJSON` below is a
 *   drop-in replacement (monkey-patched onto the prototype only for the
 *   duration of the marshal call) that keeps arrays as native typed arrays —
 *   a typed array survives `postMessage`'s structured clone as a fast memcpy,
 *   while boxing+cloning a plain number array is O(n) twice over. Primitive
 *   geometries (`BoxGeometry`, etc.) already short-circuit via `.parameters`
 *   and are untouched either way. Falls back to the original (correct but
 *   boxing) path for `InterleavedBufferAttribute`s, which the fast path can't
 *   represent — rare for placed furniture, and safety wins over speed there.
 * - `ObjectLoader.parseImagesAsync` reconstructs images via `ImageLoader`,
 *   which needs `document` (`createElementNS('img')`) — unavailable in a
 *   Worker. `reconstructSceneFromMarshal` instead decodes each embedded data
 *   URL itself via `atob` + `Blob` + `createImageBitmap` (all Worker-safe,
 *   no DOM), then feeds the result into `ObjectLoader.parseTextures`/
 *   `parseMaterials`/`parseObject` directly (those three are plain data
 *   transforms — no DOM dependency of their own). GLTFExporter already
 *   accepts `ImageBitmap`/`OffscreenCanvas` image sources (it feature-detects
 *   `document` itself), so this needs no changes downstream.
 *
 * Trade-off: `Object3D.toJSON()`'s texture embedding (`Texture.toJSON` →
 * `ImageUtils.getDataURL` → canvas encode) still runs on the MAIN thread,
 * because only the main thread has a live `HTMLCanvasElement`/`Image` to read
 * pixels from. This is bounded by the number of *unique* textures/materials,
 * not by placed-item count (furniture materials are shared/cached instances,
 * see `furniture/CLAUDE.md`), so it doesn't scale with "very large scene" the
 * way node/geometry count does — the worker offload targets the part that
 * actually grows with scene size.
 */

import {
  BufferGeometry,
  type Material,
  type Object3D,
  ObjectLoader,
  Source,
  type Texture,
} from 'three'

// ---------------------------------------------------------------------------
// Main-thread marshal
// ---------------------------------------------------------------------------

const ORIGINAL_GEOMETRY_TOJSON = BufferGeometry.prototype.toJSON

interface InterleavedLike {
  isInterleavedBufferAttribute?: boolean
}

function hasInterleavedAttribute(geometry: BufferGeometry): boolean {
  if ((geometry.index as unknown as InterleavedLike | null)?.isInterleavedBufferAttribute) {
    return true
  }
  for (const key in geometry.attributes) {
    if ((geometry.attributes[key] as unknown as InterleavedLike).isInterleavedBufferAttribute) {
      return true
    }
  }
  return false
}

/** See the module doc — identical output shape to `BufferGeometry.toJSON()`
 *  except attribute/index arrays stay native typed arrays. Morph attributes
 *  and bounding volumes are intentionally omitted: unused by placed furniture
 *  geometry and not needed by any of the four exporters (they derive
 *  accessor bounds from the raw attribute data themselves). */
function fastBufferGeometryToJSON(this: BufferGeometry, meta?: unknown): Record<string, unknown> {
  void meta
  if (hasInterleavedAttribute(this)) {
    return ORIGINAL_GEOMETRY_TOJSON.call(this) as unknown as Record<string, unknown>
  }

  const data: Record<string, unknown> = {
    metadata: { version: 4.7, type: 'BufferGeometry', generator: 'BufferGeometry.toJSON' },
    uuid: this.uuid,
    type: this.type,
  }
  if (this.name !== '') data.name = this.name
  if (Object.keys(this.userData).length > 0) data.userData = this.userData

  const parameters = (this as unknown as { parameters?: Record<string, unknown> }).parameters
  if (parameters !== undefined) {
    for (const key in parameters) if (parameters[key] !== undefined) data[key] = parameters[key]
    return data
  }

  const attributesOut: Record<string, unknown> = {}
  const geomData: Record<string, unknown> = { attributes: attributesOut }
  data.data = geomData

  const index = this.index
  if (index !== null) {
    geomData.index = { type: index.array.constructor.name, array: index.array }
  }

  for (const key in this.attributes) {
    const attribute = this.attributes[key]
    const attrOut: Record<string, unknown> = {
      itemSize: attribute.itemSize,
      type: attribute.array.constructor.name,
      array: attribute.array,
      normalized: attribute.normalized,
    }
    if (attribute.name) attrOut.name = attribute.name
    attributesOut[key] = attrOut
  }

  if (this.groups.length > 0) geomData.groups = JSON.parse(JSON.stringify(this.groups))

  return data
}

export interface MarshaledScene {
  /** Structurally identical to `Object3D.toJSON()`'s output (mirrors three's
   *  own scene-file JSON schema), except geometry attribute/index arrays are
   *  native typed arrays instead of boxed plain arrays. */
  json: Record<string, unknown>
}

/**
 * Serialize a (pruned — see `buildExportRoot`) scene root into a
 * `postMessage`-transportable payload. Safe to call repeatedly; the
 * monkey-patch is installed and reverted synchronously around the single
 * `root.toJSON()` call, so it can never leak into unrelated code (three's
 * `.toJSON()` calls are all synchronous, single-threaded JS).
 */
export function marshalSceneForWorker(root: Object3D): MarshaledScene {
  // `Object3D.toJSON()` reads `.matrix` directly rather than recomputing it
  // from position/quaternion/scale — normally kept in sync by the render
  // loop's per-frame `updateMatrixWorld()`, but forced here too so a marshal
  // is correct even if it runs before the next frame settles.
  root.updateMatrixWorld(true)
  BufferGeometry.prototype.toJSON =
    fastBufferGeometryToJSON as unknown as typeof ORIGINAL_GEOMETRY_TOJSON
  try {
    return { json: root.toJSON() as unknown as Record<string, unknown> }
  } finally {
    BufferGeometry.prototype.toJSON = ORIGINAL_GEOMETRY_TOJSON
  }
}

// ---------------------------------------------------------------------------
// Worker-side (and test-side) reconstruction
// ---------------------------------------------------------------------------

interface JsonImageEntry {
  uuid: string
  url: string
}

/** Decode a `data:` URL into an `ImageBitmap` without touching the DOM
 *  (`atob`/`Blob`/`createImageBitmap` are all available in a Worker). */
async function decodeDataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(5, comma) // e.g. "image/png;base64"
  const isBase64 = header.endsWith(';base64')
  const mime = (isBase64 ? header.slice(0, -';base64'.length) : header.split(';')[0]) || 'image/png'
  const payload = dataUrl.slice(comma + 1)
  let bytes: Uint8Array
  if (isBase64) {
    const binary = atob(payload)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload))
  }
  return createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
}

/** Resolve every embedded image into a `Source` wrapping an `ImageBitmap`.
 *  A single bad/undecodable image is dropped (its texture ends up
 *  imageless — the material falls back to its base colour) rather than
 *  failing the whole export. */
async function resolveImages(json: unknown): Promise<Record<string, Source<unknown>>> {
  const images: Record<string, Source<unknown>> = {}
  const entries = (json as JsonImageEntry[] | undefined) ?? []
  for (const image of entries) {
    try {
      images[image.uuid] = new Source(await decodeDataUrlToBitmap(image.url))
    } catch {
      // Dropped — see doc comment above.
    }
  }
  return images
}

/** `ObjectLoader` internals the public typings don't (fully) expose:
 *  `parseShapes` is missing from `@types/three`, and `parseGeometries`'s real
 *  signature takes the shapes table as a second argument (a `ShapeGeometry`/
 *  `ExtrudeGeometry` — e.g. the floor plan's room slabs — resolves its
 *  `parameters.shapes` uuids against it; omitting it crashes the parse).
 *  Mirrors three's own `ObjectLoader.parse` step order. */
interface ObjectLoaderInternals {
  parseShapes: (json: unknown) => Record<string, unknown>
  parseGeometries: (json: unknown, shapes: Record<string, unknown>) => Record<string, unknown>
  parseObject: (
    data: unknown,
    geometries: Record<string, unknown>,
    materials: Record<string, Material>,
    textures: Record<string, Texture>,
    animations: Record<string, unknown>,
  ) => Object3D
}

/**
 * Rebuild a real three.js `Object3D` tree from a `marshalSceneForWorker`
 * payload. Runs entirely on plain data + `ObjectLoader`'s DOM-independent
 * parse steps (geometries/textures/materials/object) plus the Worker-safe
 * image decode above — no `document`, so it works inside a Worker. Also
 * usable directly in tests (no Worker required) since it's just a function.
 *
 * The caller must call `root.updateMatrixWorld(true)` before handing the
 * result to `exportSceneObj`/`exportSceneStl` (they read `matrixWorld`
 * directly; `GLTFExporter`/`exportSceneUsdz` only read local transforms, but
 * updating is harmless and cheap either way) — done once in
 * `exportWorker.worker.ts` right after reconstruction.
 */
export async function reconstructSceneFromMarshal(
  json: Record<string, unknown>,
): Promise<Object3D> {
  const loader = new ObjectLoader() as ObjectLoader & ObjectLoaderInternals
  const shapes = loader.parseShapes(json.shapes)
  const geometries = loader.parseGeometries(json.geometries, shapes)
  const images = await resolveImages(json.images)
  const textures = loader.parseTextures(json.textures, images)
  const materials = loader.parseMaterials(json.materials, textures)
  return loader.parseObject(json.object, geometries, materials, textures, {})
}
