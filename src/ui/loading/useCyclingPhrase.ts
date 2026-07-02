import { useEffect, useRef, useState } from 'react'
import { createPhraseCycler } from './createPhraseCycler'
import { LOADING_PHRASES } from './loadingPhrases'

/** Cycles through loading phrases with a fade-out / fade-in swap (Claude Code style). */
export function useCyclingPhrase(
  active: boolean,
  phrases: readonly string[] = LOADING_PHRASES,
): { phrase: string; visible: boolean } {
  const [phrase, setPhrase] = useState(phrases[0] ?? '')
  const [visible, setVisible] = useState(true)
  const cyclerRef = useRef<ReturnType<typeof createPhraseCycler> | null>(null)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!active || phrases.length === 0) {
      cyclerRef.current?.stop()
      return
    }

    const cycler = createPhraseCycler(
      phrases,
      (next, vis) => {
        setPhrase(next)
        setVisible(reduced ? true : vis)
      },
      undefined,
      reduced ? 0 : undefined,
    )
    cyclerRef.current = cycler
    cycler.start()
    return () => cycler.stop()
  }, [active, phrases])

  return { phrase, visible }
}
