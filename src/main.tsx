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
import { installIosZoomGuard } from './controls/iosZoomGuard'
import { registerGltfDecoders } from './furniture/gltf/decoders'
import { registerAppServiceWorker } from './pwa/swUpdate'
import { installChunkErrorRecovery } from './ui/app/lazyWithRetry'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { startBootPhraseRotator } from './ui/loading/startBootPhraseRotator'

// Recover from stale post-deploy chunk loads (Vite `modulepreload` failures):
// reload once to fetch the fresh build instead of crash-landing the app.
installChunkErrorRecovery()

// Suppress iOS Safari's focus-zoom on small text fields (without bumping every
// field to 16px) by toggling viewport `maximum-scale` while a field is focused.
installIosZoomGuard()

// Wire the Draco/KTX2/meshopt decoders into the shared drei useGLTF loader
// before any model is requested, so compressed GLBs decode correctly. This is
// cheap + synchronous, so it stays on the critical path.
registerGltfDecoders()

// Register the service worker + check for updates on open (then foreground /
// periodic). A found update surfaces an "Update available" toast with an Update
// button — never an auto-reload; a manual "Check for updates" lives in File menu.
registerAppServiceWorker()

// Cycle HDB-flavoured status lines on the static boot splash while the bundle
// loads and React hydrates — before the transition overlay takes over.
startBootPhraseRotator()

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
