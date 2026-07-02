// Electron desktop shell. Thin wrapper around the static Vite build (dist/,
// built by `npm run build:desktop` with VITE_BASE=./ and the PWA disabled):
// no preload, no Node integration — the app is exactly the web app.
//
// dist/ is served over a custom `app://` scheme instead of loadFile because
// Chromium blocks fetch() on file:// URLs, and the app fetches GLBs, KTX2
// textures, and wasm decoders at runtime. A standard+secure scheme also gives
// the origin working IndexedDB/localStorage persistence.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
// Default-import + destructure (not named imports): when ELECTRON_RUN_AS_NODE
// leaks into the env, 'electron' resolves to the CJS path-string shim and named
// imports throw at parse time — before the guard below can produce a useful
// error. The default import keeps the module loadable in both modes.
import electron from 'electron'

const { BrowserWindow, app, net, protocol, shell } = electron

// ELECTRON_RUN_AS_NODE guard. VSCode / agent hosts export it, which makes the
// Electron binary run this file as plain Node (`app` is then undefined) — a
// confusing silent failure. Re-exec ourselves without it: in run-as-node mode
// process.execPath IS the Electron binary.
if (!app?.whenReady) {
  const { spawn } = await import('node:child_process')
  console.error('[shell] ELECTRON_RUN_AS_NODE was set — relaunching Electron without it…')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(process.execPath, process.argv.slice(1), { env, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
} else {
  const DIST = path.join(app.getAppPath(), 'dist')

  // Must run before app ready.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ])

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#ecdfce', // boot-loader light background — avoids a white flash
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })

    // External links (buy links, credits, guide, the releases page the in-app
    // update check opens) open in the system browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })

    win.loadURL('app://bundle/index.html')

    // Headless smoke hook (dev/CI only): ELECTRON_SMOKE_SHOT=<file.png> captures
    // the loaded window after a settle delay and exits — lets the visual
    // verification playbook screenshot the packaged shell under xvfb.
    const smokeShot = process.env.ELECTRON_SMOKE_SHOT
    if (smokeShot) {
      win.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const image = await win.webContents.capturePage()
            const { writeFileSync } = await import('node:fs')
            writeFileSync(smokeShot, image.toPNG())
            console.log(`[smoke] wrote ${smokeShot}`)
            app.exit(0)
          } catch (err) {
            console.error('[smoke] capture failed:', err)
            app.exit(1)
          }
        }, Number(process.env.ELECTRON_SMOKE_WAIT_MS || 15000))
      })
    }
    return win
  }

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url)
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
      const file = path.normalize(path.join(DIST, rel))
      // Path-traversal guard: never serve outside dist/.
      if (!file.startsWith(DIST + path.sep) && file !== DIST) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(file).toString())
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
