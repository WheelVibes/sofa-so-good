import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { useSunPosition } from './lighting/useSunPosition'
import { type SkyPalette, skylineLayout, skyPalette } from './photoSkyline'

/**
 * Photo-style backdrop (the "budget trick"): a single equirectangular sky +
 * city-skyline image set as `scene.background`. Unlike the instanced City/Park/
 * Hills estates this renders ZERO per-frame geometry — one texture, seen
 * correctly through every window, with no per-window placement and no sunlight
 * blocking. Its lack of parallax is physically correct for distant scenery.
 * The image is generated procedurally (no asset fetch); swap `paintSkyline` for
 * a real CC0 equirectangular photo later. The sky colour tracks the real sun
 * (warm at sunset, deep blue at night) by repainting only when the time-of-day
 * bucket changes — so it's still effectively static per frame.
 */

const TEX_W = 2048
const TEX_H = 1024
/** Fraction of the image height the skyline band occupies above the horizon. */
const BAND = 0.42

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`
function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** Paint the procedural equirectangular sky+skyline for a given sky palette. */
function paintSkyline(canvas: HTMLCanvasElement, pal: SkyPalette): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  const horizon = H * 0.5

  // Sky: zenith → hazy horizon vertical gradient (palette-driven).
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, rgb(pal.zenith))
  sky.addColorStop(0.78, rgb(lerpRgb(pal.zenith, pal.horizon, 0.7)))
  sky.addColorStop(1, rgb(pal.horizon))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, horizon)

  // Ground/haze below the horizon.
  const ground = ctx.createLinearGradient(0, horizon, 0, H)
  ground.addColorStop(0, rgb(lerpRgb(pal.horizon, pal.ground, 0.5)))
  ground.addColorStop(1, rgb(pal.ground))
  ctx.fillStyle = ground
  ctx.fillRect(0, horizon, W, H - horizon)

  const band = H * BAND
  const litAlpha = (0.35 + pal.windowLit * 0.55).toFixed(3)
  const drawBuilding = (
    px: number,
    pw: number,
    ph: number,
    layer: 0 | 1,
    tone: number,
    cols: number,
    rows: number,
  ) => {
    const top = horizon - ph
    const base = layer === 1 ? pal.buildingNear : pal.buildingFar
    // Subtle per-building tone jitter for façade variation.
    const body = lerpRgb(base, layer === 1 ? [120, 116, 120] : [196, 206, 214], tone * 0.4)
    ctx.fillStyle = rgb(body)
    ctx.fillRect(px, top, pw, ph)
    // Window grid — mostly dark glazing with some lit cells (warm at night).
    const mx = pw * 0.16
    const my = ph * 0.06
    const gw = (pw - mx * 2) / cols
    const gh = (ph - my * 2) / rows
    const ww = gw * 0.62
    const wh = gh * 0.62
    if (gw > 1.5 && gh > 1.5) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = (Math.sin(c * 12.9898 + r * 78.233 + tone * 100) * 43758.5453) % 1
          const litOn = Math.abs(lit) > 0.82 && pal.windowLit > 0.25
          ctx.fillStyle = litOn ? `rgba(255,236,180,${litAlpha})` : 'rgba(40,46,54,0.5)'
          ctx.fillRect(px + mx + c * gw + (gw - ww) / 2, top + my + r * gh + (gh - wh) / 2, ww, wh)
        }
      }
    }
  }

  const buildings = skylineLayout(0xc17)
  for (const b of buildings) {
    const px = b.x * W
    const pw = Math.max(2, b.w * W)
    const ph = b.h * band
    drawBuilding(px, pw, ph, b.layer, b.tone, b.cols, b.rows)
    // Wrap across the seam so the 360° skyline is continuous.
    if (px + pw > W) drawBuilding(px - W, pw, ph, b.layer, b.tone, b.cols, b.rows)
  }
}

/** Quantise sun altitude into a sky bucket so we repaint only on real change. */
function skyBucket(altitude: number): number {
  return Math.round((Number.isFinite(altitude) ? altitude : 0) * 12)
}

export function PhotoBackdrop() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const sun = useSunPosition()

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = TEX_W
    c.height = TEX_H
    paintSkyline(c, skyPalette(0.6))
    const tex = new CanvasTexture(c)
    tex.mapping = EquirectangularReflectionMapping
    tex.colorSpace = SRGBColorSpace
    return { canvas: c, texture: tex }
  }, [])

  const bucketRef = useRef<number>(skyBucket(0.6))

  useLayoutEffect(() => {
    const prev = scene.background
    const prevIntensity = scene.backgroundIntensity
    scene.background = texture
    // The palette carries the day/night brightness, so keep the background at
    // unit intensity (reset any value a prior backdrop/session left behind).
    scene.backgroundIntensity = 1
    return () => {
      scene.backgroundIntensity = prevIntensity
      if (scene.background === texture) scene.background = prev ?? null
      texture.dispose()
    }
  }, [scene, texture])

  // Repaint the equirect ONLY when the sun crosses a sky bucket (a handful of
  // times across a full day-scrub), so the sky warms at sunset / darkens at
  // night while staying effectively static per frame.
  useFrame(() => {
    const bucket = skyBucket(sun.altitude)
    if (bucket === bucketRef.current) return
    bucketRef.current = bucket
    paintSkyline(canvas, skyPalette(sun.altitude))
    texture.needsUpdate = true
    invalidate()
  })

  return null
}
