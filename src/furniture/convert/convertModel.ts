import type { Material, Object3D, Texture } from 'three'
import { detectModelFormat, MAX_BYTES_BY_FORMAT, type ModelFormat } from './formats'
import type { SiblingPool } from './loadToObject'

/** Thrown when a model can't be converted; carries a user-facing message. */
export class ConvertError extends Error {}

/** Dispose one material plus every Texture it references (IO-005). */
function disposeMaterial(m: Material): void {
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && (v as Texture).isTexture) (v as Texture).dispose()
  }
  m.dispose()
}

/**
 * Dispose the intermediate scene graph produced by the import loaders once its
 * GLB has been exported (IO-005). The object is never added to a live renderer,
 * so this releases CPU-side geometry buffers + any decoded textures (FBX/USDZ/…)
 * deterministically instead of leaving them for GC — important across a bulk
 * import of thousands of models.
 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Object3D & {
      geometry?: { dispose?: () => void }
      material?: Material | Material[]
    }
    mesh.geometry?.dispose?.()
    const mat = mesh.material
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) disposeMaterial(m)
  })
}

function pathOf(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
}

function baseOf(f: File): string {
  return (pathOf(f).split('/').pop() ?? f.name).toLowerCase()
}

/** Build a sibling pool from the entry file + every other file in its folder. */
function buildPool(entry: File, files: File[]): SiblingPool {
  const urls = new Map<string, string>()
  for (const f of files) urls.set(baseOf(f), URL.createObjectURL(f))
  const entryUrl = urls.get(baseOf(entry)) ?? URL.createObjectURL(entry)
  return { urls, entryUrl }
}

function revoke(pool: SiblingPool): void {
  for (const u of pool.urls.values()) URL.revokeObjectURL(u)
}

/**
 * Convert a non-GLB model file to a binary GLB File. `siblings` is every file in
 * the same dropped folder (for MTL/texture/bin resolution). A GLB/glTF entry is
 * still re-exported through three so external-ref glTF folders get packed inline
 * into a self-contained GLB.
 */
export async function convertModel(
  entry: File,
  siblings: File[],
): Promise<{ glb: File; format: ModelFormat }> {
  const format = await detectModelFormat(entry)
  if (!format) throw new ConvertError(`Unsupported model format: ${entry.name}`)
  const maxBytes = MAX_BYTES_BY_FORMAT[format] * 1024 * 1024
  if (entry.size > maxBytes) {
    throw new ConvertError(
      `${entry.name} too large (${(entry.size / 1_048_576).toFixed(1)} MB > ${MAX_BYTES_BY_FORMAT[format]} MB).`,
    )
  }
  const pool = buildPool(entry, [entry, ...siblings])
  let object: Object3D | null = null
  try {
    // Dynamic imports keep the rare-format three loaders (FBX/Collada/USDZ/…)
    // and the GLTFExporter out of the boot bundle — they only load when a
    // conversion actually runs (P-CHUNK).
    const [{ loadToObject }, { exportGlb }] = await Promise.all([
      import('./loadToObject'),
      import('./toGlb'),
    ])
    object = await loadToObject(format, pool)
    const buf = await exportGlb(object)
    if (buf.byteLength === 0) {
      throw new ConvertError(`Conversion produced an empty GLB: ${entry.name}`)
    }
    const name = entry.name.replace(/\.[a-z0-9]+$/i, '.glb')
    return { glb: new File([buf], name, { type: 'model/gltf-binary' }), format }
  } catch (e) {
    if (e instanceof ConvertError) throw e
    throw new ConvertError(
      `Failed to convert ${entry.name}: ${e instanceof Error ? e.message : String(e)}`,
    )
  } finally {
    // Dispose the intermediate scene graph (GLB already exported) + revoke the
    // sibling blob URLs — deterministic release across a bulk import (IO-005).
    if (object) disposeObject3D(object)
    revoke(pool)
  }
}

/** True when the entry needs conversion (anything but a native GLB). */
export function needsConversion(format: ModelFormat): boolean {
  return format !== 'glb'
}
