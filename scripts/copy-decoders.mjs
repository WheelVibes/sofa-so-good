#!/usr/bin/env node
// Copy the Draco glTF decoder (matching the installed `three`) into public/draco/
// so compressed GLBs decode from a self-hosted path with NO runtime CDN — the app
// runs fully offline. Mirrors the committed public/basis/ transcoder.
//
// The files are also committed to the repo, so a fresh clone works without running
// this; it just keeps them in sync with the `three` version on install/build.
// Wired into the `predev` / `prebuild` npm hooks.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules/three/examples/jsm/libs/draco/gltf')
const outDir = join(root, 'public/draco')
const files = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']

if (!existsSync(srcDir)) {
  // three not installed (e.g. fresh clone mid-install); the committed files cover us.
  console.log('[copy-decoders] three not installed yet — using committed public/draco/ files')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
for (const f of files) {
  copyFileSync(join(srcDir, f), join(outDir, f))
}
console.log(`[copy-decoders] copied ${files.length} Draco decoder files → public/draco/`)
