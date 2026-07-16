// @vitest-environment happy-dom
/**
 * Asset Studio Stage 9a — GLB-decompose REFERENCE part lifecycle:
 *  - envelope v13 round-trip + migration + strict validation for `srcRef`,
 *  - cache resolution (a ref part's geometry resolves from a populated scene),
 *  - missing-def degradation (`dropUnresolvableSrcRefParts`),
 *  - a real GLTFExporter → GLTFLoader GLB round-trip decomposing to ref parts that
 *    then resolve from the reimported scene (spec → save → restore resolves).
 */

import type { Mesh, Object3D } from 'three'
import { BoxGeometry, Group, MeshStandardMaterial, Mesh as ThreeMesh } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { partGeometry } from './buildObject'
import { decomposeObject } from './decompose'
import { dropUnresolvableSrcRefParts } from './decomposeLoader'
import { addPart, createEmptySpec, type ShapePart } from './editSpec'
import {
  ASSET_SPEC_VERSION,
  migrateAssetSpec,
  parseAssetSpec,
  serializeAssetSpec,
} from './specPersist'
import {
  __resetSrcRefCacheForTest,
  getCachedSrcRefGeometry,
  populateSrcRefCacheFromScene,
} from './srcRefCache'

afterEach(() => __resetSrcRefCacheForTest())

/** A synthetic two-named-mesh object (stands in for a loaded GLB scene). */
function twoMeshScene(): Object3D {
  const root = new Group()
  const a = new ThreeMesh(
    new BoxGeometry(0.4, 0.4, 0.4),
    new MeshStandardMaterial({ color: '#aa0000' }),
  )
  a.name = 'body'
  a.position.set(0, 0.2, 0)
  const b = new ThreeMesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshStandardMaterial({ color: '#0000aa' }),
  )
  b.name = 'lid'
  b.position.set(0, 0.5, 0)
  root.add(a, b)
  return root
}

describe('specPersist v13 — srcRef', () => {
  it('round-trips a srcRef mesh part', () => {
    const refPart: ShapePart = {
      id: 'p1',
      kind: 'mesh',
      name: 'body',
      position: [0, 0.2, 0],
      size: [0.4, 0.4, 0.4],
      color: '#aa0000',
      srcRef: { defId: 'sofa-3seat', meshPath: '3' },
    }
    const spec = { ...createEmptySpec(), parts: [refPart] }
    const json = serializeAssetSpec(spec)
    expect(JSON.parse(json).v).toBe(ASSET_SPEC_VERSION)
    const back = parseAssetSpec(json)
    expect(back).not.toBeNull()
    expect(back?.parts[0].srcRef).toEqual({ defId: 'sofa-3seat', meshPath: '3' })
  })

  it('migration v12 → v13 is the identity', () => {
    const spec = { ...createEmptySpec(), parts: [] }
    expect(migrateAssetSpec(spec, 12)).toBe(spec)
    expect(migrateAssetSpec(spec, 13)).toBe(spec)
  })

  it('rejects a malformed srcRef', () => {
    const bad = {
      kind: 'asset',
      v: 13,
      payload: {
        ...createEmptySpec(),
        parts: [
          {
            id: 'x',
            kind: 'mesh',
            position: [0, 0, 0],
            size: [1, 1, 1],
            color: '#fff',
            srcRef: { defId: 5 },
          },
        ],
      },
    }
    expect(parseAssetSpec(JSON.stringify(bad))).toBeNull()
  })
})

describe('srcRef cache resolution', () => {
  it('resolves a ref part geometry from a populated scene', () => {
    const scene = twoMeshScene()
    const { parts } = decomposeObject(scene, { ref: { defId: 'box-asset' } })
    expect(parts).toHaveLength(2)
    // Before populate → placeholder box; the cache miss is a fallback, not a crash.
    expect(getCachedSrcRefGeometry(parts[0].srcRef!)).toBeNull()
    populateSrcRefCacheFromScene('box-asset', scene)
    const resolved = getCachedSrcRefGeometry(parts[0].srcRef!)
    expect(resolved).not.toBeNull()
    // partGeometry now returns real geometry (not the 1-box placeholder).
    const geo = partGeometry(parts[0])
    expect(geo.getAttribute('position').count).toBe(resolved?.getAttribute('position').count)
  })
})

describe('missing-def degradation', () => {
  it('drops ref parts whose source def is gone, keeps resolvable + non-ref parts', () => {
    const { parts } = decomposeObject(twoMeshScene(), { ref: { defId: 'gone' } })
    let spec = { ...createEmptySpec(), parts }
    spec = addPart(spec, 'box') // a normal box part that must survive
    const { spec: pruned, dropped } = dropUnresolvableSrcRefParts(spec, () => false)
    expect(dropped).toBe(2)
    expect(pruned.parts).toHaveLength(1)
    expect(pruned.parts[0].kind).toBe('box')
    // Nothing dropped when the def resolves.
    const keep = dropUnresolvableSrcRefParts(spec, () => true)
    expect(keep.dropped).toBe(0)
    expect(keep.spec.parts).toHaveLength(3)
  })
})

describe('GLB export → reimport → decompose → resolve round-trip', () => {
  it('a two-mesh GLB decomposes to ref parts that resolve from the reimported scene', async () => {
    const buf = await exportGlb(twoMeshScene())
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    const scene = await new Promise<Object3D>((resolve, reject) => {
      loader.parse(
        buf,
        '',
        (gltf) => resolve(gltf.scene),
        (e) => reject(e),
      )
    })
    const meshCount = (() => {
      let n = 0
      scene.traverse((o) => {
        if ((o as Mesh).isMesh) n += 1
      })
      return n
    })()
    expect(meshCount).toBe(2)
    const { parts } = decomposeObject(scene, { ref: { defId: 'reimported' } })
    expect(parts).toHaveLength(2)
    expect(parts.every((p) => !!p.srcRef && !p.geometry)).toBe(true)
    // Save (spec keeps refs) → restore resolves from the same scene.
    const spec = { ...createEmptySpec(), parts }
    const restored = parseAssetSpec(serializeAssetSpec(spec))
    expect(restored?.parts[0].srcRef?.defId).toBe('reimported')
    populateSrcRefCacheFromScene('reimported', scene)
    expect(getCachedSrcRefGeometry(restored!.parts[0].srcRef!)).not.toBeNull()
  })
})
