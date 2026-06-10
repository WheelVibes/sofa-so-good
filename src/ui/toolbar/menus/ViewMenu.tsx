import { useFeature } from '../../../features/useFeature'
import { isMultiLevel, planLevels } from '../../../floorplan/levels'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'
import { SavedViewsSection } from './SavedViewsSection'

/** Combined camera + view cluster. The single entry point for *how you look* at
 *  the flat: switch the camera between Orbit and Walk, and (in the orbit
 *  overview) jump to a top-down plan view, reset the framing, auto-orbit, or fly
 *  to a saved camera angle. Entering a room to edit is the dedicated "Edit" menu,
 *  not here. */
export function ViewMenu() {
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const requestTopView = useStore((s) => s.requestTopView)
  const requestHomeView = useStore((s) => s.requestHomeView)
  const autoRotate = useStore((s) => s.autoRotate)
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const setViewLevel = useStore((s) => s.setViewLevel)
  const savedViews = useFeature('savedViews')

  const isOrbit = cameraMode === 'orbit'
  // The overview-only framing controls (top/reset/turntable/saved) only make
  // sense over the whole flat — not inside the per-room editor, which frames its
  // own room.
  const overview = isOrbit && !roomEditorActive

  return (
    <ToolbarMenu icon={isOrbit ? 'Orbit' : 'Walk'} label="View" active={autoRotate} width={244}>
      <div className="px-2 pb-0.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
        Camera
      </div>
      <MenuItem
        icon="Orbit"
        label="Orbit"
        sub="Look around the model"
        active={isOrbit}
        onClick={() => setCameraMode('orbit')}
      />
      <MenuItem
        icon="Walk"
        label="Walk"
        sub="First-person walkthrough"
        active={!isOrbit}
        onClick={() => setCameraMode('firstPerson')}
      />
      {isMultiLevel(plan) ? (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Levels
          </div>
          <MenuItem
            icon="TopView"
            label="All levels"
            sub="Show every storey"
            active={viewLevelId === 'all'}
            onClick={() => setViewLevel('all')}
          />
          {planLevels(plan).map((l) => (
            <MenuItem
              key={l.id}
              icon="TopView"
              label={l.name}
              sub={l.elevation > 0 ? `Storey at ${l.elevation.toFixed(1)} m` : 'Street level'}
              active={viewLevelId === l.id}
              onClick={() => setViewLevel(l.id)}
            />
          ))}
        </>
      ) : null}
      {overview ? (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Framing
          </div>
          <MenuItem
            icon="TopView"
            label={`Top view${chip(shortcutLabel('topView'))}`}
            sub="Fit the whole flat, top-down"
            onClick={requestTopView}
          />
          <MenuItem
            icon="Reset"
            label={`Reset view${chip(shortcutLabel('resetView'))}`}
            sub="Fit the 3D overview"
            onClick={requestHomeView}
          />
          <MenuItem
            icon="Turntable"
            label="Turntable"
            sub="Slowly auto-orbit the model"
            active={autoRotate}
            onClick={toggleAutoRotate}
          />
          {proMode && savedViews ? <SavedViewsSection /> : null}
        </>
      ) : null}
    </ToolbarMenu>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
