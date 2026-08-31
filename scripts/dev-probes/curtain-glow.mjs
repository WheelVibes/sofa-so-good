/**
 * CURTAIN-GLOW — does a drawn curtain read as backlit fabric or as a wall?
 *
 * In a photograph a curtain hanging over a daylit window is the BRIGHTEST large
 * surface in the room, because daylight transmits through the cloth. Measured on
 * the reference set (`.198`), curtain mean ÷ frame mean:
 *
 *   photo D, sheer over a balcony door   1.42   (lower half alone 1.48)
 *   photo A, cream curtain over a window 1.32
 *   photo C, drape on a blank wall       0.88   ← not backlit, for contrast
 *
 * So a drawn curtain over daylight should land near **1.3-1.5**, and a curtain
 * that measures at or below the frame mean is being lit as an opaque sheet.
 *
 * The mask is GEOMETRIC (`.181`): a sample counts only if the ray hit something
 * standing in the window's own plane, within `SLAB_M` of it and above sill
 * height. With the curtains drawn that surface is the curtain; with them open it
 * is the glazing, which is why `CLOSED=0` is a useful control rather than a
 * second arm of the same measurement.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
const PHOTO = process.env.PHOTO === '1'
const WINDOW = process.env.WINDOW || 'livingDining'
const STANDOFF = Number(process.env.STANDOFF || 3.0)
const CLOSED = process.env.CLOSED !== '0'
const GRID = Number(process.env.GRID || 90)
/** How far in front of / behind the window plane still counts as "in it". */
const SLAB_M = Number(process.env.SLAB || 0.5)
const OUT = process.env.OUT || '/tmp/curtain-glow'

// HUD cut-outs — a screenshot composites the DOM over the canvas (`.185`).
const HUD = [
  { x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 },
  { x0: 0.9, x1: 1, y0: 0, y1: 0.06 },
  { x0: 0.76, x1: 1, y0: 0.76, y1: 1 },
  { x0: 0.32, x1: 0.68, y0: 0.11, y1: 0.22 },
  { x0: 0.42, x1: 0.59, y0: 0.82, y1: 0.89 },
  { x0: 0.29, x1: 0.71, y0: 0.91, y1: 0.98 },
]
const inHud = (x, y) => HUD.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)

fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
// Onboarding renders over the canvas with a blurred, dimmed backdrop (`.193`).
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

const setup = await page.evaluate(
  ({ h, t, photo, closed, win, standoff }) => {
    const s = window.__store.getState()
    s.setQualityTier(t)
    s.setTimeMode?.('manual')
    s.setManualHour?.(h)
    s.setCameraMode?.('firstPerson')
    s.setPhotographicLook?.(photo)
    // `drawAmount` 1 is DRAWN. The default flat ships them open (`.88`), and
    // `toggleWindowFixture` FLIPS, which is how `.91` measured two covered
    // windows and concluded the presets were inert — set the value explicitly.
    let n = 0
    for (const it of s.items ?? []) {
      if (it.defId !== 'curtains') continue
      s.updateItemProps(it.id, { drawAmount: closed ? 1 : 0 })
      n++
    }
    const plan = s.floorPlan
    const re = new RegExp(win, 'i')
    const wins = (plan?.openings ?? []).filter((o) => o.kind === 'window')
    const op = wins.find((o) => re.test(o.id ?? '')) ?? wins[0]
    const w = (plan?.walls ?? []).find((x) => x.id === op?.wallId)
    if (!op || !w) return { curtains: n, pose: null }
    const [x0, z0] = w.start
    const [x1, z1] = w.end
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ux = (x1 - x0) / len
    const uz = (z1 - z0) / len
    const tt = op.offset + op.width / 2
    const cx = x0 + ux * tt
    const cz = z0 + uz * tt
    const inside = (px, pz) =>
      (plan?.rooms ?? []).some(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      )
    let nx = -uz
    let nz = ux
    if (!inside(cx + nx * 1.2, cz + nz * 1.2)) {
      nx = -nx
      nz = -nz
    }
    const px = cx + nx * standoff
    const pz = cz + nz * standoff
    return {
      curtains: n,
      pose: {
        px,
        pz,
        yaw: Math.atan2(-(cx - px), -(cz - pz)),
        cx,
        cz,
        ux,
        uz,
        id: op.id,
        halfWidth: op.width / 2,
      },
    }
  },
  { h: HOUR, t: TIER, photo: PHOTO, closed: CLOSED, win: WINDOW, standoff: STANDOFF },
)
if (!setup.pose) throw new Error('no window opening in the loaded plan')

