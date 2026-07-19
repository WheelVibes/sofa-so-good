/**
 * Model-format detection for the upload pipeline. Every supported model file is
 * either native GLB/glTF (loaded verbatim) or converted to GLB before persist
 * (see {@link ./convertModel}). Detection prefers unambiguous magic bytes and
 * falls back to the file extension.
 */

/** 3D model formats we ingest. 'glb'/'gltf' are native; the rest convert. */
export type ModelFormat =
  | 'glb'
  | 'gltf'
  | 'obj'
  | 'fbx'
  | 'stl'
  | 'ply'
  | 'dae'
  | '3ds'
  | '3mf'
  | 'usdz'

/** Entry-file extensions (NOT .mtl/.bin/textures, which are resolved siblings). */
export const MODEL_EXTENSIONS = [
  '.glb',
  '.gltf',
  '.obj',
  '.fbx',
  '.stl',
  '.ply',
  '.dae',
  '.3ds',
  '.3mf',
  '.usdz',
] as const

const EXT_TO_FORMAT: Record<string, ModelFormat> = {
  '.glb': 'glb',
  '.gltf': 'gltf',
  '.obj': 'obj',
  '.fbx': 'fbx',
  '.stl': 'stl',
  '.ply': 'ply',
  '.dae': 'dae',
  '.3ds': '3ds',
  '.3mf': '3mf',
  '.usdz': 'usdz',
}

/** Per-format size ceilings (MB). Text formats (OBJ/DAE) can be large. */
export const MAX_BYTES_BY_FORMAT: Record<ModelFormat, number> = {
  glb: 25,
  gltf: 25,
  obj: 80,
  fbx: 80,
  stl: 80,
  ply: 80,
  dae: 80,
  '3ds': 80,
  '3mf': 80,
  usdz: 80,
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

/** Map a file name/path to a model format by its extension alone (no byte
 *  sniffing) — for callers that only have a name + bytes and not a `File`, e.g.
 *  the `.sh3f` furniture-library importer resolving each catalog entry's model.
 *  Returns `null` for a non-model extension (skipped by the caller). */
export function modelFormatFromName(nameOrPath: string): ModelFormat | null {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  return EXT_TO_FORMAT[extOf(base)] ?? null
}

/** True for actual model entry files (any supported model extension). */
export function isModelEntryFile(nameOrPath: string): boolean {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  return MODEL_EXTENSIONS.includes(extOf(base) as (typeof MODEL_EXTENSIONS)[number])
}

function ascii(buf: ArrayBuffer, len: number): string {
  return String.fromCharCode(...new Uint8Array(buf.slice(0, len)))
}

/** Detect format from magic bytes where unambiguous, else extension.
 *  Returns null when the file is not a recognised model entry file. */
export async function detectModelFormat(file: File): Promise<ModelFormat | null> {
  const ext = extOf(file.name)
  const byExt = EXT_TO_FORMAT[ext] ?? null
  const head = await file.slice(0, 24).arrayBuffer()
  // GLB: 'glTF' u32 LE at offset 0.
  if (head.byteLength >= 4 && ascii(head, 4) === 'glTF') return 'glb'
  // FBX binary: 'Kaydara FBX Binary' magic.
  if (head.byteLength >= 18 && ascii(head, 18) === 'Kaydara FBX Binary') return 'fbx'
  // FBX ASCII: the text variant opens with a '; FBX <version> project file'
  // comment header. Catching it reroutes a mis-extensioned ASCII FBX to the FBX
  // loader instead of throwing an opaque parse error elsewhere (IO-009).
  if (head.byteLength >= 5 && ascii(head, 5) === '; FBX') return 'fbx'
  // PLY: ASCII/binary both start with 'ply'.
  if (head.byteLength >= 3 && ascii(head, 3) === 'ply') return 'ply'
  // Zip (PK\x03\x04 → 3mf/usdz) and XML ('<?xml' → dae/gltf) magics confirm a
  // family but can't disambiguate within it, so the extension stays the source
  // of truth for those — no override here.
  return byExt
}
