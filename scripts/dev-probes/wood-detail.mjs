/**
 * Why does the furniture wood read as cartoon orange? — a per-channel sweep.
 *
 * `pick-surface.mjs` resolved the two loudest surfaces in the default walk view
 * to `dining-chair` backrests: #7a5c3c (HSV saturation 0.51 in sRGB) rendered by
 * `furnitureMaterials.ts:getWoodMaterial` with albedo + normal + roughness maps,
 * `normalScale` 0.45, tiling at **`repeat = 1` over a 0.44 m panel**. The dining
 * and coffee tables read the same way from orbit.
 *
 * There is a specific structural reason to suspect the TILE DENSITY rather than
 * the colour. One wood tile carries two features at two very different physical
 * scales: `PLANKS = 3` board seams across it (real boards are ~120–180 mm wide)
 * and `Math.PI * 7` growth rings across the same axis (real rings are ~2–10 mm).
 * At one `repeat` those cannot both be right — and at `repeat = 1` on a 0.44 m
 * panel the rings land at ~63 mm apart, roughly an order of magnitude too coarse,
 * which is exactly what "lumpy banding" looks like. But the albedo swing is also
 * large (`lum` spans roughly 0.65–1.0), the base colour may simply be too
 * saturated for a photograph, and the normal may be over-scaled — so measure the
 * four independently instead of assuming.
 *
 *   A  baseline
 *   B  repeat x4                all three maps, finer grain
 *   C  repeat x8
 *   D  albedo map removed       what the grain's ALBEDO is worth at all
 *   E  albedo contrast halved   grain kept, banding amplitude halved toward mean
 *   F  base colour desaturated  #7a5c3c -> ~0.33 sRGB saturation, luminance held
 *   G  normalMap removed
 *   H  baseline repeated        the noise floor
 *
 * Wood materials are identified EXACTLY, not by guessing at property values: the
 * probe raycasts a known wood point to get one reference material, then groups
 * every material in the scene that shares its albedo `texture.source` (three
 * clones the shared tile per repeat, and clones share the source object).
 *
 * `TONE-CALIBRATION` (materials/CLAUDE.md) warns against eyeball-reverting a
 * calibrated swatch, so case F is a MEASUREMENT, not a proposal — it says what
 * desaturation would buy, and the decision still has to be argued from the
 * render.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-wood'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
fs.mkdirSync(OUT, { recursive: true })

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
if (MODE === 'walk') {
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await new Promise((r) => setTimeout(r, 3500))
}
await assertSceneAlive(page, 'after setup')

const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0], probe: [0.09, -0.79] }
    : { pos: [12, 8, 12], look: [0, 0, 0], probe: null }

await page.evaluate((v) => {
  const { camera } = window.__three
  camera.position.set(...v.pos)
  camera.lookAt(...v.look)
  camera.updateMatrixWorld()
  const st = window.__store.getState()
  st.setManualHour(st.manualHour)
}, VIEW)
await new Promise((r) => setTimeout(r, 2000))

const found = await page.evaluate((v) => {
  const { scene, camera, raycaster } = window.__three
  // The reference wood material. In walk mode a ray through a known chair-back
  // point is exact; in orbit fall back to the widest-used material that carries
  // all three of getWoodMaterial's maps at its signature metalness.
  let ref = null
  if (v.probe) {
    const rc = new raycaster.constructor()
    rc.setFromCamera({ x: v.probe[0], y: v.probe[1] }, camera)
    const hit = rc.intersectObjects(scene.children, true).find((k) => {
      const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
      return k.object.visible && m?.map && m.normalMap && m.roughnessMap
    })
    ref = hit
      ? Array.isArray(hit.object.material)
        ? hit.object.material[0]
        : hit.object.material
      : null
  }
  if (!ref) {
    const counts = new Map()
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m.map && m.normalMap && m.roughnessMap && m.metalness === 0.04)) continue
        counts.set(m, (counts.get(m) ?? 0) + 1)
      }
    })
    ref = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  if (!ref) return { woods: 0 }
  // Group by shared texture SOURCE — three clones the tile per repeat value, and
  // a clone shares its source object with the original.
  const src = ref.map.source
  const mats = []
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.map?.source === src && !mats.includes(m)) mats.push(m)
    }
  })
  // Snapshot everything a case might change, so every case restores to the SAME
  // baseline rather than to the previous case's leftovers.
  window.__wood = {
    mats,
    orig: mats.map((m) => ({
      m,
      map: m.map,
      normalMap: m.normalMap,
      repeat: [m.map.repeat.x, m.map.repeat.y],
      nRepeat: [m.normalMap.repeat.x, m.normalMap.repeat.y],
      rRepeat: [m.roughnessMap.repeat.x, m.roughnessMap.repeat.y],
      color: m.color.clone(),
      normalScale: m.normalScale.clone(),
      roughness: m.roughness,
    })),
    flat: null,
  }
  // A MASK of which screen cells actually show wood. Without it the metrics are
  // meaningless: the first run of this probe used the standard centre slab and
  // every case — including "albedo map removed" — came back at the noise floor,
  // because the chair backs sit at ~90% of the frame height, well below the
  // slab's lower edge. The mask is computed ONCE (geometry doesn't move between
  // cases) and every case is then measured over the wood pixels only.
  const GX = 96
  const GY = 60
  const mask = new Uint8Array(GX * GY)
  const rc2 = new raycaster.constructor()
  let woodCells = 0
  for (let iy = 0; iy < GY; iy++) {
    for (let ix = 0; ix < GX; ix++) {
      rc2.setFromCamera({ x: ((ix + 0.5) / GX) * 2 - 1, y: -(((iy + 0.5) / GY) * 2 - 1) }, camera)
      const hit = rc2.intersectObjects(scene.children, true).find((k) => {
        const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
        return (
          k.object.visible && m && m.colorWrite !== false && !(m.transparent && m.opacity < 0.05)
        )
      })
      if (!hit) continue
      const m = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material
      if (mats.includes(m)) {
        mask[iy * GX + ix] = 1
        woodCells++
      }
    }
  }
  return {
    woods: mats.length,
    refHex: `#${ref.color.getHexString()}`,
    refRepeat: [ref.map.repeat.x, ref.map.repeat.y],
    normalScale: ref.normalScale.x,
    texSize: ref.map.image?.width ?? null,
    grid: [GX, GY],
    mask: [...mask],
    woodCells,
  }
}, VIEW)

console.log(`mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log(
  `wood materials sharing one tile: ${found.woods}  ref=${found.refHex} repeat=${JSON.stringify(found.refRepeat)} normalScale=${found.normalScale} tile=${found.texSize}px`,
)
console.log(
  `wood covers ${found.woodCells}/${found.grid[0] * found.grid[1]} screen cells (${((100 * found.woodCells) / (found.grid[0] * found.grid[1])).toFixed(1)}%) — metrics below are over WOOD PIXELS ONLY\n`,
)
if (!found.woods) {
  console.log('no wood material found — aborting')
  await browser.close()
  process.exit(1)
}

async function applyCase(key) {
  await page.evaluate((k) => {
    const wd = window.__wood
    // Restore the grade too, or a tone case leaks into every later one.
    window.__store.getState().setToneMapping('auto')
    window.__store.getState().setSceneSaturation(1)
    for (const o of wd.orig) {
      o.m.map = o.map
      o.m.normalMap = o.normalMap
      o.m.map.repeat.set(...o.repeat)
      o.m.normalMap.repeat.set(...o.nRepeat)
      o.m.roughnessMap.repeat.set(...o.rRepeat)
      o.m.color.copy(o.color)
      o.m.normalScale.copy(o.normalScale)
      o.m.roughness = o.roughness
      o.m.needsUpdate = true
    }
    const scaleRepeat = (f) => {
      for (const o of wd.orig) {
        o.m.map.repeat.set(o.repeat[0] * f, o.repeat[1] * f)
        o.m.normalMap.repeat.set(o.nRepeat[0] * f, o.nRepeat[1] * f)
        o.m.roughnessMap.repeat.set(o.rRepeat[0] * f, o.rRepeat[1] * f)
      }
    }
    if (k === 'B') scaleRepeat(4)
    if (k === 'C') scaleRepeat(8)
    if (k === 'D') for (const m of wd.mats) m.map = null
    if (k === 'E') {
      if (!wd.flat) {
        // The wood albedo is built by `canvasFrom`, so its image IS a canvas and
        // can be read back. Lerp every pixel halfway to the tile's own mean:
        // the grain PATTERN survives, its banding amplitude halves.
        const srcCanvas = wd.orig[0].map.image
        const S = srcCanvas.width
        const sctx = srcCanvas.getContext('2d')
        const data = sctx.getImageData(0, 0, S, S)
        let sum = 0
        for (let i = 0; i < data.data.length; i += 4) sum += data.data[i]
        const mean = sum / (data.data.length / 4)
        for (let i = 0; i < data.data.length; i += 4) {
          const v = mean + (data.data[i] - mean) * 0.5
          data.data[i] = data.data[i + 1] = data.data[i + 2] = v
        }
        const cv = document.createElement('canvas')
        cv.width = S
        cv.height = S
        cv.getContext('2d').putImageData(data, 0, 0)
        const T = wd.orig[0].map.constructor
        const t = new T(cv)
        const s0 = wd.orig[0].map
        t.wrapS = s0.wrapS
        t.wrapT = s0.wrapT
        t.colorSpace = s0.colorSpace
        t.anisotropy = s0.anisotropy
        t.repeat.copy(s0.repeat)
        t.needsUpdate = true
        wd.flat = t
      }
      for (const m of wd.mats) m.map = wd.flat
    }
    if (k === 'F') {
      // Desaturate toward ~0.33 sRGB saturation while HOLDING luminance, so the
      // case isolates chroma and can't be confused with a brightness change.
      for (const o of wd.orig) {
        const c = o.m.color
        const hsl = { h: 0, s: 0, l: 0 }
        c.getHSL(hsl)
        // three's getHSL works in linear-light; converting the target through
        // the same space keeps the comparison honest.
        c.setHSL(hsl.h, hsl.s * 0.55, hsl.l)
      }
    }
    if (k === 'G') for (const m of wd.mats) m.normalMap = null
    // TONE / GRADE cases. These touch no material at all — they ask whether the
    // saturation is being ADDED by the view transform rather than authored. The
    // arithmetic says a #7a5c3c albedo (sRGB HSV saturation 0.508) rendered at
    // the measured mean luminance of ~58/255 should encode to ~0.54; the wood
    // measures 0.83, so ~0.3 comes from somewhere downstream.
    if (k === 'L') window.__store.getState().setToneMapping('neutral')
    if (k === 'M') window.__store.getState().setToneMapping('agx')
    if (k === 'N') window.__store.getState().setToneMapping('filmic')
    // `hueSatSaturation` = BASE_POST_SATURATION (0.06) + (sceneSaturation - 1),
    // so 0.94 puts the HueSaturation pass at exactly 0.
    if (k === 'O') window.__store.getState().setSceneSaturation(0.94)
    if (k === 'P') {
      // Hold hue and saturation, raise LIGHTNESS — isolates how much of the
      // measured chroma is simply an artefact of the surface being dark.
      for (const o of wd.orig) {
        const hsl = { h: 0, s: 0, l: 0 }
        o.m.color.getHSL(hsl)
        o.m.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.8))
      }
    }
    if (k === 'I') for (const m of wd.mats) m.roughness = 0.65
    if (k === 'J') for (const m of wd.mats) m.roughness = 0.8
    if (k === 'K') {
      // The candidate ship: a satin-matte lacquer plus a photographic chroma.
      for (const o of wd.orig) {
        const hsl = { h: 0, s: 0, l: 0 }
        o.m.color.getHSL(hsl)
        o.m.color.setHSL(hsl.h, hsl.s * 0.55, hsl.l)
        o.m.roughness = 0.7
      }
    }
    for (const m of wd.mats) m.needsUpdate = true
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, key)
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, VIEW)
  await new Promise((r) => setTimeout(r, 1800))
  await assertSceneAlive(page, `case ${key}`)
  return page.screenshot({ type: 'png' })
}

const W = 1280 * DSF
const H = 800 * DSF
const [GX, GY] = found.grid
// Pixel span of one grid cell, and the centred sub-block sampled from it. The
// block is inset so a cell straddling a wood silhouette edge contributes mostly
// wood rather than half background.
const CW = W / GX
const CH = H / GY
const BW = Math.max(1, Math.floor(CW * 0.5))
const BH = Math.max(1, Math.floor(CH * 0.5))

/**
 * MICROCONTRAST over wood pixels: the mean absolute luminance difference between
 * horizontally adjacent pixels inside each wood cell's centre block.
 *
 * This exists because the cell-mean sampling below deliberately AVERAGES each
 * block, which makes it blind to exactly the high-frequency speckle that the
 * aliased pore field produced — the first post-fix run reported the baseline
 * essentially unchanged (chroma 0.831 -> 0.833) while the dimples had visibly
 * vanished from the frame. A metric that cannot see the thing you changed is
 * worse than no metric, so measure both scales.
 */
