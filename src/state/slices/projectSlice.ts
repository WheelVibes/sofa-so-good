import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Project-level metadata that travels with the saved design (not a device
 * preference). Currently a free-text note — e.g. a brief, client preferences,
 * or a to-do — surfaced in the Share modal and the printable report, and
 * round-tripped through the save schema.
 */
export interface ProjectSlice {
  designNote: string
  setDesignNote: (note: string) => void
}

export const PROJECT_INITIAL: Pick<ProjectSlice, 'designNote'> = {
  designNote: '',
}

export const createProjectSlice: SliceCreator<ProjectSlice, RootState> = (set) => ({
  ...PROJECT_INITIAL,
  setDesignNote: (designNote) => set({ designNote }),
})
