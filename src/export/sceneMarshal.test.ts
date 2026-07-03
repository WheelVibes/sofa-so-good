import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Shape,
  ShapeGeometry,
} from 'three'
import { describe, expect, it } from 'vitest'
import { buildExportRoot, noExportUserData } from './sceneGltf'
import { marshalSceneForWorker, reconstructSceneFromMarshal } from './sceneMarshal'

function indexedTriangleGeometry(): BufferGeometry {
  const geom = new BufferGeometry()
  geom.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  geom.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1))
  return geom
}

describe('marshalSceneForWorker', () => {
  it('keeps attribute/index arrays as native typed arrays (the fast path)', () => {
    const mesh = new Mesh(indexedTriangleGeometry(), new MeshStandardMaterial({ color: '#ff0000' }))
    const { json } = marshalSceneForWorker(mesh)
    const geoms = json.geometries as Array<Record<string, unknown>>
    expect(geoms).toHaveLength(1)
    const data = geoms[0].data as {
      attributes: Record<string, { array: unknown }>
      index: { array: unknown }
    }
    expect(data.attributes.position.array).toBeInstanceOf(Float32Array)
    expect(data.index.array).toBeInstanceOf(Uint16Array)
  })

  it('leaves primitive geometries on the untouched .parameters short-circuit', () => {
    const mesh = new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial())
    const { json } = marshalSceneForWorker(mesh)
    const geoms = json.geometries as Array<Record<string, unknown>>
    expect(geoms[0].type).toBe('BoxGeometry')
    expect(geoms[0].width).toBe(1)
    expect(geoms[0].data).toBeUndefined()
  })

  it('falls back to the boxed-array path for an interleaved attribute (safety net)', () => {
    const interleaved = new InterleavedBuffer(
      new Float32Array([0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1]),
      4,
    )
    const geom = new BufferGeometry()
    geom.setAttribute('position', new InterleavedBufferAttribute(interleaved, 3, 0))
    geom.setAttribute('uv', new InterleavedBufferAttribute(interleaved, 2, 3))
    const mesh = new Mesh(geom, new MeshStandardMaterial())
    // Must not throw, and must still produce a valid (if boxed) geometry entry.
    const { json } = marshalSceneForWorker(mesh)
    const geoms = json.geometries as Array<Record<string, unknown>>
    expect(geoms).toHaveLength(1)
  })

  it('restores the original BufferGeometry.prototype.toJSON after the call, even after an interleaved fallback', () => {
    const before = BufferGeometry.prototype.toJSON
    marshalSceneForWorker(new Mesh(indexedTriangleGeometry(), new MeshStandardMaterial()))
    expect(BufferGeometry.prototype.toJSON).toBe(before)
  })

  it('survives a structuredClone round-trip (simulating postMessage) with typed arrays intact', () => {
    const mesh = new Mesh(indexedTriangleGeometry(), new MeshStandardMaterial())
    const { json } = marshalSceneForWorker(mesh)
    const cloned = structuredClone(json)
    const geoms = cloned.geometries as Array<Record<string, unknown>>
    const data = geoms[0].data as { attributes: Record<string, { array: unknown }> }
    expect(data.attributes.position.array).toBeInstanceOf(Float32Array)
    expect((data.attributes.position.array as Float32Array)[3]).toBe(1)
  })
})

describe('reconstructSceneFromMarshal', () => {
  it('round-trips geometry, material colour, hierarchy and a light with no textures involved', async () => {
    const root = new Group()
    root.name = 'root'
    const child = new Mesh(
      indexedTriangleGeometry(),
      new MeshStandardMaterial({ color: '#3366ff' }),
    )
    child.name = 'child-mesh'
    child.position.set(1, 2, 3)
    const light = new PointLight('#ffffff', 2, 10)
    light.name = 'lamp'
    root.add(child, light)

    const { json } = marshalSceneForWorker(root)
    const cloned = structuredClone(json)
    const rebuilt = await reconstructSceneFromMarshal(cloned)

    expect(rebuilt.children).toHaveLength(2)
    const rebuiltMesh = rebuilt.children.find((c) => c.name === 'child-mesh') as Mesh
    expect(rebuiltMesh).toBeDefined()
    expect(rebuiltMesh.position.toArray()).toEqual([1, 2, 3])
    const mat = rebuiltMesh.material as MeshStandardMaterial
    expect(mat.color.getHexString()).toBe('3366ff')
    const geom = rebuiltMesh.geometry
    expect(Array.from(geom.getAttribute('position').array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(Array.from(geom.getIndex()!.array)).toEqual([0, 1, 2])

    const rebuiltLight = rebuilt.children.find((c) => c.name === 'lamp') as PointLight
    expect(rebuiltLight).toBeDefined()
    expect(rebuiltLight.intensity).toBe(2)
  })

  it('excludes a noExport-tagged gizmo end-to-end (buildExportRoot -> marshal -> reconstruct)', async () => {
    const scene = new Group()
    scene.name = 'scene'
    const wall = new Mesh(indexedTriangleGeometry(), new MeshStandardMaterial())
    wall.name = 'wall'
    const gizmo = new Group()
    gizmo.name = 'gizmo'
    gizmo.userData = noExportUserData()
    gizmo.add(new Mesh(indexedTriangleGeometry(), new MeshStandardMaterial()))
    scene.add(wall, gizmo)

    const exportRoot = buildExportRoot(scene)
    const { json } = marshalSceneForWorker(exportRoot)
    const rebuilt = await reconstructSceneFromMarshal(structuredClone(json))

    const names = new Set<string>()
    rebuilt.traverse((o) => names.add(o.name))
    expect(names.has('wall')).toBe(true)
    expect(names.has('gizmo')).toBe(false)
  })

  it('round-trips a ShapeGeometry mesh (floor-plan slabs serialize via the shapes table)', async () => {
    // Regression: `ShapeGeometry`/`ExtrudeGeometry` serialize `parameters.shapes`
    // as uuids resolved against the root JSON's `shapes` library — the first
    // real-browser run crashed in the worker ("Cannot read properties of
    // undefined (reading '<uuid>')") because the reconstruct skipped
    // `parseShapes` and `parseGeometries`'s second argument.
    const outline = new Shape()
    outline.moveTo(0, 0)
    outline.lineTo(4, 0)
    outline.lineTo(4, 3)
    outline.lineTo(0, 3)
    const slab = new Mesh(new ShapeGeometry(outline), new MeshStandardMaterial())
    slab.name = 'floor-slab'
    const root = new Group()
    root.add(slab)

    const { json } = marshalSceneForWorker(buildExportRoot(root))
    const rebuilt = await reconstructSceneFromMarshal(structuredClone(json))

    const rebuiltSlab = rebuilt.children.find((c) => c.name === 'floor-slab') as Mesh
    expect(rebuiltSlab).toBeDefined()
    const pos = rebuiltSlab.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(0)
  })
})
