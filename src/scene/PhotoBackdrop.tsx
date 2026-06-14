import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'
import { skylineLayout } from './photoSkyline'

/**
 * Photo-style backdrop (the "budget trick"): a single equirectangular sky +
 * city-skyline image set as `scene.background`. Unlike the instanced City/Park/
 * Hills estates this renders ZERO per-frame geometry — one texture, seen
 * correctly through every window, with no per-window placement and no sunlight
 * blocking. Its lack of parallax is physically correct for distant scenery.
 * The image is generated procedurally (no asset fetch); swap `paintSkyline` for
 * a real CC0 equirectangular photo later. Day/night follows the sun via
 * `scene.backgroundIntensity` (cheap), like the IBL ramp.
 */

const TEX_W = 2048
const TEX_H = 1024
/** Fraction of the image height the skyline band occupies above the horizon. */
const BAND = 0.42

function lerpHex(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

/** Paint the procedural equirectangular sky+skyline onto a 2:1 canvas. */
function paintSkyline(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  const horizon = H * 0.5

  // Sky: zenith → hazy horizon vertical gradient.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#4f7fb4')
  sky.addColorStop(0.7, '#9fc0dc')
  sky.addColorStop(1, '#dce7ee')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, horizon)

  // Ground/haze below the horizon.
  const ground = ctx.createLinearGradient(0, horizon, 0, H)
  ground.addColorStop(0, '#c2c6bf')
  ground.addColorStop(1, '#74776f')
  ctx.fillStyle = ground
  ctx.fillRect(0, horizon, W, H - horizon)

  const band = H * BAND
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
    // Far row hazier/lighter/bluer; near row darker/warmer.
    const body =
      layer === 1
        ? lerpHex([86, 84, 88], [120, 116, 120], tone)
        : lerpHex([150, 162, 176], [186, 196, 206], tone)
    ctx.fillStyle = body
    ctx.fillRect(px, top, pw, ph)
    // Window grid — mostly dark glazing with a few lit cells (cheap night cue).
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
          const litOn = Math.abs(lit) > 0.82
          ctx.fillStyle = litOn ? 'rgba(255,236,180,0.85)' : 'rgba(40,46,54,0.5)'
          ctx.fillRect(px + mx + c * gw + (gw - ww) / 2, top + my + r * gh + (gh - wh) / 2, ww, wh)
        }
      }
    }
  }

  for (const b of skylineLayout(0xc17)) {
    const px = b.x * W
    const pw = Math.max(2, b.w * W)
    const ph = b.h * band
    drawBuilding(px, pw, ph, b.layer, b.tone, b.cols, b.rows)
    // Wrap across the seam so the 360° skyline is continuous.
    if (px + pw > W) drawBuilding(px - W, pw, ph, b.layer, b.tone, b.cols, b.rows)
  }
}

export function PhotoBackdrop() {
  const scene = useThree((s) => s.scene)
  const sun = useSunPosition()

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    paintSkyline(canvas)
    const tex = new CanvasTexture(canvas)
    tex.mapping = EquirectangularReflectionMapping
    tex.colorSpace = SRGBColorSpace
    return tex
  }, [])

  useLayoutEffect(() => {
    const prev = scene.background
    scene.background = texture
    return () => {
      // Restore whatever was there (normally null) and free the texture.
      if (scene.background === texture) scene.background = prev ?? null
      texture.dispose()
    }
  }, [scene, texture])

  // Dim the visible sky toward night, mirroring the IBL intensity ramp, so the
  // photo backdrop tracks the time-of-day slider. Cheap: one scalar per frame.
  useFrame(() => {
    const level = lightingFromAltitude(sun.altitude).sun // 1 day → 0 night
    scene.backgroundIntensity = 0.16 + level * 0.84
  })

  return null
}
