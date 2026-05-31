import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/** Procedural "content" for a powered-on display, cached per kind:
 *  'landscape' (sky + sun + hills), 'sunset' (warm gradient sea), or
 *  'abstract' (soft colour-field blocks). Shared by every screen of a kind. */
const screenTex = new Map<string, Texture>()
const W = 128
const H = 72

export function getScreenContent(kind = 'landscape'): Texture {
  const hit = screenTex.get(kind)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!

  if (kind === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#3a2a5a')
    g.addColorStop(0.45, '#b5567a')
    g.addColorStop(0.7, '#f0945a')
    g.addColorStop(0.72, '#1c2230')
    g.addColorStop(1, '#0e1320')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const sun = ctx.createRadialGradient(W * 0.5, H * 0.6, 1, W * 0.5, H * 0.6, 26)
    sun.addColorStop(0, '#ffe8b0')
    sun.addColorStop(1, 'rgba(255,232,176,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, W, H * 0.72)
  } else if (kind === 'abstract') {
    ctx.fillStyle = '#1b2330'
    ctx.fillRect(0, 0, W, H)
    const blocks: [number, number, number, number, string][] = [
      [0, 0, W * 0.45, H * 0.6, '#d8694a'],
      [W * 0.45, 0, W * 0.55, H * 0.4, '#3f7f8a'],
      [W * 0.45, H * 0.4, W * 0.3, H * 0.6, '#e0b15a'],
      [0, H * 0.6, W * 0.45, H * 0.4, '#5a6b8a'],
    ]
    for (const [x, y, w, h, col] of blocks) {
      ctx.fillStyle = col
      ctx.fillRect(x, y, w, h)
    }
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#2a4a7a')
    sky.addColorStop(0.55, '#7fa6c8')
    sky.addColorStop(0.6, '#d8c9a8')
    sky.addColorStop(1, '#2e3a32')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)
    const sun = ctx.createRadialGradient(W * 0.7, H * 0.42, 1, W * 0.7, H * 0.42, 22)
    sun.addColorStop(0, '#fff3d0')
    sun.addColorStop(1, 'rgba(255,243,208,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#3a4a44'
    ctx.beginPath()
    ctx.moveTo(0, H * 0.62)
    ctx.quadraticCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.6)
    ctx.quadraticCurveTo(W * 0.8, H * 0.7, W, H * 0.58)
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    ctx.fill()
  }

  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  screenTex.set(kind, tex)
  return tex
}
