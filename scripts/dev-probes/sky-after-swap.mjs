/**
 * SKY-AFTER-SWAP — why is the view out of a window dark in a template plan?
 *
 * WINDOW-SKY-DARK (item (k), v0.31.5.123) measured a window pane at 13:00 reading
 * p50 **48** in `tpl-condo-4bed` against **136** in the BOOT flat, at the same hour,
 * tier, camera height and view direction, while the pure `skyRadiance` model holds
 * byte ~187 for that band.
 *
 * The first hypothesis — that `replaceFloorPlan` loses `scene.background`, since
 * `SceneBackdrop.tsx`'s `SkyBackdrop` writes it from an effect and restores the prior
 * value on unmount — is **REFUTED**: the texture survives a swap with a byte-identical
 * uuid (v0.31.5.124). Recorded so nobody re-runs it.
 *
 * So this probe does the attribution that actually discriminates. For the SAME camera
 * forward direction it prints, side by side:
 *   · the byte the baked equirect texture holds for that direction, sampled straight out
 *     of `scene.background.image` through a 2D context, and
 *   · the byte the framebuffer shows at the screen centre.
 * Texture bright + screen dark is a RENDER loss (the glass, or the background tone-mapping
 * path). Texture dark is a BAKE problem. No elevation arithmetic or direction guessing in
 * between — the camera reports its own forward vector and the same vector indexes the map.
 *
 * `PLAN=` empty skips the swap, so the identical code path measures the boot flat as the
 * control arm. `FURNISH=1` and `LIGHTS=on|off` reproduce a `walk-tour` state.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
/** Empty = do NOT swap; measure the boot flat through the identical code path. */
const PLAN = process.env.PLAN ?? 'tpl-condo-4bed'
/** Comma-separated: visited IN ORDER, one frame each — a `walk-tour` order replay. */
const ROOMS = (process.env.ROOM || 'c4-master').split(',')
const FURNISH = process.env.FURNISH === '1'
const LIGHTS = process.env.LIGHTS || ''
const YAW = process.env.YAW === undefined ? 0 : Number(process.env.YAW)
const OUT = process.env.OUT || '/tmp/sky-swap'
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
// `TIER=auto` SKIPS the setter and leaves the capability-detected tier, exactly as
// `walk-tour.mjs:128` does. Both resolve to the name `medium`, but they are not the
// same render state: under `auto` the window pane reads 132 in the FIRST room toured
// and ~49 in every later one, while an explicit `medium` reads 132 everywhere.
if (TIER !== 'auto') await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
if (LIGHTS) await page.evaluate((m) => window.__store.getState().setLightsMode(m), LIGHTS)
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

/**
 * The equirect byte the background holds for the camera's own forward direction,
 * beside the byte the framebuffer shows at the screen centre.
 *
 * The forward vector is read off `camera.matrixWorld` (its −Z axis) rather than
 * constructed, so the probe needs no three import. The direction → pixel mapping is
 * the exact inverse of `skyGradient.ts:equirectDir` (`phi = atan2(x, −z)`,
 * `theta = acos(y)`); keep the two in step if that convention ever changes.
 */
const sample = () =>
  page.evaluate(() => {
    const three = window.__three
    const b = three?.scene?.background
    const cam = three?.camera
    if (!b?.image || !cam) return null
    cam.updateMatrixWorld?.()
    const m = cam.matrixWorld.elements
    let [fx, fy, fz] = [-m[8], -m[9], -m[10]]
    const len = Math.hypot(fx, fy, fz) || 1
    fx /= len
    fy /= len
    fz /= len
    const img = b.image
    const w = img.width
    const h = img.height
    const theta = Math.acos(Math.max(-1, Math.min(1, fy)))
    const phi = Math.atan2(fx, -fz)
    const col = Math.min(
      w - 1,
      Math.max(0, Math.round(((phi + Math.PI) / (2 * Math.PI)) * w - 0.5)),
    )
    const row = Math.min(h - 1, Math.max(0, Math.round((theta / Math.PI) * h - 0.5)))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    // Average an 8x8 patch so a single noisy texel can't stand for the direction.
    const d = ctx.getImageData(Math.max(0, col - 4), Math.max(0, row - 4), 8, 8).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    return {
      forward: [fx.toFixed(3), fy.toFixed(3), fz.toFixed(3)].join(','),
      texel: `${col},${row}`,
      textureLuma: +(s / (d.length / 4)).toFixed(1),
    }
  })

