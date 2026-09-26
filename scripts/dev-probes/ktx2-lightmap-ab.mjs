/**
 * KTX2-LIGHTMAP-AB — does re-encoding the baked lightmaps as KTX2/UASTC move the render?
 *
 * **This is a calibration guard, not a look probe.** `IRRADIANCE_GAIN` (2.7) is pinned to
 * `public/assets/lightmaps/` by a HARD EQUALITY in `src/scene/visibilityLightmap.test.ts` — gain
 * and asset set are one calibration, and KTX2 is lossy. A few counts of drift in the maps
 * invalidates the fit silently, because a mis-fitted gain and a correctly-fitted one both produce
 * a perfectly plausible frame.
 *
 * Three things make the comparison trustworthy, and each exists because its absence has burned
 * this arc before:
 *
 * 1. **LINEAR.** AGX-PARITY (`v0.34.1.0`) established that app counts are not Cycles counts and
 *    that a comparison run through AgX is run through a curve that compresses the exact range the
 *    lightmap lives in. `ssg_linear_view` swaps both tone-mapping sites for `LinearToneMapping`
 *    (`src/scene/linearView.ts`), so the frame inverts exactly and the averaging happens in light
 *    rather than in display counts.
 * 2. **An IN-SESSION CONTROL.** The PNG arm is re-rendered in the SAME browser session
 *    immediately before the KTX2 arm, never read from a file on disk. A stale reference cannot
 *    tell you whether the machine, the driver, the dev server or the branch moved underneath you.
 * 3. **A FORMAT ASSERTION.** The arms are selected with the `?aoDir=` DEV seam, and the KTX2 arm
 *    is only meaningful if it actually transcoded: `lightmapTexture.ts` falls back to the PNG
 *    sibling when no transcoder is bound, which would make the two arms byte-identical for
 *    exactly the wrong reason. So each arm reports how many attached maps are
 *    `isCompressedTexture`, and the probe REFUSES to report a KTX2 arm carrying none.
 *
 *   PROBE_PORT=5213 scripts/dev-probes/with-server.sh ktx2-lightmap-ab.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'
import { WALK_POSES } from './view-matrix.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const args = process.argv.slice(2)
const out =
  (args.includes('--out') ? args[args.indexOf('--out') + 1] : null) ??
  process.env.OUT ??
  '/tmp/ktx2-lm-ab'
const DIRS = (process.env.DIRS || 'lightmaps,lightmaps-ktx2').split(',')
const POSES = (
  process.env.POSES || 'living-window,kitchen-east,bedroom2-door,corridor-along'
).split(',')
const HOUR = Number(process.env.HOUR || 13)
const GAIN = process.env.GAIN || ''

for (const name of POSES) {
  if (!WALK_POSES.find((p) => p.name === name)) throw new Error(`unknown pose ${name}`)
}
fs.mkdirSync(out, { recursive: true })

/** sRGB byte -> linear. */
const toLinear = (b) => {
  const c = b / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** linear -> sRGB byte, so a linear-space delta can also be quoted in the counts people read. */
const toCounts = (l) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, c * 255))
}

/**
 * A 3x3 grid of large patches over the central slab of the canvas.
 *
 * Deliberately a GRID rather than hand-placed rects: `patch-read.mjs`'s own docstring records five
 * separate rounds lost to a patch landing on the HUD, a beam or the minimap. Both arms are the same
 * pose with one variable changed, so every cell is a valid paired comparison and the grid cannot
 * miss the lightmapped surfaces the way three hand-aimed rectangles can.
 */
const GRID = []
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    GRID.push({ name: `r${r}c${c}`, x: 0.2 + c * 0.2, y: 0.18 + r * 0.2, w: 0.18, h: 0.18 })
  }
}

async function linearPatches(file) {
  const img = sharp(file)
  const meta = await img.metadata()
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = []
  for (const p of GRID) {
    const x0 = Math.round(p.x * meta.width)
    const y0 = Math.round(p.y * meta.height)
    const w = Math.round(p.w * meta.width)
    const h = Math.round(p.h * meta.height)
    let sum = 0
    let n = 0
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * info.width + x) * 3
        sum +=
          0.2126 * toLinear(data[i]) +
          0.7152 * toLinear(data[i + 1]) +
          0.0722 * toLinear(data[i + 2])
        n++
      }
    }
    rows.push({ name: p.name, linear: sum / n })
  }
  // Whole-frame paired stats need the raw buffer too.
  return { rows, data, info }
}

/** Per-pixel linear-luma difference between two frames of identical size. */
function frameDelta(a, b) {
  if (a.data.length !== b.data.length) throw new Error('frame size mismatch between arms')
  let sumAbs = 0
  let maxAbs = 0
  let n = 0
  for (let i = 0; i < a.data.length; i += 3) {
    const la =
      0.2126 * toLinear(a.data[i]) +
      0.7152 * toLinear(a.data[i + 1]) +
      0.0722 * toLinear(a.data[i + 2])
    const lb =
      0.2126 * toLinear(b.data[i]) +
      0.7152 * toLinear(b.data[i + 1]) +
      0.0722 * toLinear(b.data[i + 2])
    const d = Math.abs(la - lb)
    sumAbs += d
    if (d > maxAbs) maxAbs = d
    n++
  }
  return { meanAbsLinear: sumAbs / n, maxAbsLinear: maxAbs, pixels: n }
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})

