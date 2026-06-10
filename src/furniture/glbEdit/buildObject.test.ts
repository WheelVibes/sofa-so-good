import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { applyMeshOverrides, buildEditedObject, partGeometry, partMaterial } from './buildObject'
import {
  addPart,
  createEmptySpec,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  defaultPart,
  SHAPE_KINDS,
} from './editSpec'

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
