import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { hydrate } from './state/storage/hydrate';
import { startAutosave } from './state/storage/autosave';

async function boot() {
  // Pull user assets + autosaved layout before React paints. Failures
  // are silent; the app falls back to default layout via App.tsx.
  await hydrate();
  startAutosave();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
