import { type CSSProperties, memo } from 'react'
import { LOADING_PHRASES, PHRASE_FADE_MS } from './loadingPhrases'
import { useCyclingPhrase } from './useCyclingPhrase'

/** Animated status line that cycles through Singapore/HDB loading phrases. */
export const CyclingPhrase = memo(function CyclingPhrase({
  active,
  phrases = LOADING_PHRASES,
  className,
  style,
}: {
  active: boolean
  phrases?: readonly string[]
  className?: string
  style?: CSSProperties
}) {
  const { phrase, visible } = useCyclingPhrase(active, phrases)

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        minHeight: '1.35em',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: `opacity ${PHRASE_FADE_MS}ms ease, transform ${PHRASE_FADE_MS}ms ease`,
        ...style,
      }}
    >
      {phrase}
    </span>
  )
})
