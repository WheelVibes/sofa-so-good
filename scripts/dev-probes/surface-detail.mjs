/**
 * Measure ONE surface class, wherever it happens to be on screen.
 *
 * A generalisation of `wood-detail.mjs`'s masking half: pick a surface by casting
 * a ray through a named NDC point, group every material in the scene that shares
 * that material's identity, mask the screen cells those materials occupy, and
 * report statistics over THOSE PIXELS ONLY:
 *
 *   chroma / >0.35 sat   how colourful the surface renders
 *   mean                 its luminance
 *   sigma                its own contrast (the low-frequency design)
 *   microcontrast        mean |neighbour difference| at full resolution — the
 *                        HIGH-frequency channel, which a cell-mean average is
 *                        blind to. This is the metric that shows an aliased
 *                        normal map (see WOOD-PORE-NYQUIST / FABRIC-FINE-NYQUIST);
 *                        without it a de-aliasing fix reads as "no change".
 *
 * Why a mask and not a rectangle: the standard centre slab misses whatever you
 * are actually looking at (`wood-detail.mjs`'s first run reported every case at
 * the noise floor because the chair backs sit at ~90% of the frame height), and
 * in WALK mode the camera cannot be aimed at all — `FirstPersonCamera` discards
 * a programmatic `lookAt`. A mask sidesteps both: whatever the controller points
 * at, the right pixels are still found.
 *
 * Two ways to name the surface, and **prefer `DEF`**:
 *   `DEF=coffee-table`  a catalog `defId`. The probe finds that item's meshes via
 *                       `Furniture.tsx`'s `userData.itemId` tag and seeds from the
 *                       largest one. Robust, and it survives a camera change.
 *   `POINT=x,y`         NDC of a pixel on the surface, measured off a screenshot.
 *                       Only use this when there is no `defId` (shell surfaces).
 *                       Eyeballed NDC has silently missed its target more than
 *                       once here — it hit a candle cluster while trying to pick a
 *                       dining table — so the probe reports what it actually hit.
 *
 * Env: `DEF` or `POINT`, plus `MODE`, `TIER`, `HOUR`, `LABEL`.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-surface'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
const LABEL = process.env.LABEL || 'surface'
const POINT = (process.env.POINT || '0.42,-0.12').split(',').map(Number)
const DEF = process.env.DEF || null
/**
 * What the mask covers:
 *   'painter' (default) — every material sharing the seed's map SOURCE. Right for
 *                         "how does this painter look", since three clones the
 *                         shared tile per repeat.
 *   'item'              — only meshes belonging to the `DEF` item(s). Right for a
 *                         per-ITEM decision such as its `color` prop.
 * Getting this wrong dilutes the measurement badly: a tv-console colour sweep
 * under 'painter' covered 402 cells across 17 shared-wood materials, and the whole
 * #3a2f24 -> #a08464 range moved mean only 80.2 -> 92.9 because most of the mask
 * was other furniture wearing the same tile.
 */
const MASK = process.env.MASK || 'painter'
/**
 * Optional A/B: a comma-separated list of `finish` prop values to try on the
 * `DEF` item(s), measured in ONE run over the identical view and mask. This is
 * the honest way to compare candidate finishes — a source edit per candidate
 * needs a run each and invites quoting numbers across states. The mask is built
 * from the FIRST value, so every case covers the same pixels.
 */
const FINISHES = (process.env.FINISHES || '').split(',').filter(Boolean)
/**
 * Which prop the finish values are written to. NOT always `finish`: beds and some
 * decor carry their wood on `frameFinish`, and writing the wrong key makes every
 * arm of the A/B byte-identical — which reads as "this change does nothing"
 * rather than "the mutation never landed". Check the def's `paramSchema`.
 */
const PROP = process.env.PROP || 'finish'
/**
 * Optional second A/B: `material.normalScale` values to sweep, in ONE run, after
 * the finish is applied.
 *
 * `normalScale` is a RENDER-TIME multiplier on the sampled tangent-space normal,
 * whereas a painter's `normalStrength` scales the height->normal bake. Sweeping
 * this live finds a ballpark in one run instead of one source edit + one browser
 * launch per arm — but **the two are NOT proportional, so always confirm with a
 * real `normalStrength` change.** Measured on carpet: `normalScale` 1 / 0.5 /
 * 0.25 / 0.1 gave microcontrast 4.010 / 2.739 / 1.838 / 1.353, and a genuine
 * `normalStrength` 6 -> 1.5 (a 4x cut) landed at **1.349** — i.e. where
 * `normalScale` 0.1 (a 10x cut) did, not where 0.25 did. `heightToNormalRGBA`
 * normalises `(-dx, -dy, 1)`, so its response saturates: use the sweep to pick a
 * DIRECTION, then measure the real bake.
 */
