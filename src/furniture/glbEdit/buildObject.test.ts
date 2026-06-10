import { Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { applyMeshOverrides } from './buildObject'

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
