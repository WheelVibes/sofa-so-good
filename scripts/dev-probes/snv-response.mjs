/**
 * TONE-CALIBRATION guard: what a change of view transform does to the five
 * render-calibrated SNV finishes.
 *
 * `materials/CLAUDE.md:TONE-CALIBRATION` records that the five Serangoon North
 * Vista finish swatches are deliberately more saturated/warm than the exhibition
 * sample boards they match, because they were solved as `boardTone / response`
 * against the render and verified until "the rendered proportions match the board
 * photo's (to +-0.002)". It also says to recalibrate after any lighting or
 * tone-mapping change. So TONE-CURVE-CHOICE — switching the default operator —
 * cannot be judged on whole-frame numbers alone.
 *
 * This measures, per surface and per operator:
 *   - the mean RENDERED RGB of the masked surface,
 *   - the peak-normalised per-channel response (`render / swatch`), which is the
 *     quantity the calibration was solved against, and
 *   - the per-channel multiplier that would make a LATER operator reproduce the
 *     FIRST operator's render exactly (`firstRender / thisRender`).
 *
 * That last column matters because the board photos are NOT in the repo
 * (`assets/guidelines/` is gitignored and absent from every checkout), so the
 * boards cannot be used as ground truth here. The available honest move is
 * therefore render-PRESERVING: if the current swatches match the boards under
 * the current operator, then keeping each surface's render invariant across the
 * switch keeps the board match by construction, whatever the board tone is.
 *
 * Two things this probe learned the hard way:
 *   - **Mask by world-space face NORMAL, not geometry extents.** An extent-based
 *     classifier borrowed from `material-audit.mjs` matched ZERO cells: that one
 *     works because "the shell is axis-aligned boxes", and these floors are
 *     rotated planes whose LOCAL box is tall in Y and zero in Z.
 *   - **Derive the camera pose from the PLAN, not by hand.** Hand-picked poses
 *     silently missed rooms (the first kitchen pose found no floor at all), and
 *     they break whenever the default plan changes. Each target names a room id
 *     and the probe places the eye at that room's centre.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-snv'
const TIER = process.env.TIER || 'performance'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 13)
const TONES = (process.env.TONES || 'filmic,agx').split(',')
fs.mkdirSync(OUT, { recursive: true })

/** The five render-calibrated SNV finishes, each with the room it defaults in
 *  and which surface kind to mask. `floor-tile-beige-300` shares its swatch and
 *  painter with `floor-tile-beige`, so the household shelter stands in for both. */
