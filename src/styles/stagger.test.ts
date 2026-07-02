import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P2 entrance stagger', () => {
  it('defines .stagger-in children with a --i-driven 50ms animation-delay', () => {
    const c = read('./components.css')
    expect(c).toMatch(
      /\.stagger-in > \*\s*\{[^}]*animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\)/s,
    )
    expect(c).toMatch(/animation-delay:\s*calc\(var\(--i,\s*0\)\s*\*\s*50ms\)/)
    expect(c).toMatch(/@keyframes staggerIn/)
  })
  it('provides an nth-child --i fallback for hand-authored menus', () => {
    expect(read('./components.css')).toMatch(/\.stagger-in > \*:nth-child\(1\)\s*\{\s*--i:\s*0/)
  })
  it('uses fill-mode backwards (not both) so hover transforms and dimmed state are not locked', () => {
    const c = read('./components.css')
    expect(c).toMatch(
      /\.stagger-in > \*\s*\{[^}]*animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    const rule = c.match(/\.stagger-in > \*\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(rule).not.toMatch(/animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('reduced-motion zeroes animation-delay so items do not appear one-by-one', () => {
    const app = read('./app.css')
    const block = app.slice(app.indexOf('prefers-reduced-motion'))
    expect(block).toMatch(/animation-delay:\s*0(ms|s)?\s*!important/)
    expect(block).toMatch(/transition-delay:\s*0(ms|s)?\s*!important/)
  })
})
