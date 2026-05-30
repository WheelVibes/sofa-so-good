import type { Object3D } from 'three';
import { Mesh, type Material, type Texture } from 'three';
import type { QualityTier } from '../../scene/quality';
import { TIER_BUDGETS } from './lod';

/** Slots on a standard material that hold textures we may downscale. */
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
] as const;

/** Resizes one texture's image to `cap` (longest edge) and returns the new
 *  image, or undefined if it can't. Injectable for tests. */
export type Resizer = (tex: Texture, cap: number) => CanvasImageSource | undefined;

const canvasResizer: Resizer = (tex, cap) => {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img?.height) return undefined;
  const scale = cap / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return canvas;
};

/** Downscales over-budget textures in `root` in place for the given tier.
 *  No-op on high. Idempotent (textures already within budget are skipped). */
export function applyTextureBudget(
  root: Object3D,
  tier: QualityTier,
  resize: Resizer = canvasResizer,
): void {
  if (tier === 'high') return;
  const cap = TIER_BUDGETS[tier].maxTexture;
  const seen = new Set<Texture>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) shrinkMaterial(mat, cap, seen, resize);
  });
}

function shrinkMaterial(
  mat: Material,
  cap: number,
  seen: Set<Texture>,
  resize: Resizer,
): void {
  const m = mat as unknown as Record<string, Texture | null>;
  for (const slot of TEXTURE_SLOTS) {
    const tex = m[slot];
    if (!tex || seen.has(tex)) continue;
    seen.add(tex);
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height) continue;
    if (Math.max(img.width, img.height) <= cap) continue;
    const next = resize(tex, cap);
    if (!next) continue;
    tex.image = next;
    tex.needsUpdate = true;
  }
}
