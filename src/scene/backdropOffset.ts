import { useMemo } from 'react'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { planBounds } from '../floorplan/types'
import { useStore } from '../state/store'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/** Translation that centres a backdrop (laid out around the built-in apartment
 *  centre) on the ACTIVE plan, so any custom apartment is ringed by its scenery.
 *  Exactly (0,0,0) for the built-in flat. Memoised on the plan. */
export function useBackdropOffset(): [number, number, number] {
  const plan = useStore((s) => s.floorPlan)
  return useMemo(() => {
    const [pw, pd] = planBounds(plan)
    return [pw / 2 - CX, 0, pd / 2 - CZ]
  }, [plan])
}
