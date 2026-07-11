import { useEffect, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { isMultiLevel, planLevels } from '../../../floorplan/levels'
import { detectVrSupport } from '../../../scene/xr/vrSupport'
import { enterVr, getXrStore } from '../../../scene/xr/xrStore'
import { useStore } from '../../../state/store'
import { formatLength } from '../../../utils/measurement'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, MenuLabel, ToolbarMenu } from '../ToolbarMenu'
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
  const verticalLock = useStore((s) => s.verticalLock)
  const toggleVerticalLock = useStore((s) => s.toggleVerticalLock)
  const parallelProjection = useStore((s) => s.parallelProjection)
  const toggleParallelProjection = useStore((s) => s.toggleParallelProjection)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const setViewLevel = useStore((s) => s.setViewLevel)
  const units = useStore((s) => s.units)
  const savedViews = useFeature('savedViews')
  const fVr = useFeature('vrWalkthrough')
  const fTwoPointPerspective = useFeature('twoPointPerspective')
  const fParallelProjection = useFeature('parallelProjection')
  const [vrSupported, setVrSupported] = useState(false)
  useEffect(() => {
    if (!fVr) return
    let on = true
    void detectVrSupport().then((ok) => {
      if (!on || !ok) return
      setVrSupported(true)
      // Pre-create the XR store so the Enter-VR click keeps its user
      // activation (no chunk-load between gesture and requestSession).
      void getXrStore()
    })
    return () => {
      on = false
    }
  }, [fVr])

  const isOrbit = cameraMode === 'orbit'
  // The overview-only framing controls (top/reset/turntable/saved) only make
  // sense over the whole flat — not inside the per-room editor, which frames its
  // own room.
  const overview = isOrbit && !roomEditorActive

  return (
    <ToolbarMenu icon={isOrbit ? 'Orbit' : 'Walk'} label="View" active={autoRotate} width={244}>
      <MenuLabel>Camera</MenuLabel>
      <MenuItem
        icon="Orbit"
        label="Orbit"
        sub="Look around the model"
        kbd={shortcutLabel('toggleCameraMode')}
        active={isOrbit}
        onClick={() => setCameraMode('orbit')}
      />
      <MenuItem
        icon="Walk"
        label="Walk"
        sub="First-person walkthrough"
        kbd={shortcutLabel('toggleCameraMode')}
        active={!isOrbit}
        onClick={() => setCameraMode('firstPerson')}
      />
      {fVr && vrSupported ? (
        <MenuItem
          icon="Walk"
          label="Enter VR"
          sub="Immersive walkthrough on your headset"
          onClick={() => {
            useStore.getState().setVrActive(true)
            void enterVr()
          }}
        />
      ) : null}
      {isMultiLevel(plan) ? (
        <>
          <MenuLabel>Levels</MenuLabel>
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
              // In walk mode picking a storey also teleports the walker onto it.
              sub={
                !isOrbit
                  ? 'Walk this storey'
                  : l.elevation > 0
                    ? `Storey at ${formatLength(l.elevation, units)}`
                    : 'Street level'
              }
              active={viewLevelId === l.id}
              onClick={() => setViewLevel(l.id)}
            />
          ))}
        </>
      ) : null}
      {overview ? (
        <>
          <MenuLabel>Framing</MenuLabel>
          <MenuItem
            icon="TopView"
            label="Top view"
            sub="Fit the whole flat, top-down"
            kbd={shortcutLabel('topView')}
            onClick={requestTopView}
          />
          <MenuItem
            icon="Reset"
            label="Reset view"
            sub="Fit the 3D overview"
            kbd={shortcutLabel('resetView')}
            onClick={requestHomeView}
          />
          <MenuItem
            icon="Turntable"
            label="Turntable"
            sub="Slowly auto-orbit the model"
            active={autoRotate}
            onClick={toggleAutoRotate}
          />
          {fTwoPointPerspective ? (
            <MenuItem
              icon="AlignX"
              label="Vertical lock"
              sub="Keep wall corners parallel instead of converging"
              active={verticalLock}
              onClick={toggleVerticalLock}
            />
          ) : null}
          {fParallelProjection ? (
            <MenuItem
              icon="Cube"
              label="Parallel projection"
              sub="Orthographic dollhouse — no perspective foreshortening"
              active={parallelProjection}
              newFlag="parallelProjection"
              onClick={toggleParallelProjection}
            />
          ) : null}
          {proMode && savedViews ? <SavedViewsSection /> : null}
        </>
      ) : null}
    </ToolbarMenu>
  )
}
