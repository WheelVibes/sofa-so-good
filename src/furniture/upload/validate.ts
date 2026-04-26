/**
 * Pure validators for user-uploaded furniture GLBs. No React, no store.
 *
 * The runtime check goes:
 *   - extension + mime + size cap
 *   - GLB magic bytes (`glTF` u32 = 0x46546C67) at offset 0
 *   - For .gltf JSON, parse and reject any external `uri` references
 *     so a malicious payload can't pull in remote assets.
 */

export const MAX_GLB_BYTES = 25 * 1024 * 1024;

export type ValidateResult =
  | { ok: true; mime: string }
  | { ok: false; reason: string };

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian

export async function validateGlbFile(file: File): Promise<ValidateResult> {
  if (file.size > MAX_GLB_BYTES) {
    return { ok: false, reason: `File too large (${(file.size / 1_048_576).toFixed(1)} MB > ${MAX_GLB_BYTES / 1_048_576} MB).` };
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.glb')) {
    const head = await file.slice(0, 12).arrayBuffer();
    const view = new DataView(head);
    if (view.getUint32(0, true) !== GLB_MAGIC) {
      return { ok: false, reason: 'Not a GLB file (missing glTF magic header).' };
    }
    return { ok: true, mime: 'model/gltf-binary' };
  }
  if (lower.endsWith('.gltf')) {
    const text = await file.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'GLTF JSON failed to parse.' };
    }
    const hasExternalUris = (() => {
      const j = json as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
      const all = [...(j.buffers ?? []), ...(j.images ?? [])];
      return all.some(
        (e) => typeof e.uri === 'string' && !e.uri.startsWith('data:'),
      );
    })();
    if (hasExternalUris) {
      return {
        ok: false,
        reason: 'GLTF references external resources — only self-contained GLBs are allowed.',
      };
    }
    return { ok: true, mime: 'model/gltf+json' };
  }
  return { ok: false, reason: 'Only .glb or .gltf files are supported.' };
}