await page.evaluate(async (q) => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(q.px, q.pz, q.yaw)
  window.__walkLook?.setPitch(0)
}, setup.pose)
await new Promise((r) => setTimeout(r, 3000))
await assertSceneAlive(page, 'curtain-glow')

let hits = []
for (let attempt = 1; attempt <= 4; attempt++) {
  hits = await page.evaluate(
    ({ g, pose, slab }) => {
      const { scene, camera } = window.__three
      const rc = new window.__three.raycaster.constructor()
      const solid = (o) =>
        o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
      const out = []
      for (let j = 0; j < g; j++) {
        for (let i = 0; i < g; i++) {
          const x = (i + 0.5) / g
          const y = (j + 0.5) / g
          rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
          const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          if (!h) continue
          // Distance from the window's own plane, along its normal...
          const d = Math.abs((h.point.x - pose.cx) * -pose.uz + (h.point.z - pose.cz) * pose.ux)
          // ...AND along the wall, because the wall BESIDE a window sits in the
          // same plane. Depth alone counted that wall as curtain and dragged the
          // mean down wherever the covering is narrower than the wall — measured
          // (`.201`), it cost the bedrooms ~0.25 of ratio against living/dining,
          // which reads as a parity gap that is not there.
          const along = Math.abs((h.point.x - pose.cx) * pose.ux + (h.point.z - pose.cz) * pose.uz)
          out.push({
            x,
            y,
            inPlane: d <= slab && along <= pose.halfWidth * 1.15 && h.point.y > 0.5,
          })
        }
      }
      return out
    },
    { g: GRID, pose: setup.pose, slab: SLAB_M },
  )
  if (hits.length >= 50) break
  await new Promise((r) => setTimeout(r, 1500))
}

const shot = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/frame.png`, shot)
const sharp = (await import('sharp')).default
const img = sharp(shot)
const meta = await img.metadata()
const raw = await img.raw().toBuffer()
const ch = raw.length / (meta.width * meta.height)

const inPlane = []
const all = []
/** Everything that is NOT the window plane — the room the curtain is judged
 *  against. `plane/frame` is POSE-DEPENDENT: the reference curtains cover only
 *  2-8 % of their frames while this probe's fills ~35 %, so a brighter curtain
 *  inflates the very mean it is divided by and the ratio saturates. Comparing
 *  against the room instead removes that (`.200`). */
const room = []
for (const h of hits) {
  if (inHud(h.x, h.y)) continue
  const px = Math.min(meta.width - 1, Math.floor(h.x * meta.width))
  const py = Math.min(meta.height - 1, Math.floor(h.y * meta.height))
  const o = (py * meta.width + px) * ch
  const l = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2]
  all.push(l)
  if (h.inPlane) inPlane.push(l)
  else room.push(l)
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN)
const mw = mean(inPlane)
const mf = mean(all)
const mr = mean(room)

console.log(
  'curtain-glow ',
  JSON.stringify({
    tier: TIER,
    hour: HOUR,
    photographicLook: PHOTO,
    curtainsDrawn: CLOSED,
    curtainItems: setup.curtains,
    window: setup.pose.id,
  }),
)
console.log(`frame -> ${OUT}/frame.png`)
console.log('')
console.log(`window-plane samples ${inPlane.length} of ${all.length}`)
console.log(
  `  window plane = ${mw.toFixed(1)}   frame = ${mf.toFixed(1)}   plane/frame = ${(mw / mf).toFixed(2)}`,
)
console.log(
  `  room (excl. plane) = ${mr.toFixed(1)}   plane/ROOM = ${(mw / mr).toFixed(2)}   <- the pose-robust one`,
)
console.log('')
console.log('reference photographs, curtain over daylight:')
console.log('  plane/ROOM  1.32 (photo A) .. 1.48 (photo D)   <- compare THIS')
console.log('  plane/frame 1.32 .. 1.42 — only comparable at their 2-8 % coverage')
console.log('  a drawn curtain at or below 1.0 is being lit as an opaque sheet.')
if (setup.curtains === 0) console.log('  WARNING: no curtain items found — nothing was drawn.')
if (inPlane.length < 30) console.log('  WARNING: too few window-plane samples; check the pose.')
await browser.close()