async function woodMicrocontrast(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  let sum = 0
  let n = 0
  for (let iy = 0; iy < GY; iy++) {
    for (let ix = 0; ix < GX; ix++) {
      if (!found.mask[iy * GX + ix]) continue
      const x0 = Math.round(ix * CW + (CW - BW) / 2)
      const y0 = Math.round(iy * CH + (CH - BH) / 2)
      for (let y = y0; y < y0 + BH; y++) {
        for (let x = x0; x < x0 + BW - 1; x++) {
          const i = (y * info.width + x) * 3
          sum += Math.abs(lum(i + 3) - lum(i))
          n++
        }
      }
    }
  }
  return n ? sum / n : 0
}

/** RGB triples for every WOOD cell, sampled as the mean of each cell's centre
 *  block — so all metrics below describe the wood surfaces, nothing else. */
async function woodSamples(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = []
  for (let iy = 0; iy < GY; iy++) {
    for (let ix = 0; ix < GX; ix++) {
      if (!found.mask[iy * GX + ix]) continue
      const x0 = Math.round(ix * CW + (CW - BW) / 2)
      const y0 = Math.round(iy * CH + (CH - BH) / 2)
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = y0; y < y0 + BH; y++) {
        for (let x = x0; x < x0 + BW; x++) {
          const i = (y * info.width + x) * 3
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
      }
      out.push(r / n, g / n, b / n)
    }
  }
  return out
}

