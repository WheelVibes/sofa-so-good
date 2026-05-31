import { useStore } from '../../../state/store';
import { ToolbarMenu, MenuItem } from '../ToolbarMenu';
import { shortcutLabel } from '../shortcuts';

/** View cluster: top-down view, reset to 3D overview, turntable auto-orbit. */
export function ViewMenu() {
  const requestTopView = useStore((s) => s.requestTopView);
  const requestHomeView = useStore((s) => s.requestHomeView);
  const autoRotate = useStore((s) => s.autoRotate);
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate);
  return (
    <ToolbarMenu icon="TopView" label="View" active={autoRotate}>
      <MenuItem icon="TopView" label={`Top view${chip(shortcutLabel('topView'))}`} sub="Top-down plan view" onClick={requestTopView} />
      <MenuItem icon="Reset" label={`Reset view${chip(shortcutLabel('resetView'))}`} sub="Back to the 3D overview" onClick={requestHomeView} />
      <MenuItem icon="Turntable" label="Turntable" sub="Slowly auto-orbit the model" active={autoRotate} onClick={toggleAutoRotate} />
    </ToolbarMenu>
  );
}

function chip(s: string): string {
  return s ? `  (${s})` : '';
}
