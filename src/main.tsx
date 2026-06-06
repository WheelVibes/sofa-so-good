import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerGltfDecoders } from './furniture/gltf/decoders'
import { ErrorBoundary } from './ui/ErrorBoundary'

// Wire the Draco/KTX2/meshopt decoders into the shared drei useGLTF loader
// before any model is requested, so compressed GLBs decode correctly. This is
// cheap + synchronous, so it stays on the critical path.
registerGltfDecoders()

// Render immediately — App shows the loading overlay and kicks off the async
// boot bootstrap (IDB user assets, packs, autosave) from <BootHydrator>, so
// the page is never a blank screen while IndexedDB/localStorage resolve.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
