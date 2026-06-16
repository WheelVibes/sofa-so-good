import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted UI/mono fonts (bundled via Vite) so the app needs no Google Fonts
// CDN at runtime — see src/styles/tokens.css (--font-ui / --font-mono).
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
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
