import { useCallback } from 'react';
import { Scene } from './scene/Scene';
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
    },
    [toggleMeasurements, cameraMode, setCameraMode],
  );
  useKeyboard(onKey);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Scene />
    </div>
  );
}
