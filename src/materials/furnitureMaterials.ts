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
  SRGBColorSpace,
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

/** Continuous "shine" 0..1 → roughness: 0 keeps the material's natural matte
 *  roughness, 1 drives it to a high-gloss finish. Lets any colour+material be
 *  tuned matte → satin → gloss. */
function sheenRough(base: number, sheen: number): number {
  const s = Math.min(1, Math.max(0, sheen));
  return base * (1 - s) + 0.04 * s;
}

/** Soft-fabric material tinted to `color` (upholstery). `rough` overrides the
 *  natural roughness (for the shine control). */
export function getFabricMaterial(color: string, rough = 0.95): MeshStandardMaterial {
  const key = `fab:${color}:${rough.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0,
    normalMap: getFabricNormal(),
  });
  m.normalScale.set(0.5, 0.5);
  cache.set(key, m);
  return m;
}

/** Woven fabric with a diagonal two-colour gradient (ombre) albedo, tinted
 *  full-colour by the gradient itself. Shares the fabric weave normal. */
export function getGradientFabricMaterial(a: string, b: string): MeshStandardMaterial {
  const key = `grad:${a}:${b}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new MeshStandardMaterial({
    map: tex,
    roughness: 0.95,
    metalness: 0,
    normalMap: getFabricNormal(),
  });
  m.normalScale.set(0.5, 0.5);
  cache.set(key, m);
  return m;
}

/** Flat two-colour diagonal gradient (no weave) — for prints / wall art. */
export function getGradientMaterial(a: string, b: string): MeshStandardMaterial {
  const key = `gradflat:${a}:${b}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  cache.set(key, m);
  return m;
}

/** Smooth leather upholstery — pebbled grain, low roughness for a soft sheen. */
export function getLeatherMaterial(color: string, rough = 0.42): MeshStandardMaterial {
  const key = `leath:${color}:${rough.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0.06,
    normalMap: getLeatherNormal(),
  });
  m.normalScale.set(0.35, 0.35);
  cache.set(key, m);
  return m;
}

/** Velvet upholstery — soft pile (fine weave normal) with a gentle sheen
 *  (lower roughness than plain fabric) so it catches light richly. */
export function getVelvetMaterial(color: string, rough = 0.62): MeshStandardMaterial {
  const key = `velv:${color}:${rough.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0.02,
    normalMap: getFabricNormal(),
  });
  m.normalScale.set(0.22, 0.22);
  cache.set(key, m);
  return m;
}

/** Dispatch upholstery material by finish kind ('fabric' | 'leather' |
 *  'velvet'), tinted to `color`. `sheen` (0..1) tunes matte → glossy. */
export function getUpholsteryMaterial(kind: string, color: string, sheen = 0): MeshStandardMaterial {
  if (kind === 'leather') return getLeatherMaterial(color, sheen > 0 ? sheenRough(0.42, sheen) : 0.42);
  if (kind === 'velvet') return getVelvetMaterial(color, sheen > 0 ? sheenRough(0.62, sheen) : 0.62);
  return getFabricMaterial(color, sheen > 0 ? sheenRough(0.95, sheen) : 0.95);
}

/** Flat painted material — matte by default, or glossy (lacquered) when
 *  `gloss` is set. `rough` overrides roughness (shine control). No grain, so
 *  it reads as a painted/laminate surface. */
export function getPaintedMaterial(color: string, gloss = false, rough?: number): MeshStandardMaterial {
  const r = rough ?? (gloss ? 0.16 : 0.72);
  const metal = gloss ? 0.1 : 0.0;
  const key = `paint:${color}:${r.toFixed(2)}:${metal}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({ color, roughness: r, metalness: metal });
  cache.set(key, m);
  return m;
}

/** Dispatch a hard-surface material by finish kind ('wood' | 'painted' |
 *  'gloss'), tinted to `color`. `sheen` (0..1) tunes matte → glossy across all
 *  three. Wood keeps its grain; painted/gloss are flat. */
export function getSurfaceMaterial(kind: string, color: string, repeat = 1, sheen = 0): MeshStandardMaterial {
  if (kind === 'painted') return getPaintedMaterial(color, false, sheen > 0 ? sheenRough(0.72, sheen) : undefined);
  if (kind === 'gloss') return getPaintedMaterial(color, true, sheen > 0 ? sheenRough(0.16, sheen) : undefined);
  return getWoodMaterial(color, repeat, sheen > 0 ? sheenRough(0.5, sheen) : 0.5);
}

/** Wood material whose grain is tinted by `color`. `repeat` tiles the grain
 *  (defaults suit a ~1 m piece). `rough` overrides roughness (shine control). */
export function getWoodMaterial(color: string, repeat = 1, rough = 0.5): MeshStandardMaterial {
  const key = `wood:${color}:${repeat}:${rough.toFixed(2)}`;
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
    roughness: rough,
    metalness: 0.04,
    map,
    normalMap: normal,
  });
  m.normalScale.set(0.4, 0.4);
  cache.set(key, m);
  return m;
}

/**
 * Surface-finish presets for hard appliance/fixture bodies. Returns plain
 * `meshStandardMaterial` props (roughness/metalness) to spread onto a mesh
 * material so the same painted/steel/gloss look is consistent across the
 * fridge, washer, oven, hood, microwave, etc. Colour is supplied separately.
 */
export function applianceFinish(finish: string): { roughness: number; metalness: number } {
  switch (finish) {
    case 'steel': // brushed stainless steel
      return { roughness: 0.3, metalness: 0.88 };
    case 'gloss': // glossy lacquer / glass front
      return { roughness: 0.12, metalness: 0.25 };
    case 'matte': // painted matte
    default:
      return { roughness: 0.55, metalness: 0.1 };
  }
}
