import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPhraseCycler } from './createPhraseCycler'
import { PHRASE_CYCLE_MS, PHRASE_FADE_MS } from './loadingPhrases'

describe('createPhraseCycler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cycles phrases with a fade gap between them', () => {
    const updates: Array<{ phrase: string; visible: boolean }> = []
    const cycler = createPhraseCycler(['A…', 'B…'], (phrase, visible) => {
      updates.push({ phrase, visible })
    })

    cycler.start()
    expect(updates).toEqual([{ phrase: 'A…', visible: true }])

    vi.advanceTimersByTime(PHRASE_CYCLE_MS)
    expect(updates.at(-1)).toEqual({ phrase: 'A…', visible: false })

    vi.advanceTimersByTime(PHRASE_FADE_MS)
    expect(updates.at(-1)).toEqual({ phrase: 'B…', visible: true })

    cycler.stop()
  })

  it('pins a final phrase and stops cycling', () => {
    const updates: string[] = []
    const cycler = createPhraseCycler(['A…', 'B…'], (phrase) => {
      updates.push(phrase)
    })

    cycler.start()
    cycler.pin('Almost ready…')
    vi.advanceTimersByTime(PHRASE_CYCLE_MS * 3)
    expect(updates).toEqual(['A…', 'Almost ready…'])
  })

  it('does nothing for an empty phrase list', () => {
    const onPhrase = vi.fn()
    const cycler = createPhraseCycler([], onPhrase)
    cycler.start()
    vi.advanceTimersByTime(PHRASE_CYCLE_MS * 2)
    expect(onPhrase).not.toHaveBeenCalled()
  })
})
