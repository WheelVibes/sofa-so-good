import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { applyAnisotropy } from '../../materials/anisotropy'

/**
 * A seamless-tiling sisal-rope wrap texture for cat-tree posts and scratching
 * posts. Reads as tightly-wound natural rope: fine horizontal ring bands (the
 * coils of wrapped twine) in two close tan tones over a warm ground, so a post
 * wrapped in it reads as sisal without any bespoke texture art. Canvas-drawn
 * (like the `meshGridTexture` / `ContactShadow` blob precedent), cached per tint
 * and shared across every wrapped post; tile it with `texture.repeat` for the
 * physical coil density (a coil ≈ 8 mm on a real post).
 */
const cache = new Map<string, CanvasTexture>()

/** Shade a hex colour by a multiplicative factor (clamped to a byte). */
function shade(hex: string, f: number): string {
  const n = hex.replace('#', '')
  const r = Math.min(255, Math.round(Number.parseInt(n.slice(0, 2), 16) * f))
  const g = Math.min(255, Math.round(Number.parseInt(n.slice(2, 4), 16) * f))
  const b = Math.min(255, Math.round(Number.parseInt(n.slice(4, 6), 16) * f))
  return `rgb(${r},${g},${b})`
}

export function getSisalTexture(color = '#c9a875'): CanvasTexture {
  const hit = cache.get(color)
  if (hit) return hit
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  // Warm ground.
  ctx.fillStyle = shade(color, 0.9)
  ctx.fillRect(0, 0, size, size)
  // Coil bands: alternating light/dark horizontal ridges reading as rope wraps.
  // Eight coils per tile so a repeated post shows tightly-wound twine.
  const coils = 8
  const band = size / coils
  for (let i = 0; i < coils; i++) {
    const y = i * band
    // Highlight top of each coil, shadow the groove between coils.
    ctx.fillStyle = shade(color, 1.12)
    ctx.fillRect(0, y, size, band * 0.55)
    ctx.fillStyle = shade(color, 0.72)
    ctx.fillRect(0, y + band * 0.55, size, band * 0.45)
  }
  // Faint diagonal fibre streaks so the coils don't read as clean plastic rings.
  ctx.strokeStyle = shade(color, 0.82)
  ctx.globalAlpha = 0.25
  ctx.lineWidth = 1
  for (let x = -size; x < size; x += 5) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + band, size)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const tex = applyAnisotropy(new CanvasTexture(c))
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  cache.set(color, tex)
  return tex
}
