import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { buildMaterial } from '../../materials/cache'
import { furnitureMaterialCacheId } from '../../materials/furnitureMaterials'
import type { SolidMaterialDef } from '../../materials/types'
import {
  applyMeshOverrides,
  boxProjectUvs,
  buildEditedObject,
  partGeometry,
  partMaterial,
} from './buildObject'
import {
  addPart,
  createEmptySpec,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  defaultPart,
  SHAPE_KINDS,
  type ShapePart,
} from './editSpec'

/** Simulate the furniture material loader having built `mat:<id>` into the
 *  shared cache (the same pattern as `furnitureMaterialFinish.test.ts` — a
 *  solid def avoids the canvas-dependent procedural path). */
function buildFinishIntoCache(id: string, swatch = '#8a5a2b'): MeshStandardMaterial {
  const def: SolidMaterialDef = {
    id: furnitureMaterialCacheId(id),
    name: 'Test finish',
    category: 'floor',
    swatch,
    kind: 'solid',
  }
  return buildMaterial(def)
}

function graph() {
  const g = new Group()
  const seat = new Mesh(undefined, new MeshStandardMaterial({ color: '#ffffff' }))
  seat.name = 'Seat'
  const legs = new Mesh(undefined, new MeshStandardMaterial({ color: '#ffffff' }))
  legs.name = 'Legs'
  g.add(seat, legs)
  return { g, seat, legs }
}

describe('applyMeshOverrides', () => {
  it('recolours only the named mesh, cloning its material (no shared mutation)', () => {
    const { g, seat, legs } = graph()
    const legsMat = legs.material
    applyMeshOverrides(g, { Seat: { color: '#ff0000' } })
    expect((seat.material as MeshStandardMaterial).color.getHexString()).toBe('ff0000')
    // Legs untouched + its material instance unchanged.
    expect(legs.material).toBe(legsMat)
    expect((legs.material as MeshStandardMaterial).color.getHexString()).toBe('ffffff')
  })

  it('hides a mesh flagged hidden', () => {
    const { g, seat } = graph()
    applyMeshOverrides(g, { Seat: { hidden: true } })
    expect(seat.visible).toBe(false)
  })

  it('is a no-op with no overrides', () => {
    const { g, seat } = graph()
    const mat = seat.material
    applyMeshOverrides(g, {})
    expect(seat.material).toBe(mat)
    expect(seat.visible).toBe(true)
  })

  it('does not mutate a shared material across two recoloured meshes', () => {
    const g = new Group()
    const shared = new MeshStandardMaterial({ color: '#ffffff' })
    const a = new Mesh(undefined, shared)
    a.name = 'A'
    const b = new Mesh(undefined, shared)
    b.name = 'B'
    g.add(a, b)
    applyMeshOverrides(g, { A: { color: '#ff0000' }, B: { color: '#00ff00' } })
    expect((a.material as MeshStandardMaterial).color.getHexString()).toBe('ff0000')
    expect((b.material as MeshStandardMaterial).color.getHexString()).toBe('00ff00')
    expect(shared.color.getHexString()).toBe('ffffff') // original shared mat intact
  })
})

describe('partGeometry — every shape kind builds valid, finite geometry', () => {
  it.each(SHAPE_KINDS)('builds non-degenerate geometry for %s', (kind) => {
    const geo = partGeometry(defaultPart(kind))
    expect(geo).toBeInstanceOf(BufferGeometry)
    const pos = geo.getAttribute('position')
    expect(pos.count).toBeGreaterThan(0)
    // No NaN/Infinity slipped into the vertex buffer (would break export + render).
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
    // Has a real bounding box with positive extent.
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0)
    expect(bb.max.y - bb.min.y).toBeGreaterThan(0)
  })

  it('wedge maps its size to w×h×d (extrude axis → X)', () => {
    const geo = partGeometry({ ...defaultPart('wedge'), size: [0.6, 0.4, 0.8] })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    expect(bb.max.x - bb.min.x).toBeCloseTo(0.6, 2)
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.4, 2)
    expect(bb.max.z - bb.min.z).toBeCloseTo(0.8, 2)
  })

  it('builds one mesh per part across all kinds (preview == export parity)', () => {
    let spec = createEmptySpec()
    for (const kind of SHAPE_KINDS) spec = addPart(spec, kind)
    const obj = buildEditedObject(null, spec)
    const meshes: Mesh[] = []
    obj.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o)
    })
    expect(meshes).toHaveLength(SHAPE_KINDS.length)
  })
})

