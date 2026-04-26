import { useCallback, useEffect } from 'react';
import { Scene } from './scene/Scene';
import { Crosshair } from './ui/Crosshair';
import { DoorPrompt } from './ui/DoorPrompt';
import { HelpHint } from './ui/HelpHint';
import { Toolbar } from './ui/Toolbar';
import { WebGLFallback } from './ui/WebGLFallback';
import { useStore } from './state/store';
import {
  KEYBINDINGS,
  ROTATE_FINE_STEP,
  ROTATE_STEP,
} from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);

  // Seed the default layout on first mount when nothing has been
  // hydrated. Phase 3 autosave will short-circuit this once it lands.
  useEffect(() => {
    if (useStore.getState().items.length === 0) {
      useStore.getState().resetToDefault();
    }
  }, []);

  const onKey = useCallback(
    (code: string, e: KeyboardEvent) => {
      if (code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
      if (code === KEYBINDINGS.toggleCameraMode) {
        setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit');
      }
      if (code === KEYBINDINGS.cycleTimeOfDay) {
        useStore.getState().cycleTimeOfDay();
      }
      if (code === KEYBINDINGS.interact) {
        const { nearbyDoorId, toggleDoor } = useStore.getState();
        if (nearbyDoorId) toggleDoor(nearbyDoorId);
      }

      // Editor-only keys: scoped to orbit mode so first-person walking
      // doesn't accidentally delete or rotate the player's selection.
      if (cameraMode !== 'orbit') return;
      const state = useStore.getState();
      if (code === KEYBINDINGS.toggleCatalog) {
        state.toggleCatalogOpen();
      }
      if (code === KEYBINDINGS.deselect) {
        state.selectItem(null);
      }
      if (code === KEYBINDINGS.deleteSelected && state.selectedItemId) {
        state.deleteItem(state.selectedItemId);
      }
      if (code === KEYBINDINGS.rotate && state.selectedItemId) {
        const item = state.items.find((i) => i.id === state.selectedItemId);
        if (!item) return;
        const step = e.shiftKey ? ROTATE_FINE_STEP : ROTATE_STEP;
        state.rotateItem(item.id, item.rotation + step);
      }
    },
    [toggleMeasurements, cameraMode, setCameraMode],
  );
  useKeyboard(onKey);

  return (
    <WebGLFallback>
      <div className="relative h-screen w-screen overflow-hidden">
        <Toolbar />
        <Scene />
        <Crosshair />
        <DoorPrompt />
        <HelpHint />
      </div>
    </WebGLFallback>
  );
}
