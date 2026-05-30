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

let woodMaps: { albedo: Texture; normal: Texture; rough: Texture } | null = null;
function getWoodMaps(): { albedo: Texture; normal: Texture; rough: Texture } {
  if (woodMaps) return woodMaps;
  // Layered noise: low-freq warp bends the growth rings into cathedral
  // arches; mid-freq carries figure; high-freq scratches the surface and
  // draws open pores along the grain.
  const warpN = makeFbm(7777, 4, 3);
  const figureN = makeFbm(0x51ed, 4, 10);
  const poreN = makeFbm(0x2c7a, 3, 64);
  const flecks = makeFbm(0x91b3, 2, 40);
  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  const rough = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      // Warp the ring coordinate so bands are not perfectly straight; the
      // strong x-warp makes flatsawn "cathedral" arching down the board.
      const warp = (warpN(u * 1.3, v * 1.0) - 0.5) * 1.6;
      const ring = (u + warp) * Math.PI * 9;
      // Latewood lines: sharp dark bands where the ring turns over. Raising
      // the sine to a power tightens the dark line so earlywood stays pale.
      const s = Math.abs(Math.sin(ring));
      const late = Math.pow(s, 3.5); // 0 earlywood … 1 dark latewood line
      // Long open pores streaking along the grain (the v axis).
      const pore = clamp01((poreN(u * 8, v * 1.2) - 0.55) * 4);
      const figure = (figureN(u * 2, v * 2.5) - 0.5) * 0.12;
      const fleck = Math.max(0, flecks(u * 6, v * 6) - 0.62) * 0.4;
      // White-ish luminance so material.color tints it into real wood; the
      // latewood lines and pores darken it, flecks lighten it.
      const lum = clamp01(0.99 - late * 0.34 - pore * 0.12 + figure + fleck);
      const i = y * N + x;
      const c = Math.round(lum * 255);
      albedo[i * 4] = c;
      albedo[i * 4 + 1] = c;
      albedo[i * 4 + 2] = c;
      albedo[i * 4 + 3] = 255;
      // Pores + latewood sit slightly proud/recessed for a tactile normal.
      height[i] = late * 0.6 + pore * 0.5 + figure;
      // Open pores and latewood scatter more (rougher); earlywood is smoother.
      const r = clamp01(0.42 + late * 0.28 + pore * 0.22 - fleck * 0.3);
      const rc = Math.round(r * 255);
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = rc;
      rough[i * 4 + 3] = 255;
    }
  }
  const a = canvasFrom(albedo);
  const n = canvasFrom(heightToNormalRGBA(height, N, 3));
  const rg = canvasFrom(rough);
  woodMaps = { albedo: a, normal: n, rough: rg };
  return woodMaps;
}

// ---- Stone / marble -------------------------------------------------------
// Turbulent veins on a pale ground. Like wood, the albedo is near-white
// luminance so the material colour tints it (white marble, green, etc.).
let marbleMaps: { albedo: Texture; normal: Texture } | null = null;
function getMarbleMaps(): { albedo: Texture; normal: Texture } {
  if (marbleMaps) return marbleMaps;
  const baseN = makeFbm(0x5a17, 5, 4);
  const veinWarp = makeFbm(0x7d31, 4, 6);
  const grime = makeFbm(0x1133, 4, 20);
  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      // A directional coordinate warped by turbulence; veins fall where the
      // warped sine crosses zero, giving thin meandering cracks.
      const warp = (veinWarp(u * 2, v * 2) - 0.5) * 2.2;
      const field = Math.sin((u * 2.2 + v * 0.6 + warp) * Math.PI * 2.5);
      const vein = clamp01(1 - Math.abs(field) * 7); // thin ridge near 0
      // Secondary fainter vein network at a different angle.
      const warp2 = (baseN(u * 3 + 4, v * 3) - 0.5) * 2.5;
      const field2 = Math.sin((v * 1.8 - u * 0.4 + warp2) * Math.PI * 3.1);
      const vein2 = clamp01(1 - Math.abs(field2) * 11) * 0.5;
      const mottle = (grime(u * 4, v * 4) - 0.5) * 0.06;
      const lum = clamp01(0.97 - vein * 0.4 - vein2 * 0.22 + mottle);
      const i = y * N + x;
      const c = Math.round(lum * 255);
      albedo[i * 4] = albedo[i * 4 + 1] = albedo[i * 4 + 2] = c;
      albedo[i * 4 + 3] = 255;
      height[i] = vein * 0.4 + vein2 * 0.2;
    }
  }
  const a = canvasFrom(albedo);
  a.colorSpace = SRGBColorSpace;
  const n = canvasFrom(heightToNormalRGBA(height, N, 1.6));
  marbleMaps = { albedo: a, normal: n };
  return marbleMaps;
}

