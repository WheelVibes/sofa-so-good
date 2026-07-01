import { useEffect, useState } from 'react'
import { GROUND_LEVEL_ID, levelAsPlan, levelById, planLevels } from '../../../floorplan/levels'
import type { FloorPlan } from '../../../floorplan/types'

/**
 * Resolves the 2D editor's **active storey** (F13/ML4b): the selected level id
 * (reset to ground when the editor opens or the plan changes), and everything
 * derived from it that the rest of the editor operates on — the effective
 * `activeLevel` (a stale id degrades to ground), the single-storey `levelPlan`
 * (`levelAsPlan`, the walls/rooms/openings every tool/overlay/inspector edit
 * targets), the `levelId`, and the level list. Extracted from `FloorPlanEditor`
 * as behaviour-preserving code-motion (MOD-FPE-SPLIT).
 */
export function usePlanLevel(plan: FloorPlan, editing: boolean) {
  // Active storey: every tool, overlay and inspector edit operates on this
  // level's walls/rooms/openings. Resets to ground when the editor opens or a
  // different plan becomes active.
  const [activeLevelId, setActiveLevelId] = useState<string>(GROUND_LEVEL_ID)
  // biome-ignore lint/correctness/useExhaustiveDependencies: editing/plan.id are reset triggers.
  useEffect(() => {
    setActiveLevelId(GROUND_LEVEL_ID)
  }, [editing, plan.id])
  // A stale id (level undone/removed) degrades to ground; use the EFFECTIVE id
  // everywhere so the tab highlight and the routed actions always agree.
  const activeLevel = levelById(plan, activeLevelId)
  const levelPlan = levelAsPlan(plan, activeLevel)
  const levelId = activeLevel.id
  const allLevels = planLevels(plan)
  const isMultiLevel = allLevels.length > 1
  const otherLevels = allLevels.filter((l) => l.id !== levelId)

  return {
    activeLevelId,
    setActiveLevelId,
    activeLevel,
    levelPlan,
    levelId,
    allLevels,
    isMultiLevel,
    otherLevels,
  }
}