/**
 * Every TRANSPARENT material in the scene, deduped by its state, with counts.
 *
 * Two earlier attempts failed and are recorded so they are not repeated: matching meshes
 * by `/glass|window|pane/i` returned ZERO (the panes carry no such name, so that zero was a
 * broken instrument, not a result), and `await import('three')` inside the page throws
 * `Failed to resolve module specifier 'three'` — a bare specifier is not resolvable there,
 * so a Raycaster cannot be constructed this way.
 *
 * A dedup over transparent materials needs neither. The window panes are the transparent
 * meshes in a plan shell, and comparing the SET across two arms is what the bisect needs —
 * identifying which individual mesh is the pane is not.
 *
 * Also reports `getFixtureGlow()` — the module singleton (`scene/lighting/fixtureGlow.ts`)
 * `FadeWindow` uses to lerp the pane between `GLASS_DAY` and `GLASS_NIGHT` and to set
 * `base = 0.28 + glow * 0.45` on the cheap tiers. MEASURED v0.31.5.125: **1 in BOTH the auto
 * and the explicit-tier arm**, so it does NOT separate them. Kept as a recorded negative.
 */
const glass = () =>
  page.evaluate(async () => {
    const { getFixtureGlow } = await import('/src/scene/lighting/fixtureGlow.ts')
    const seen = new Map()
    window.__three?.scene?.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        if (!m.transparent) continue
        const key = [
          m.type,
          m.color?.getHexString?.() ?? '-',
          Number(m.opacity).toFixed(2),
          m.transmission === undefined ? '-' : Number(m.transmission).toFixed(2),
          m.emissiveIntensity === undefined ? '-' : Number(m.emissiveIntensity).toFixed(2),
          m.depthWrite,
        ].join('|')
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
    })
    return {
      fixtureGlow: +getFixtureGlow().toFixed(3),
      transparentMaterials: [...seen.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, n]) => `${n}x ${k}`),
    }
  })

const bg = () =>
  page.evaluate(() => {
    const b = window.__three?.scene?.background
    if (!b) return { background: b === null ? 'null' : String(b) }
    const img = b.image
    return {
      uuid: b.uuid?.slice(0, 8),
      size: img ? `${img.width}x${img.height}` : 'no-image',
      colorSpace: b.colorSpace,
    }
  })

const shot = async (tag) => {
  fs.writeFileSync(`${OUT}/${tag}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `  ${tag} — bg=${JSON.stringify(await bg())} sample=${JSON.stringify(await sample())}`,
  )
  console.log(`      glass=${JSON.stringify(await glass())}`)
}

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return {
    tier: st.qualityTier,
    lightsMode: st.lightsMode,
    timeMode: st.timeMode,
    manualHour: st.manualHour,
    backdrop: st.backdrop,
    cameraMode: st.cameraMode,
    uiMode: st.uiMode,
  }
})
console.log(
  `plan=${PLAN || '(boot flat, no swap)'} rooms=${ROOMS.join(' -> ')} yaw=${YAW} furnish=${FURNISH}`,
)
console.log(`resolved=${JSON.stringify(resolved)}\n`)

if (PLAN) {
  const swapped = await page.evaluate(
    async (q) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === q.id)
      if (!tpl) return null
      window.__store
        .getState()
        .replaceFloorPlan(structuredClone(tpl), { furniture: q.furnish ? 'clear' : 'rehome' })
      return tpl.name
    },
    { id: PLAN, furnish: FURNISH },
  )
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 3000))
  if (FURNISH) {
    await page.evaluate(async () => {
      const st = window.__store.getState()
      const { furnishPlanItems } = await import('/src/furniture/furnishPlan.ts')
      const { LAYOUT_PRESETS } = await import('/src/furniture/layoutPresets.ts')
      const { BUILTIN_CATALOG } = await import('/src/furniture/builtinCatalog.ts')
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'move-in')
      st.setItems(furnishPlanItems(st.floorPlan, preset, BUILTIN_CATALOG, {}))
    })
    await new Promise((r) => setTimeout(r, 3000))
  }
  console.log(`swapped -> ${swapped}`)
}

// `walk-tour` aims every frame with `__walkLook.setPitch(-0.05)`; measured here as a
// single variable and found INNOCENT (pane 132 -> 131), so it is applied throughout to
// match the tour rather than left as an arm.
//
// The remaining difference is ORDER: walk-tour's first room reads bright (117) and every
// later one dark (39). Visiting the rooms in sequence reproduces that, or does not.
console.log('\ntexture byte vs screen, same forward direction:')
for (let i = 0; i < ROOMS.length; i++) {
  const room = ROOMS[i]
  const pose = await page.evaluate(
    (q) => {
      const r = (window.__store.getState().floorPlan.rooms ?? []).find((x) => x.id === q.room)
      if (!r) return null
      return { pos: [r.origin[0] + r.width / 2, 1.6, r.origin[1] + r.depth / 2], yaw: q.yaw }
    },
    { room, yaw: YAW },
  )
  if (!pose) throw new Error(`room not found: ${room}`)
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
    window.__walkLook?.setPitch(-0.05)
  }, pose)
  await new Promise((r) => setTimeout(r, 2500))
  await shot(`${String(i + 1).padStart(2, '0')}-${room}`)
}

console.log(`\nframes -> ${OUT}`)
await browser.close()
