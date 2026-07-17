import { CanvasTexture, SRGBColorSpace } from 'three'
import { applyAnisotropy } from '../../materials/anisotropy'
import { LruCache } from '../../materials/materialLru'

/**
 * Per-species leaf/frond **alpha silhouette** textures, canvas-drawn (like the
 * `meshGridTexture` / `sisalTexture` / `ContactShadow` blob precedent — not
 * bespoke texture art). Each texture is a single leaf drawn tip-up on a
 * transparent ground, in shades of the requested foliage colour, with a pale
 * midrib + veins for reading detail. Mapped onto a curved leaf plane (see
 * `leafFoliage.tsx`) with `alphaTest` (NOT transparent sorting) so foliage reads
 * as real leaves at closeup and stays depth-correct — critical for leaves drawn
 * INSIDE the aquarium's transparent glass, where alpha-blended planes would
 * sort-fight the tank walls.
 *
 * The species set covers every foliage-bearing primitive: `monstera` (split
 * lobes), `fiddle` (broad paddle), `frond` (pinnate palm/areca), `blade` (snake
 * plant sword), `pothos` (trailing heart), `fern` (feathery frond), `oval`
 * (generic broadleaf/bush), `succulent` (plump rosette leaf), `pampas` (dried
 * plume) and `seagrass` (aquatic ribbon).
 *
 * The per-(species,colour) base cache is a bounded LRU (AUD-002 discipline, same
 * as `meshGridTexture`/`sisalTexture`): each distinct foliage colour draws its
 * own leaf, so cycling the colour picker without a bound would leak one GPU
 * texture per colour. Consumers read the shared base directly (the leaf material
 * cache in `leafFoliage.tsx` holds its own bound); an evicted base is disposed a
 * frame later by `LruCache`.
 */
export type LeafSpecies =
  | 'monstera'
  | 'fiddle'
  | 'frond'
  | 'blade'
  | 'pothos'
  | 'fern'
  | 'oval'
  | 'succulent'
  | 'pampas'
  | 'seagrass'

/** Cap on distinct (species,colour) base textures held live (AUD-002). */
export const LEAF_TEX_CACHE_MAX = 32
const cache = new LruCache<CanvasTexture>({
  max: LEAF_TEX_CACHE_MAX,
  dispose: (t) => t.dispose(),
})

/** Shade a hex colour by a multiplicative factor (clamped to a byte). */
function shade(hex: string, f: number): string {
  const n = hex.replace('#', '')
  const r = Math.min(255, Math.round(Number.parseInt(n.slice(0, 2), 16) * f))
  const g = Math.min(255, Math.round(Number.parseInt(n.slice(2, 4), 16) * f))
  const b = Math.min(255, Math.round(Number.parseInt(n.slice(4, 6), 16) * f))
  return `rgb(${r},${g},${b})`
}

/** A pointed-ellipse blade outline: base at (cx,y1), tip at (cx,y0), half-width
 *  `hw` at the widest fraction `wAt` up the length. */
function bladePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y0: number,
  y1: number,
  hw: number,
  wAt: number,
) {
  const ym = y1 - (y1 - y0) * wAt
  ctx.beginPath()
  ctx.moveTo(cx, y1)
  ctx.quadraticCurveTo(cx - hw, ym + (y1 - ym) * 0.2, cx - hw, ym)
  ctx.quadraticCurveTo(cx - hw, y0 + (ym - y0) * 0.35, cx, y0)
  ctx.quadraticCurveTo(cx + hw, y0 + (ym - y0) * 0.35, cx + hw, ym)
  ctx.quadraticCurveTo(cx + hw, ym + (y1 - ym) * 0.2, cx, y1)
  ctx.closePath()
}

