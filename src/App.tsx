import { useCallback } from 'react';
import { Scene } from './scene/Scene';
import { useStore } from './state/store';
import { KEYBINDINGS } from './controls/keybindings';
import { useKeyboard } from './controls/useKeyboard';

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const onKey = useCallback(
    (code: string) => {
      if (code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
    },
    [toggleMeasurements],
  );
  useKeyboard(onKey);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Scene />
    </div>
  );
}
