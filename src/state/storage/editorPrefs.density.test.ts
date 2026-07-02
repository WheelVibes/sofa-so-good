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

  it('applies [data-density] on <html> when the watcher fires after setDensity', () => {
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
})
