// @vitest-environment happy-dom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { exportGlb } from './toGlb'

describe('exportGlb', () => {
  it('exports a mesh to a binary GLB with the glTF magic header', async () => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const buf = await exportGlb(mesh)
    expect(buf.byteLength).toBeGreaterThan(0)
    const head = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))
    expect(head).toBe('glTF')
  })
})
