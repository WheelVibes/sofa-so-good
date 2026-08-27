/**
 * TONE-CALIBRATION guard: how far do the SNV floor swatches drift if the view
 * transform changes?
 *
 * `materials/CLAUDE.md:TONE-CALIBRATION` records that the five Serangoon North
 * Vista finish swatches are deliberately MORE saturated/warm than the sample
 * boards they match, because they were solved as `boardTone / response` against
 * a measured per-channel render response of roughly (0.56, 0.61, 0.68) R/G/B —
 * blue boosted ~19% over red, which greys out warm albedos. It also says to
 * recalibrate after "any lighting/tonemap change".
 *
 * So a change of default tone operator cannot be shipped on whole-frame numbers
 * alone: it could silently push those five finishes off the boards they were
 * matched to. This measures the recipe's first step directly — the mean RENDERED
 * RGB of a masked SNV floor — under each operator in ONE run, and reports the
 * per-channel response (`render / swatch`) plus how much the response RATIO
 * (the thing the calibration actually solved against) moves.
 *
 * A small ratio change means the swatches stay on the boards and the tone change
 * is safe; a large one means recalibrating the five swatches is part of the same
 * commit.
 *
 * The floor is masked by raycast rather than by a fixed rectangle, because the
 * floor's screen region differs per view and a rectangle would average in
 * furniture (the mistake that made `wood-detail.mjs`'s first version blind).
 */
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 13)
const TONES = (process.env.TONES || 'filmic,agx,neutral').split(',')
/** Room -> the SNV finish it defaults to, and that finish's catalog swatch. */
const TARGETS = [
  {
    room: 'livingDining',
    finish: 'floor-vinyl-oak',
    view: { pos: [10.6, 1.6, 6.4], look: [10.0, 0.1, 4.2] },
  },
  {
    room: 'kitchen',
    finish: 'floor-tile-beige',
    view: { pos: [6.2, 1.6, 6.0], look: [6.2, 0.1, 4.2] },
  },
]

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
await new Promise((r) => setTimeout(r, 3500))
await assertSceneAlive(page, 'after setup')

const W = 1280 * DSF
const H = 800 * DSF
const GX = 80
const GY = 50
const CW = W / GX
const CH = H / GY

/**
 * Mask the ROOM FLOOR by the ray's world-space face NORMAL, not by geometry
 * extents.
 *
 * An earlier version of this classified surfaces from their LOCAL bounding-box
 * extents (borrowed from `material-audit.mjs`, whose own note says it works
 * because "the shell is axis-aligned boxes"). Floors here are rotated PLANES, so
 * in local space a floor's box is tall in Y and zero in Z — the test reported
 * `h=5.47 fp=0` for nearly every ray and matched zero cells. A face normal is
 * orientation-proof: the floor is whatever faces up, at floor height.
 */
async function floorMask() {
  return page.evaluate(
    (gx, gy) => {
      const { scene, camera, raycaster } = window.__three
      const rc = new raycaster.constructor()
      const mask = []
      let n = 0
      const nrm = new camera.position.constructor()
      for (let iy = 0; iy < gy; iy++) {
        for (let ix = 0; ix < gx; ix++) {
          rc.setFromCamera(
            { x: ((ix + 0.5) / gx) * 2 - 1, y: -(((iy + 0.5) / gy) * 2 - 1) },
            camera,
          )
          const hit = rc.intersectObjects(scene.children, true).find((k) => {
            const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
            return (
              k.object.visible &&
              m &&
              m.colorWrite !== false &&
              !(m.transparent && m.opacity < 0.05)
            )
          })
          let ok = 0
          if (hit?.face) {
            nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
            // Up-facing, at floor height, and not a rug/mat (those sit a few cm
            // proud of the slab and would contaminate the finish's own colour).
            if (nrm.y > 0.9 && hit.point.y < 0.06) ok = 1
          }
          mask.push(ok)
          n += ok
        }
      }
      return { mask, n, diag: [] }
    },
    GX,
    GY,
  )
}

async function maskedMeanRgb(buf, mask) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const BW = Math.max(1, Math.floor(CW * 0.5))
  const BH = Math.max(1, Math.floor(CH * 0.5))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let iy = 0; iy < GY; iy++) {
    for (let ix = 0; ix < GX; ix++) {
      if (!mask[iy * GX + ix]) continue
      const x0 = Math.round(ix * CW + (CW - BW) / 2)
      const y0 = Math.round(iy * CH + (CH - BH) / 2)
      for (let y = y0; y < y0 + BH; y++) {
        for (let x = x0; x < x0 + BW; x++) {
          const i = (y * info.width + x) * 3
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
      }
    }
  }
  return n ? [r / n, g / n, b / n] : null
}

console.log(`tier=${TIER} hour=${HOUR} dpr=${DSF} — SNV floor render response per tone operator\n`)
for (const t of TARGETS) {
  const swatch = await page.evaluate(async (finish) => {
    const mod = await import('/src/materials/builtinCatalog.ts')
    return mod.BUILTIN_MATERIALS[finish]?.swatch ?? null
  }, t.finish)
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, t.view)
  await new Promise((r) => setTimeout(r, 2200))
  const { mask, n, diag } = await floorMask()
  console.log(`${t.room} / ${t.finish}  swatch ${swatch}  floor covers ${n}/${GX * GY} cells`)
  if (!n) {
    console.log(
      `  (no floor matched — top ray hits: ${diag.map(([k, c]) => `${k} x${c}`).join('  |  ')})\n`,
    )
    continue
  }
  const sw = swatch ? [1, 3, 5].map((i) => Number.parseInt(sw_(swatch, i), 16)) : null
  const rows = []
  for (const tone of TONES) {
    await page.evaluate((tn) => {
      window.__store.getState().setToneMapping(tn)
      const st = window.__store.getState()
      st.setManualHour(st.manualHour)
    }, tone)
    await new Promise((r) => setTimeout(r, 2200))
    await assertSceneAlive(page, `${t.room} ${tone}`)
    const buf = await page.screenshot({ type: 'png' })
    const rgb = await maskedMeanRgb(buf, mask)
    rows.push({ tone, rgb })
    const resp = sw ? rgb.map((v, i) => v / sw[i]) : null
    // The calibration solved against the RATIO between channels, so normalise
    // the response by its own peak — that is the quantity that must hold.
    const norm = resp ? resp.map((v) => v / Math.max(...resp)) : null
    console.log(
      `  ${tone.padEnd(8)} render rgb ${rgb.map((v) => v.toFixed(1).padStart(6)).join(' ')}` +
        (norm ? `   response(peak-normalised) ${norm.map((v) => v.toFixed(3)).join(' / ')}` : ''),
    )
  }
  // Drift of the peak-normalised response vs the first operator listed.
  if (sw) {
    const base = rows[0]
    const bResp = base.rgb.map((v, i) => v / sw[i])
    const bNorm = bResp.map((v) => v / Math.max(...bResp))
    for (const r of rows.slice(1)) {
      const resp = r.rgb.map((v, i) => v / sw[i])
      const norm = resp.map((v) => v / Math.max(...resp))
      const drift = norm.map((v, i) => Math.abs(v - bNorm[i]))
      console.log(
        `  drift ${base.tone} -> ${r.tone}: ${drift.map((v) => v.toFixed(3)).join(' / ')}  (max ${Math.max(...drift).toFixed(3)}; the calibration holds to +-0.002)`,
      )
    }
  }
  console.log('')
}
await browser.close()

/** Two hex digits of a #rrggbb string starting at `i`. */
function sw_(hex, i) {
  return hex.slice(i, i + 2)
}
