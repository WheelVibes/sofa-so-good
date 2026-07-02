import { createPhraseCycler } from './createPhraseCycler'
import { LOADING_PHRASES, PHRASE_FADE_MS } from './loadingPhrases'

let cycler: ReturnType<typeof createPhraseCycler> | null = null
let span: HTMLSpanElement | null = null

declare global {
  interface Window {
    /** Inline boot script in index.html — cleared when the bundle rotator takes over. */
    __stopBootPhraseRotator?: (finalPhrase?: string) => void
  }
}

function applyVisible(next: string, visible: boolean) {
  if (!span) return
  span.textContent = next
  span.style.opacity = visible ? '1' : '0'
  span.style.transform = visible ? 'translateY(0)' : 'translateY(4px)'
}

/** Start cycling HDB-flavoured phrases on the static `#boot-loader` subline. */
export function startBootPhraseRotator(): void {
  window.__stopBootPhraseRotator?.()

  const sub = document.querySelector<HTMLElement>('#boot-loader .bl-sub')
  if (!sub) return

  span =
    sub.querySelector<HTMLSpanElement>('.cycling-phrase') ??
    (() => {
      const el = document.createElement('span')
      el.className = 'cycling-phrase'
      el.textContent = LOADING_PHRASES[0]
      sub.replaceChildren(el)
      return el
    })()

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  span.style.display = 'inline-block'
  span.style.minHeight = '1.35em'
  span.style.transition = reduced
    ? 'none'
    : `opacity ${PHRASE_FADE_MS}ms ease, transform ${PHRASE_FADE_MS}ms ease`

  cycler?.stop()
  cycler = createPhraseCycler(
    LOADING_PHRASES,
    (phrase, visible) => applyVisible(phrase, reduced ? true : visible),
    undefined,
    reduced ? 0 : undefined,
  )
  cycler.start()
}

/** Stop the boot rotator — optionally pin a final line (phase-2 warm-up). */
export function stopBootPhraseRotator(finalPhrase?: string): void {
  window.__stopBootPhraseRotator?.(finalPhrase)
  if (finalPhrase) {
    cycler?.pin(finalPhrase)
    if (!cycler && span) applyVisible(finalPhrase, true)
    return
  }
  cycler?.stop()
  cycler = null
}
