/**
 * DRAPE-CHECK — is the drapery translucency patch actually compiled, per tier?
 *
 * `.214` measured the curtain term at 1.03 on `performance` against 1.38-1.49 on
 * every other tier, and showed the missing env map is NOT the cause (an
 * unconditional hemisphere term moved medium 1.38 -> 1.55 and left performance
 * at 1.03 exactly). So the question is whether the patched shader runs there at
 * all. This answers it from the renderer rather than from the image: it counts
 * the drapery materials in the live scene and looks for a compiled PROGRAM whose
 * cache key carries the patch's marker (`renderer.info.programs[].cacheKey`).
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIER = process.env.TIER || 'medium'
const HOUR = Number(process.env.HOUR || 13)

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
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
await page.evaluate(
  ({ t, h }) => {
    const s = window.__store.getState()
    s.setQualityTier(t)
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setCameraMode('firstPerson')
    s.setPhotographicLook?.(true)
    // Draw the curtains so the drapery material is definitely rendering.
    for (const it of s.items ?? [])
      if (it.defId === 'curtains') s.updateItemProps(it.id, { drawAmount: 1 })
  },
  { t: TIER, h: HOUR },
)
await new Promise((r) => setTimeout(r, 5000))

const report = await page.evaluate(async () => {
  // The curtain attenuation the FILL actually receives (KEY-FILL-BALANCE).
  const wls = await import('/src/scene/lighting/windowLightSignal.ts')
  const look = await import('/src/scene/look.ts')
  const { scene, gl } = window.__three
  const drape = []
  const seen = new Set()
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      if (seen.has(m.uuid)) continue
      seen.add(m.uuid)
      let key = null
      try {
        key = typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : null
      } catch {}
      if (key?.startsWith('drape-translucency')) {
        drape.push({
          type: m.type,
          key,
          hasHook: typeof m.onBeforeCompile === 'function',
          visible: o.visible,
          envMap: !!m.envMap,
        })
      }
    }
  })
  // What is actually lighting the room, per tier.
  const lights = { hemisphere: [], ambient: [], directional: [], point: 0, pointTotal: 0 }
  scene.traverse((o) => {
    if (o.isHemisphereLight)
      lights.hemisphere.push({
        intensity: +o.intensity.toFixed(3),
        sky: `#${o.color.getHexString()}`,
        ground: `#${o.groundColor.getHexString()}`,
      })
    else if (o.isAmbientLight) lights.ambient.push({ intensity: +o.intensity.toFixed(3) })
    else if (o.isDirectionalLight)
      lights.directional.push({ intensity: +o.intensity.toFixed(3), castShadow: o.castShadow })
    else if (o.isPointLight && o.intensity > 0) {
      lights.point++
      lights.pointTotal += o.intensity
    }
  })
  lights.pointTotal = +lights.pointTotal.toFixed(2)
  const programs = (gl.info?.programs ?? []).map((p) => p.cacheKey ?? '')
  return {
    tier: window.__store.getState().qualityTier,
    exposure: +gl.toneMappingExposure.toFixed(3),
    lights,
    windowAttenuation: +wls.getWindowAttenuation().toFixed(3),
    fillAttenuation: +look.windowFillAttenuation(wls.getWindowAttenuation()).toFixed(3),
    sceneEnvironment: !!scene.environment,
    drapeMaterials: drape.length,
    sample: drape[0] ?? null,
    programCount: programs.length,
    // A program compiled FROM the patched material carries the marker.
    drapePrograms: programs.filter((k) => k.includes('drape-translucency')).length,
    envmapPrograms: programs.filter((k) => k.includes('ENVMAP')).length,
  }
})

console.log(`drape-check  ${JSON.stringify(report, null, 2)}`)
await browser.close()