/** Pale midrib + a few lateral veins up a blade. */
function veins(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y0: number,
  y1: number,
  hw: number,
  color: string,
  count = 5,
) {
  ctx.strokeStyle = shade(color, 1.5)
  ctx.globalAlpha = 0.5
  ctx.lineWidth = Math.max(1, hw * 0.06)
  ctx.beginPath()
  ctx.moveTo(cx, y1 * 0.98)
  ctx.lineTo(cx, y0)
  ctx.stroke()
  ctx.lineWidth = Math.max(1, hw * 0.03)
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1)
    const y = y1 - (y1 - y0) * t
    const w = hw * (1 - Math.abs(t - 0.5) * 1.3)
    ctx.beginPath()
    ctx.moveTo(cx, y)
    ctx.lineTo(cx - w, y - (y1 - y0) * 0.06)
    ctx.moveTo(cx, y)
    ctx.lineTo(cx + w, y - (y1 - y0) * 0.06)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function draw(species: LeafSpecies, ctx: CanvasRenderingContext2D, S: number, color: string): void {
  const cx = S / 2
  const y0 = S * 0.05 // tip (top)
  const y1 = S * 0.97 // base (bottom)
  ctx.lineJoin = 'round'
  ctx.fillStyle = color

  switch (species) {
    case 'oval': {
      bladePath(ctx, cx, y0, y1, S * 0.3, 0.55)
      ctx.fill()
      ctx.strokeStyle = shade(color, 0.7)
      ctx.lineWidth = 1.5
      ctx.stroke()
      veins(ctx, cx, y0, y1, S * 0.3, color, 5)
      break
    }
    case 'fiddle': {
      // Broad violin paddle: narrow base, widest high, rounded lobed top.
      bladePath(ctx, cx, y0 + S * 0.04, y1, S * 0.34, 0.68)
      ctx.fill()
      ctx.strokeStyle = shade(color, 0.65)
      ctx.lineWidth = 1.5
      ctx.stroke()
      veins(ctx, cx, y0, y1, S * 0.34, color, 6)
      break
    }
    case 'blade': {
      // Snake-plant sword: tall, narrow, pale margin stripe (variegation).
      bladePath(ctx, cx, y0, y1, S * 0.13, 0.5)
      ctx.fill()
      // Variegated edge stripe.
      ctx.strokeStyle = shade(color, 1.7)
      ctx.globalAlpha = 0.6
      ctx.lineWidth = Math.max(1.5, S * 0.02)
      ctx.stroke()
      ctx.globalAlpha = 1
      // Faint horizontal mottle bands.
      ctx.strokeStyle = shade(color, 0.7)
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      for (let i = 1; i < 9; i++) {
        const y = y1 - (y1 - y0) * (i / 9)
        ctx.beginPath()
        ctx.moveTo(cx - S * 0.1, y)
        ctx.quadraticCurveTo(cx, y - S * 0.02, cx + S * 0.1, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      break
    }
    case 'pothos': {
      // Heart / cordate: notched base, rounded shoulders, pointed apex.
      ctx.beginPath()
      ctx.moveTo(cx, y0) // apex tip
      ctx.bezierCurveTo(
        cx + S * 0.34,
        y0 + S * 0.2,
        cx + S * 0.36,
        y1 - S * 0.16,
        cx,
        y1 - S * 0.06,
      )
      ctx.bezierCurveTo(cx - S * 0.36, y1 - S * 0.16, cx - S * 0.34, y0 + S * 0.2, cx, y0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = shade(color, 0.68)
      ctx.lineWidth = 1.5
      ctx.stroke()
      veins(ctx, cx, y0 + S * 0.02, y1 - S * 0.06, S * 0.3, color, 4)
      break
    }
    case 'monstera': {
      // Broad heart, then fenestrate: split lobes + a couple holes.
      ctx.beginPath()
      ctx.moveTo(cx, y0)
      ctx.bezierCurveTo(cx + S * 0.42, y0 + S * 0.16, cx + S * 0.4, y1 - S * 0.1, cx, y1)
      ctx.bezierCurveTo(cx - S * 0.4, y1 - S * 0.1, cx - S * 0.42, y0 + S * 0.16, cx, y0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = shade(color, 0.65)
      ctx.lineWidth = 1.5
      ctx.stroke()
      veins(ctx, cx, y0, y1, S * 0.36, color, 5)
      // Fenestration: erase edge slots + oval holes.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      for (const s of [-1, 1]) {
        for (let i = 1; i <= 4; i++) {
          const t = i / 5
          const y = y1 - (y1 - y0) * t
          const w = S * 0.36 * (1 - Math.abs(t - 0.5) * 1.1)
          ctx.beginPath()
          ctx.ellipse(cx + s * w * 0.55, y, S * 0.05, S * 0.02, 0, 0, Math.PI * 2)
          ctx.fill()
          // Edge split notch.
          ctx.beginPath()
          ctx.moveTo(cx + s * w, y - S * 0.03)
          ctx.lineTo(cx + s * w * 0.4, y)
          ctx.lineTo(cx + s * w, y + S * 0.03)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'frond': {
      // Pinnate palm/areca: central rachis + thin leaflets both sides.
      ctx.strokeStyle = shade(color, 0.85)
      ctx.lineWidth = Math.max(2, S * 0.025)
      ctx.beginPath()
      ctx.moveTo(cx, y1)
      ctx.lineTo(cx, y0)
      ctx.stroke()
      const N = 13
      for (let i = 1; i <= N; i++) {
        const t = i / (N + 1)
        const y = y1 - (y1 - y0) * t
        const len = S * 0.34 * Math.sin(t * Math.PI * 0.95) + S * 0.05
        const up = (y1 - y0) * 0.12
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(cx, y)
          ctx.quadraticCurveTo(cx + s * len * 0.6, y - up * 0.6, cx + s * len, y - up)
          ctx.quadraticCurveTo(cx + s * len * 0.5, y - up * 0.2, cx, y + S * 0.012)
          ctx.closePath()
          ctx.fillStyle = shade(color, i % 2 ? 1 : 0.85)
          ctx.fill()
        }
      }
      break
    }
    case 'fern': {
      // Feathery frond: rachis + many small rounded pinnae.
      ctx.strokeStyle = shade(color, 0.8)
      ctx.lineWidth = Math.max(1.5, S * 0.018)
      ctx.beginPath()
      ctx.moveTo(cx, y1)
      ctx.lineTo(cx, y0)
      ctx.stroke()
      const N = 16
      for (let i = 1; i <= N; i++) {
        const t = i / (N + 1)
        const y = y1 - (y1 - y0) * t
        const len = S * 0.26 * Math.sin(t * Math.PI * 0.9) + S * 0.03
        for (const s of [-1, 1]) {
          ctx.fillStyle = shade(color, i % 2 ? 1 : 0.82)
          ctx.beginPath()
          ctx.ellipse(
            cx + s * len * 0.6,
            y - (y1 - y0) * 0.03,
            len * 0.5,
            S * 0.028,
            s * 0.5,
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
      }
      break
    }
    case 'succulent': {
      // Plump teardrop leaf, widest near the top.
      bladePath(ctx, cx, y0 + S * 0.02, y1, S * 0.24, 0.72)
      ctx.fill()
      ctx.strokeStyle = shade(color, 0.7)
      ctx.lineWidth = 1.5
      ctx.stroke()
      // A soft highlight ridge down the centre for the fleshy look.
      const g = ctx.createLinearGradient(cx - S * 0.2, 0, cx + S * 0.2, 0)
      g.addColorStop(0, shade(color, 0.75))
      g.addColorStop(0.5, shade(color, 1.25))
      g.addColorStop(1, shade(color, 0.75))
      ctx.globalAlpha = 0.5
      ctx.fillStyle = g
      bladePath(ctx, cx, y0 + S * 0.08, y1 - S * 0.04, S * 0.16, 0.72)
      ctx.fill()
      ctx.globalAlpha = 1
      break
    }
    case 'pampas': {
      // Dried plume: a dense, soft, feathery elongated feather-duster. A faint
      // filled body reads the silhouette; many fine radiating filaments layered
      // over it give the fluffy plume texture (the sparse-stroke version read as
      // bare sticks).
      const topY = S * 0.06
      const botY = S * 0.9
      const midY = (topY + botY) / 2
      const bodyHalf = S * 0.14
      // Soft plume body (teardrop, fat in the middle, tapering both ends).
      ctx.globalAlpha = 0.35
      ctx.fillStyle = shade(color, 1.02)
      ctx.beginPath()
      ctx.moveTo(cx, topY)
      ctx.quadraticCurveTo(cx + bodyHalf, midY, cx + bodyHalf * 0.5, botY)
      ctx.quadraticCurveTo(cx, botY + S * 0.03, cx - bodyHalf * 0.5, botY)
      ctx.quadraticCurveTo(cx - bodyHalf, midY, cx, topY)
      ctx.closePath()
      ctx.fill()
      // Fine filaments radiating up-and-out from the central axis.
      ctx.lineWidth = Math.max(1, S * 0.008)
      const N = 120
      for (let i = 0; i < N; i++) {
        const t = i / N
        const y = botY - (botY - topY) * t
        // Widest in the middle of the plume, tapering to a point at the top.
        const envelope = Math.sin(Math.min(1, t + 0.05) * Math.PI * 0.92)
        const spread = (S * 0.2 * envelope + S * 0.02) * (0.6 + ((i * 7) % 5) / 5)
        const s = i % 2 ? 1 : -1
        ctx.globalAlpha = 0.4
        ctx.strokeStyle = shade(color, i % 3 ? 1.0 : 0.85)
        ctx.beginPath()
        ctx.moveTo(cx, y + S * 0.02)
        ctx.quadraticCurveTo(cx + s * spread * 0.5, y - S * 0.015, cx + s * spread, y - S * 0.05)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      break
    }
    case 'seagrass': {
      // Aquatic ribbon: long wavy blade, rounded tip.
      ctx.beginPath()
      ctx.moveTo(cx - S * 0.07, y1)
      ctx.bezierCurveTo(cx - S * 0.2, y1 * 0.7, cx + S * 0.12, y1 * 0.4, cx - S * 0.02, y0)
      ctx.bezierCurveTo(cx + S * 0.06, y1 * 0.4, cx - S * 0.06, y1 * 0.72, cx + S * 0.07, y1)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = shade(color, 1.4)
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.globalAlpha = 1
      break
    }
  }
}

export function getLeafTexture(species: LeafSpecies, color: string): CanvasTexture {
  const key = `${species}|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  draw(species, ctx, S, color)
  const tex = applyAnisotropy(new CanvasTexture(c))
  tex.colorSpace = SRGBColorSpace
  cache.set(key, tex)
  return tex
}

/** Test-only: live entry count of the bounded base cache (cap invariant). */
export function __leafTexCacheSizeForTest(): number {
  return cache.size
}
export function __clearLeafTexCacheForTest(): void {
  cache.clearForTest()
}