const results = {}

try {
  for (const [armIndex, dir] of DIRS.entries()) {
    // A FRESH INCOGNITO CONTEXT WITH THE HTTP CACHE OFF PER ARM.
    //
    // Without this the second arm is not the same experiment as the first, and the difference is
    // large enough to swamp what the probe exists to measure. Measured with BOTH arms pointed at
    // the SAME shipped PNG set: arm 1 read 689 patched materials / 223 GL textures, arm 2 read
    // 658 / 171, and a patch read -14.98 counts against itself. Every one of those numbers
    // reproduced across sessions, so it is deterministic rather than a race: the second page
    // loads its assets from the HTTP cache, which reorders the attach against mesh creation and
    // keys fewer materials. A same-set control is the only reason this was caught rather than
    // reported as a -15-count KTX2 regression.
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setCacheEnabled(false)
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
    const failed = []
    // `applyLightmapsFromIndex`'s own summary line — the applier saying what it did, which the
    // scene-graph walk below is not a substitute for (lightmap-ab.mjs's rule).
    const applied = []
    page.on('console', (m) => {
      const t = m.text()
      if (/lightmap/i.test(t)) applied.push(t)
    })
    page.on('pageerror', (e) => applied.push(`PAGEERROR ${e.message}`))
    page.on('response', (r) => {
      const u = r.url()
      // 304 is a SUCCESS here: the second arm in a session revalidates from cache, and
      // puppeteer's `ok()` is false for it — which read as '153 asset requests failed'.
      if (u.includes('/assets/') && /\.(png|ktx2)$/.test(u) && !r.ok() && r.status() !== 304)
        failed.push(u)
    })
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('hdb_onboarded', '1')
        localStorage.setItem('ssg_linear_view', '1')
      } catch {}
    })
    const sep = appUrl().includes('?') ? '&' : '?'
    await page.goto(`${appUrl()}${sep}aoDir=${dir}${GAIN ? `&aoGain=${GAIN}` : ''}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('canvas', { timeout: 60000 })
    await page.evaluate(
      ({ h }) => {
        const s = window.__store.getState()
        s.endTour?.()
        s.setOnboardingOpen?.(false)
        s.dismissLocationPrompt?.()
        s.dismissChecklist?.()
        s.setManualHour?.(h)
        s.setTimeMode?.('manual')
        s.setQualityTier?.('realistic')
        s.hideLoading?.()
        s.setFeatureFlag?.('interactiveDegrade', false)
      },
      { h: HOUR },
    )
    await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
    // Lights off: the calibration this guards is the DAYLIGHT bake's gain.
    await page.evaluate(() => {
      const s = window.__store.getState()
      for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
        s.toggleLightPower(id)
    })
    await sleep(8000)

    // SETTLE ON THE TEXTURE COUNT, do not just sleep a fixed time.
    //
    // The first run of this probe read `glTextures` 223 in the PNG arm and 171 in the KTX2 arm and
    // then reported up to -15 counts of "drift" — which was not drift at all: the KTX2 arm spends
    // CPU transcoding 153 maps on its worker pool, so 52 OTHER material textures had not finished
    // streaming when the frame was captured. A wall missing its plaster normal/roughness shades
    // differently, and the diff image was the whole shell rather than texel noise. Two arms in
    // different load states cannot be compared however carefully the luma is averaged.
    let stable = 0
    let last = -1
    for (let i = 0; i < 60 && stable < 4; i++) {
      const t = await page.evaluate(() => window.__three.gl.info.memory.textures)
      stable = t === last ? stable + 1 : 0
      last = t
      await sleep(1500)
    }
    if (stable < 4) console.warn(`${dir}: texture count never settled (last ${last})`)

    const load = await page.evaluate(() => {
      const o = {
        patched: 0,
        withImage: 0,
        withoutImage: 0,
        compressed: 0,
        plain: 0,
        bytes: 0,
        sample: null,
      }
      const seenMat = new Set()
      const seenTex = new Set()
      const visit = (n) => {
        const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : []
        for (const c of n.children ?? []) visit(c)
        for (const m of mats) {
          if (!m || seenMat.has(m.uuid)) continue
          seenMat.add(m.uuid)
          const t = m.__visMapForProbe
          if (!t) continue
          o.patched++
          const img = t.image
          if ((img?.width ?? 0) > 0) o.withImage++
          else o.withoutImage++
          if (seenTex.has(t.uuid)) continue
          seenTex.add(t.uuid)
          if (!o.sample) {
            // The GPU-side identity of one map. A transcode target whose internalFormat is an
            // sRGB variant, or a texture three has tagged `SRGBColorSpace`, inserts a transfer
            // the PNG set never had — and that is invisible except as "the walls went dark".
            o.sample = {
              format: t.format,
              internalFormat: t.internalFormat,
              type: t.type,
              colorSpace: t.colorSpace,
              flipY: t.flipY,
              minFilter: t.minFilter,
              magFilter: t.magFilter,
              generateMipmaps: t.generateMipmaps,
              mips: (t.mipmaps ?? []).length,
              unpackAlignment: t.unpackAlignment,
              premultiplyAlpha: t.premultiplyAlpha,
              w: img?.width,
              h: img?.height,
            }
          }
          if (t.isCompressedTexture) {
            o.compressed++
            for (const mip of t.mipmaps ?? []) o.bytes += mip?.data?.byteLength ?? 0
          } else {
            o.plain++
            const w = img?.width ?? 0
            const h = img?.height ?? 0
            // RGBA8 upload; `prepareVisibilityTexture` disables mip generation, so no 1.33x.
            o.bytes += w * h * 4
          }
        }
      }
      visit(window.__three.scene)
      const gl = window.__three.gl
      const st = window.__store.getState()
      return {
        ...o,
        tier: st.qualityTier,
        uiMode: st.uiMode,
        flag: st.featureFlags?.visibilityLightmap,
        uniqueMaps: seenTex.size,
        glTextures: gl.info.memory.textures,
        exposure: gl.toneMappingExposure,
        toneMapping: gl.toneMapping,
      }
    })
    if (load.patched === 0) {
      console.error(`${dir}: state ${JSON.stringify(load)}`)
      console.error(applied.slice(-20).join('\n'))
      throw new Error(`${dir}: no material patched — the set never loaded`)
    }
    if (load.withoutImage > 0 || failed.length)
      throw new Error(
        `${dir}: ${load.withoutImage} patched materials have no image, ${failed.length} asset requests failed`,
      )
    if (dir.includes('ktx2') && load.compressed === 0)
      throw new Error(
        `${dir}: ZERO attached maps are compressed — the KTX2 arm silently fell back to PNG, ` +
          'so any "no change" reading here would be meaningless',
      )

    await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
    await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
      timeout: 20000,
    })
    await sleep(4000)
    await page.evaluate(() => {
      const s = window.__store.getState()
      s.hideLoading?.()
      s.dismissCallout?.('walk-mode')
      s.setWalkFov?.(50)
    })

    const frames = {}
    for (const name of POSES) {
      const pose = WALK_POSES.find((p) => p.name === name)
      await page.evaluate((q) => {
        const l = window.__walkLook
        l.setPosition(q[0], q[1])
        l.setYaw(q[2])
        l.setPitch(q[3])
      }, pose.p)
      await sleep(2500)
      await assertSceneAlive(page, `${dir}@${name}`)
      const file = path.join(out, `arm${armIndex}-${dir}-${name}.png`)
      await page.screenshot({ path: file })
      frames[name] = file
    }
    results[armIndex] = { load, frames }
    console.log(
      `${dir}: patched=${load.patched} uniqueMaps=${load.uniqueMaps} ` +
        `compressed=${load.compressed} plain=${load.plain} ` +
        `lightmapVRAM=${(load.bytes / 1e6).toFixed(2)} MB glTextures=${load.glTextures} ` +
        `exposure=${load.exposure} tone=${load.toneMapping}\n  sample=${JSON.stringify(load.sample)}`,
    )
    await page.close()
    await ctx.close()
  }
} finally {
  await browser.close()
}

const [control, arm] = DIRS
console.log(`\nLINEAR comparison — control "${control}" vs "${arm}" (same session)\n`)
const summary = { control, arm, hour: HOUR, poses: {} }
for (const name of POSES) {
  const a = await linearPatches(results[0].frames[name])
  const b = await linearPatches(results[1].frames[name])
  const d = frameDelta(a, b)
  console.log(`  ${name}`)
  const cells = []
  for (let i = 0; i < GRID.length; i++) {
    const la = a.rows[i].linear
    const lb = b.rows[i].linear
    const counts = toCounts(lb) - toCounts(la)
    cells.push({ name: GRID[i].name, controlLinear: la, armLinear: lb, deltaCounts: counts })
    console.log(
      `    ${GRID[i].name}  linear ${la.toFixed(5)} -> ${lb.toFixed(5)}  ` +
        `(x${(lb / la).toFixed(4)})  = ${counts >= 0 ? '+' : ''}${counts.toFixed(3)} counts`,
    )
  }
  const worst = cells.reduce((m, c) => (Math.abs(c.deltaCounts) > Math.abs(m.deltaCounts) ? c : m))
  console.log(
    `    WORST patch ${worst.name} ${worst.deltaCounts.toFixed(3)} counts | ` +
      `per-pixel meanAbs ${d.meanAbsLinear.toExponential(3)} linear, max ${d.maxAbsLinear.toExponential(3)} linear`,
  )
  summary.poses[name] = { cells, worst, frame: d }
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1))
console.log(`\n-> ${out}`)
