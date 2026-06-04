import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { normalizeTextureFile } from '../convert/reencode'
import type { MaterialCategory, TexturedMaterialDef } from '../types'
import { validateImageFile } from './validate'

export interface MaterialUploadFiles {
  albedo: File
  normal?: File | null
  roughness?: File | null
  ao?: File | null
}

export interface MaterialUploadOptions {
  name: string
  category: MaterialCategory
  uvScale: [number, number]
  swatch: string
}

export type PersistResult = { ok: true; def: TexturedMaterialDef } | { ok: false; reason: string }

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `mat-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

async function persistChannel(
  matAssetId: string,
  role: 'albedo' | 'normal' | 'roughness' | 'ao',
  file: File,
): Promise<{ assetId: string; url: string }> {
  // Exotic formats (TGA/TIFF/EXR/HDR) decode + PNG/JPEG re-encode to WebP;
  // WebP passes through. The dimension/size ceiling is checked post-normalize.
  const normalized = await normalizeTextureFile(file)
  const v = await validateImageFile(normalized)
  if (!v.ok) throw new Error(`${role}: ${v.reason}`)
  const assetId = `${matAssetId}-${role}`
  const blob = new Blob([await normalized.arrayBuffer()], { type: v.mime })
  await IdbAssetStore.put({
    assetId,
    kind: 'texture',
    mime: v.mime,
    name: `${role}.${v.mime.split('/')[1]}`,
    uploadedAt: new Date().toISOString(),
    blob,
    meta: { matId: matAssetId, role },
  })
  return { assetId, url: URL.createObjectURL(blob) }
}

/** Validates every channel, writes the blobs to IndexedDB (one record
 *  per role), then registers a TexturedMaterialDef with both the
 *  textures map (asset ids) and runtimeUrls (blob URLs for use by the
 *  material loader without an extra IDB round-trip). */
export async function persistUserMaterial(
  files: MaterialUploadFiles,
  opts: MaterialUploadOptions,
): Promise<PersistResult> {
  if (!opts.name.trim()) return { ok: false, reason: 'Name is required.' }
  const matId = `user-${newId()}`

  const persisted: Partial<
    Record<'albedo' | 'normal' | 'roughness' | 'ao', { assetId: string; url: string }>
  > = {}
  try {
    persisted.albedo = await persistChannel(matId, 'albedo', files.albedo)
    if (files.normal) persisted.normal = await persistChannel(matId, 'normal', files.normal)
    if (files.roughness)
      persisted.roughness = await persistChannel(matId, 'roughness', files.roughness)
    if (files.ao) persisted.ao = await persistChannel(matId, 'ao', files.ao)
  } catch (e) {
    // Roll back any successful writes so a half-uploaded material doesn't
    // leak into IDB.
    for (const r of Object.values(persisted)) {
      if (r) {
        URL.revokeObjectURL(r.url)
        await IdbAssetStore.delete(r.assetId).catch(() => {})
      }
    }
    return { ok: false, reason: (e as Error).message }
  }

  const def: TexturedMaterialDef = {
    id: matId,
    name: opts.name.trim(),
    category: opts.category,
    kind: 'textured',
    source: 'user',
    swatch: opts.swatch,
    uvScale: opts.uvScale,
    textures: {
      albedo: persisted.albedo!.assetId,
      normal: persisted.normal?.assetId,
      roughness: persisted.roughness?.assetId,
      ao: persisted.ao?.assetId,
    },
    runtimeUrls: {
      albedo: persisted.albedo!.url,
      normal: persisted.normal?.url,
      roughness: persisted.roughness?.url,
      ao: persisted.ao?.url,
    },
  }
  useStore.getState().addUserMaterial(def)
  return { ok: true, def }
}
