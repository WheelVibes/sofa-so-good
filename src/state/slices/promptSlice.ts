import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A pending themed text-prompt request (replaces the blocking `window.prompt`). */
interface PromptRequest {
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

/** A pending themed confirm request (replaces the blocking `window.confirm`). */
export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  /** `danger` tints the confirm button red (destructive actions). */
  danger?: boolean
}

export interface PromptSlice {
  /** The open prompt request, or null. Read by `<PromptModal>`. */
  textPrompt: PromptRequest | null
  /** Open a themed prompt; resolves to the trimmed string, or null if cancelled
   *  / left blank. Drop-in async replacement for `window.prompt`. */
  promptText: (req: PromptRequest) => Promise<string | null>
  /** Resolve the open prompt (called by the modal's OK / Cancel / close). */
  resolvePrompt: (value: string | null) => void
  /** The open confirm request, or null. Read by `<ConfirmModal>`. */
  confirmRequest: ConfirmRequest | null
  /** Open a themed confirm; resolves true (confirmed) or false. Drop-in async
   *  replacement for `window.confirm`. */
  confirmAction: (req: ConfirmRequest) => Promise<boolean>
  /** Resolve the open confirm (called by the modal's buttons / close). */
  resolveConfirm: (ok: boolean) => void
}

export const PROMPT_INITIAL: Pick<PromptSlice, 'textPrompt' | 'confirmRequest'> = {
  textPrompt: null,
  confirmRequest: null,
}

// The pending resolvers live outside the store (transient callbacks, not
// serialisable state). Only one prompt / one confirm can be open at a time.
let pendingResolve: ((value: string | null) => void) | null = null
let pendingConfirm: ((ok: boolean) => void) | null = null

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
  confirmAction: (req) =>
    new Promise<boolean>((resolve) => {
      if (pendingConfirm) pendingConfirm(false)
      pendingConfirm = resolve
      set({ confirmRequest: req })
    }),
  resolveConfirm: (ok) => {
    const resolve = pendingConfirm
    pendingConfirm = null
    set({ confirmRequest: null })
    resolve?.(ok)
  },
})
