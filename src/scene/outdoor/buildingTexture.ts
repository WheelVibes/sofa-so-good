import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three';

let cachedColor: Texture | null = null;
let cachedEmissive: Texture | null = null;

/** Tex resolution. Each tile holds COLS × ROWS window cells; the tile's
 *  world footprint is set on the material via texture.repeat. */
const TEX = 256;
const COLS = 2;
const ROWS = 2;
/** Window proportion of the cell. Buildings should read as walls with
 *  windows, not as a window-grid checker. */
const WIN_W_FRAC = 0.36;
const WIN_H_FRAC = 0.55;
const LIT_RATIO = 0.55;
const BASE_WALL = '#3a3a40';
const DAY_WINDOW = '#5e5e66';
const LIT_EMISSIVE = '#f0c878';

function fallback(): Texture {
  return new Texture();
}

function canvasOk(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function isLit(x: number, y: number, salt: number): boolean {
  const h = (x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791) ^ salt;
  const u = ((h >>> 0) % 10000) / 10000;
  return u < LIT_RATIO;
}

function paint(
  ctx: CanvasRenderingContext2D,
  cellColor: (x: number, y: number) => string,
  base: string,
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX, TEX);
  const cellW = TEX / COLS;
  const cellH = TEX / ROWS;
  const winW = cellW * WIN_W_FRAC;
  const winH = cellH * WIN_H_FRAC;
  const padX = (cellW - winW) / 2;
  const padY = (cellH - winH) / 2;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = cellColor(x, y);
      ctx.fillRect(x * cellW + padX, y * cellH + padY, winW, winH);
    }
  }
}

export function buildingColorTexture(): Texture {
  if (cachedColor) return cachedColor;
  if (!canvasOk()) return (cachedColor = fallback());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return (cachedColor = fallback());
  paint(ctx, () => DAY_WINDOW, BASE_WALL);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cachedColor = tex;
  return tex;
}

export function buildingEmissiveTexture(): Texture {
  if (cachedEmissive) return cachedEmissive;
  if (!canvasOk()) return (cachedEmissive = fallback());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return (cachedEmissive = fallback());
  paint(ctx, (x, y) => (isLit(x, y, 0xa5) ? LIT_EMISSIVE : '#000'), '#000');
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cachedEmissive = tex;
  return tex;
}
