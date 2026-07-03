// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'

const KEY = 'sofa.editor.v1'

describe('editorPrefs — density (P38)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-density')
    useStore.setState({
      snapEnabled: false,
      gridSize: 0.5,
      units: 'metric',
      backdrop: 'city',
      uiMode: 'simple',
      density: 'comfortable',
    } as never)
  })

  it('round-trips density through sofa.editor.v1', () => {
    localStorage.setItem(KEY, JSON.stringify({ density: 'compact' }))
    loadEditorPrefs()
    expect(useStore.getState().density).toBe('compact')
  })

  it('old JSON without density loads as comfortable (back-compat default)', () => {
    localStorage.setItem(KEY, JSON.stringify({ snapEnabled: true }))
    loadEditorPrefs()
    expect(useStore.getState().density).toBe('comfortable')
  })

  it('falls back to comfortable for an invalid stored density value', () => {
    localStorage.setItem(KEY, JSON.stringify({ density: 'ultra-cozy' }))
    loadEditorPrefs()
    expect(useStore.getState().density).toBe('comfortable')
  })

  it('applies [data-density] on <html> when the watcher fires after setDensity (Pro)', () => {
    useStore.setState({ uiMode: 'pro' } as never)
    useStore.getState().reresolveFeatureFlags()
    watchEditorPrefs()
    useStore.getState().setDensity('compact')
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('persists density to localStorage via the watcher', () => {
    watchEditorPrefs()
    useStore.setState({ density: 'compact' } as never)
    const raw = localStorage.getItem(KEY)
    expect(raw).toBeTruthy()
    const p = JSON.parse(raw as string)
    expect(p.density).toBe('compact')
  })

  describe('densityMode flag gates the effect, not the preference', () => {
    it('Pro mode with a persisted compact pref applies data-density=compact', () => {
      localStorage.setItem(KEY, JSON.stringify({ uiMode: 'pro', density: 'compact' }))
      loadEditorPrefs()
      expect(useStore.getState().featureFlags.densityMode).toBe(true)
      expect(document.documentElement.getAttribute('data-density')).toBe('compact')
    })

    it('switching to Simple falls back to comfortable while the pref stays compact', () => {
      localStorage.setItem(KEY, JSON.stringify({ uiMode: 'pro', density: 'compact' }))
      loadEditorPrefs()
      watchEditorPrefs()
      expect(document.documentElement.getAttribute('data-density')).toBe('compact')

      useStore.getState().setUiMode('simple')

      expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
      expect(useStore.getState().density).toBe('compact')
      const raw = JSON.parse(localStorage.getItem(KEY) as string)
      expect(raw.density).toBe('compact')
    })

    it('switching back to Pro restores data-density=compact', () => {
      localStorage.setItem(KEY, JSON.stringify({ uiMode: 'pro', density: 'compact' }))
      loadEditorPrefs()
      watchEditorPrefs()
      useStore.getState().setUiMode('simple')
      expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')

      useStore.getState().setUiMode('pro')

      expect(document.documentElement.getAttribute('data-density')).toBe('compact')
      expect(useStore.getState().density).toBe('compact')
    })
  })
})
