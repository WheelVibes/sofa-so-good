/**
 * Render a lighting plan to an SVG string (top-down, world metres as SVG units,
 * matching the floor-plan orientation). Pure + palette-injected so the in-app
 * panel (CSS tokens) and the printable report (print inks) share one renderer.
 * Draws thin wall context, each fixture's coverage circle (its falloff radius)
 * and a light glyph at the bulb position.
 */
import type { FloorPlan } from '../../floorplan/types'
import { planBounds } from '../../floorplan/types'
import type { PlanLight } from '../../lighting2d/lightingPlan'

export interface LightingPalette {
  /** Wall context lines. */
  wall: string
  /** Fixture glyph stroke + labels. */
  ink: string
  /** Coverage-circle tint. */
  coverage: string
}

const f = (n: number) => n.toFixed(3)

export interface LightingPlanSvgOptions {
  palette: LightingPalette
  /** Draw each fixture's coverage (falloff) circle. Default true. */
  coverage?: boolean
  /** Outer margin (m). Default 0.4. */
  margin?: number
}

/** Build `<svg>…</svg>` for a lighting plan: walls + coverage circles + fixture
 *  glyphs (a filled bulb in the fixture's own warm colour + a 4-ray star). */
export function lightingPlanSvg(
  plan: FloorPlan,
  lights: PlanLight[],
  opts: LightingPlanSvgOptions,
): string {
  const { palette: p, coverage = true, margin = 0.4 } = opts
  const [mx, mz] = planBounds(plan)
  if (mx <= 0 || mz <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" role="img" aria-label="empty lighting plan"></svg>`
  }
  const sw = Math.max(0.02, Math.min(mx, mz) * 0.004)
  const parts: string[] = []

  // Wall context (thin lines).
  for (const w of plan.walls) {
    parts.push(
      `<line x1="${f(w.start[0])}" y1="${f(w.start[1])}" x2="${f(w.end[0])}" y2="${f(w.end[1])}" stroke="${p.wall}" stroke-width="${f(sw)}" stroke-linecap="round"/>`,
    )
  }

  // Coverage circles first (behind the glyphs).
  if (coverage) {
    for (const l of lights) {
      if (l.distance <= 0) continue
      parts.push(
        `<circle cx="${f(l.x)}" cy="${f(l.z)}" r="${f(l.distance)}" fill="${p.coverage}" fill-opacity="0.08" stroke="${p.coverage}" stroke-opacity="0.4" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 5)} ${f(sw * 4)}"/>`,
      )
    }
  }

  // Fixture glyphs — a bulb dot in the fixture's warm colour + a 4-ray star.
  const r = Math.max(0.08, Math.min(mx, mz) * 0.02)
  for (const l of lights) {
    parts.push(
      `<g stroke="${p.ink}" stroke-width="${f(sw)}">`,
      `<line x1="${f(l.x - r * 1.6)}" y1="${f(l.z)}" x2="${f(l.x + r * 1.6)}" y2="${f(l.z)}"/>`,
      `<line x1="${f(l.x)}" y1="${f(l.z - r * 1.6)}" x2="${f(l.x)}" y2="${f(l.z + r * 1.6)}"/>`,
      `<circle cx="${f(l.x)}" cy="${f(l.z)}" r="${f(r)}" fill="${l.color}"/>`,
      `</g>`,
    )
  }

  const vb = `${f(-margin)} ${f(-margin)} ${f(mx + 2 * margin)} ${f(mz + 2 * margin)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="lighting plan, ${lights.length} fixtures">${parts.join('')}</svg>`
}