const NORMAL_SCALES = (process.env.NORMAL_SCALES || '').split(',').filter(Boolean).map(Number)
/**
 * Generic live MATERIAL-property sweep, one arm per `;`-separated group, each
 * group a comma-separated `key=value` list applied to every masked material:
 *
 *   MATPROPS='sheen=0;sheen=0.4;sheen=1,sheenRoughness=0.25'
 *
 * Values parse as numbers when numeric, else as strings (so `sheenColor=#ffffff`
 * works via `Color.set`). Every arm restores the captured originals first, so an
 * arm never inherits the previous one's state.
 *
 * Use this for anything shading-related that lives on the material rather than in
 * the texture bake — `sheen`/`sheenRoughness`/`sheenColor`, `clearcoat`,
 * `roughness`, `metalness`. Note `sheen` in three is a Fresnel-weighted
 * retroreflective lobe driven mostly by the ENVIRONMENT, so it is near-inert on
 * `performance` (no IBL) and shows most at GRAZING angles — measure a grazing view,
 * not just head-on, or a real difference will read as nothing.
 */
const MATPROPS = (process.env.MATPROPS || '')
  .split(';')
  .filter(Boolean)
  .map((group) =>
    group.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k.trim(), Number.isNaN(Number(v)) ? v.trim() : Number(v)]
    }),
  )
/**
 * Props to set ONCE on the `DEF` item(s) before the mask is built, as
 * `key=value,key=value`. Use it to pin the context a sweep runs in — e.g.
 * `PRESET=finish=wood` before sweeping `PROP=color`, since the sweep itself only
 * writes one prop.
 */
const PRESET = (process.env.PRESET || '')
  .split(',')
  .filter(Boolean)
  .map((kv) => kv.split('='))
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
const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }
await page.evaluate((v) => {
  const { camera, controls } = window.__three
  camera.position.set(...v.pos)
  if (controls?.target) {
    controls.target.set(...v.look)
    controls.update()
  } else camera.lookAt(...v.look)
  camera.updateMatrixWorld()
  const st = window.__store.getState()
  st.setManualHour(st.manualHour)
}, VIEW)
await new Promise((r) => setTimeout(r, 2500))
await assertSceneAlive(page, 'after setup')

/** Set the `finish` prop on every item with the target defId, via the app's own
 *  action so the whole material-resolution path runs exactly as for a user. */
async function applyFinish(finish) {
  if (!DEF || !finish) return
  const wrote = await page.evaluate(
    (def, f, prop) => {
      const st = window.__store.getState()
      const items = st.items.filter((x) => x.defId === def)
      for (const i of items) st.updateItemProps(i.id, { [prop]: f })
      return items.length
    },
    DEF,
    finish,
    PROP,
  )
  if (!wrote) throw new Error(`no items with defId ${DEF} — nothing was changed`)
  // Catalog/DLC materials (`mat:<id>`) build asynchronously in
  // FurnitureMaterialLoader, and until they land the primitive falls back to a
  // procedural wood — measuring inside that window compares the fallback.
  await new Promise((r) => setTimeout(r, 4500))
  await assertSceneAlive(page, `${PROP} ${finish}`)
}
if (PRESET.length) {
  const n = await page.evaluate(
    (def, pairs) => {
      const st = window.__store.getState()
      const items = st.items.filter((x) => x.defId === def)
      for (const i of items) st.updateItemProps(i.id, Object.fromEntries(pairs))
      return items.length
    },
    DEF,
    PRESET,
  )
  if (!n) throw new Error(`PRESET: no items with defId ${DEF}`)
  await new Promise((r) => setTimeout(r, 4500))
  await assertSceneAlive(page, 'after PRESET')
}
if (FINISHES.length) await applyFinish(FINISHES[0])

/** Apply one MATPROPS arm, restoring the captured originals first. */
async function applyMatProps(pairs) {
  const n = await page.evaluate((kvs) => {
    const wd = window.__sd
    if (!wd?.mats?.length) return 0
    if (!wd.orig) {
      // Snapshot every key any arm will touch, so a restore is exact.
      wd.orig = wd.mats.map((m) => ({
        m,
        sheen: m.sheen,
        sheenRoughness: m.sheenRoughness,
        sheenColor: m.sheenColor?.clone?.() ?? null,
        clearcoat: m.clearcoat,
        roughness: m.roughness,
        metalness: m.metalness,
      }))
    }
    for (const o of wd.orig) {
      for (const k of ['sheen', 'sheenRoughness', 'clearcoat', 'roughness', 'metalness'])
        if (o[k] !== undefined) o.m[k] = o[k]
      if (o.sheenColor && o.m.sheenColor) o.m.sheenColor.copy(o.sheenColor)
      o.m.needsUpdate = true
    }
    for (const m of wd.mats) {
      for (const [k, v] of kvs) {
        if (k === 'sheenColor') m.sheenColor?.set(v)
        else m[k] = v
      }
      m.needsUpdate = true
    }
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
    return wd.mats.length
  }, pairs)
  if (!n) throw new Error('no materials captured for the MATPROPS sweep')
  await new Promise((r) => setTimeout(r, 1600))
  await assertSceneAlive(page, `matprops ${JSON.stringify(pairs)}`)
}

