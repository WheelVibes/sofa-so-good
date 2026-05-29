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
  | 'plaster';

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
  f.normalStrength = 12;
  const rand = mulberry32(seed);
  const planks = 6; // boards stacked across the tile
  const plankH = S / planks;
  // Per-plank tint + a horizontal phase so end-seams stagger.
  const plankTint = Array.from({ length: planks }, () => 0.82 + rand() * 0.32);
  const plankPhase = Array.from({ length: planks }, () => rand());
  const grain = makeFbm(seed + 7, 4, 6);
  const fineGrain = makeFbm(seed + 99, 3, 40);
  for (let y = 0; y < S; y++) {
    const plank = Math.floor(y / plankH);
    const yInPlank = (y % plankH) / plankH; // 0..1
    const tint = plankTint[plank];
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // Long grain streaks running along the plank (x axis).
      const g = grain(u * 1.0 + plankPhase[plank], v * 4.0);
      const fg = fineGrain(u, v);
      const streak = 0.78 + g * 0.4 + (fg - 0.5) * 0.12;
      let factor = tint * streak;
      // Bevelled groove between planks (dark + recessed).
      const edge = Math.min(yInPlank, 1 - yInPlank);
      const groove = edge < 0.04 ? edge / 0.04 : 1;
      factor *= 0.5 + 0.5 * groove;
      const [r, gg, b] = shade(base, clamp01(factor));
      const h = clamp01(0.6 * groove + 0.25 * g + 0.15 * fg);
      const rough = clamp01(0.62 + (1 - g) * 0.18 - (1 - groove) * 0.15);
      setPx(f, y * S + x, r, gg, b, h, rough);
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
  f.normalStrength = 3;
  const peel = makeFbm(seed + 17, 4, 70);
  const broad = makeFbm(seed + 23, 3, 6);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const pk = peel(u, v);
      const br = broad(u, v);
      const factor = 0.97 + (br - 0.5) * 0.05 + (pk - 0.5) * 0.04;
      const [r, g, b] = shade(base, clamp01(factor));
      setPx(f, y * S + x, r, g, b, pk, 0.9);
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
