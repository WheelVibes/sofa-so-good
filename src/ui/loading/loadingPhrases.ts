import data from './loadingPhrases.json'

/** Singapore / HDB-flavoured status lines for boot + generic loading overlays. */
export const LOADING_PHRASES = data.phrases as readonly string[]

/** How long each phrase stays fully visible before crossfading to the next. */
export const PHRASE_CYCLE_MS = data.cycleMs
/** Crossfade duration — matches Claude Code's thinking-line swap. */
export const PHRASE_FADE_MS = data.fadeMs
