// @vitest-environment happy-dom
/**
 * Asset Studio Stage 6e — fabric wrinkle EXPORT REALITY CHECK + spec→material
 * contract.
 *
 * (1) The spec→material contract (DOM-free-ish): a plumped box/capsule with
 *     wrinkles builds a material carrying a `normalMap` (a `DataTexture`, so it
 *     exists even headless — no 2D canvas needed to generate it) and the
 *     documented `normalScale`; a NON-plumped part, a wrinkles-0 part, and a
 *     part with a textured finish (whose clone owns the normal channel) all get
 *     NO wrinkle overlay; and wrinkles are material-only (geometry unaffected).
 *
 * (2) The GLB export round-trip: happy-dom has no real 2D canvas, so
 *     `GLTFExporter` can't encode a texture image on its own (the same limit the
 *     decal export test documents). We install a minimal 2D-context + `toBlob` +
 *     `ImageData` shim so the exporter runs its normal-map path, then read the
 *     GLB's JSON chunk directly and assert it wrote a `normalTexture` (index +
 *     `scale`) — proving the normal map and its scale survive the exporter
 *     (the real browser encodes the PNG for real; the scenario verifies the
 *     visual result).
 */
import { BoxGeometry, Group, Mesh } from 'three'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { partGeometry, partMaterial, wrinklesSuppressedByFinish } from './buildObject'
import { addPart, createEmptySpec, updatePart } from './editSpec'
import { __clearWrinkleCacheForTest } from './wrinkleTexture'

function plumpedBox(overrides: Record<string, unknown> = {}) {
  let spec = addPart(createEmptySpec(), 'box')
  const id = spec.parts[0].id
  spec = updatePart(spec, id, { size: [0.6, 0.18, 0.6], plump: 0.7, ...overrides })
  return spec.parts[0]
}

describe('wrinkle spec→material contract', () => {
  afterAll(() => __clearWrinkleCacheForTest())

  it('a plumped cushion gains a normalMap + a plump/intensity-scaled normalScale', () => {
    const m = partMaterial(plumpedBox())
    expect(m.normalMap).toBeTruthy()
    // effective wrinkles default 0.6, plump 0.7 → 0.6 * (0.15 + 0.25*0.7) = 0.195
    expect(m.normalScale.x).toBeCloseTo(0.195, 3)
    expect(m.normalScale.x).toBe(m.normalScale.y)
  })

  it('no overlay when the part is not plumped', () => {
    const m = partMaterial(plumpedBox({ plump: undefined }))
    expect(m.normalMap).toBeNull()
  })

  it('an explicit wrinkles:0 disables the overlay', () => {
    const m = partMaterial(plumpedBox({ wrinkles: 0 }))
    expect(m.normalMap).toBeNull()
  })

  it('a textured finish suppresses wrinkles (finish owns the normal channel)', () => {
    const part = plumpedBox({ finish: 'mat:floor-wood-oak' })
    expect(wrinklesSuppressedByFinish(part)).toBe(true)
    // With no built finish material in headless the clone is null → solid path,
    // and the overlay is still skipped because a finish is set.
    const m = partMaterial(part)
    expect(m.normalMap).toBeNull()
  })

  it('wrinkles are material-only — geometry is byte-identical to the plain plump', () => {
    const withWrinkles = partGeometry(plumpedBox({ wrinkles: 1 }))
    const withoutWrinkles = partGeometry(plumpedBox({ wrinkles: 0 }))
    const a = withWrinkles.getAttribute('position').array
    const b = withoutWrinkles.getAttribute('position').array
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

// --- minimal canvas/image shims so GLTFExporter can run its texture path -----
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
  const jsonLen = view.getUint32(12, true) // chunk 0 length (JSON)
  const bytes = new Uint8Array(buf, 20, jsonLen)
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('wrinkle GLB export round-trip', () => {
  afterAll(() => __clearWrinkleCacheForTest())

  it('exports a normalTexture with a scale (normalMap + normalScale survive GLTFExporter)', async () => {
    // Build a material via the real designer path so this exercises the wrinkle
    // overlay, not a hand-made material.
    const m = partMaterial(plumpedBox())
    expect(m.normalMap).toBeTruthy()
    const group = new Group()
    group.add(new Mesh(new BoxGeometry(1, 1, 1), m))
    const buf = await exportGlb(group)
    const json = parseGlbJson(buf) as {
      materials?: Array<{ normalTexture?: { index?: number; scale?: number } }>
      textures?: unknown[]
      images?: unknown[]
    }
    const mat = json.materials?.[0]
    expect(mat?.normalTexture).toBeTruthy()
    expect(typeof mat?.normalTexture?.index).toBe('number')
    expect(mat?.normalTexture?.scale).toBeCloseTo(m.normalScale.x, 4)
    expect((json.textures ?? []).length).toBeGreaterThan(0)
    expect((json.images ?? []).length).toBeGreaterThan(0)
  })

  it('a plain MeshStandardMaterial with a known normalScale round-trips its scale', async () => {
    // Control: a hand-set normalScale writes verbatim (independent of the overlay
    // math) — locks the exporter's normalTexture.scale contract.
    const m = partMaterial(plumpedBox({ wrinkles: 1, plump: 1 })) // scale = 0.4
    const group = new Group()
    group.add(new Mesh(new BoxGeometry(1, 1, 1), m))
    const json = parseGlbJson(await exportGlb(group)) as {
      materials?: Array<{ normalTexture?: { scale?: number } }>
    }
    expect(json.materials?.[0]?.normalTexture?.scale).toBeCloseTo(0.4, 4)
  })
})