function diff(a, b) {
  let changed = 0
  let abs = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    abs += d
    if (d > 8) changed++
  }
  return { pct: (100 * changed) / a.length, mean: abs / a.length }
}

/** Chroma + luminance stats over the wood samples. `sd` here is the wood's OWN
 *  contrast — the grain banding amplitude, which is the thing the tile-density
 *  and albedo-contrast cases are supposed to move. */
function woodStats(px) {
  let cSum = 0
  let over = 0
  let lSum = 0
  let lSq = 0
  const n = px.length / 3
  for (let i = 0; i < px.length; i += 3) {
    const max = Math.max(px[i], px[i + 1], px[i + 2])
    const min = Math.min(px[i], px[i + 1], px[i + 2])
    cSum += max === 0 ? 0 : (max - min) / max
    if (max > 0 && (max - min) / max > 0.35) over++
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
    lSum += l
    lSq += l * l
  }
  const mean = lSum / n
  return {
    chroma: cSum / n,
    over: (100 * over) / n,
    mean,
    sd: Math.sqrt(Math.max(0, lSq / n - mean * mean)),
  }
}

const CASES = [
  { key: 'warm', label: 'warm-up (discarded)' },
  { key: 'A', label: 'baseline' },
  { key: 'B', label: 'repeat x4 (finer grain)' },
  { key: 'C', label: 'repeat x8' },
  { key: 'D', label: 'albedo map removed' },
  { key: 'E', label: 'albedo contrast halved' },
  { key: 'F', label: 'base colour desaturated' },
  { key: 'G', label: 'normalMap removed' },
  { key: 'I', label: 'roughness 0.5 -> 0.65' },
  { key: 'J', label: 'roughness 0.5 -> 0.80' },
  { key: 'K', label: 'desaturated + roughness 0.7' },
  { key: 'L', label: 'tone: NEUTRAL (Khronos)' },
  { key: 'M', label: 'tone: AgX' },
  { key: 'N', label: 'tone: filmic (explicit)' },
  { key: 'O', label: 'post saturation 0.06 -> 0' },
  { key: 'P', label: 'colour lightened x1.8' },
  { key: 'H', label: 'baseline repeated (noise)' },
]
const px = {}
console.log(
  'case                            chroma  >0.35%   mean   grain-sd  microK | frame clipped',
)
for (const c of CASES) {
  const buf = await applyCase(c.key === 'warm' || c.key === 'H' ? 'A' : c.key)
  if (c.key === 'warm') continue
  fs.writeFileSync(`${OUT}/${MODE}-${TIER}-h${HOUR}-${c.key}.png`, buf)
  px[c.key] = await woodSamples(buf)
  const w = woodStats(px[c.key])
  // Whole-frame stats too, so a wood change that wrecks the overall exposure
  // can't hide behind a good local number.
  const st = await frameStats(buf, { x: W * 0.25, y: H * 0.28, w: W * 0.5, h: H * 0.44 })
  const mk = await woodMicrocontrast(buf)
  console.log(
    `${c.key} ${c.label.padEnd(28)} ${w.chroma.toFixed(3)}  ${w.over.toFixed(1).padStart(5)}%  ${w.mean.toFixed(1).padStart(6)}  ${w.sd.toFixed(2).padStart(7)}  ${mk.toFixed(2).padStart(6)} | ${st.clipped}`,
  )
}
console.log('')
const show = (l, k) => {
  const d = diff(px.A, px[k])
  console.log(`  ${l.padEnd(34)} pixels>8=${d.pct.toFixed(2)}%  meanAbsDiff=${d.mean.toFixed(2)}`)
}
show('A vs H  (NOISE FLOOR)', 'H')
show('A vs B  (repeat x4)', 'B')
show('A vs C  (repeat x8)', 'C')
show('A vs D  (albedo map worth)', 'D')
show('A vs E  (albedo contrast halved)', 'E')
show('A vs F  (desaturated)', 'F')
show('A vs G  (normal map worth)', 'G')
show('A vs I  (roughness 0.65)', 'I')
show('A vs J  (roughness 0.80)', 'J')
show('A vs K  (candidate: desat + rough 0.7)', 'K')
show('A vs L  (tone neutral)', 'L')
show('A vs M  (tone AgX)', 'M')
show('A vs N  (tone filmic explicit)', 'N')
show('A vs O  (post saturation off)', 'O')
show('A vs P  (lightened x1.8)', 'P')
await browser.close()
