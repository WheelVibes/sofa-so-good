import { PET_TYPES, type PetType } from '../../analysis/petCompliance'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Pet profile (Pet program — Stage P6): which pet types the household keeps.
 * A per-design setting that drives the pet-compliance checklist and the catalog
 * "Essentials" surfacing. Persisted with the design (rides the save schema like
 * `location`), so it survives save/load + cloud sync — see `state/schema.ts`
 * (`petTypes` field) + the autosave watch-list.
 */
export interface PetProfileSlice {
  /** The pet types the household has declared (order-insensitive; deduped). */
  petTypes: PetType[]
  /** Replace the full set (used by the profile multi-select "clear"/bulk set). */
  setPetTypes: (types: PetType[]) => void
  /** Toggle one pet type on/off. */
  togglePetType: (type: PetType) => void
}

export const PET_PROFILE_INITIAL: Pick<PetProfileSlice, 'petTypes'> = {
  petTypes: [],
}

/** Sanitise + canonicalise a set of pet types: keep only known types, dedupe,
 *  and return them in the canonical `PET_TYPES` order (so persistence is stable
 *  and equality comparisons don't churn on ordering). */
export function normalisePetTypes(types: readonly unknown[]): PetType[] {
  const seen = new Set(
    types.filter((t): t is PetType => (PET_TYPES as readonly unknown[]).includes(t)),
  )
  return PET_TYPES.filter((t) => seen.has(t))
}

export const createPetProfileSlice: SliceCreator<PetProfileSlice, RootState> = (set) => ({
  ...PET_PROFILE_INITIAL,
  setPetTypes: (types) => set({ petTypes: normalisePetTypes(types) }),
  togglePetType: (type) =>
    set((s) => ({
      petTypes: s.petTypes.includes(type)
        ? s.petTypes.filter((t) => t !== type)
        : normalisePetTypes([...s.petTypes, type]),
    })),
})
