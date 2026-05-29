import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

/** Soft abstract "content" for a powered-on display — a sky/landscape
 *  gradient with a warm sun and a hill silhouette. Reads as a TV scene or a
 *  desktop wallpaper. Generated once and shared by every screen. */
let screenTex: Texture | null = null;
export function getScreenContent(): Texture {
  if (screenTex) return screenTex;
  const W = 128;
  const H = 72;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a4a7a');
  sky.addColorStop(0.55, '#7fa6c8');
  sky.addColorStop(0.6, '#d8c9a8');
  sky.addColorStop(1, '#2e3a32');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.7, H * 0.42, 1, W * 0.7, H * 0.42, 22);
  sun.addColorStop(0, '#fff3d0');
  sun.addColorStop(1, 'rgba(255,243,208,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a4a44';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  ctx.quadraticCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.6);
  ctx.quadraticCurveTo(W * 0.8, H * 0.7, W, H * 0.58);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  screenTex = tex;
  return tex;
}
