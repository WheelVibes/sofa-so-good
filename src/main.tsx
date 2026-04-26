import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { hydrateUserAssets } from './state/storage/hydrateAssets';

// Pull user-uploaded assets out of IndexedDB before the first render so
// they appear in the catalog drawer immediately. Failures are silent —
// the app still boots with built-ins only.
void hydrateUserAssets();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
