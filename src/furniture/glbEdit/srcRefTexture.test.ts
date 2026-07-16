// @vitest-environment happy-dom
/**
 * Asset Studio Stage 10a — decomposed-part TEXTURE FIDELITY for `srcRef` parts.
 *
 * A part decomposed from a GLB source keeps a `srcRef` (Stage 9a); Stage 10a keeps
 * the SOURCE mesh's textured material too, so the resolved part renders + exports
 * with the real PBR maps. This test covers:
 *  (1) MATERIAL CAPTURE — the cache hands back a cloned source material carrying
 *      the source `map` (shared texture instance, one material per cache entry).
 *  (2) OVERRIDE SEMANTICS — verbatim look, colour tint (map kept), finish REPLACES
 *      (source path stands down), and "reset to source look".
 *  (3) EXPORT ROUND-TRIP — a decomposed textured part exports a GLB whose material
 *      carries a baseColorTexture (the texture survives decomposition + export).
 *  (4) COMPONENT FRAGMENT — a fragment of a textured srcRef part keeps fidelity
 *      (its ref resolves at placement, so the placed part gets the source map).
 *
 * happy-dom has no real 2D canvas, so `GLTFExporter` can't encode a texture on its
 * own — we install the same minimal canvas/image shims the wrinkle export test uses
 * so the exporter runs its texture path, then read the GLB JSON directly.
 */

import {
  BoxGeometry,
  DataTexture,
  Group,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Mesh as ThreeMesh,
} from 'three'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { buildEditedObject, partMaterials } from './buildObject'
import { captureGroupFragment, insertComponentFragment } from './componentFragment'
import { decomposeObject } from './decompose'
import { addPartGroup, createEmptySpec, type ShapePart } from './editSpec'
import {
  __resetSrcRefCacheForTest,
  getCachedSrcRefMaterial,
  populateSrcRefCacheFromScene,
} from './srcRefCache'
import {
  buildSrcRefPartMaterial,
  resetSrcRefPartToSourceLook,
  srcRefPartHasOverride,
  srcRefSourceLook,
} from './srcRefMaterial'

afterEach(() => __resetSrcRefCacheForTest())

/** A single-mesh scene whose material carries a real (synthetic) baseColor `map`
 *  — a 2×2 DataTexture (needs no image decode, so it exists headless). The mesh
 *  keeps a solid source colour ('#ffffff' = the texture carries the look). */
function texturedScene(color = '#ffffff'): { root: Group; tex: DataTexture } {
  const root = new Group()
  const px = new Uint8Array([
    210, 150, 90, 255, 180, 120, 70, 255, 200, 140, 85, 255, 170, 110, 60, 255,
  ])
  const tex = new DataTexture(px, 2, 2)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.needsUpdate = true
  const mat = new MeshStandardMaterial({ color, map: tex, roughness: 0.7, metalness: 0 })
  const mesh = new ThreeMesh(new BoxGeometry(0.5, 0.5, 0.5), mat)
  mesh.name = 'oak-panel'
  root.add(mesh)
  return { root, tex }
}

/** Decompose a textured scene in reference mode + seed the cache, returning the
 *  single ref part. */
function decomposedTexturedPart(defId = 'oak-def', color = '#ffffff'): ShapePart {
  const { root } = texturedScene(color)
  const { parts } = decomposeObject(root, { ref: { defId } })
  populateSrcRefCacheFromScene(defId, root)
  return parts[0]
}

describe('Stage 10a — srcRef material capture', () => {
  it('caches a cloned SOURCE material carrying the real map (shared instance)', () => {
    const { root, tex } = texturedScene()
    const { parts } = decomposeObject(root, { ref: { defId: 'oak-def' } })
    expect(parts).toHaveLength(1)
    // Unresolved → no material yet (miss, not a crash).
    expect(getCachedSrcRefMaterial(parts[0].srcRef!)).toBeNull()
    populateSrcRefCacheFromScene('oak-def', root)
    const mat = getCachedSrcRefMaterial(parts[0].srcRef!)
    expect(mat).toBeTruthy()
    expect(mat?.map).toBe(tex) // texture INSTANCE is shared (not a copy)
    expect(mat?.map?.colorSpace).toBe(SRGBColorSpace)
  })

  it('holds ONE material per cache entry (no per-call mint)', () => {
    const part = decomposedTexturedPart()
    const a = getCachedSrcRefMaterial(part.srcRef!)
    const b = getCachedSrcRefMaterial(part.srcRef!)
    expect(a).toBe(b) // same instance every read
  })
})