const TARGETS = [
  { key: 'livingDining-floor', room: 'livingDining', surface: 'floor', finish: 'floor-vinyl-oak' },
  { key: 'kitchen-floor', room: 'kitchen', surface: 'floor', finish: 'floor-tile-beige' },
  { key: 'bath1-floor', room: 'bath1', surface: 'floor', finish: 'floor-tile-bath-green' },
  { key: 'bath1-wall', room: 'bath1', surface: 'wall', finish: 'wall-tile-white' },
  {
    key: 'householdShelter-floor',
    room: 'householdShelter',
    surface: 'floor',
    finish: 'floor-tile-beige-300',
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
// Deliberately STAYS IN ORBIT. Walk mode's `FirstPersonCamera` owns the camera
// orientation every frame and silently discards a programmatic `lookAt` — this
// probe measured a forward vector of exactly (-0.07, 0, -1) for five different
// requested pitches, so every "floor" sample was actually a grazing sliver of
// slab plus whatever else was level with the eye. Orbit's `OrbitControls`
// recomputes its orientation from position + `controls.target`, both of which
// CAN be set, so the pose is reproducible and verifiable (see the pose-held
// check below). Orbit is also where a finish is chosen in this app.
await assertSceneAlive(page, 'after setup')

const swatches = await page.evaluate(
  async (ids) => {
    const mod = await import('/src/materials/builtinCatalog.ts')
    return Object.fromEntries(ids.map((id) => [id, mod.BUILTIN_MATERIALS[id]?.swatch ?? null]))
  },
  TARGETS.map((t) => t.finish),
)

const W = 1280 * DSF
const H = 800 * DSF
const GX = 80
const GY = 50
const CW = W / GX
const CH = H / GY

/**
 * Frame a plan room's floor (or its far wall) from ORBIT, by setting both the
 * camera position and `controls.target` — the two things OrbitControls derives
 * its orientation from, so the pose actually holds.
 */
async function place(room, surface) {
  return page.evaluate(
    (roomId, kind) => {
      const st = window.__store.getState()
      const r = st.floorPlan.rooms.find((x) => x.id === roomId)
      if (!r) return { ok: false, why: `no room ${roomId}` }
      const cx = r.origin[0] + r.width / 2
      const cz = r.origin[1] + r.depth / 2
      const { camera, controls } = window.__three
      if (!controls) return { ok: false, why: 'no orbit controls exposed' }
      // Close enough that the room's own surface fills the frame, high enough to
      // clear the (orbit-culled) ceiling. A steep look-down for a floor; a low,
      // near-level approach for a wall.
      const span = Math.max(r.width, r.depth)
      if (kind === 'floor') {
        controls.target.set(cx, 0, cz)
        camera.position.set(cx + span * 0.25, span * 0.9 + 1.2, cz + span * 0.25)
      } else {
        controls.target.set(cx, 1.4, r.origin[1] + 0.05)
        camera.position.set(cx, 1.6, cz + Math.max(1.0, r.depth * 0.6))
      }
      controls.update()
      camera.updateMatrixWorld()
      st.setManualHour(st.manualHour)
      window.__snvWant = {
        pos: camera.position.toArray().map((v) => +v.toFixed(2)),
        fwd: camera
          .getWorldDirection(new camera.position.constructor())
          .toArray()
          .map((v) => +v.toFixed(2)),
      }
      return { ok: true, centre: [+cx.toFixed(2), +cz.toFixed(2)] }
    },
    room,
    surface,
  )
}

/** Mask a surface by the ray's WORLD face normal (orientation-proof). */
async function surfaceMask(kind) {
  return page.evaluate(
    (gx, gy, k) => {
      const { scene, camera, raycaster } = window.__three
      const rc = new raycaster.constructor()
      const nrm = new camera.position.constructor()
      const mask = []
      const diag = []
      let n = 0
      for (let iy = 0; iy < gy; iy++) {
        for (let ix = 0; ix < gx; ix++) {
          rc.setFromCamera(
            { x: ((ix + 0.5) / gx) * 2 - 1, y: -(((iy + 0.5) / gy) * 2 - 1) },
            camera,
          )
          const hit = rc.intersectObjects(scene.children, true).find((q) => {
            const m = Array.isArray(q.object.material) ? q.object.material[0] : q.object.material
            return (
              q.object.visible &&
              m &&
              m.colorWrite !== false &&
              !(m.transparent && m.opacity < 0.05)
            )
          })
          let ok = 0
          if (hit?.face) {
            nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
            if (k === 'floor') {
              // |ny|, not ny: a rotated PlaneGeometry's GEOMETRIC normal can
              // point down while the material renders DoubleSide, so a signed
              // test drops half the real floor. Height still excludes rugs and
              // mats, which sit proud of the slab and would contaminate the
              // finish's own colour.
              if (Math.abs(nrm.y) > 0.9 && hit.point.y < 0.06) ok = 1
            } else if (Math.abs(nrm.y) < 0.3 && hit.point.y > 0.9 && hit.point.y < 2.2) ok = 1
            diag.push(`|ny|=${Math.abs(nrm.y).toFixed(1)} y=${hit.point.y.toFixed(2)}`)
          }
          mask.push(ok)
          n += ok
        }
      }
      const hist = new Map()
      for (const d of diag) hist.set(d, (hist.get(d) ?? 0) + 1)
      return {
        mask,
        n,
        diag: [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      }
    },
    GX,
    GY,
    kind,
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

const hexRgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
const pk = (v) => {
  const m = Math.max(...v)
  return v.map((x) => x / m)
}

console.log(`tier=${TIER} hour=${HOUR} dpr=${DSF} — SNV surface response, ${TONES.join(' vs ')}\n`)
for (const t of TARGETS) {
  const swatch = swatches[t.finish]
  const placed = await place(t.room, t.surface)
  if (!placed.ok) {
    console.log(`${t.key}: ${placed.why}\n`)
    continue
  }
  await new Promise((r) => setTimeout(r, 2200))
  // Verify the pose SURVIVED. Walk mode's controller owns the camera each frame,
  // so a programmatic `lookAt` may simply be overwritten — which would make every
  // per-surface number a measurement of whatever the controller was pointing at.
  const pose = await page.evaluate(() => {
    const { camera } = window.__three
    return {
      want: window.__snvWant,
      got: {
        pos: camera.position.toArray().map((v) => +v.toFixed(2)),
        fwd: camera
          .getWorldDirection(new camera.position.constructor())
          .toArray()
          .map((v) => +v.toFixed(2)),
      },
    }
  })
  const kept =
    JSON.stringify(pose.want.fwd) === JSON.stringify(pose.got.fwd) &&
    JSON.stringify(pose.want.pos) === JSON.stringify(pose.got.pos)
  const { mask, n, diag } = await surfaceMask(t.surface)
  console.log(
    `${t.key}  (${t.finish}, swatch ${swatch})  ${n}/${GX * GY} cells` +
      (kept ? '' : `  POSE NOT HELD want fwd ${pose.want.fwd} got ${pose.got.fwd}`),
  )
  if (n > 0 && n < 200)
    console.log(`  SMALL SAMPLE — top ray hits: ${diag.map(([k2, c]) => `${k2} x${c}`).join('  ')}`)
  if (!n) {
    console.log(
      `  NO SURFACE MATCHED — top ray hits: ${diag.map(([k2, c]) => `${k2} x${c}`).join('  ')}\n`,
    )
    continue
  }
  const sw = swatch ? hexRgb(swatch) : null
  const rows = []
  for (const tone of TONES) {
    await page.evaluate((tn) => {
      window.__store.getState().setToneMapping(tn)
      const st = window.__store.getState()
      st.setManualHour(st.manualHour)
    }, tone)
    await new Promise((r) => setTimeout(r, 2200))
    await assertSceneAlive(page, `${t.key} ${tone}`)
    const buf = await page.screenshot({ type: 'png' })
    fs.writeFileSync(`${OUT}/${t.key}-${tone}-h${HOUR}.png`, buf)
    const rgb = await maskedMeanRgb(buf, mask)
    rows.push({ tone, rgb })
    const resp = sw ? pk(rgb.map((v, i) => v / sw[i])) : null
    console.log(
      `  ${tone.padEnd(8)} render ${rgb.map((v) => v.toFixed(1).padStart(6)).join(' ')}` +
        (resp ? `   response ${resp.map((v) => v.toFixed(3)).join(' / ')}` : ''),
    )
  }
  if (sw && rows.length > 1) {
    const base = rows[0]
    const bResp = pk(base.rgb.map((v, i) => v / sw[i]))
    for (const r of rows.slice(1)) {
      const resp = pk(r.rgb.map((v, i) => v / sw[i]))
      const drift = resp.map((v, i) => Math.abs(v - bResp[i]))
      // The render-preserving multiplier: scale the swatch by this and the later
      // operator reproduces the first one's render.
      const mult = base.rgb.map((v, i) => v / r.rgb[i])
      const newSw = sw.map((v, i) => Math.round(Math.min(255, v * mult[i])))
      // NOTE on the +-0.002 figure TONE-CALIBRATION claims: this probe has shown
      // the response is NOT single-valued (the same floor reads blue-strongest
      // in orbit and blue-weakest in walk), so treat the tolerance as historical
      // context, not a gate. See TONE-CALIBRATION in materials/CLAUDE.md.
      console.log(
        `  drift ${base.tone}->${r.tone} ${drift.map((v) => v.toFixed(3)).join(' / ')} (max ${Math.max(...drift).toFixed(3)})`,
      )
      console.log(
        `  render-preserving swatch for ${r.tone}: x${mult.map((v) => v.toFixed(3)).join('/')} -> #${newSw.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      )
    }
  }
  console.log('')
}
await browser.close()
