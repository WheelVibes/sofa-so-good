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

if (existsSync(srcDir)) {
  mkdirSync(outDir, { recursive: true })
  for (const f of files) {
    copyFileSync(join(srcDir, f), join(outDir, f))
  }
  console.log(`[copy-decoders] copied ${files.length} Draco decoder files → public/draco/`)
} else {
  // three not installed (e.g. fresh clone mid-install); the committed files cover us.
  console.log('[copy-decoders] three not installed yet — using committed public/draco/ files')
}

// Basis Universal *encoder* glue + wasm for the in-browser KTX2/UASTC encoder
// (src/lib/ktx2encode.ts). Self-hosted under public/basis/ — same offline, no-CDN
// policy as the transcoder; ktx2encode passes these URLs so the encoder never
// reaches the upstream's default Alipay CDN. Committed too, so a fresh clone works.
const basisSrc = join(root, 'node_modules/ktx2-encoder/dist/basis')
const basisOut = join(root, 'public/basis')
const basisFiles = ['basis_encoder.js', 'basis_encoder.wasm']

if (existsSync(basisSrc)) {
  mkdirSync(basisOut, { recursive: true })
  for (const f of basisFiles) {
    copyFileSync(join(basisSrc, f), join(basisOut, f))
  }
  console.log(`[copy-decoders] copied ${basisFiles.length} Basis encoder files → public/basis/`)
} else {
  console.log(
    '[copy-decoders] ktx2-encoder not installed yet — using committed public/basis/ files',
  )
}