describe('partMaterial — per-part PBR', () => {
  it('falls back to the matte defaults when roughness/metalness are unset', () => {
    const m = partMaterial(defaultPart('box'))
    expect(m.roughness).toBeCloseTo(DEFAULT_PART_ROUGHNESS)
    expect(m.metalness).toBeCloseTo(DEFAULT_PART_METALNESS)
  })

  it('honours explicit roughness + metalness (e.g. a polished metal part)', () => {
    const m = partMaterial({ ...defaultPart('cylinder'), roughness: 0.1, metalness: 0.9 })
    expect(m.roughness).toBeCloseTo(0.1)
    expect(m.metalness).toBeCloseTo(0.9)
    expect(m.color.getHexString()).toBe('b08d57')
  })

  it('is opaque + non-glowing by default', () => {
    const m = partMaterial(defaultPart('box'))
    expect(m.transparent).toBe(false)
    expect(m.opacity).toBe(1)
    expect(m.emissiveIntensity).toBe(0)
    expect(m.emissive.getHexString()).toBe('000000')
  })

  it('glows in its own colour when emissiveIntensity > 0', () => {
    const m = partMaterial({ ...defaultPart('sphere'), color: '#ff0000', emissiveIntensity: 2 })
    expect(m.emissiveIntensity).toBe(2)
    expect(m.emissive.getHexString()).toBe('ff0000')
  })

  it('goes translucent (transparent flag set) when opacity < 1', () => {
    const m = partMaterial({ ...defaultPart('box'), opacity: 0.4 })
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBeCloseTo(0.4)
  })

  it('the built object carries each part’s material values', () => {
    let spec = createEmptySpec()
    spec = addPart(spec, 'box')
    spec.parts[0]!.metalness = 1
    spec.parts[0]!.roughness = 0.2
    const obj = buildEditedObject(null, spec)
    const mesh = obj.children.find((c) => c instanceof Mesh) as Mesh
    const mat = mesh.material as MeshStandardMaterial
    expect(mat.metalness).toBeCloseTo(1)
    expect(mat.roughness).toBeCloseTo(0.2)
  })

  it('applies a part’s degree rotation to the built mesh (converted to radians)', () => {
    let spec = createEmptySpec()
    spec = addPart(spec, 'cone')
    spec.parts[0]!.rotation = [90, 0, 0]
    const obj = buildEditedObject(null, spec)
    const mesh = obj.children.find((c) => c instanceof Mesh) as Mesh
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2)
    expect(mesh.rotation.y).toBeCloseTo(0)
  })
})

