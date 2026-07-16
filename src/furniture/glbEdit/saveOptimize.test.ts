// @vitest-environment happy-dom
/**
 * Asset Studio Iteration 2 · Stage 6f — SAVE-TIME OPTIMIZE COMPATIBILITY CHECK.
 *
 * The designer's save (`exportAndSaveAsset`) now routes the raw GLTFExporter
 * output through the shared optimize pipeline (`optimize/optimizeGlb.ts` →
 * weld/dedup/prune + Draco geometry pack + near-lossless WebP texture re-encode)
 * before persist, keeping whichever is SMALLER (`optimizeSavedGlb`). That pass is
 * only safe if it preserves every material feature the designer bakes. This test
 * is the empirical gate: it round-trips each of the four at-risk features THROUGH
 * `optimizeGlb` and asserts it survives.
 *
 * Feature-survival matrix (verified here — see docs/asset-studio-plan.md Stage 6f):
 *   KHR physical-material extensions (sheen/clearcoat/transmission/…) .......... ✅
 *   multi-material primitives (Stage 6c per-face boxes) ........................ ✅
 *   vertex colours (Stage 2 gradients — COLOR_0) ............................... ✅
 *   embedded normal maps (Stage 6e wrinkles / decal textures) .................. ✅
 *
 * Exact-value export round-trip is already covered by `physicalMaterialExport.test.ts`
 * (three exporter → three loader); here we only need to prove OPTIMIZE doesn't
 * STRIP the feature, so we read the optimized doc back with an extension-aware
 * gltf-transform IO and check the feature is present (env-robust — no DRACOLoader
 * wasm path needed to decode a Draco-packed output).
 *
 * NOTE: happy-dom has no OffscreenCanvas/createImageBitmap, so `reencodeTexture`
 * no-ops here — the WebP texture re-encode (the biggest byte win) is a BROWSER
 * path, measured in the `glb-designer-stage6f` scenario. Draco (draco3dgltf wasm)
 * DOES load in this env (see optimizeGlb.test.ts), so the geometry pack + all four
 * preservation checks run for real.
 */
