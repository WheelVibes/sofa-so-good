import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'

const KEY = 'sofa.editor.v1'

describe('editorPrefs', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      snapEnabled: false,
      gridSize: 0.5,
      units: 'metric',
      backdrop: 'photo',
      uiMode: 'simple',
    } as never)
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
    expect(useStore.getState().backdrop).toBe('photo')
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
    expect(useStore.getState().backdrop).toBe('photo')
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
})