/** Polished stone / marble material tinted to `color` (near-white veins on a
 *  tinted ground). Low roughness + faint metalness give a polished sheen;
 *  `rough` overrides for honed/matte stone. */
export function getStoneMaterial(color: string, repeat = 1, rough = 0.12): MeshStandardMaterial {
  const key = `stone:${color}:${repeat}:${rough.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const maps = getMarbleMaps();
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
  m.normalScale.set(0.3, 0.3);
  cache.set(key, m);
  return m;
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

// Tone-on-tone weave patterns: a near-white luminance albedo (so the
// material colour tints it) carrying striped or herringbone structure.
const patternTex = new Map<string, Texture>();
function getPatternTexture(pattern: string): Texture {
  const hit = patternTex.get(pattern);
  if (hit) return hit;
  const fine = makeFbm(0x2b1a, 3, 90);
  const data = new Uint8ClampedArray(N * N * 4);
  const band = 26; // px per stripe / herringbone block
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let lum: number;
      if (pattern === 'striped') {
        // Soft vertical stripes, two tones close in value (tonal stripe).
        const s = Math.sin((x / band) * Math.PI);
        lum = 0.9 + 0.1 * (s > 0 ? 1 : -1) * 0.5;
      } else if (pattern === 'checkered') {
        // Gingham-style check: overlapping light/dark in both axes.
        const cx = Math.floor(x / band) % 2;
        const cy = Math.floor(y / band) % 2;
        lum = cx && cy ? 0.8 : cx || cy ? 0.9 : 0.99;
      } else if (pattern === 'plaid') {
        // Tartan: thin darker lines crossing a lighter ground.
        const vx = ((x % band) < 3) || ((x % (band * 2)) < 6 && (x % (band * 2)) > 2);
        const vy = ((y % band) < 3) || ((y % (band * 2)) < 6 && (y % (band * 2)) > 2);
        lum = vx && vy ? 0.78 : vx || vy ? 0.86 : 0.97;
      } else if (pattern === 'dots') {
        // Regular polka dots: darker discs on a light ground.
        const cx = (x % band) - band / 2;
        const cy = (y % band) - band / 2;
        lum = Math.hypot(cx, cy) < band * 0.28 ? 0.82 : 0.97;
      } else {
        // Herringbone: diagonals that flip direction every block row.
        const row = Math.floor(y / band);
        const dir = row % 2 === 0 ? 1 : -1;
        const t = ((x + dir * y) % band + band) % band;
        lum = t < band / 2 ? 0.97 : 0.83;
      }
      lum = clamp01(lum + (fine(x / N, y / N) - 0.5) * 0.05);
      const i = (y * N + x) * 4;
      const c = Math.round(lum * 255);
      data[i] = data[i + 1] = data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const tex = canvasFrom(data);
  tex.colorSpace = SRGBColorSpace;
  patternTex.set(pattern, tex);
  return tex;
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
export function getFabricMaterial(color: string, rough = 0.95, pattern = 'plain'): MeshStandardMaterial {
  const key = `fab:${color}:${rough.toFixed(2)}:${pattern}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const patterned =
    pattern === 'striped' ||
    pattern === 'herringbone' ||
    pattern === 'checkered' ||
    pattern === 'plaid' ||
    pattern === 'dots';
  const m = new MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0,
    normalMap: getFabricNormal(),
    map: patterned ? getPatternTexture(pattern) : null,
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

/** Two-colour art print for wall art: a crisp canvas pattern (vertical
 *  'stripes', a Mondrian-ish 'blocks' grid, or diagonal 'chevron') in colours
 *  a + b. Cached per (a, b, kind). */
export function getPrintMaterial(a: string, b: string, kind: string): MeshStandardMaterial {
  const key = `print:${a}:${b}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = b;
  if (kind === 'stripes') {
    for (let i = 1; i < 6; i += 2) ctx.fillRect((i / 6) * S, 0, S / 6, S);
  } else if (kind === 'chevron') {
    const bandH = S / 5;
    ctx.lineWidth = bandH * 0.5;
    ctx.strokeStyle = b;
    for (let y = -S; y < S * 2; y += bandH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S / 2, y + bandH);
      ctx.lineTo(S, y);
      ctx.stroke();
    }
  } else {
    // blocks: a few colour-blocked rectangles + tonal accents (abstract).
    const shade = (hex: string, f: number) => {
      const [r, g, bl] = hexToRgb(hex);
      return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(bl * f)})`;
    };
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, S * 0.55, S * 0.6);
    ctx.fillStyle = shade(a, 0.7);
    ctx.fillRect(S * 0.55, 0, S * 0.45, S * 0.4);
    ctx.fillStyle = shade(b, 1.25);
    ctx.fillRect(S * 0.55, S * 0.4, S * 0.45, S * 0.6);
    ctx.fillStyle = shade(a, 1.15);
    ctx.fillRect(0, S * 0.6, S * 0.55, S * 0.4);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
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
 *  'velvet'), tinted to `color`. `sheen` (0..1) tunes matte → glossy.
 *  `pattern` ('plain' | 'striped' | 'herringbone') applies a tone-on-tone
 *  weave to woven fabric only (leather/velvet ignore it). */
