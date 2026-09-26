// @vitest-environment happy-dom
/**
 * MOTION-PREF-CSS (C2): the in-app tri-state has to reach the DOM, or the
 * app's principal animation suppressor — the blanket
 * `@media (prefers-reduced-motion: reduce)` block in `styles/app.css` — never
 * hears about it. `[data-reduce-motion]` is that bridge; these tests pin the
 * contract the CSS in `app.css` / `parts.css` / `LoadingOverlay` /
 * `TierChangeVeil` / `index.html` is written against:
 *
 *   · the attribute carries the RAW tri-state, not a resolved boolean (CSS
 *     resolves `'system'` itself via the media query, so an OS change
 *     mid-session lands with no `matchMedia` listener); and
 *   · it is rewritten on every store change, so flipping the toggle takes
 *     effect without a reload.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { loadAppearancePrefs, watchAppearancePrefs } from './appearancePrefs'

const KEY = 'hdb_appearance'

describe('appearancePrefs → <html> attributes', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-reduce-motion')
    useStore.setState({ theme: 'clay', modePref: 'light', reduceMotion: 'system' })
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('loadAppearancePrefs writes theme, mode AND the raw motion preference', () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'harbour', modePref: 'dark' }))
    loadAppearancePrefs()
    const el = document.documentElement
    expect(el.getAttribute('data-theme')).toBe('harbour')
    expect(el.getAttribute('data-mode')).toBe('dark')
    // A record written before U4 has no `reduceMotion` — back-compat default
    // 'system' keeps the media query in sole charge, exactly as before.
    expect(el.getAttribute('data-reduce-motion')).toBe('system')
  })

  it.each([
    'system',
    'on',
    'off',
  ] as const)('round-trips the raw %s preference to the attribute (not a resolved boolean)', (pref) => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'clay', reduceMotion: pref }))
    loadAppearancePrefs()
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe(pref)
  })

  it('watchAppearancePrefs re-applies the attribute when the toggle flips mid-session', () => {
    loadAppearancePrefs()
    watchAppearancePrefs()
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('system')

    // "Reduce" must reach CSS even though the OS asks for nothing …
    useStore.setState({ reduceMotion: 'on' })
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('on')
    // … and "Full" must be distinguishable from 'system', which is the only
    // way `app.css`'s `:root:not([data-reduce-motion='off'])` can let an
    // explicit choice beat an OS reduce-motion request.
    useStore.setState({ reduceMotion: 'off' })
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('off')

    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').reduceMotion).toBe('off')
  })
})
