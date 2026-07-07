// Generate the Android launcher icons for the Capacitor APK from the single
// source of truth, public/favicon.svg — mirrors scripts/make-desktop-icon.mjs
// (same sharp SVG->PNG path). We roll our own instead of @capacitor/assets
// because that package bundles an old sharp that downloads libvips from
// github.com at install time, which the build proxy blocks (403).
//
// Writes, into the committed android/ project:
//   - legacy square + round launcher PNGs (mipmap-<density>/ic_launcher*.png)
//   - adaptive-icon foreground PNGs (mipmap-<density>/ic_launcher_foreground.png)
//   - the adaptive-icon background colour (values/ic_launcher_background.xml)
// so the app shows the Sofa So Good mark on every Android version + launcher
// shape. Wired into scripts/build-mobile.mjs; safe to re-run (idempotent).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'public/favicon.svg')
const resDir = join(root, 'android/app/src/main/res')

// The favicon's rounded-rect background colour — reused as the adaptive-icon
// background so the sofa mark floats on the same field the icon was drawn on.
const BG = '#2c2f33'

// Per-density pixel sizes. Legacy icons are 48dp; adaptive foreground/background
// layers are 108dp (with the inner 72dp as the guaranteed-visible safe zone).
const DENSITIES = [
  { dir: 'mdpi', legacy: 48, adaptive: 108 },
  { dir: 'hdpi', legacy: 72, adaptive: 162 },
  { dir: 'xhdpi', legacy: 96, adaptive: 216 },
  { dir: 'xxhdpi', legacy: 144, adaptive: 324 },
  { dir: 'xxxhdpi', legacy: 192, adaptive: 432 },
]

// Adaptive-icon foreground: the favicon artwork WITHOUT its own background rect,
// scaled to ~64 of the 108 canvas and centred so it sits well inside the 72dp
// safe zone (launchers crop the outer edge to a circle/squircle/etc.).
const FOREGROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(22 22) scale(2)">
    <path d="M5 14 16 6l11 8" fill="none" stroke="#cfe0f2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="7" y="17" width="18" height="7" rx="1.5" fill="#8aa1a8"/>
    <rect x="6" y="20" width="3" height="5" rx="1" fill="#6b7e84"/>
    <rect x="23" y="20" width="3" height="5" rx="1" fill="#6b7e84"/>
    <rect x="10" y="18.5" width="5" height="4" rx="1" fill="#a8bcc2"/>
    <rect x="17" y="18.5" width="5" height="4" rx="1" fill="#a8bcc2"/>
  </g>
</svg>`

if (!existsSync(resDir)) {
  console.error(`[make-android-icons] ${resDir} not found — run \`npx cap add android\` first.`)
  process.exit(1)
}

for (const { dir, legacy, adaptive } of DENSITIES) {
  const mipmap = join(resDir, `mipmap-${dir}`)
  mkdirSync(mipmap, { recursive: true })
  // Legacy square + round icons: the full favicon (its own rounded-rect bg included).
  const legacyPng = await sharp(src, { density: 512 }).resize(legacy, legacy).png().toBuffer()
  writeFileSync(join(mipmap, 'ic_launcher.png'), legacyPng)
  writeFileSync(join(mipmap, 'ic_launcher_round.png'), legacyPng)
  // Adaptive foreground layer (transparent outside the artwork).
  await sharp(Buffer.from(FOREGROUND_SVG), { density: 512 })
    .resize(adaptive, adaptive)
    .png()
    .toFile(join(mipmap, 'ic_launcher_foreground.png'))
}

// Adaptive-icon background colour (referenced by mipmap-anydpi-v26/ic_launcher.xml
// as @color/ic_launcher_background in the Capacitor scaffold).
const valuesDir = join(resDir, 'values')
mkdirSync(valuesDir, { recursive: true })
writeFileSync(
  join(valuesDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
)

console.log(`[make-android-icons] wrote launcher icons to ${resDir}`)
