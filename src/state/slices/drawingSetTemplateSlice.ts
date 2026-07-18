/**
 * Slice that persists the user's drawing-set handover metadata (TODO G5 —
 * project/client identity, drawn-by/checked-by, revision). Mirrors
 * `quoteTemplateSlice.ts` exactly: the template travels with the design
 * (saved in `.sofa.json` / share links) and is applied at export time in
 * `drawingSet.ts`. Changes are pushed to the undo history.
 */

import {
  DEFAULT_DRAWING_SET_TEMPLATE,
  type DrawingSetTemplate,
} from '../../export/drawingSetTemplate'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface DrawingSetTemplateSlice {
  /** The active drawing-set template. Defaults to `DEFAULT_DRAWING_SET_TEMPLATE`. */
  drawingSetTemplate: DrawingSetTemplate
  /** Replace the active template (pushed to undo history). */
  setDrawingSetTemplate: (t: DrawingSetTemplate) => void
  /** Reset to the default template (pushed to undo history). */
  resetDrawingSetTemplate: () => void
}

export const DRAWING_SET_TEMPLATE_INITIAL: Pick<DrawingSetTemplateSlice, 'drawingSetTemplate'> = {
  drawingSetTemplate: DEFAULT_DRAWING_SET_TEMPLATE,
}

export const createDrawingSetTemplateSlice: SliceCreator<DrawingSetTemplateSlice, RootState> = (
  set,
  get,
) => ({
  ...DRAWING_SET_TEMPLATE_INITIAL,
  setDrawingSetTemplate: (drawingSetTemplate) => {
    get().pushHistory()
    set({ drawingSetTemplate })
  },
  resetDrawingSetTemplate: () => {
    get().pushHistory()
    set({ drawingSetTemplate: DEFAULT_DRAWING_SET_TEMPLATE })
  },
})
