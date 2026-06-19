/**
 * Slice that persists the user's quote template settings (company branding,
 * notes, tax/markup/discount percentages, and section-visibility toggles).
 *
 * The template travels with the design (saved in `.sofa.json` / share links)
 * and is applied at export time in `openBoq` / `downloadBoqXlsx`. Changes are
 * pushed to the undo history so they can be stepped back.
 */

import { DEFAULT_QUOTE_TEMPLATE, type QuoteTemplate } from '../../export/quoteTemplate'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface QuoteTemplateSlice {
  /** The active quote template. Defaults to `DEFAULT_QUOTE_TEMPLATE`. */
  quoteTemplate: QuoteTemplate
  /** Replace the active template (pushed to undo history). */
  setQuoteTemplate: (t: QuoteTemplate) => void
  /** Reset to the default template (pushed to undo history). */
  resetQuoteTemplate: () => void
}

export const QUOTE_TEMPLATE_INITIAL: Pick<QuoteTemplateSlice, 'quoteTemplate'> = {
  quoteTemplate: DEFAULT_QUOTE_TEMPLATE,
}

export const createQuoteTemplateSlice: SliceCreator<QuoteTemplateSlice, RootState> = (
  set,
  get,
) => ({
  ...QUOTE_TEMPLATE_INITIAL,
  setQuoteTemplate: (quoteTemplate) => {
    get().pushHistory()
    set({ quoteTemplate })
  },
  resetQuoteTemplate: () => {
    get().pushHistory()
    set({ quoteTemplate: DEFAULT_QUOTE_TEMPLATE })
  },
})
