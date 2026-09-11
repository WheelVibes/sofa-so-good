/**
 * LOOK-OPTIONS — render a look parameter at several values so the choice can be made BY EYE.
 *
 * **Why this exists.** `v0.34.1.19` shipped a scene-saturation default chosen because it matched a
 * photographic reference median to 0.0013, with every supporting metric unaffected — and it was
 * reverted on sight as oversaturated. Matching a corpus median on a scalar is not a perceptual
 * match, and *describing* the options in prose ("0.0741 against a target of 0.1836") does not let
 * anyone judge that. A rendered strip does.
 *
 * So: for a look decision, render every candidate at a fixed pose, label them, and show the strip.
 * Do not ask which number sounds right.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/look-options.mjs \
 *     --key sceneSaturation --values 1,1.15,1.3,1.45 --out /tmp/look-options
 *
 * `--key` is any store key with a matching `set<Key>` action (it falls back to `setState`).
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

/** Poses to render each value at. Two, so a choice is not made on one room's palette. */
export const OPTION_POSES = [
  { name: 'living', p: [10.9, 5.2, 0, -0.02] },
  { name: 'bedroom', p: [5.2, 3.6, 0, -0.05] },
]

const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = arg('--key', 'sceneSaturation')
  const values = arg('--values', '1,1.15,1.3,1.45').split(',').map(Number)
  const out = arg('--out', '/tmp/look-options')
  const tier = arg('--tier', 'realistic')
  fs.mkdirSync(out, { recursive: true })
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => {
    throw e
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.evaluate((t) => {
    const s = window.__store.getState()
    s.endTour?.()
    s.setOnboardingOpen?.(false)
    s.dismissLocationPrompt?.()
    s.dismissChecklist?.()
    s.setManualHour?.(13)
    s.setTimeMode?.('manual')
    s.setQualityTier?.(t)
    s.hideLoading?.()
    s.setFeatureFlag?.('interactiveDegrade', false)
    s.setWalkFov?.(50)
  }, tier)
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await new Promise((r) => setTimeout(r, 7000))
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20000,
  })
  await new Promise((r) => setTimeout(r, 4500))
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.hideLoading?.()
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(50)
  })

  for (const v of values) {
    const live = await page.evaluate(
      ({ k, val }) => {
        const s = window.__store.getState()
        const setter = `set${k[0].toUpperCase()}${k.slice(1)}`
        if (typeof s[setter] === 'function') s[setter](val)
        else window.__store.setState({ [k]: val })
        return window.__store.getState()[k]
      },
      { k: key, val: v },
    )
    // Report the LIVE value: a clamp or a rejected setter would otherwise render a duplicate frame
    // and the strip would silently show the same picture twice.
    if (Math.abs(live - v) > 1e-6) console.log(`  ** ${key} ${v} resolved to ${live} **`)
    await new Promise((r) => setTimeout(r, 1600))
    for (const { name, p } of OPTION_POSES) {
      await page.evaluate((q) => {
        const l = window.__walkLook
        l.setPosition(q[0], q[1])
        l.setYaw(q[2])
        l.setPitch(q[3])
      }, p)
      await new Promise((r) => setTimeout(r, 1500))
      await assertSceneAlive(page, `${key}=${v}`)
      await page.screenshot({ path: path.join(out, `${name}__${v}.png`) })
    }
    console.log(`rendered ${key} = ${live}`)
  }
  await browser.close()

  // Contact strip: one row per pose, one column per value, each labelled with the value it IS.
  const W = 560
  const H = 350
  for (const { name } of OPTION_POSES) {
    const comp = []
    for (let i = 0; i < values.length; i++) {
      const label = `${key} = ${values[i]}${values[i] === 1 ? '  (current)' : ''}`
      const img = await sharp(path.join(out, `${name}__${values[i]}.png`))
        .resize(W, H, { fit: 'cover' })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${W}" height="26"><rect width="${W}" height="26" fill="#000" fill-opacity="0.72"/><text x="8" y="18" fill="#fff" font-size="15" font-family="monospace">${label}</text></svg>`,
            ),
            top: 0,
            left: 0,
          },
        ])
        .toBuffer()
      comp.push({ input: img, left: i * W, top: 0 })
    }
    await sharp({
      create: {
        width: values.length * W,
        height: H,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    })
      .composite(comp)
      .toFile(path.join(out, `strip-${name}.png`))
  }
  console.log(
    `\nstrips: ${out}/strip-${OPTION_POSES.map((p) => p.name).join('.png, ' + out + '/strip-')}.png`,
  )
}
