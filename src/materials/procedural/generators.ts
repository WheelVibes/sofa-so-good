/**
 * Runtime procedural PBR texture generators. Each pattern paints a single
 * seamlessly-tiling tile (albedo + normal + roughness) on a canvas; the
 * material then repeats it across a surface via UV scale. No network, tiny
 * memory (one tile per material, shared across every mesh that uses it).
 */
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import {
  clamp01,
  hashSeed,
  heightToNormalRGBA,
  hexToRgb,
  makeFbm,
  mix,
  mulberry32,
} from './noise';

export type ProceduralPattern =
  | 'wood'
  | 'tile'
  | 'carpet'
  | 'concrete'
  | 'marble'
  | 'plaster'
  | 'terrazzo'
  | 'stripe'
  | 'grasscloth';

export interface ProceduralResult {
  albedo: Texture;
  normal: Texture;
  roughness: Texture;
  metalness: number;
}

let S = 512;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  return c;
}

function toTexture(data: Uint8ClampedArray, srgb: boolean): CanvasTexture {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface Fields {
  /** RGBA albedo, 0..255. */
  albedo: Uint8ClampedArray;
  /** Height field 0..1 for normal-map derivation. */
  height: Float32Array;
  /** Per-texel roughness 0..1. */
  rough: Float32Array;
  /** Bump strength fed to the normal derivation. */
  normalStrength: number;
  metalness: number;
}

function blank(): Fields {
  return {
    albedo: new Uint8ClampedArray(S * S * 4),
    height: new Float32Array(S * S),
    rough: new Float32Array(S * S),
    normalStrength: 1,
    metalness: 0,
  };
}

function setPx(
  f: Fields,
  i: number,
  r: number,
  g: number,
  b: number,
  h: number,
  rough: number,
) {
  f.albedo[i * 4] = r;
  f.albedo[i * 4 + 1] = g;
  f.albedo[i * 4 + 2] = b;
  f.albedo[i * 4 + 3] = 255;
  f.height[i] = h;
  f.rough[i] = rough;
}

function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

// ── Patterns ───────────────────────────────────────────────────────────────

function woodFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 9;
  const rand = mulberry32(seed);
  const planks = 6; // boards stacked across the tile
  const plankH = S / planks;
  // Per-plank tint with correlated warmth (real boards vary in hue + value).
  const plank = Array.from({ length: planks }, () => {
    const val = 0.86 + rand() * 0.24; // brightness
    const warm = 0.94 + rand() * 0.16; // >1 warmer (more red, less blue)
    const phase = rand() * 10;
    // A couple of knots per board at random positions along its length.
    const knots = rand() < 0.6
      ? [{ u: rand(), v: 0.25 + rand() * 0.5, r: 0.012 + rand() * 0.02 }]
      : [];
    return { val, warm, phase, knots };
  });
  // Cathedral grain: low-freq along the board, tight bands across it.
  const grainAlong = makeFbm(seed + 7, 4, 3);
  const fineGrain = makeFbm(seed + 99, 3, 28);
  for (let y = 0; y < S; y++) {
    const pi = Math.floor(y / plankH);
    const yInPlank = (y % plankH) / plankH; // 0..1
    const pk = plank[pi];
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // Bands run along the board (x); warp them with low-freq noise so the
      // grain meanders like real timber rather than ruled lines.
      const warp = grainAlong(u * 1.2 + pk.phase, v * 1.5) - 0.5;
      const band = Math.abs(Math.sin((yInPlank + warp * 0.6) * Math.PI * 9 + pk.phase));
      const fg = fineGrain(u * 4, v);
      // Grain lines darken; fine noise adds tooth.
      let factor = pk.val * (0.92 - band * 0.16 + (fg - 0.5) * 0.06);

      // Knots: dark elliptical cores with a tight ring.
      let knotH = 0;
      for (const k of pk.knots) {
        const du = (u - k.u);
        const dv = (yInPlank - k.v) * 0.6;
        const d = Math.hypot(du, dv);
        if (d < k.r * 3) {
          const core = d < k.r ? 1 : 0;
          const ring = Math.abs(Math.sin(d / k.r * 3.5)) * (1 - d / (k.r * 3));
          factor *= 1 - core * 0.55 - ring * 0.25;
          knotH = Math.max(knotH, ring * 0.4 + core * 0.5);
        }
      }

      // Plank groove (dark + recessed bevel between boards).
      const edge = Math.min(yInPlank, 1 - yInPlank);
      const groove = edge < 0.035 ? edge / 0.035 : 1;
      factor *= 0.45 + 0.55 * groove;

      // Apply warmth: scale R up / B down around the value.
      const r = base[0] * factor * pk.warm;
      const g = base[1] * factor;
      const b = base[2] * factor * (2 - pk.warm);
      const h = clamp01(0.55 * groove + band * 0.3 + knotH);
      // Satin-varnished boards: fairly glossy, grain lines slightly rougher.
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2);
      setPx(f, y * S + x, r, g, b, h, rough);
    }
  }
  return f;
}

function tileFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 22;
  const tilesPerRow = 2;
  const cell = S / tilesPerRow;
  const groutW = S * 0.018;
  const rand = mulberry32(seed);
  const cellTint: number[] = [];
  for (let i = 0; i < tilesPerRow * tilesPerRow; i++) cellTint.push(0.94 + rand() * 0.12);
  const speck = makeFbm(seed + 3, 3, 50);
  const grout: [number, number, number] = [
    base[0] * 0.62,
    base[1] * 0.62,
    base[2] * 0.6,
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const inX = x - cx * cell;
      const inY = y - cy * cell;
      const distEdge = Math.min(inX, cell - inX, inY, cell - inY);
      const i = y * S + x;
      if (distEdge < groutW) {
        // Recessed grout line.
        const t = distEdge / groutW;
        setPx(f, i, grout[0], grout[1], grout[2], 0.05 + t * 0.1, 0.9);
      } else {
        const tint = cellTint[cy * tilesPerRow + cx];
        const sp = (speck(x / S, y / S) - 0.5) * 0.06;
        const factor = clamp01(tint + sp);
        const [r, g, b] = shade(base, factor);
        // Glossy ceramic: low roughness, slight variance.
        setPx(f, i, r, g, b, 0.85, 0.18 + Math.abs(sp) * 1.5);
      }
    }
  }
  return f;
}

function carpetFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 6;
  const fibre = makeFbm(seed + 11, 4, 110);
  const blotch = makeFbm(seed + 31, 3, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const fib = fibre(u, v);
      const bl = blotch(u, v);
      const factor = 0.82 + fib * 0.3 + (bl - 0.5) * 0.1;
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, fib, 0.93 + fib * 0.05);
    }
  }
  return f;
}

function concreteFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 7;
  const mottle = makeFbm(seed + 5, 5, 5);
  const pores = makeFbm(seed + 41, 4, 90);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const m = mottle(u, v);
      const p = pores(u, v);
      const pore = p > 0.86 ? (p - 0.86) / 0.14 : 0;
      const factor = 0.86 + (m - 0.5) * 0.22 - pore * 0.25;
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, clamp01(m * 0.6 + pore), 0.78 + (m - 0.5) * 0.1);
    }
  }
  return f;
}

function marbleFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 4;
  const turb = makeFbm(seed + 13, 5, 4);
  const fine = makeFbm(seed + 71, 4, 30);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // Veins: a warped sinusoid threshold.
      const t = turb(u, v);
      const vein = Math.abs(Math.sin((u + v) * 6.28 * 2 + t * 6.0));
      const veinMask = vein < 0.12 ? 1 - vein / 0.12 : 0;
      const baseFac = 0.96 + (fine(u, v) - 0.5) * 0.08;
      // Veins darken slightly with a cool tint.
      const factor = clamp01(baseFac - veinMask * 0.28);
      const [r, g, b] = shade(base, factor);
      setPx(f, y * S + x, r, g, b, veinMask * 0.4, 0.22 + veinMask * 0.1);
    }
  }
  return f;
}

function plasterFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  // Very gentle orange-peel: low bump, near-uniform colour so walls read as
  // clean matte paint rather than noisy stucco.
  f.normalStrength = 1.1;
  const peel = makeFbm(seed + 17, 3, 48);
  const broad = makeFbm(seed + 23, 3, 5);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const pk = peel(u, v);
      const br = broad(u, v);
      const factor = 0.985 + (br - 0.5) * 0.022 + (pk - 0.5) * 0.012;
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, pk * 0.5, 0.92);
    }
  }
  return f;
}

function terrazzoFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 2;
  const rand = mulberry32(seed);
  const grain = makeFbm(seed + 9, 3, 60);
  // Light cement matrix with faint noise.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = grain(x / S, y / S);
      const factor = 0.96 + (g - 0.5) * 0.06;
      const [r, gg, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, gg, b, 0.1, 0.42 + (g - 0.5) * 0.08);
    }
  }
  // Scattered polished chips (with edge wrap so the tile is seamless).
  const CHIP_COLS: [number, number, number][] = [
    [196, 188, 174], [120, 96, 78], [150, 120, 110], [90, 110, 96],
    [86, 92, 110], [170, 150, 120], [60, 60, 64], [210, 205, 196],
  ];
  const chips = Math.round((S * S) / 1400);
  for (let c = 0; c < chips; c++) {
    const cxp = rand() * S;
    const cyp = rand() * S;
    const radius = 3 + rand() * (S / 70);
    const col = CHIP_COLS[Math.floor(rand() * CHIP_COLS.length)];
    const squish = 0.7 + rand() * 0.6;
    const rad = Math.ceil(radius) + 1;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy / squish);
        if (d > radius) continue;
        const px = ((Math.round(cxp) + dx) % S + S) % S;
        const py = ((Math.round(cyp) + dy) % S + S) % S;
        const i = py * S + px;
        const edge = d > radius - 1 ? 0.8 : 1; // slight dark rim
        f.albedo[i * 4] = col[0] * edge;
        f.albedo[i * 4 + 1] = col[1] * edge;
        f.albedo[i * 4 + 2] = col[2] * edge;
        f.height[i] = 0.5;
        f.rough[i] = 0.28;
      }
    }
  }
  return f;
}

