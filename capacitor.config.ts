/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the built web app (`dist/`) in a native Android WebView to
// produce an installable APK — see docs/packaging-android.md. The bundle is
// self-contained (built with VITE_BASE=./ + VITE_DISABLE_PWA=1 by
// scripts/build-mobile.mjs), so no `server.url` is set: the WebView loads the
// bundled assets over the default `https://localhost` scheme and runs offline.
// `appId` mirrors the Electron desktop shell (electron-builder.yml) so both
// packaging targets share one application identity.
const config: CapacitorConfig = {
  appId: 'sg.sofasogood.app',
  appName: 'Sofa So Good',
  webDir: 'dist',
}

export default config
