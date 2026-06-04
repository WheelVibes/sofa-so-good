import { Document, WebIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { optimizeGlb } from './optimizeGlb'

async function tinyGlb(): Promise<Uint8Array> {
  const doc = new Document()
  const buf = doc.createBuffer()
  const pos = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buf)
  const prim = doc.createPrimitive().setAttribute('POSITION', pos)
  const mesh = doc.createMesh().addPrimitive(prim)
  const node = doc.createNode().setMesh(mesh)
  doc.createScene().addChild(node)
  return new WebIO().writeBinary(doc)
}

describe('optimizeGlb', () => {
  it('returns a valid, non-empty GLB and never throws', async () => {
    const input = await tinyGlb()
    const { data, report } = await optimizeGlb(input)
    expect(data.byteLength).toBeGreaterThan(0)
    expect(report.beforeBytes).toBe(input.byteLength)
    expect(report.afterBytes).toBeGreaterThan(0)
    // Output reads back as a valid glTF document (or, on graceful fallback,
    // it's the untouched input — either way a valid GLB).
    const head = String.fromCharCode(...data.slice(0, 4))
    expect(head).toBe('glTF')
  })
})