/** Tone-on-tone vertical stripe wallpaper — alternating slightly lighter
 *  bands over a faint paper texture. Subtle, tasteful (an accent wall). */
function stripeFields(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 0.7;
  const stripes = 6;
  const sw = S / stripes;
  const paper = makeFbm(seed + 11, 3, 40);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const band = Math.floor(x / sw) % 2;
      const edge = Math.min(x % sw, sw - (x % sw)) < 2 ? 0.97 : 1; // faint seam
      const alt = band === 0 ? 1.0 : 1.07;
      const n = paper(x / S, y / S);
      const factor = alt * edge * (0.99 + (n - 0.5) * 0.02);
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, 0.2 + n * 0.1, 0.86);
    }
  }
  return f;
}

/** Grasscloth wallpaper — fine horizontal woven striation with subtle warp,
 *  reading as a natural textured paper. */
function grasscloth(base: [number, number, number], seed: number): Fields {
  const f = blank();
  f.normalStrength = 1.4;
  const warp = makeFbm(seed + 7, 3, 70);
  const slub = makeFbm(seed + 13, 2, 14);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const line = Math.sin((v * S) * 0.85 + warp(u, v) * 3) * 0.5 + 0.5; // horizontal weave
      const sl = slub(u, v);
      const factor = 0.95 + line * 0.05 + (sl - 0.5) * 0.05;
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, line * 0.5, 0.82 + line * 0.06);
    }
  }
  return f;
}

const PATTERN_FN: Record<
  ProceduralPattern,
  (base: [number, number, number], seed: number) => Fields
> = {
  wood: woodFields,
  tile: tileFields,
  carpet: carpetFields,
  concrete: concreteFields,
  marble: marbleFields,
  plaster: plasterFields,
  terrazzo: terrazzoFields,
  stripe: stripeFields,
  grasscloth,
};

/** Generate the three PBR maps for a procedural material. Browser-only
 *  (uses canvas / ImageData). */
export function generateProcedural(
  id: string,
  pattern: ProceduralPattern,
  swatch: string,
): ProceduralResult {
  const seed = hashSeed(id + ':' + pattern);
  const base = hexToRgb(swatch);
  const f = PATTERN_FN[pattern](base, seed);

  const albedo = toTexture(f.albedo, true);
  const normal = toTexture(heightToNormalRGBA(f.height, S, f.normalStrength), false);
  const roughData = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const r = Math.round(clamp01(f.rough[i]) * 255);
    roughData[i * 4] = r;
    roughData[i * 4 + 1] = r;
    roughData[i * 4 + 2] = r;
    roughData[i * 4 + 3] = 255;
  }
  const roughness = toTexture(roughData, false);
  return { albedo, normal, roughness, metalness: f.metalness };
}

// Shared orange-peel normal for ALL plaster (wall-paint) materials. Plaster
// is near-flat and varies only by tint, so every wall colour reuses this one
// 256² normal map (tinted via material.color) instead of generating its own
// full 512² albedo+normal+roughness set — a big memory saving for the palette.
let plasterNormalTex: Texture | null = null;
export function getPlasterNormal(): Texture {
  if (plasterNormalTex) return plasterNormalTex;
  const prev = S;
  S = 256;
  try {
    const f = plasterFields([255, 255, 255], hashSeed('plaster:shared'));
    plasterNormalTex = toTexture(heightToNormalRGBA(f.height, S, f.normalStrength), false);
    // Wall faces carry metre UVs and all wall paints tile at 2.5 m.
    plasterNormalTex.repeat.set(1 / 2.5, 1 / 2.5);
    return plasterNormalTex;
  } finally {
    S = prev;
  }
}

const thumbCache = new Map<string, string>();

/** Cheap albedo-only preview (default 64²) as a data URL, cached per id —
 *  used by the finish picker so procedural materials show a real texture
 *  swatch instead of a flat colour. */
export function proceduralThumbnailDataUrl(
  id: string,
  pattern: ProceduralPattern,
  swatch: string,
  size = 64,
): string {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const prev = S;
  S = size;
  try {
    const seed = hashSeed(id + ':' + pattern);
    const f = PATTERN_FN[pattern](hexToRgb(swatch), seed);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    img.data.set(f.albedo);
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    thumbCache.set(id, url);
    return url;
  } finally {
    S = prev;
  }
}

export { mix };