import { Document, type Material, WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import {
  BoxGeometry,
  CylinderGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { optimizeGlb } from '../optimize/optimizeGlb'
import { buildEditedObject } from './buildObject'
import { decomposeObject } from './decompose'
import { createEmptySpec } from './editSpec'
import { optimizeSavedGlb } from './saveOptimize'
import { __resetSrcRefCacheForTest, populateSrcRefCacheFromScene } from './srcRefCache'

// Minimal canvas/image shims so three's GLTFExporter can encode a texture image
// in happy-dom (no real 2D canvas). Harmless for the texture-LESS material tests;
// the WebP re-encode still no-ops (no OffscreenCanvas/createImageBitmap). Mirrors
// the wrinkle export test's shim. Only the Stage 10a case exercises the image path.
type CanvasProto = { getContext: unknown; toBlob: unknown }
let origGetContext: unknown
let origToBlob: unknown
let hadImageData = false
beforeAll(() => {
  const proto = (globalThis as unknown as { HTMLCanvasElement: { prototype: CanvasProto } })
    .HTMLCanvasElement.prototype
  origGetContext = proto.getContext
  origToBlob = proto.toBlob
  proto.getContext = () => ({ translate() {}, scale() {}, putImageData() {}, drawImage() {} })
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
  if (!hadImageData) (globalThis as { ImageData?: unknown }).ImageData = undefined
})

/** Read a (possibly Draco-packed) GLB back into a gltf-transform Document with
 *  every extension + the Draco decoder registered, so feature-presence checks
 *  see exactly what the optimized asset carries. */
async function readDoc(data: Uint8Array): Promise<Document> {
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS)
  try {
    io.registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
  } catch {
    // decoder unavailable — a non-Draco output still reads
  }
  return io.readBinary(data)
}

/** Export a three object → optimizeGlb → read the optimized doc back. */
async function exportOptimizeRead(object: Group): Promise<Document> {
  const raw = new Uint8Array(await exportGlb(object))
  const { data } = await optimizeGlb(raw)
  return readDoc(data)
}

describe('Stage 6f — optimize preserves every designer material feature', () => {
  it('KHR physical extensions survive (sheen / clearcoat / transmission / ior / volume / anisotropy)', async () => {
    const mat = new MeshPhysicalMaterial({ color: '#aabbcc' })
    mat.sheen = 1
    mat.sheenRoughness = 0.4
    mat.sheenColor.set('#8899ff')
    mat.clearcoat = 0.8
    mat.clearcoatRoughness = 0.2
    mat.transmission = 0.6
    mat.ior = 1.7 // non-default (1.5 is the glTF default → three omits the ext)
    mat.thickness = 0.3
    mat.anisotropy = 0.7
    mat.anisotropyRotation = 0.5
    const g = new Group()
    g.add(new Mesh(new BoxGeometry(1, 1, 1), mat))
    const doc = await exportOptimizeRead(g)
    const m = doc.getRoot().listMaterials()[0]
    const names = m?.listExtensions().map((e) => e.extensionName)
    expect(names).toContain('KHR_materials_sheen')
    expect(names).toContain('KHR_materials_clearcoat')
    expect(names).toContain('KHR_materials_transmission')
    expect(names).toContain('KHR_materials_ior')
    expect(names).toContain('KHR_materials_volume')
    expect(names).toContain('KHR_materials_anisotropy')
  })

  it('multi-material primitives survive (Stage 6c per-face box → 3 distinct materials)', async () => {
    const geo = new BoxGeometry(1, 1, 1)
    geo.clearGroups()
    const zone = [0, 0, 1, 2, 0, 0] // sides / top / bottom, like remapBoxFaceGroups
    for (let i = 0; i < 6; i++) geo.addGroup(i * 6, 6, zone[i])
    const g = new Group()
    g.add(
      new Mesh(geo, [
        new MeshStandardMaterial({ color: '#ff0000' }),
        new MeshStandardMaterial({ color: '#00ff00' }),
        new MeshStandardMaterial({ color: '#0000ff' }),
      ]),
    )
    const doc = await exportOptimizeRead(g)
    // Distinct base-colour factors across all materials still present.
    const key = (m: Material) =>
      (m.getBaseColorFactor() ?? [])
        .slice(0, 3)
        .map((v) => v.toFixed(2))
        .join(',')
    const hues = new Set(doc.getRoot().listMaterials().map(key))
    expect(hues.size).toBeGreaterThanOrEqual(3)
  })

  it('vertex-colour gradients survive (Stage 2 COLOR_0 + vertexColors)', async () => {
    const geo = new BoxGeometry(1, 1, 1)
    const n = geo.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = i / n
      colors[i * 3 + 1] = 0.25
      colors[i * 3 + 2] = 1 - i / n
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const g = new Group()
    g.add(new Mesh(geo, new MeshStandardMaterial({ vertexColors: true })))
    const doc = await exportOptimizeRead(g)
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    expect(prim?.getAttribute('COLOR_0')).toBeTruthy()
    expect((prim?.getAttribute('COLOR_0')?.getCount() ?? 0) > 0).toBe(true)
  })

  it('srcRef-textured decompose parts survive (Stage 10a baseColor map)', async () => {
    // A part decomposed from a textured GLB source keeps the source baseColor map
    // (Stage 10a); the save-time optimize must preserve it through the 6f matrix.
    const px = new Uint8Array([
      210, 150, 90, 255, 180, 120, 70, 255, 200, 140, 85, 255, 170, 110, 60, 255,
    ])
    const tex = new DataTexture(px, 2, 2)
    tex.colorSpace = SRGBColorSpace
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.needsUpdate = true
    const src = new Group()
    const mesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ map: tex }))
    mesh.name = 'oak-panel'
    src.add(mesh)
    const { parts } = decomposeObject(src, { ref: { defId: 'oak-opt' } })
    populateSrcRefCacheFromScene('oak-opt', src)
    try {
      const object = buildEditedObject(null, { ...createEmptySpec(), parts })
      const doc = await exportOptimizeRead(object)
      const outMat = doc.getRoot().listMaterials()[0]
      expect(outMat?.getBaseColorTexture()).toBeTruthy()
      expect((outMat?.getBaseColorTexture()?.getImage()?.byteLength ?? 0) > 0).toBe(true)
    } finally {
      __resetSrcRefCacheForTest()
    }
  })

  it('embedded normal maps survive (Stage 6e wrinkles / decal textures)', async () => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhgGAhCq1sAAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    )
    // Build a GLB with a normalTexture directly (three's exporter can't encode a
    // texture in happy-dom — no canvas).
    const doc0 = new Document()
    const buffer = doc0.createBuffer()
    const pos = doc0
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer)
    const uv = doc0
      .createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer)
    const tex = doc0.createTexture('wrinkle').setImage(png).setMimeType('image/png')
    const mat = doc0.createMaterial('m').setNormalTexture(tex)
    const prim = doc0
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('TEXCOORD_0', uv)
      .setMaterial(mat)
    doc0.createScene().addChild(doc0.createNode().setMesh(doc0.createMesh().addPrimitive(prim)))
    const raw = await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc0)

    const { data } = await optimizeGlb(raw)
    const back = await readDoc(data)
    const outMat = back.getRoot().listMaterials()[0]
    expect(outMat?.getNormalTexture()).toBeTruthy()
    expect((outMat?.getNormalTexture()?.getImage()?.byteLength ?? 0) > 0).toBe(true)
  })
})

describe('Stage 6f — optimizeSavedGlb keep-smaller guard + size measurement', () => {
  it('never grows the asset (keep-smaller) and reports honest before/after', async () => {
    const table = new Group()
    table.add(
      new Mesh(new BoxGeometry(1.2, 0.04, 0.7), new MeshStandardMaterial({ color: '#8a5a2b' })),
    )
    for (const [x, z] of [
      [-0.5, -0.3],
      [0.5, -0.3],
      [-0.5, 0.3],
      [0.5, 0.3],
    ] as const) {
      const leg = new Mesh(new CylinderGeometry(0.03, 0.03, 0.72, 16), new MeshStandardMaterial())
      leg.position.set(x, -0.38, z)
      table.add(leg)
    }
    const raw = new Uint8Array(await exportGlb(table))
    const res = await optimizeSavedGlb(raw)
    expect(res.afterBytes).toBeLessThanOrEqual(res.beforeBytes)
    expect(res.data.byteLength).toBe(res.afterBytes)
    // eslint-disable-next-line no-console
    console.log(
      `[6f-size] 4-leg table: raw=${res.beforeBytes}B optimized=${res.afterBytes}B ` +
        `used=${res.optimized ? 'optimized' : 'raw'} ` +
        `(${(((res.beforeBytes - res.afterBytes) / res.beforeBytes) * 100).toFixed(1)}% smaller)`,
    )
    const head = String.fromCharCode(...res.data.slice(0, 4))
    expect(head).toBe('glTF')
  })
})