export function getUpholsteryMaterial(kind: string, color: string, sheen = 0, pattern = 'plain'): MeshStandardMaterial {
  if (kind === 'leather') return getLeatherMaterial(color, sheen > 0 ? sheenRough(0.42, sheen) : 0.42);
  if (kind === 'velvet') return getVelvetMaterial(color, sheen > 0 ? sheenRough(0.62, sheen) : 0.62);
  return getFabricMaterial(color, sheen > 0 ? sheenRough(0.95, sheen) : 0.95, pattern);
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
  if (kind === 'marble' || kind === 'stone')
    return getStoneMaterial(color, repeat, sheen > 0 ? sheenRough(0.12, sheen) : 0.12);
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
  const roughMap = maps.rough.clone();
  map.repeat.set(repeat, repeat);
  normal.repeat.set(repeat, repeat);
  roughMap.repeat.set(repeat, repeat);
  map.needsUpdate = normal.needsUpdate = roughMap.needsUpdate = true;
  const [r, g, b] = hexToRgb(color);
  const m = new MeshStandardMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: rough,
    metalness: 0.04,
    map,
    normalMap: normal,
    roughnessMap: roughMap,
  });
  m.normalScale.set(0.55, 0.55);
  cache.set(key, m);
  return m;
}

/** Cached plain solid material (metal pole, plastic body, etc.) so primitives
 *  can pass a real `Material` instance to a `material=` prop instead of a plain
 *  props object (which three.js silently ignores). */
export function getSolidMaterial(color: string, roughness: number, metalness: number): MeshStandardMaterial {
  const key = `solid:${color}:${roughness.toFixed(2)}:${metalness.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new MeshStandardMaterial({ color, roughness, metalness });
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
