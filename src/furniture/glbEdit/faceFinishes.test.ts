// @vitest-environment happy-dom
/**
 * Asset Studio Stage 6c — per-face finishes (edge banding) + texture scale/grain.
 * Pure spec ops + strict validation/migration, plus a GLB export round-trip
 * asserting a 3-zone box exports ≥2 distinct materials (the veneer + edge-band
 * split survives as distinct glTF primitives).
 */
import { BoxGeometry, Group, type Material, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { partGeometry, partMaterials } from './buildObject'
import {
  boxFaceFinishesActive,
  createEmptySpec,
  duplicatePart,
  faceFinishHasOverride,
  mirrorPart,
  type ShapePart,
  setFaceFinish,
} from './editSpec'
import { migrateAssetSpec, parseAssetSpec, serializeAssetSpec } from './specPersist'

function sharpBox(over: Partial<ShapePart> = {}): ShapePart {
  return {
    id: 'b1',
    kind: 'box',
    position: [0, 0.2, 0],
    size: [0.6, 0.04, 0.6],
    color: '#b08d57',
    ...over,
  }
}

describe('setFaceFinish (pure)', () => {
  it('sets a zone override and merges over the current value', () => {
    const a = setFaceFinish(undefined, 'top', { finish: 'mat:oak' })
    expect(a).toEqual({ top: { finish: 'mat:oak' } })
    const b = setFaceFinish(a, 'top', { color: '#333' })
    expect(b).toEqual({ top: { finish: 'mat:oak', color: '#333' } })
  })

  it('drops a zone that becomes empty and clears the field when all-empty', () => {
    const ff = setFaceFinish(undefined, 'sides', { color: '#222' })
    const cleared = setFaceFinish(ff, 'sides', { color: undefined, finish: undefined })
    expect(cleared).toBeUndefined()
  })

  it('keeps other zones when one is cleared', () => {
    let ff = setFaceFinish(undefined, 'top', { finish: 'mat:oak' })
    ff = setFaceFinish(ff, 'sides', { color: '#111' })
    ff = setFaceFinish(ff, 'top', { finish: undefined })
    expect(ff).toEqual({ sides: { color: '#111' } })
  })
})

describe('boxFaceFinishesActive gate', () => {
  const ff = { top: { finish: 'mat:oak' } }
  it('true for a sharp box with an override', () => {
    expect(boxFaceFinishesActive(sharpBox({ faceFinishes: ff }))).toBe(true)
  })
  it('false without an override', () => {
    expect(boxFaceFinishesActive(sharpBox({ faceFinishes: {} }))).toBe(false)
    expect(faceFinishHasOverride({})).toBe(false)
  })
  it('false for a bevelled / hollow / plumped box', () => {
    expect(boxFaceFinishesActive(sharpBox({ faceFinishes: ff, bevel: 0.02 }))).toBe(false)
    expect(boxFaceFinishesActive(sharpBox({ faceFinishes: ff, shell: 0.01 }))).toBe(false)
    expect(boxFaceFinishesActive(sharpBox({ faceFinishes: ff, plump: 0.5 }))).toBe(false)
  })
  it('false for a non-box kind', () => {
    expect(
      boxFaceFinishesActive({
        id: 'c',
        kind: 'cylinder',
        position: [0, 0, 0],
        size: [1, 1, 1],
        color: '#fff',
        faceFinishes: ff,
      }),
    ).toBe(false)
  })
})

describe('duplicate / mirror copy the fields (deep, no shared zone)', () => {
  it('duplicate deep-copies faceFinishes + carries scale/rotation', () => {
    const spec = {
      ...createEmptySpec(),
      parts: [
        sharpBox({
          faceFinishes: { top: { finish: 'mat:oak' } },
          finishScale: 2,
          finishRotation: 90,
        }),
      ],
    }
    const dup = duplicatePart(spec, 'b1')
    const copy = dup.parts[1]
    expect(copy.finishScale).toBe(2)
    expect(copy.finishRotation).toBe(90)
    expect(copy.faceFinishes).toEqual({ top: { finish: 'mat:oak' } })
    // Deep copy: mutating the copy's zone must not touch the original.
    copy.faceFinishes!.top!.finish = 'mat:walnut'
    expect(spec.parts[0].faceFinishes!.top!.finish).toBe('mat:oak')
  })
  it('mirror copies grain verbatim (a reflection keeps the grain axis)', () => {
    const spec = {
      ...createEmptySpec(),
      parts: [sharpBox({ finishRotation: 90, faceFinishes: { sides: { color: '#111' } } })],
    }
    const m = mirrorPart(spec, 'b1')
    const copy = m.parts[1]
    expect(copy.finishRotation).toBe(90)
    expect(copy.faceFinishes).toEqual({ sides: { color: '#111' } })
  })
})

describe('specPersist v9 migration + validation', () => {
  it('migrates v8 → v9 as identity (additive superset)', () => {
    const spec = { ...createEmptySpec(), parts: [sharpBox()] }
    expect(migrateAssetSpec(spec, 8)).toBe(spec)
  })

  it('round-trips faceFinishes + finishScale + finishRotation', () => {
    const spec = {
      ...createEmptySpec(),
      parts: [
        sharpBox({
          faceFinishes: { top: { finish: 'mat:oak' }, sides: { color: '#2b2b2b' } },
          finishScale: 1.5,
          finishRotation: 90,
        }),
      ],
    }
    const restored = parseAssetSpec(serializeAssetSpec(spec))
    expect(restored?.parts[0].faceFinishes).toEqual(spec.parts[0].faceFinishes)
    expect(restored?.parts[0].finishScale).toBe(1.5)
    expect(restored?.parts[0].finishRotation).toBe(90)
  })

  it('serializes at the current envelope version', () => {
    const env = JSON.parse(serializeAssetSpec({ ...createEmptySpec(), parts: [sharpBox()] }))
    expect(env.v).toBe(14)
    expect(env.kind).toBe('asset')
  })

  it('rejects a malformed faceFinishes / finishScale (strict guard → null)', () => {
    const bad1 = JSON.stringify({
      kind: 'asset',
      v: 9,
      payload: {
        ...createEmptySpec(),
        parts: [{ ...sharpBox(), faceFinishes: { top: { color: 5 } } }],
      },
    })
    expect(parseAssetSpec(bad1)).toBeNull()
    const bad2 = JSON.stringify({
      kind: 'asset',
      v: 9,
      payload: { ...createEmptySpec(), parts: [{ ...sharpBox(), finishScale: 'big' }] },
    })
    expect(parseAssetSpec(bad2)).toBeNull()
  })
})

describe('GLB export round-trip — a 3-zone box exports ≥2 distinct materials', () => {
  it('remaps the box faces to distinct materials that survive export', async () => {
    const part = sharpBox({
      faceFinishes: { top: { color: '#c9a06a' }, sides: { color: '#3a2b1a' } },
    })
    const geo = partGeometry(part)
    // Three board zones remapped over the 6 face groups (sides / top / bottom).
    const mats = partMaterials(part) as Material[]
    expect(Array.isArray(mats)).toBe(true)
    expect(mats.length).toBe(3)
    expect(geo instanceof BoxGeometry).toBe(true)
    expect(geo.groups.length).toBe(6)
    const group = new Group()
    group.add(new Mesh(geo, mats))
    const buf = await exportGlb(group)
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    const distinct = await new Promise<number>((resolve, reject) => {
      loader.parse(
        buf,
        '',
        (gltf) => {
          const seen = new Set<string>()
          gltf.scene.traverse((o) => {
            const mesh = o as Mesh
            if (!mesh.isMesh) return
            const m = mesh.material
            const list = Array.isArray(m) ? m : [m]
            for (const mm of list) {
              const col = (mm as Material & { color?: { getHexString(): string } }).color
              seen.add(col ? col.getHexString() : mm.uuid)
            }
          })
          resolve(seen.size)
        },
        (e) => reject(e instanceof Error ? e : new Error(String(e))),
      )
    })
    expect(distinct).toBeGreaterThanOrEqual(2)
  })
})
