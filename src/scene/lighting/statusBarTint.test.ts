// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../features/featureFlags'
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
    updateStatusBarTint(undefined, [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
  })

  it('tracks a changing fallback colour across calls (past the sample throttle)', () => {
    updateStatusBarTint(undefined, [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
    // Advance well past the throttle window so the second call samples.
    updateStatusBarTint(undefined, [0, 0, 0], 1000)
    expect(content()).toBe('#000000')
  })

  it('throttles the readback: a call inside the sample window is a no-op (PERF-MAX-2)', () => {
    updateStatusBarTint(undefined, [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
    // A change requested inside the 100ms window must NOT be applied yet — the
    // expensive canvas readback is skipped to avoid a per-frame GPU stall.
    updateStatusBarTint(undefined, [0, 0, 0], 50)
    expect(content()).toBe('#ffffff')
    // Once the window elapses, the next call samples again.
    updateStatusBarTint(undefined, [0, 0, 0], 150)
    expect(content()).toBe('#000000')
  })
})

describe('statusBarTintBudget (STATUS-TINT-READBACK, P1)', () => {
  beforeEach(() => {
    resetStatusBarTint()
    document.head.innerHTML = `<meta name="theme-color" content="#000000" />`
  })
  afterEach(() => {
    document.head.innerHTML = ''
    setResolvedFlags(resolveFlags(false))
  })

  const content = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

  /** A canvas stand-in whose readback is EXPENSIVE — the trace measured 76 ms with the
   *  lights on. happy-dom has no 2D context, so `sampleCanvasTopHex` returns null and the
   *  analytic fallback is applied either way; what is under test is the RATE, not the colour. */
  const fakeCanvas = () => document.createElement('canvas') as HTMLCanvasElement

  it('ships on by default in BOTH Simple and Pro mode (tier: simple)', () => {
    expect(resolveFlags(false, {}, false, 'simple').statusBarTintBudget).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').statusBarTintBudget).toBe(true)
  })

  it('holds skipShaderLinkChecks OFF in BOTH modes for one cycle (R7-V)', () => {
    // A DELIBERATE one-cycle hold, not a retreat: the perf win (683 ms of sampled CPU,
    // worst mode-switch frame 717 → 283 ms) is still on the table and the flag is meant to
    // flip back. It is off while `boxProjectEnv.ts` — the repo's first hand-written
    // ShaderChunk replacement — has no real-device mileage, because a driver that rejects
    // that GLSL renders black glossy surfaces with a completely clean console.
    // See `docs/audit/code-review-r7-2026-09-25.md` and the registry comment.
    expect(resolveFlags(false, {}, false, 'simple').skipShaderLinkChecks).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').skipShaderLinkChecks).toBe(false)
  })

  it('does no canvas readback where a theme-color tint paints nothing (desktop)', () => {
    // happy-dom reports no coarse pointer and no standalone display mode, i.e. a desktop
    // browser — the sampler must not touch the canvas at all, only the analytic sky.
    setResolvedFlags(resolveFlags(false))
    let reads = 0
    const canvas = fakeCanvas()
    Object.defineProperty(canvas, 'width', {
      get() {
        reads += 1
        return 800
      },
    })
    updateStatusBarTint(canvas, [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
    expect(reads).toBe(0)
  })

  it('with the flag OFF it still reaches the canvas (the pre-fix control path)', () => {
    setResolvedFlags({ ...resolveFlags(false), statusBarTintBudget: false })
    let reads = 0
    const canvas = fakeCanvas()
    Object.defineProperty(canvas, 'width', {
      get() {
        reads += 1
        return 800
      },
    })
    updateStatusBarTint(canvas, [1, 1, 1], 0)
    expect(reads).toBeGreaterThan(0)
  })

  it('keeps the 100 ms floor when the readback is free', () => {
    setResolvedFlags(resolveFlags(false))
    updateStatusBarTint(undefined, [1, 1, 1], 0)
    updateStatusBarTint(undefined, [0, 0, 0], 50)
    expect(content()).toBe('#ffffff')
    updateStatusBarTint(undefined, [0, 0, 0], 150)
    expect(content()).toBe('#000000')
  })
})

/**
 * C5 — the duty-cycle branch itself. Every test above runs the DESKTOP path:
 * happy-dom reports neither `(pointer: coarse)` nor `(display-mode: standalone)`,
 * so `statusBarTintIsVisible()` is always false, the readback never runs and
 * `lastSampleCostMs` is pinned at 0 — the `lastSampleCostMs * SAMPLE_DUTY_DIVISOR`
 * expression was never once evaluated with a non-zero cost. These stub the media
 * queries to the mobile/standalone answer and inject a measurable readback cost
 * by advancing `performance.now`, which is the only clock the module reads.
 */
describe('statusBarTintBudget duty cycle on the mobile/standalone path (C5)', () => {
  const realMatchMedia = window.matchMedia
  const realNow = performance.now

  /** Stub `matchMedia` so the module believes it is on a phone. */
  function coarsePointer(): void {
    window.matchMedia = ((q: string) =>
      ({
        media: q,
        matches: /pointer:\s*coarse/.test(q),
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia
  }

  /** Make the next readback appear to cost `ms`: the module brackets the sample
   *  with two `performance.now()` reads, so returning 0 then `ms` injects it. */
  function readbackCosts(ms: number): void {
    let call = 0
    performance.now = () => {
      call += 1
      return call === 1 ? 0 : ms
    }
  }

  beforeEach(() => {
    resetStatusBarTint()
    document.head.innerHTML = `<meta name="theme-color" content="#000000" />`
    setResolvedFlags(resolveFlags(false))
    coarsePointer()
  })
  afterEach(() => {
    document.head.innerHTML = ''
    window.matchMedia = realMatchMedia
    performance.now = realNow
    resetStatusBarTint()
    setResolvedFlags(resolveFlags(false))
  })

  const content = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
  const fakeCanvas = () => document.createElement('canvas') as HTMLCanvasElement

  it('DOES read the canvas on a coarse-pointer client (the branch desktop skips)', () => {
    let reads = 0
    const canvas = fakeCanvas()
    Object.defineProperty(canvas, 'width', {
      get() {
        reads += 1
        return 800
      },
    })
    updateStatusBarTint(canvas, [1, 1, 1], 0)
    expect(reads).toBeGreaterThan(0)
  })

  it('a 10 ms readback stretches the interval to cost x 50 (500 ms), not the 100 ms floor', () => {
    readbackCosts(10)
    updateStatusBarTint(fakeCanvas(), [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
    // Past the 100 ms floor but inside 10 x 50 = 500 ms ⇒ still throttled.
    updateStatusBarTint(fakeCanvas(), [0, 0, 0], 499)
    expect(content()).toBe('#ffffff')
    updateStatusBarTint(fakeCanvas(), [0, 0, 0], 500)
    expect(content()).toBe('#000000')
  })

  it('the 2 s staleness ceiling wins over the duty cycle at the measured 76 ms cost', () => {
    readbackCosts(76)
    updateStatusBarTint(fakeCanvas(), [1, 1, 1], 0)
    expect(content()).toBe('#ffffff')
    // A strict 1/50 duty would wait 76 x 50 = 3800 ms; SAMPLE_INTERVAL_MAX_MS
    // clamps it to 2000, so the achieved duty is 76/2000 = 3.8 %, not 2 % —
    // which is exactly what the docblock now says rather than "never".
    updateStatusBarTint(fakeCanvas(), [0, 0, 0], 1999)
    expect(content()).toBe('#ffffff')
    updateStatusBarTint(fakeCanvas(), [0, 0, 0], 2000)
    expect(content()).toBe('#000000')
    expect(2000).toBeLessThan(76 * 50)
  })

  it('with the budget flag OFF the interval is the flat 100 ms floor, cost or no cost', () => {
    setResolvedFlags({ ...resolveFlags(false), statusBarTintBudget: false })
    readbackCosts(76)
    updateStatusBarTint(fakeCanvas(), [1, 1, 1], 0)
    updateStatusBarTint(fakeCanvas(), [0, 0, 0], 100)
    expect(content()).toBe('#000000')
  })
})
