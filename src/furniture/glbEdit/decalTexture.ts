/**
 * GLB Asset Designer — Stage 5 decal patterns. Small procedural canvas textures
 * (transparent background, the pattern in white so the decal material can tint
 * it) for each detail kind — a tufted button, a dashed stitch line, a crossed
 * seam, a round patch, a soft wear spot. No bespoke texture art: just simple
 * shapes drawn on a ≤128px canvas, cached per kind and shared by every decal of
 * that kind. Canvas textures export losslessly into the GLB (GLTFExporter embeds
 * them as PNG).
 *
 * Guarded for headless/no-canvas environments (unit tests): when a 2D context
 * isn't available the material falls back to a flat tint — the decal GEOMETRY
 * (what the export test checks) is canvas-independent.
 */

import { CanvasTexture, type Texture } from 'three'
import type { DecalKind } from './editSpec'

const cache = new Map<DecalKind, Texture | null>()
const SIZE = 128

type Ctx = CanvasRenderingContext2D

function draw(kind: DecalKind, ctx: Ctx, s: number): void {
  ctx.clearRect(0, 0, s, s)
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  const c = s / 2
  switch (kind) {
    case 'button': {
      // Filled disc rim + four tufting thread holes.
      ctx.beginPath()
      ctx.arc(c, c, s * 0.36, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.lineWidth = s * 0.03
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.arc(c, c, s * 0.36, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath()
        ctx.arc(c + dx * s * 0.1, c + dy * s * 0.1, s * 0.035, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'stitch': {
      // A dashed centre line running across the decal (X axis).
      ctx.lineWidth = s * 0.09
      ctx.setLineDash([s * 0.11, s * 0.08])
      ctx.beginPath()
      ctx.moveTo(s * 0.04, c)
      ctx.lineTo(s * 0.96, c)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    case 'seam': {
      // A solid seam line with a fine ladder of cross stitches.
      ctx.lineWidth = s * 0.05
      ctx.beginPath()
      ctx.moveTo(s * 0.04, c)
      ctx.lineTo(s * 0.96, c)
      ctx.stroke()
      ctx.lineWidth = s * 0.05
      for (let x = s * 0.12; x <= s * 0.88; x += s * 0.16) {
        ctx.beginPath()
        ctx.moveTo(x, c - s * 0.16)
        ctx.lineTo(x, c + s * 0.16)
        ctx.stroke()
      }
      break
    }
    case 'patch': {
      // A soft round patch with a stitched border ring.
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.arc(c, c, s * 0.42, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = s * 0.03
      ctx.setLineDash([s * 0.06, s * 0.05])
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.arc(c, c, s * 0.33, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    default: {
      // wear — a soft radial darkening blotch.
      const g = ctx.createRadialGradient(c, c, s * 0.05, c, c, s * 0.48)
      g.addColorStop(0, 'rgba(255,255,255,0.85)')
      g.addColorStop(0.6, 'rgba(255,255,255,0.35)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(c, c, s * 0.48, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
}

/** The cached canvas texture for a decal kind, or null when a 2D canvas isn't
 *  available (headless). The material tints it via its `color`. */
export function decalTexture(kind: DecalKind): Texture | null {
  if (cache.has(kind)) return cache.get(kind) ?? null
  let tex: Texture | null = null
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (ctx) {
        draw(kind, ctx, SIZE)
        tex = new CanvasTexture(canvas)
        tex.anisotropy = 4
        tex.needsUpdate = true
      }
    }
  } catch {
    tex = null
  }
  cache.set(kind, tex)
  return tex
}
