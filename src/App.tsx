import { useCallback } from 'react';
import { Scene } from './scene/Scene';
import { Crosshair } from './ui/Crosshair';
import { DoorPrompt } from './ui/DoorPrompt';
import { HelpHint } from './ui/HelpHint';
import { Toolbar } from './ui/Toolbar';
import { WebGLFallback } from './ui/WebGLFallback';
import { useStore } from './state/store';
import { KEYBINDINGS } from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const onKey = useCallback(
    (code: string) => {
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
