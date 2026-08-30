/**
 * BOUNCE-CENSUS — is the bounce term actually in the scene?
 *
 * A term that never mounts and a term that mounts and does nothing produce the
 * SAME near-null in `light-distribution.mjs`. This separates them by censusing
 * the live scene graph for RectAreaLights and reporting their count, intensity,
 * size and world position, alongside the state that gates them.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
const PHOTO = process.env.PHOTO !== '0'

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

await page.evaluate(
  ({ h, t, photo }) => {
    const s = window.__store.getState()
    s.setQualityTier(t)
    s.setTimeMode?.('manual')
    s.setManualHour?.(h)
    s.setCameraMode?.('firstPerson')
    s.setPhotographicLook?.(photo)
  },
  { h: HOUR, t: TIER, photo: PHOTO },
)
await new Promise((r) => setTimeout(r, 2500))

const report = await page.evaluate(() => {
  /** World position of a light's target, or null if it has none. */
  function targetWorldPos(light) {
    if (!light.target) return null
    light.target.updateWorldMatrix(true, false)
    const e = light.target.matrixWorld.elements
    return [+e[12].toFixed(2), +e[13].toFixed(2), +e[14].toFixed(2)]
  }

  const s = window.__store.getState()
  const out = {
    state: {
      photographicLook: s.photographicLook,
      qualityTier: s.qualityTier,
      uiMode: s.uiMode,
      hasFloorPlan: !!s.floorPlan,
      rooms: s.floorPlan?.rooms?.length ?? 0,
      walls: s.floorPlan?.walls?.length ?? 0,
      windows: (s.floorPlan?.openings ?? []).filter((o) => o.kind === 'window').length,
    },
    rectAreaLights: [],
  }
  const scene = window.__three?.scene
  if (!scene) return { ...out, error: 'no window.__three.scene' }
  scene.traverse((o) => {
    if (o.isRectAreaLight || o.isSpotLight) {
      o.updateWorldMatrix(true, false)
      const m = o.matrixWorld.elements
      const p = { x: m[12], y: m[13], z: m[14] }
      out.rectAreaLights.push({
        kind: o.isSpotLight ? 'spot' : 'rect',
        intensity: +o.intensity.toFixed(3),
        angle: o.angle ? +o.angle.toFixed(2) : null,
        distance: o.distance ?? null,
        targetPos: targetWorldPos(o),
        inScene: o.target ? !!o.target.parent : null,
        color: `#${o.color.getHexString()}`,
        pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        visible: o.visible,
      })
    }
  })
  return out
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
