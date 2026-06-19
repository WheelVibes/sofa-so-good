import { Fragment } from 'react'
import { GROUND_LEVEL_ID, type PlanLevel, planLevels } from '../../floorplan/levels'
import type { FloorPlan } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { formatLength } from '../../utils/measurement'

/**
 * Storey tab strip for the 2D Floor Plan Editor (F13/ML4b): Ground + each
 * upper level + "＋ Level". Selecting a tab makes every editor tool/inspector
 * edit operate on that storey's walls/rooms/openings. Upper tabs carry a ✕
 * remove button (confirmed via the store's themed confirm; undoable — the
 * slice snapshots history and drops the storey's items + finish keys).
 */
export function LevelTabs({
  plan,
  activeLevelId,
  onSelect,
}: {
  plan: FloorPlan
  /** Effective active level id (degrade stale ids to ground before passing). */
  activeLevelId: string
  onSelect: (levelId: string) => void
}) {
  const levels = planLevels(plan)
  const units = useStore((s) => s.units)

  const addLevel = () => {
    const id = useStore.getState().addLevel()
    onSelect(id)
  }

  const duplicateLevel = () => {
    const id = useStore.getState().duplicateLevel(activeLevelId)
    if (id) onSelect(id)
  }

  const removeLevel = async (level: PlanLevel) => {
    const st = useStore.getState()
    const ok = await st.confirmAction({
      title: `Remove ${level.name}?`,
      message: 'Its walls, rooms, openings and furniture are removed with it. You can undo this.',
      confirmLabel: 'Remove level',
      danger: true,
    })
    if (!ok) return
    useStore.getState().removeLevel(level.id)
    onSelect(GROUND_LEVEL_ID)
  }

  return (
    <div className="seg plan-level-tabs" role="tablist" aria-label="Levels">
      {levels.map((l) => (
        <Fragment key={l.id}>
          <button
            type="button"
            role="tab"
            aria-selected={l.id === activeLevelId}
            className={l.id === activeLevelId ? 'on' : ''}
            onClick={() => onSelect(l.id)}
            title={
              l.elevation > 0
                ? `Edit this storey (floor at ${formatLength(l.elevation, units)})`
                : undefined
            }
          >
            {l.name}
          </button>
          {l.id !== GROUND_LEVEL_ID && (
            <button
              type="button"
              aria-label={`Remove ${l.name}`}
              title={`Remove ${l.name}`}
              onClick={() => void removeLevel(l)}
            >
              ✕
            </button>
          )}
        </Fragment>
      ))}
      <button type="button" onClick={addLevel} title="Add a storey above the highest level">
        ＋ Level
      </button>
      <button
        type="button"
        onClick={duplicateLevel}
        title="Duplicate the current storey — walls, rooms, openings, furniture + finishes"
      >
        ⧉ Duplicate
      </button>
    </div>
  )
}
