import { useFeature } from '../../../features/useFeature'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'
import { SavedViewsSection } from './SavedViewsSection'

/** View cluster (orbit overview, view-only): top-down view, reset to the 3D
 *  overview, turntable auto-orbit, and saved camera views. Entering a room to
 *  edit is the dedicated "Edit a room" toolbar button, not a menu item. */
export function ViewMenu() {
  const requestTopView = useStore((s) => s.requestTopView)
  const requestHomeView = useStore((s) => s.requestHomeView)
  const autoRotate = useStore((s) => s.autoRotate)
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const savedViews = useFeature('savedViews')
  return (
    <ToolbarMenu icon="TopView" label="View" active={autoRotate}>
      <MenuItem
        icon="TopView"
        label={`Top view${chip(shortcutLabel('topView'))}`}
        sub="Top-down plan view"
        onClick={requestTopView}
      />
      <MenuItem
        icon="Reset"
        label={`Reset view${chip(shortcutLabel('resetView'))}`}
        sub="Back to the 3D overview"
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
    </ToolbarMenu>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
