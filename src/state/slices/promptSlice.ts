import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A pending themed text-prompt request (replaces the blocking `window.prompt`). */
export interface PromptRequest {
  title: string
  /** Inline field label (defaults to the title context). */
  label?: string
  defaultValue?: string
  placeholder?: string
  /** Confirm-button text (default "OK"). */
  submitLabel?: string
  /** `text` (default) or `number` input mode. */
  numeric?: boolean
}

export interface PromptSlice {
  /** The open prompt request, or null. Read by `<PromptModal>`. */
  textPrompt: PromptRequest | null
  /** Open a themed prompt; resolves to the trimmed string, or null if cancelled
   *  / left blank. Drop-in async replacement for `window.prompt`. */
  promptText: (req: PromptRequest) => Promise<string | null>
  /** Resolve the open prompt (called by the modal's OK / Cancel / close). */
  resolvePrompt: (value: string | null) => void
}

export const PROMPT_INITIAL: Pick<PromptSlice, 'textPrompt'> = {
  textPrompt: null,
}

// The pending resolver lives outside the store (it's a transient callback, not
// serialisable state). Only one prompt can be open at a time.
let pendingResolve: ((value: string | null) => void) | null = null

export const createPromptSlice: SliceCreator<PromptSlice, RootState> = (set) => ({
  ...PROMPT_INITIAL,
  promptText: (req) =>
    new Promise<string | null>((resolve) => {
      // Superseding an open prompt cancels the previous one.
      if (pendingResolve) pendingResolve(null)
      pendingResolve = resolve
      set({ textPrompt: req })
    }),
  resolvePrompt: (value) => {
    const resolve = pendingResolve
    pendingResolve = null
    set({ textPrompt: null })
    resolve?.(value)
  },
})
