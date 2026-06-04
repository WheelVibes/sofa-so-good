import { describe, expect, it } from 'vitest'
import { convertModel } from './convertModel'

// Minimal ASCII STL: a single triangle. STL parsing + GLTF export are pure JS
// (no WebGL / DOM), so this round-trips under jsdom.
const STL = `solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
endsolid t
`

describe('convertModel', () => {
  // three's loaders fetch the entry via blob: URLs, which jsdom/node cannot
  // resolve ("URL scheme 'blob' is not supported"). This works in a real
  // browser; the full convert round-trip is exercised by the Task 10 visual
  // verification instead. The export half is covered by toGlb.test.ts.
  it.skip('converts an ASCII STL to a non-empty GLB (browser-only: blob fetch)', async () => {
    const entry = new File([STL], 'tri.stl', { type: 'model/stl' })
    const { glb, format } = await convertModel(entry, [])
    expect(format).toBe('stl')
    expect(glb.name).toBe('tri.glb')
    expect(glb.size).toBeGreaterThan(0)
    const head = String.fromCharCode(...new Uint8Array(await glb.slice(0, 4).arrayBuffer()))
    expect(head).toBe('glTF')
  })

  it('rejects an unsupported format', async () => {
    const entry = new File([new Uint8Array([1, 2, 3])], 'x.mtl')
    await expect(convertModel(entry, [])).rejects.toThrow(/Unsupported model format/)
  })
})
