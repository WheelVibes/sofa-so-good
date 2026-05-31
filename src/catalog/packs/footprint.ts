/**
 * Compute a bounding-box-derived footprint from raw GLB bytes by walking the
 * embedded glTF JSON's accessor.min / accessor.max arrays for every POSITION
 * attribute. Avoids Three.js / GLTFLoader so it runs in Node and jsdom (the
 * loader's texture-loading path hangs without a DOM Image impl).
 *
 * Convention: glTF uses +Y up. We map (x, z) → footprint (w, d) and y → h.
 * Falls back to {1,1,1} on any parse error.
 */

export interface Footprint {
  w: number
  d: number
  h: number
}

const FALLBACK: Footprint = { w: 1, d: 1, h: 1 }
const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'

interface GltfJson {
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>
    }>
  }>
  accessors?: Array<{
    min?: number[]
    max?: number[]
  }>
}

export async function glbFootprint(glbBytes: Uint8Array): Promise<Footprint> {
  try {
    if (glbBytes.byteLength < 20) return FALLBACK
    const dv = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength)
    const magic = dv.getUint32(0, true)
    if (magic !== GLB_MAGIC) return FALLBACK
    const chunkLen = dv.getUint32(12, true)
    const chunkType = dv.getUint32(16, true)
    if (chunkType !== CHUNK_JSON) return FALLBACK
    const jsonStart = 20
    const jsonBytes = glbBytes.subarray(jsonStart, jsonStart + chunkLen)
    const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfJson

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity

    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives ?? []) {
        const posIdx = prim.attributes?.POSITION
        if (typeof posIdx !== 'number') continue
        const acc = json.accessors?.[posIdx]
        if (!acc?.min || !acc?.max) continue
        if (acc.min.length < 3 || acc.max.length < 3) continue
        if (acc.min[0] < minX) minX = acc.min[0]
        if (acc.min[1] < minY) minY = acc.min[1]
        if (acc.min[2] < minZ) minZ = acc.min[2]
        if (acc.max[0] > maxX) maxX = acc.max[0]
        if (acc.max[1] > maxY) maxY = acc.max[1]
        if (acc.max[2] > maxZ) maxZ = acc.max[2]
      }
    }

    if (!isFinite(minX) || !isFinite(maxX)) return FALLBACK
    return {
      w: Math.max(0.05, maxX - minX),
      d: Math.max(0.05, maxZ - minZ),
      h: Math.max(0.05, maxY - minY),
    }
  } catch {
    return FALLBACK
  }
}