describe('partMaterial — per-part texture finish (GE3c)', () => {
  it('resolves a built `mat:<id>` finish to an owned CLONE of the cached material', () => {
    const built = buildFinishIntoCache('test:ge3c-oak')
    const m = partMaterial({ ...defaultPart('box'), finish: 'mat:test:ge3c-oak' })
    expect(m).not.toBe(built) // owned clone — the dialog/export can dispose it
    expect(m.color.getHexString()).toBe(built.color.getHexString())
    expect(m.roughness).toBe(built.roughness) // finish's surface wins
  })

  it('applies per-part glow/opacity over the finish without mutating the cached base', () => {
    const built = buildFinishIntoCache('test:ge3c-marble', '#ffffff')
    const m = partMaterial({
      ...defaultPart('box'),
      color: '#ff0000',
      finish: 'mat:test:ge3c-marble',
      emissiveIntensity: 2,
      opacity: 0.5,
    })
    expect(m.emissiveIntensity).toBe(2)
    expect(m.emissive.getHexString()).toBe('ff0000')
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBeCloseTo(0.5)
    // The shared cache instance stays pristine.
    expect(built.transparent).toBe(false)
    expect(built.opacity).toBe(1)
    expect(built.emissive.getHexString()).toBe('000000')
  })

  it('ignores the part’s flat roughness/metalness while a finish is set', () => {
    const built = buildFinishIntoCache('test:ge3c-rough')
    const m = partMaterial({
      ...defaultPart('box'),
      finish: 'mat:test:ge3c-rough',
      roughness: 0.1,
      metalness: 0.9,
    })
    expect(m.roughness).toBe(built.roughness)
    expect(m.metalness).toBe(built.metalness)
  })

  it('falls back to the solid colour for an unbuilt/unknown finish id (no crash)', () => {
    const m = partMaterial({ ...defaultPart('box'), finish: 'mat:nope:not-downloaded' })
    expect(m.color.getHexString()).toBe('b08d57')
    expect(m.roughness).toBeCloseTo(DEFAULT_PART_ROUGHNESS)
  })

  it('treats a non-`mat:` finish string as no finish (solid path)', () => {
    const m = partMaterial({ ...defaultPart('box'), finish: 'wood' })
    expect(m.color.getHexString()).toBe('b08d57')
  })

  it('the built (exported) object carries the finish material on the part mesh', () => {
    buildFinishIntoCache('test:ge3c-export', '#123456')
    let spec = createEmptySpec()
    spec = addPart(spec, 'box')
    spec.parts[0]!.finish = 'mat:test:ge3c-export'
    const obj = buildEditedObject(null, spec)
    const mesh = obj.children.find((c) => c instanceof Mesh) as Mesh
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe('123456')
  })
})

describe('boxProjectUvs — UVs for CSG mesh parts', () => {
  function meshPart(): ShapePart {
    const src = new BoxGeometry(0.4, 0.2, 0.6)
    const part: ShapePart = {
      id: 'm1',
      kind: 'mesh',
      position: [0, 0.1, 0],
      size: [0.4, 0.2, 0.6],
      color: '#ffffff',
      geometry: {
        positions: Array.from(src.getAttribute('position').array),
        normals: Array.from(src.getAttribute('normal').array),
        index: Array.from(src.getIndex()!.array),
      },
    }
    src.dispose()
    return part
  }

  it('a rebuilt mesh part gains finite plane-projected UVs (so a texture tiles)', () => {
    const geo = partGeometry(meshPart())
    const uv = geo.getAttribute('uv')
    expect(uv).toBeTruthy()
    expect(uv.count).toBe(geo.getAttribute('position').count)
    for (let i = 0; i < uv.array.length; i++) expect(Number.isFinite(uv.array[i])).toBe(true)
    // The projection spans the part’s extent (not a single smeared texel).
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let i = 0; i < uv.count; i++) {
      min = Math.min(min, uv.getX(i))
      max = Math.max(max, uv.getX(i))
    }
    expect(max - min).toBeGreaterThan(0.1)
  })

  it('projects onto the plane facing each vertex normal (top face → XZ)', () => {
    const geo = new BoxGeometry(1, 1, 1)
    geo.deleteAttribute('uv')
    boxProjectUvs(geo)
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) > 0.9) {
        expect(uv.getX(i)).toBeCloseTo(pos.getX(i), 5)
        expect(uv.getY(i)).toBeCloseTo(pos.getZ(i), 5)
      }
    }
    geo.dispose()
  })

  it('never clobbers existing UVs (primitive parts keep their own)', () => {
    const geo = partGeometry(defaultPart('box'))
    const orig = geo.getAttribute('uv')
    expect(orig).toBeTruthy()
    boxProjectUvs(geo)
    expect(geo.getAttribute('uv')).toBe(orig)
    geo.dispose()
  })
})
