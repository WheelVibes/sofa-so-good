/**
 * Tintable procedural micro-textures for furniture surfaces — a soft fabric
 * weave normal and a wood-grain albedo+normal. The greyscale/neutral maps are
 * generated once and shared; a MeshStandardMaterial is cached per (kind, tint)
 * so many pieces reuse the same GPU texture and only differ by colour.
 * Browser-only (canvas).
 */
import {
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  type Texture,
} from 'three';
import { makeFbm, heightToNormalRGBA, hexToRgb, clamp01 } from './procedural/noise';

const N = 256;

function canvasFrom(data: Uint8ClampedArray): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let fabricNormal: Texture | null = null;
function getFabricNormal(): Texture {
  if (fabricNormal) return fabricNormal;
  const fine = makeFbm(4242, 4, 120);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Soft over/under weave: a fine grid modulated by noise.
      const weave = 0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(y * 0.9);
      height[y * N + x] = weave * 0.6 + fine(x / N, y / N) * 0.4;
    }
  }
  fabricNormal = canvasFrom(heightToNormalRGBA(height, N, 2.2));
  return fabricNormal;
}

let woodMaps: { albedo: Texture; normal: Texture } | null = null;
function getWoodMaps(): { albedo: Texture; normal: Texture } {
  if (woodMaps) return woodMaps;
  const grain = makeFbm(7777, 4, 4);
  const fine = makeFbm(0x51ed, 3, 26);
  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      // Bands running along x (grain), warped by low-freq noise.
      const warp = grain(u * 1.2, v * 1.5) - 0.5;
      const band = Math.abs(Math.sin((v + warp * 0.5) * Math.PI * 7));
      const fg = fine(u * 3, v);
      // White-ish luminance so material.color tints it into real wood.
      const lum = clamp01(0.96 - band * 0.18 + (fg - 0.5) * 0.07);
      const i = y * N + x;
      const c = Math.round(lum * 255);
      albedo[i * 4] = c;
      albedo[i * 4 + 1] = c;
      albedo[i * 4 + 2] = c;
      albedo[i * 4 + 3] = 255;
      height[i] = band * 0.5 + fg * 0.2;
    }
  }
  const a = canvasFrom(albedo);
  const n = canvasFrom(heightToNormalRGBA(height, N, 3));
  woodMaps = { albedo: a, normal: n };
  return woodMaps;
}

let leatherNormal: Texture | null = null;
function getLeatherNormal(): Texture {
  if (leatherNormal) return leatherNormal;
  // Fine pebbled grain (small cells) for a leather hide look.
  const coarse = makeFbm(0x1ea7, 4, 18);
  const fine = makeFbm(0x9a13, 3, 60);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      height[y * N + x] = coarse(u, v) * 0.6 + fine(u, v) * 0.4;
    }
  }
  leatherNormal = canvasFrom(heightToNormalRGBA(height, N, 1.4));
  return leatherNormal;
}

const cache = new Map<string, MeshStandardMaterial>();

/** Soft-fabric material tinted to `color` (upholstery). */
export function getFabricMaterial(color: string): MeshStandardMaterial {
  const key = 'fab:' + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    normalMap: getFabricNormal(),
  });
  m.normalScale.set(0.5, 0.5);
  cache.set(key, m);
  return m;
}

/** Smooth leather upholstery — pebbled grain, low roughness for a soft sheen. */
export function getLeatherMaterial(color: string): MeshStandardMaterial {
  const key = 'leath:' + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.06,
    normalMap: getLeatherNormal(),
  });
  m.normalScale.set(0.35, 0.35);
  cache.set(key, m);
  return m;
}

/** Velvet upholstery — soft pile (fine weave normal) with a gentle sheen
 *  (lower roughness than plain fabric) so it catches light richly. */
export function getVelvetMaterial(color: string): MeshStandardMaterial {
  const key = 'velv:' + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.02,
    normalMap: getFabricNormal(),
  });
  m.normalScale.set(0.22, 0.22);
  cache.set(key, m);
  return m;
}

/** Dispatch upholstery material by finish kind ('fabric' | 'leather' |
 *  'velvet'), tinted to `color`. */
export function getUpholsteryMaterial(kind: string, color: string): MeshStandardMaterial {
  if (kind === 'leather') return getLeatherMaterial(color);
  if (kind === 'velvet') return getVelvetMaterial(color);
  return getFabricMaterial(color);
}

/** Wood material whose grain is tinted by `color`. `repeat` tiles the grain
 *  (defaults suit a ~1 m piece). */
export function getWoodMaterial(color: string, repeat = 1): MeshStandardMaterial {
  const key = `wood:${color}:${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const maps = getWoodMaps();
  // Clone so per-repeat tiling doesn't clobber the shared source.
  const map = maps.albedo.clone();
  const normal = maps.normal.clone();
  map.repeat.set(repeat, repeat);
  normal.repeat.set(repeat, repeat);
  map.needsUpdate = normal.needsUpdate = true;
  const [r, g, b] = hexToRgb(color);
  const m = new MeshStandardMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: 0.5,
    metalness: 0.04,
    map,
    normalMap: normal,
  });
  m.normalScale.set(0.4, 0.4);
  cache.set(key, m);
  return m;
}
