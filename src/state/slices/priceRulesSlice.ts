/**
 * Slice that persists the user's price-rule library — the configurable $/m²
 * floor + wall rates and the carpentry $/linear-metre rate that drive the
 * BOQ quote (`assembleBoqInput`) and the renovation estimate (`estimateRenovation`).
 *
 * Like the quote template, the rate card travels with the design (saved in
 * `.sofa.json` / share links) and changes are pushed to the undo history so
 * they can be stepped back. Defaults reproduce the built-in SG rate table.
 */

import { DEFAULT_PRICE_RULES, type PriceRules } from '../../analysis/renovationCost'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface PriceRulesSlice {
  /** The active price-rule card. Defaults to `DEFAULT_PRICE_RULES`. */
  priceRules: PriceRules
  /** Replace the active rate card (pushed to undo history). */
  setPriceRules: (r: PriceRules) => void
  /** Reset to the built-in rate table (pushed to undo history). */
  resetPriceRules: () => void
}

export const PRICE_RULES_INITIAL: Pick<PriceRulesSlice, 'priceRules'> = {
  priceRules: DEFAULT_PRICE_RULES,
}

export const createPriceRulesSlice: SliceCreator<PriceRulesSlice, RootState> = (set, get) => ({
  ...PRICE_RULES_INITIAL,
  setPriceRules: (priceRules) => {
    get().pushHistory()
    set({ priceRules })
  },
  resetPriceRules: () => {
    get().pushHistory()
    set({ priceRules: DEFAULT_PRICE_RULES })
  },
})
