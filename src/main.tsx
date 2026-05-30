import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { hydrate } from './state/storage/hydrate';
import { startAutosave } from './state/storage/autosave';
import { loadQualityPrefs, watchQualityPrefs } from './state/storage/qualityPrefs';
import { loadEditorPrefs, watchEditorPrefs } from './state/storage/editorPrefs';
import { loadFloorPlans, watchFloorPlans } from './state/storage/floorPlanStore';
import { useStore } from './state/store';

async function boot() {
  // Pull user assets + autosaved layout before React paints. Failures
  // are silent; the app falls back to default layout via App.tsx.
  await hydrate();
  loadQualityPrefs();
  watchQualityPrefs();
  loadEditorPrefs();
  watchEditorPrefs();
  loadFloorPlans();
  watchFloorPlans();
  startAutosave();
  // Dev-only: expose the store + auto-arranger for screenshot/automation.
  if (import.meta.env.DEV) {
    (window as unknown as { __store?: typeof useStore }).__store = useStore;
    const { arrangeRoom, arrangeAllRooms } = await import('./layout/autoArrange');
    const { BUILTIN_CATALOG } = await import('./furniture/builtinCatalog');
    (window as unknown as { __arrangeRoom?: unknown }).__arrangeRoom = (roomId: string) => {
      const s = useStore.getState();
      s.setItems(arrangeRoom(roomId as never, s.items, BUILTIN_CATALOG as never, s.doors));
    };
    (window as unknown as { __tidyHome?: unknown }).__tidyHome = () => {
      const s = useStore.getState();
      s.setItems(arrangeAllRooms(s.items, BUILTIN_CATALOG as never, s.doors));
    };
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
