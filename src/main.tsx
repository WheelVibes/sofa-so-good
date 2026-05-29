import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { hydrate } from './state/storage/hydrate';
import { startAutosave } from './state/storage/autosave';
import { loadQualityPrefs, watchQualityPrefs } from './state/storage/qualityPrefs';
import { useStore } from './state/store';

async function boot() {
  // Pull user assets + autosaved layout before React paints. Failures
  // are silent; the app falls back to default layout via App.tsx.
  await hydrate();
  loadQualityPrefs();
  watchQualityPrefs();
  startAutosave();
  // Dev-only: expose the store for screenshot/automation harnesses.
  if (import.meta.env.DEV) {
    (window as unknown as { __store?: typeof useStore }).__store = useStore;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
