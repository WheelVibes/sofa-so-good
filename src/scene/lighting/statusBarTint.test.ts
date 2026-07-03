// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applySkyStatusBarTint,
  applyStatusBarTint,
  resetStatusBarTint,
  skyColorToHex,
  updateStatusBarTint,
} from './statusBarTint'

describe('skyColorToHex', () => {
  it('maps pure black/white linear to sRGB hex', () => {
    expect(skyColorToHex([0, 0, 0])).toBe('#000000')
    expect(skyColorToHex([1, 1, 1])).toBe('#ffffff')
  })

  it('applies the linear→sRGB transfer curve (mid value brightens)', () => {
    // Linear 0.5 → sRGB ~0.735 → ~188 (0xbc), not 0x80.
    expect(skyColorToHex([0.5, 0.5, 0.5])).toBe('#bcbcbc')
  })

  it('produces a sky-blue hex for the noon hemisphere tint', () => {
    // The altitudeCurve noon skyColor — should read as a light blue.
    const hex = skyColorToHex([0.55, 0.66, 0.92])
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) =>
      Number.parseInt(h, 16),
    )
    expect(b).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(r)
  })

  it('clamps out-of-range channels', () => {
    expect(skyColorToHex([-0.2, 1.5, 0.5])).toBe('#00ffbc')
  })
})

describe('applyStatusBarTint', () => {
  beforeEach(() => {
    resetStatusBarTint()
    document.head.innerHTML = ''
  })
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('overrides the content of every theme-color meta (incl. media-scoped tags)', () => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#ecdfce" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#251f1b" media="(prefers-color-scheme: dark)" />`
    applyStatusBarTint('#abcdef')
    const metas = document.querySelectorAll('meta[name="theme-color"]')
    expect(metas.length).toBe(2)
    for (const m of metas) expect(m.getAttribute('content')).toBe('#abcdef')
    // Media scoping is preserved so the OS still resolves a single active tag.
    expect(metas[0].getAttribute('media')).toContain('light')
  })

  it('creates a theme-color meta when none exists', () => {
    applyStatusBarTint('#123456')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#123456')
  })

  it('no-ops on an unchanged colour (no redundant DOM writes)', () => {
    document.head.innerHTML = `<meta name="theme-color" content="#000000" />`
    applyStatusBarTint('#abcdef')
    // Mutate behind the cache; an unchanged call must not rewrite it.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', 'sentinel')
    applyStatusBarTint('#abcdef')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      'sentinel',
    )
  })

  it('applySkyStatusBarTint converts then applies', () => {
    document.head.innerHTML = `<meta name="theme-color" content="#000000" />`
    applySkyStatusBarTint([1, 1, 1])
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffff',
    )
  })
})

describe('updateStatusBarTint', () => {
  beforeEach(() => {
    resetStatusBarTint()
    document.head.innerHTML = `<meta name="theme-color" content="#000000" />`
  })
  afterEach(() => {
    document.head.innerHTML = ''
  })

  const content = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

  it('falls back to the analytic sky colour when no canvas is readable', () => {
    // No source ⇒ sampling is skipped and the linear sky tint is used.
    updateStatusBarTint(undefined, [1, 1, 1])
    expect(content()).toBe('#ffffff')
  })

  it('tracks a changing fallback colour across calls', () => {
    updateStatusBarTint(undefined, [1, 1, 1])
    expect(content()).toBe('#ffffff')
    updateStatusBarTint(undefined, [0, 0, 0])
    expect(content()).toBe('#000000')
  })
})
