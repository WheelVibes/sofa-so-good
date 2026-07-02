import { PHRASE_CYCLE_MS, PHRASE_FADE_MS } from './loadingPhrases'

export interface PhraseCycler {
  start: () => void
  stop: () => void
  /** Stop cycling and show a fixed line (e.g. boot phase-2 "Almost ready…"). */
  pin: (phrase: string) => void
}

/** Pure timer-driven phrase rotator — shared by the React hook and boot DOM rotator. */
export function createPhraseCycler(
  phrases: readonly string[],
  onPhrase: (phrase: string, visible: boolean) => void,
  intervalMs = PHRASE_CYCLE_MS,
  fadeMs = PHRASE_FADE_MS,
): PhraseCycler {
  if (phrases.length === 0) {
    return { start: () => {}, stop: () => {}, pin: () => {} }
  }

  let index = 0
  let running = false
  let pinned = false
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let fadeTimer: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    if (holdTimer !== undefined) clearTimeout(holdTimer)
    if (fadeTimer !== undefined) clearTimeout(fadeTimer)
    holdTimer = undefined
    fadeTimer = undefined
  }

  const show = (phrase: string) => onPhrase(phrase, true)

  const scheduleNext = () => {
    if (!running || pinned) return
    holdTimer = setTimeout(() => {
      if (!running || pinned) return
      onPhrase(phrases[index]!, false)
      fadeTimer = setTimeout(() => {
        if (!running || pinned) return
        index = (index + 1) % phrases.length
        show(phrases[index]!)
        scheduleNext()
      }, fadeMs)
    }, intervalMs)
  }

  return {
    start() {
      if (running) return
      running = true
      pinned = false
      show(phrases[index]!)
      scheduleNext()
    },
    stop() {
      running = false
      pinned = false
      clear()
    },
    pin(phrase) {
      running = false
      pinned = true
      clear()
      show(phrase)
    },
  }
}