/** Set every masked material's normalScale (uniform x/y). */
async function applyNormalScale(v) {
  const n = await page.evaluate((val) => {
    const mats = window.__sd?.mats
    if (!mats?.length) return 0
    for (const m of mats) m.normalScale?.set(val, val)
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
    return mats.length
  }, v)
  if (!n) throw new Error('no materials captured for the normalScale sweep')
  await new Promise((r) => setTimeout(r, 1600))
  await assertSceneAlive(page, `normalScale ${v}`)
}

const GX = 96
const GY = 60
const found = await page.evaluate(
  (pt, gx, gy, def, maskMode) => {
    const { scene, camera, raycaster } = window.__three
    const rc = new raycaster.constructor()
    const visible = (k) => {
      const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
      return k.object.visible && m && m.colorWrite !== false && !(m.transparent && m.opacity < 0.05)
    }
    let ref = null
    let seededFrom = ''
    const itemIds = new Set(
      def
        ? window.__store
            .getState()
            .items.filter((i) => i.defId === def)
            .map((i) => i.id)
        : [],
    )
    if (def) {
      // Find the item(s) with this defId, then their meshes via the itemId tag
      // Furniture.tsx puts on each piece's group. Seed from the mesh with the
      // largest world-space bounding-box diagonal — the piece's dominant surface
      // (a table's top, not its handle).
      const ids = new Set(
        window.__store
          .getState()
          .items.filter((i) => i.defId === def)
          .map((i) => i.id),
      )
      if (!ids.size) return { n: 0, why: `no item with defId ${def}` }
      let best = null
      let bestSize = -1
      scene.traverse((o) => {
        if (!o.isMesh || !o.material) return
        let node = o
        let hit = false
        while (node) {
          if (node.userData?.itemId && ids.has(node.userData.itemId)) {
            hit = true
            break
          }
          node = node.parent
        }
        if (!hit) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox
        if (!bb) return
        if (!o.userData.__s) o.userData.__s = new o.position.constructor()
        const sc = o.getWorldScale(o.userData.__s)
        const size = Math.abs((bb.max.x - bb.min.x) * sc.x) * Math.abs((bb.max.z - bb.min.z) * sc.z)
        if (size > bestSize) {
          bestSize = size
          best = o
        }
      })
      if (!best) return { n: 0, why: `defId ${def} has no meshes in the scene` }
      ref = Array.isArray(best.material) ? best.material[0] : best.material
      seededFrom = `defId ${def} (largest mesh, footprint ${bestSize.toFixed(2)} m2)`
    } else {
      rc.setFromCamera({ x: pt[0], y: pt[1] }, camera)
      const seed = rc.intersectObjects(scene.children, true).find(visible)
      if (!seed) return { n: 0, why: 'no hit at POINT' }
      ref = Array.isArray(seed.object.material) ? seed.object.material[0] : seed.object.material
      // Report what the ray ACTUALLY hit, so a mis-measured NDC is visible
      // instead of silently measuring the wrong object.
      let node = seed.object
      let itemId = null
      while (node && !itemId) {
        if (node.userData?.itemId) itemId = node.userData.itemId
        node = node.parent
      }
      const item = window.__store.getState().items.find((i) => i.id === itemId)
      seededFrom = `POINT ${pt.join(',')} -> ${item?.defId ?? 'shell/unknown'} at ${seed.distance.toFixed(2)} m`
    }
    // Group by shared MAP SOURCE when there is a map (clones share it), else by
    // the material object itself.
    const src = ref.normalMap?.source ?? ref.map?.source ?? null
    const mats = []
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const ms = m.normalMap?.source ?? m.map?.source ?? null
        if ((src && ms === src) || m === ref) if (!mats.includes(m)) mats.push(m)
      }
    })
    const mask = []
    let n = 0
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        rc.setFromCamera({ x: ((ix + 0.5) / gx) * 2 - 1, y: -(((iy + 0.5) / gy) * 2 - 1) }, camera)
        const hit = rc.intersectObjects(scene.children, true).find(visible)
        let ok = 0
        if (hit) {
          if (maskMode === 'item') {
            let node = hit.object
            while (node && !ok) {
              if (node.userData?.itemId && itemIds.has(node.userData.itemId)) ok = 1
              node = node.parent
            }
          } else {
            const m = Array.isArray(hit.object.material)
              ? hit.object.material[0]
              : hit.object.material
            if (mats.includes(m)) ok = 1
          }
        }
        mask.push(ok)
        n += ok
      }
    }
    window.__sd = { mats }
    return {
      n,
      mask,
      mats: mats.length,
      seededFrom,
      hex: ref.color ? `#${ref.color.getHexString()}` : null,
      rough: ref.roughness ?? null,
      metal: ref.metalness ?? null,
      type: ref.type,
      maps: {
        map: !!ref.map,
        normalMap: !!ref.normalMap,
        roughnessMap: !!ref.roughnessMap,
      },
      sheen: ref.sheen ?? null,
      sheenRoughness: ref.sheenRoughness ?? null,
      clearcoat: ref.clearcoat ?? null,
    }
  },
  POINT,
  GX,
  GY,
  DEF,
  MASK,
)

