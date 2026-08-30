/**
 * SHADOW-ATTRIB — which light is lifting the blacks?
 *
 * v0.31.5.134 measured the app at its MAXIMUM tier against two real interior
 * photographs. Midtones and highlights already match (p50 179 against the
 * photographs' 155/189; p95 220 against 205/215) but the shadows do not: both
 * photographs put **11–12% of pixels below luma 64**, the app **1.4%**. The app
 * is not failing at exposure, it is failing to be dark anywhere — a legible
 * "this is CG" cue.
 *
 * Four things could be doing the lifting and they have never been separated:
 *   1. the fixtures, which `ensureDaylightFirstPaint` switches ON at EVERY hour
 *      on a fresh seed (DEFAULT-GLOOM, v0.31.5.86 — itself a measured, signed-off
 *      decision worth 2.3–2.5x in the daytime walk view),
 *   2. the analytical ambient + hemisphere fill, deliberately sized so "nothing
 *      crushes to black" (`Lighting.tsx`'s own comment),
 *   3. the IBL probe (`SceneEnvironment.tsx`),
 *   4. AgX, which lifts near-black by design (TONE-CURVE-CHOICE).
 *
 * Knocking each out in its own `walk-tour` run would be four boots and four
 * scene builds. Instead this holds ONE session at ONE pose and mutates only the
 * store between shots, so every arm differs from the baseline in exactly one
 * variable (meta-rule xvi) and nothing about the geometry, camera or hour moves.
 *
 * It reports each arm's RESOLVED state (meta-rule iv) so an arm that silently
 * failed to apply is visible rather than being read as "no effect".
 *
 * ARMS=a,b,c to run a subset. Offline, measure `%<64` per frame — that is the
 * number the photographs beat us on.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'maximum'
const ROOM = process.env.ROOM || 'livingDining'
const OUT = process.env.OUT || '/tmp/shadow-attrib'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
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
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

// Same pose `walk-tour` uses: the room-editor shell centre, eye height, yaw 0,
// pitch −0.05 — so these frames are directly comparable to `/tmp/tw31`.
const pose = await page.evaluate(async (roomId) => {
  const { getRoomEditorShell } = await import('/src/scene/roomEditorShell.ts')
  const plan = window.__store.getState().floorPlan
  const shell = getRoomEditorShell(plan, roomId)?.shell
  if (!shell?.center) return null
  return { x: shell.center[0], z: shell.center[1] }
}, ROOM)
if (!pose) throw new Error(`no room shell for ${ROOM}`)
await page.evaluate(async (q) => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(q.x, q.z, 0)
  window.__walkLook?.setPitch(-0.05)
}, pose)
await new Promise((r) => setTimeout(r, 2500))

const ARMS = [
  { id: 'a-baseline', apply: () => {} },
  { id: 'b-lamps-off', apply: (st) => st.setLightsMode('off') },
  { id: 'c-ibl-off', apply: (st) => st.setQualityOverride('ibl', false) },
  { id: 'd-tone-linear', apply: (st) => st.setToneMapping('none') },
  {
    id: 'e-lamps-and-ibl-off',
    apply: (st) => {
      st.setLightsMode('off')
      st.setQualityOverride('ibl', false)
    },
  },
]
const only = (process.env.ARMS || '').split(',').filter(Boolean)

console.log(
  `shadow-attrib  tier=${TIER} hour=${HOUR} room=${ROOM} pose=${pose.x.toFixed(2)},${pose.z.toFixed(2)}\n`,
)
for (const arm of ARMS) {
  if (only.length && !only.some((k) => arm.id.startsWith(k))) continue
  // Reset to the baseline before every arm so arms cannot accumulate.
  await page.evaluate(() => {
    const st = window.__store.getState()
    st.setLightsMode('on')
    st.resetQualityOverrides()
    st.setToneMapping('agx')
  })
  await new Promise((r) => setTimeout(r, 1500))
  await page.evaluate((id) => {
    const st = window.__store.getState()
    const table = {
      'a-baseline': () => {},
      'b-lamps-off': () => st.setLightsMode('off'),
      'c-ibl-off': () => st.setQualityOverride('ibl', false),
      'd-tone-linear': () => st.setToneMapping('none'),
      'e-lamps-and-ibl-off': () => {
        st.setLightsMode('off')
        st.setQualityOverride('ibl', false)
      },
    }
    table[id]?.()
  }, arm.id)
  await new Promise((r) => setTimeout(r, 2500))
  const resolved = await page.evaluate(() => {
    const st = window.__store.getState()
    return {
      tier: st.qualityTier,
      lights: st.lightsMode,
      tone: st.toneMapping,
      iblOverride: st.qualityOverrides?.ibl ?? '(unset)',
      hour: st.manualHour,
    }
  })
  fs.writeFileSync(`${OUT}/${arm.id}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  ${arm.id.padEnd(22)} ${JSON.stringify(resolved)}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
