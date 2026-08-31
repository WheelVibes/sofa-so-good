// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UI_INITIAL } from '../slices/uiSlice'
import { useStore } from '../store'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'

const KEY = 'sofa.editor.v1'

/** Install a `matchMedia` stub reporting the given desktop/mobile result for
 *  the `(min-width:641px)` query the catalogOpen restore gate uses. */
function mockMatchMedia(isDesktop: boolean): void {
  ;(globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (
    query: string,
  ) => ({ matches: query.includes('min-width') ? isDesktop : false })
}

describe('editorPrefs', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      snapEnabled: false,
      gridSize: 0.5,
      units: 'metric',
      backdrop: 'city',
      uiMode: 'simple',
      leftMode: 'catalog',
      layersCollapsed: {},
      catalogOpen: false,
    } as never)
    mockMatchMedia(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as unknown as { matchMedia?: unknown }).matchMedia = undefined
  })

  it('loads persisted prefs (incl. backdrop + uiMode) into the store', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        snapEnabled: true,
        gridSize: 1,
        units: 'imperial',
        backdrop: 'park',
        uiMode: 'simple',
      }),
    )
    loadEditorPrefs()
    const s = useStore.getState()
    expect(s.snapEnabled).toBe(true)
    expect(s.gridSize).toBe(1)
    expect(s.units).toBe('imperial')
    expect(s.backdrop).toBe('park')
    expect(s.uiMode).toBe('simple')
  })

  it('falls back to safe values for invalid/missing backdrop + uiMode', () => {
    localStorage.setItem(KEY, JSON.stringify({ backdrop: 'martian', uiMode: 'wizard' }))
    loadEditorPrefs()
    // Falls back to the APP DEFAULT, not a hardcoded literal (WINDOW-SKY-DEFAULT).
    expect(useStore.getState().backdrop).toBe(UI_INITIAL.backdrop)
    // Default interface is Simple; only an explicit 'pro' opts into the full UI.
    expect(useStore.getState().uiMode).toBe('simple')
  })

  it('keeps an explicit pro uiMode', () => {
    localStorage.setItem(KEY, JSON.stringify({ uiMode: 'pro' }))
    loadEditorPrefs()
    expect(useStore.getState().uiMode).toBe('pro')
  })

  it('ignores a missing/corrupt prefs blob without throwing', () => {
    localStorage.setItem(KEY, '{ not json')
    expect(() => loadEditorPrefs()).not.toThrow()
    // Store keeps its defaults.
    expect(useStore.getState().backdrop).toBe('city')
  })

  it('persists store changes back to localStorage (round-trip)', () => {
    watchEditorPrefs()
    useStore.setState({ backdrop: 'hills', uiMode: 'simple' } as never)
    const raw = localStorage.getItem(KEY)
    expect(raw).toBeTruthy()
    const p = JSON.parse(raw as string)
    expect(p.backdrop).toBe('hills')
    expect(p.uiMode).toBe('simple')
  })

  it('round-trips the left-dock mode + collapsed layer groups', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ leftMode: 'layers', layersCollapsed: { living: true, kitchen: false } }),
    )
    loadEditorPrefs()
    expect(useStore.getState().leftMode).toBe('layers')
    expect(useStore.getState().layersCollapsed).toEqual({ living: true, kitchen: false })
  })

  it('defaults leftMode + layersCollapsed for missing/invalid stored values', () => {
    localStorage.setItem(KEY, JSON.stringify({ leftMode: 'bogus', layersCollapsed: 'nope' }))
    loadEditorPrefs()
    expect(useStore.getState().leftMode).toBe('catalog')
    expect(useStore.getState().layersCollapsed).toEqual({})
  })

  it('persists leftMode + layersCollapsed back to localStorage', () => {
    watchEditorPrefs()
    useStore.setState({ leftMode: 'layers', layersCollapsed: { bed: true } } as never)
    const p = JSON.parse(localStorage.getItem(KEY) as string)
    expect(p.leftMode).toBe('layers')
    expect(p.layersCollapsed).toEqual({ bed: true })
  })

  it('restores catalogOpen=true on desktop (matchMedia matches)', () => {
    mockMatchMedia(true)
    localStorage.setItem(KEY, JSON.stringify({ catalogOpen: true }))
    loadEditorPrefs()
    expect(useStore.getState().catalogOpen).toBe(true)
  })

  it('does NOT restore catalogOpen on mobile even if stored true', () => {
    mockMatchMedia(false)
    localStorage.setItem(KEY, JSON.stringify({ catalogOpen: true }))
    loadEditorPrefs()
    expect(useStore.getState().catalogOpen).toBe(false)
  })

  it('is SSR/jsdom-safe when matchMedia is undefined (catalogOpen stays false)', () => {
    ;(globalThis as unknown as { matchMedia?: unknown }).matchMedia = undefined
    localStorage.setItem(KEY, JSON.stringify({ catalogOpen: true }))
    expect(() => loadEditorPrefs()).not.toThrow()
    expect(useStore.getState().catalogOpen).toBe(false)
  })

  it('round-trips the plan-labels mode (valid value persisted + restored)', () => {
    localStorage.setItem(KEY, JSON.stringify({ planLabels: 'price' }))
    loadEditorPrefs()
    expect(useStore.getState().planLabels).toBe('price')
    // An invalid stored value falls back to off.
    localStorage.setItem(KEY, JSON.stringify({ planLabels: 'bogus' }))
    loadEditorPrefs()
    expect(useStore.getState().planLabels).toBe('off')
  })
})