if (!found.n) {
  console.log(`no surface found (${found.why ?? 'mask empty'})`)
  await browser.close()
  process.exit(1)
}

const W = 1280 * DSF
const H = 800 * DSF
const CW = W / GX
const CH = H / GY
const BW = Math.max(1, Math.floor(CW * 0.5))
const BH = Math.max(1, Math.floor(CH * 0.5))
async function measure(tag) {
  const buf = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUT}/${LABEL}-${MODE}-${TIER}-h${HOUR}${tag ? `-${tag}` : ''}.png`, buf)
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]

  let cSum = 0
  let over = 0
  let lSum = 0
  let lSq = 0
  let cells = 0
  let step = 0
  let steps = 0
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
          if (x < x0 + BW - 1) {
            step += Math.abs(lum(i + 3) - lum(i))
            steps++
          }
        }
      }
      r /= n
      g /= n
      b /= n
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const sat = mx === 0 ? 0 : (mx - mn) / mx
      cSum += sat
      if (sat > 0.35) over++
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      lSum += l
      lSq += l * l
      cells++
    }
  }
  const mean = lSum / cells
  const sd = Math.sqrt(Math.max(0, lSq / cells - mean * mean))
  return {
    chroma: cSum / cells,
    over: (100 * over) / cells,
    mean,
    sd,
    micro: step / steps,
  }
}

console.log(`${LABEL}  mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log(`  seeded from: ${found.seededFrom}`)
console.log(
  `  seed material: ${found.type} ${found.hex} rough=${found.rough} metal=${found.metal}` +
    (found.sheen != null ? ` sheen=${found.sheen}/${found.sheenRoughness}` : '') +
    (found.clearcoat ? ` clearcoat=${found.clearcoat}` : '') +
    `  map=${found.maps.map ? 'y' : '.'} nrm=${found.maps.normalMap ? 'y' : '.'} rgh=${found.maps.roughnessMap ? 'y' : '.'}  (${found.mats} materials share it)`,
)
console.log(
  `  masked ${found.n}/${GX * GY} screen cells (${((100 * found.n) / (GX * GY)).toFixed(1)}%) — mask=${MASK}`,
)
const show = (tag, r) =>
  console.log(
    `  ${tag.padEnd(24)} chroma=${r.chroma.toFixed(3)}  >0.35=${r.over.toFixed(1).padStart(5)}%  mean=${r.mean.toFixed(1).padStart(6)}  sigma=${r.sd.toFixed(2).padStart(6)}  microcontrast=${r.micro.toFixed(3)}`,
  )
if (MATPROPS.length) {
  console.log(`  MATPROPS sweep over ${found.mats} masked material(s)`)
  for (const arm of MATPROPS) {
    await applyMatProps(arm)
    const tag = arm.map(([k, v]) => `${k}=${v}`).join(',')
    show(tag, await measure(tag.replace(/[^\w.=-]/g, '_')))
  }
} else if (NORMAL_SCALES.length) {
  console.log(`  normalScale sweep over ${found.mats} masked material(s)`)
  for (const v of NORMAL_SCALES) {
    await applyNormalScale(v)
    show(`normalScale ${v}`, await measure(`ns${v}`))
  }
} else if (!FINISHES.length) {
  show('as shipped', await measure(''))
} else {
  console.log(`  A/B writes prop '${PROP}' on defId '${DEF}'`)
  for (const f of FINISHES) {
    await applyFinish(f)
    show(f, await measure(f.replace(/[^\w-]/g, '_')))
  }
}
await browser.close()
