// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import type { ClipboardEntry } from './clipboardSlice'

const LS_KEY = 'hdb_clipboard'

const entry = (defId: string, pos: [number, number]): ClipboardEntry => ({
  defId: defId as ClipboardEntry['defId'],
  rotation: 0,
  props: { color: '#fff' },
  sourcePosition: pos,
})

/** Force a fresh module evaluation of clipboardSlice — mirrors what actually
 *  happens on a real page reload (the JS module graph re-executes from
 *  scratch, so `CLIPBOARD_INITIAL` re-reads localStorage). */
async function reimportClipboardSlice() {
  vi.resetModules()
  return import('./clipboardSlice')
}

describe('clipboardSlice (multi-item copy/paste, PC2-MULTI-DUP-PASTE)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.removeItem(LS_KEY)
  })

  it('stores a whole selection (array) and deep-copies props + positions', () => {
    const a = entry('sofa-3seat', [1, 2])
    const b = entry('coffee-table', [3, 4])
    useStore.getState().setClipboard([a, b])
    const cb = useStore.getState().clipboard
    expect(cb).toHaveLength(2)
    // Deep copies, not references — mutating the source must not affect the store.
    a.props.color = '#000'
    a.sourcePosition[0] = 99
    expect(cb?.[0].props.color).toBe('#fff')
    expect(cb?.[0].sourcePosition[0]).toBe(1)
    expect(cb?.[1].defId).toBe('coffee-table')
  })

  it('normalises null / empty array to null', () => {
    useStore.getState().setClipboard([entry('sofa-3seat', [0, 0])])
    expect(useStore.getState().clipboard).not.toBeNull()
    useStore.getState().setClipboard([])
    expect(useStore.getState().clipboard).toBeNull()
    useStore.getState().setClipboard([entry('sofa-3seat', [0, 0])])
    useStore.getState().setClipboard(null)
    expect(useStore.getState().clipboard).toBeNull()
  })
})

describe('clipboardSlice persistence (R3-FEAT-1 — cross-reload / cross-plan paste)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.removeItem(LS_KEY)
  })

  it('persists to localStorage on copy (setClipboard)', () => {
    useStore.getState().setClipboard([entry('sofa-3seat', [1, 2])])
    const raw = localStorage.getItem(LS_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].defId).toBe('sofa-3seat')
    expect(parsed[0].sourcePosition).toEqual([1, 2])
  })

  it('removes the localStorage entry when the clipboard is cleared', () => {
    useStore.getState().setClipboard([entry('sofa-3seat', [1, 2])])
    expect(localStorage.getItem(LS_KEY)).toBeTruthy()
    useStore.getState().setClipboard(null)
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('removes the localStorage entry when set to an empty array', () => {
    useStore.getState().setClipboard([entry('sofa-3seat', [1, 2])])
    useStore.getState().setClipboard([])
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('hydrates from localStorage on module init (simulated reload)', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        {
          defId: 'armchair',
          rotation: 1.5,
          props: { color: '#abc' },
          sourcePosition: [3, 4],
          flipX: true,
          label: 'My chair',
        },
      ]),
    )
    const { CLIPBOARD_INITIAL } = await reimportClipboardSlice()
    expect(CLIPBOARD_INITIAL.clipboard).toHaveLength(1)
    expect(CLIPBOARD_INITIAL.clipboard?.[0]).toMatchObject({
      defId: 'armchair',
      rotation: 1.5,
      sourcePosition: [3, 4],
      flipX: true,
      label: 'My chair',
    })
  })

  it('a missing localStorage value hydrates to null without throwing', async () => {
    localStorage.removeItem(LS_KEY)
    const { CLIPBOARD_INITIAL } = await reimportClipboardSlice()
    expect(CLIPBOARD_INITIAL.clipboard).toBeNull()
  })

  it('a corrupt localStorage value hydrates to null without throwing', async () => {
    localStorage.setItem(LS_KEY, '{ not json')
    await expect(reimportClipboardSlice()).resolves.toBeTruthy()
  })

  it('a non-array localStorage value hydrates to null without throwing', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ not: 'an array' }))
    const { CLIPBOARD_INITIAL } = await reimportClipboardSlice()
    expect(CLIPBOARD_INITIAL.clipboard).toBeNull()
  })

  it('filters out malformed entries within an otherwise-valid array', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        { defId: 'armchair', rotation: 0, props: {}, sourcePosition: [0, 0] },
        { defId: 'missing-rotation', props: {}, sourcePosition: [0, 0] },
        { defId: 'bad-position', rotation: 0, props: {}, sourcePosition: [0] },
        { rotation: 0, props: {}, sourcePosition: [0, 0] }, // no defId
        null,
        'not an object',
      ]),
    )
    const { CLIPBOARD_INITIAL } = await reimportClipboardSlice()
    expect(CLIPBOARD_INITIAL.clipboard).toHaveLength(1)
    expect(CLIPBOARD_INITIAL.clipboard?.[0].defId).toBe('armchair')
  })

  it('an all-invalid array hydrates to null (not an empty array)', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([{ bogus: true }]))
    const { CLIPBOARD_INITIAL } = await reimportClipboardSlice()
    expect(CLIPBOARD_INITIAL.clipboard).toBeNull()
  })
})

describe('clipboardSlice cross-plan paste resolution (R3-FEAT-1)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.removeItem(LS_KEY)
  })

  it('a copied item persists in the clipboard after the design/items are swapped out', () => {
    useStore.getState().setClipboard([entry('armchair', [1, 1])])
    // Simulate switching to a different design/plan: items reset, clipboard
    // (device-level, not part of the save schema) must be untouched.
    useStore.getState().setItems([])
    expect(useStore.getState().clipboard).toHaveLength(1)
    expect(useStore.getState().clipboard?.[0].defId).toBe('armchair')
  })

  it('clipboard entries with an id not resolvable against a target catalog are identifiable for skip-on-paste', () => {
    // Paste's own def-resolution (App.tsx `pasteClipboard`) filters entries
    // against the live catalog and skips unresolvable ones; this asserts the
    // clipboard itself keeps storing whatever was copied (including an id that
    // may not resolve in a different design), so that filtering has something
    // to work with rather than silently dropping data at copy time.
    useStore.getState().setClipboard([entry('some-def-not-in-target-catalog', [0, 0])])
    const cb = useStore.getState().clipboard
    expect(cb).toHaveLength(1)
    expect(cb?.[0].defId).toBe('some-def-not-in-target-catalog')
  })
})