describe('Stage 10a — override semantics', () => {
  it('renders the source material verbatim (map kept) when untouched', () => {
    const part = decomposedTexturedPart()
    const m = buildSrcRefPartMaterial(part)
    expect(m).toBeTruthy()
    expect(m?.map).toBeTruthy()
    // A fresh clone each build (owned), never the shared cache instance.
    expect(m).not.toBe(getCachedSrcRefMaterial(part.srcRef!))
    // partMaterials routes through the srcRef path (single material, textured).
    const pm = partMaterials(part)
    expect(Array.isArray(pm)).toBe(false)
    expect((pm as MeshStandardMaterial).map).toBeTruthy()
  })

  it('a colour tint multiplies onto the map (textures survive the recolour)', () => {
    const part = { ...decomposedTexturedPart(), color: '#ff0000' }
    const m = buildSrcRefPartMaterial(part)
    expect(m?.map).toBeTruthy() // map still present — recolour is a multiply, not a replace
    expect(`#${m?.color.getHexString()}`).toBe('#ff0000')
  })

  it('a mat:<id> finish REPLACES the source textures (source path stands down)', () => {
    const part = { ...decomposedTexturedPart(), finish: 'mat:floor-wood-oak' }
    // The source-material builder returns null so the standard finish path wins.
    expect(buildSrcRefPartMaterial(part)).toBeNull()
  })

  it('detects overrides + resets to the source look', () => {
    const part = decomposedTexturedPart()
    const look = srcRefSourceLook(part)
    expect(look).toBeTruthy()
    // Untouched → no override.
    expect(srcRefPartHasOverride(part, look!)).toBe(false)
    // Tint → override; reset clears it.
    const tinted = { ...part, color: '#3366cc', finish: 'mat:floor-wood-oak' }
    expect(srcRefPartHasOverride(tinted, look!)).toBe(true)
    const reset = resetSrcRefPartToSourceLook(tinted, look!)
    expect(reset.finish).toBeUndefined()
    expect(reset.color).toBe(look!.color)
    expect(srcRefPartHasOverride(reset, look!)).toBe(false)
    // After reset the source material rebuilds with its map.
    expect(buildSrcRefPartMaterial(reset)?.map).toBeTruthy()
  })

  it('a baked (procedural) mesh part is unaffected — no source material path', () => {
    // A mesh part with inlined geometry (not a srcRef) never routes through the
    // srcRef material builder.
    const baked: ShapePart = {
      id: 'b1',
      kind: 'mesh',
      position: [0, 0, 0],
      size: [1, 1, 1],
      color: '#804020',
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] },
    }
    expect(buildSrcRefPartMaterial(baked)).toBeNull()
    expect(srcRefSourceLook(baked)).toBeNull()
  })
})

describe('Stage 10a — component fragment keeps texture fidelity', () => {
  it('a fragment of a textured srcRef part resolves the source map on insert', () => {
    const part = decomposedTexturedPart('oak-def')
    // Wrap the part in a transform group, capture it as a component fragment.
    let spec = { ...createEmptySpec(), parts: [part] }
    const { spec: grouped, groupId } = addPartGroup(spec, [part.id])
    spec = grouped
    const fragment = captureGroupFragment(spec, groupId!)
    expect(fragment).toBeTruthy()
    expect(fragment?.parts[0].srcRef?.defId).toBe('oak-def')
    // Insert it as a fresh group into an empty spec — the new part keeps the same
    // srcRef, so it resolves from the SAME populated cache with the source map.
    const { spec: placed } = insertComponentFragment(createEmptySpec(), fragment!, 'Leg')
    const placedPart = placed.parts[0]
    expect(placedPart.id).not.toBe(part.id) // fresh id
    expect(placedPart.srcRef?.defId).toBe('oak-def')
    expect(buildSrcRefPartMaterial(placedPart)?.map).toBeTruthy()
  })
})

// --- minimal canvas/image shims so GLTFExporter can encode a texture image ----
type CanvasProto = { getContext: unknown; toBlob: unknown }
let origGetContext: unknown
let origToBlob: unknown
let hadImageData = false

beforeAll(() => {
  const proto = (globalThis as unknown as { HTMLCanvasElement: { prototype: CanvasProto } })
    .HTMLCanvasElement.prototype
  origGetContext = proto.getContext
  origToBlob = proto.toBlob
  proto.getContext = () => ({
    translate() {},
    scale() {},
    putImageData() {},
    drawImage() {},
  })
  proto.toBlob = (cb: (b: Blob) => void) => {
    cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
  }
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
    ;(globalThis as { ImageData?: unknown }).ImageData = class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, w: number, h: number) {
        this.data = data
        this.width = w
        this.height = h
      }
    }
  } else {
    hadImageData = true
  }
})

afterAll(() => {
  const proto = (globalThis as unknown as { HTMLCanvasElement: { prototype: CanvasProto } })
    .HTMLCanvasElement.prototype
  proto.getContext = origGetContext
  proto.toBlob = origToBlob
  if (!hadImageData) {
    ;(globalThis as { ImageData?: unknown }).ImageData = undefined
  }
})

function parseGlbJson(buf: ArrayBuffer): Record<string, unknown> {
  const view = new DataView(buf)
  const jsonLen = view.getUint32(12, true)
  const bytes = new Uint8Array(buf, 20, jsonLen)
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('Stage 10a — export round-trip', () => {
  it('a decomposed textured srcRef part exports a baseColorTexture', async () => {
    const part = decomposedTexturedPart('oak-def')
    const spec = { ...createEmptySpec(), parts: [part] }
    const group = buildEditedObject(null, spec)
    const json = parseGlbJson(await exportGlb(group)) as {
      materials?: Array<{ pbrMetallicRoughness?: { baseColorTexture?: { index?: number } } }>
      textures?: unknown[]
      images?: unknown[]
    }
    const mat = json.materials?.[0]
    expect(mat?.pbrMetallicRoughness?.baseColorTexture).toBeTruthy()
    expect(typeof mat?.pbrMetallicRoughness?.baseColorTexture?.index).toBe('number')
    expect((json.textures ?? []).length).toBeGreaterThan(0)
    expect((json.images ?? []).length).toBeGreaterThan(0)
  })

  it('a tinted srcRef part still exports its baseColorTexture (recolour keeps the map)', async () => {
    const part = { ...decomposedTexturedPart('oak-def'), color: '#8a4b2f' }
    const group = buildEditedObject(null, { ...createEmptySpec(), parts: [part] })
    const json = parseGlbJson(await exportGlb(group)) as {
      materials?: Array<{ pbrMetallicRoughness?: { baseColorTexture?: unknown } }>
    }
    expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toBeTruthy()
  })
})
