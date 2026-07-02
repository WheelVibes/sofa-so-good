// Generate the desktop app icon for electron-builder: render public/favicon.svg
// to build/icon.png (1024×1024). electron-builder picks it up from its default
// buildResources dir (build/) and derives the platform formats (icns/ico) from
// it, so nothing binary needs committing. Wired into `npm run build:desktop`.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'public/favicon.svg')
const outDir = join(root, 'build')
const out = join(outDir, 'icon.png')

mkdirSync(outDir, { recursive: true })
await sharp(src, { density: 512 }).resize(1024, 1024).png().toFile(out)
console.log(`[make-desktop-icon] wrote ${out}`)
