/**
 * Grep guard for the P7 ambient-fx CSS. Enforces the token/motion rules the
 * hand review can't: the HQ border-beam travels via `offset-distance`, is built
 * only from `color-mix(in oklch, var(--accent) …)` (zero colour literals), fills
 * `backwards` (never `both`), and can be IntersectionObserver-paused; the catalog
 * / preset cards carry a pointermove-driven `radial-gradient` reading `var(--mx`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const flows = readFileSync(join(__dirname, 'flows.css'), 'utf8')
const parts = readFileSync(join(__dirname, 'parts.css'), 'utf8')

describe('ambient-fx CSS (P7)', () => {
  it('defines a beamTravel keyframe animating offset-distance', () => {
    expect(flows).toMatch(/@keyframes\s+beamTravel/)
    const kf = flows.slice(flows.indexOf('@keyframes beamTravel'))
    expect(kf).toContain('offset-distance')
  })

  it('drives the beam along an offset-path with a color-mix(in oklch, var(--accent) …) dash', () => {
    const beam = flows.slice(flows.indexOf('.beam'))
    expect(beam).toContain('offset-path')
    expect(beam).toMatch(/color-mix\(in oklch, var\(--accent\)/)
  })

  it('fills the beam animation backwards, never both', () => {
    const beam = flows.slice(flows.indexOf('.beam'), flows.indexOf('.beam') + 600)
    expect(beam).toMatch(/backwards/)
    expect(beam).not.toMatch(/\bboth\b/)
  })

  it('has a .paused rule that pauses the animation (IntersectionObserver hook)', () => {
    expect(flows).toMatch(/\.beam\.paused[^}]*animation-play-state:\s*paused/)
  })

  it('gives .preset-card (flows) a var(--mx radial-gradient in oklch accent', () => {
    const card = flows.slice(flows.indexOf('.preset-card'))
    expect(card).toMatch(/radial-gradient\([^)]*var\(--mx/)
    expect(card).toMatch(/color-mix\(in oklch, var\(--accent\)/)
  })

  it('gives .cat-card (parts) a var(--mx radial-gradient in oklch accent', () => {
    const card = parts.slice(parts.indexOf('.cat-card'))
    expect(card).toMatch(/radial-gradient\([^)]*var\(--mx/)
    expect(card).toMatch(/color-mix\(in oklch, var\(--accent\)/)
  })

  it('paints the card glow ONLY when armed — accent share defaults to 0% (dormant-invisible)', () => {
    // The gradient must be invisible whenever the ambient-fx gate is off: the
    // accent share reads var(--glow-a, 0%), raised on hover only under the
    // grid's .fx class (set by CatalogDrawer when useAmbientFx() is true).
    // A hardcoded share painted a permanent brown bloom on every card in the
    // default Performance tier (user report, 2026-07-03).
    for (const css of [parts, flows]) {
      const card = css.slice(css.indexOf('-card'))
      expect(card).toMatch(/color-mix\(in oklch, var\(--accent\) var\(--glow-a, 0%\)/)
    }
    expect(parts).toMatch(/\.fx [^{]*:hover[^}]*--glow-a:\s*12%/)
    expect(flows).toMatch(/\.fx [^{]*:hover[^}]*--glow-a:\s*12%/)
  })

  it('uses no raw hex/rgb colour literals in the beam rule', () => {
    const beam = flows.slice(flows.indexOf('.beam'), flows.indexOf('.beam') + 600)
    expect(beam).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(beam).not.toMatch(/\brgba?\(/)
  })
})
