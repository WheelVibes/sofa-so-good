/**
 * HQ-LENS — does the "Lens focal length" dropdown actually change the HQ still?
 *
 * The lens was only read inside `hqRenderSession`'s `fStop > 0` branch, so at the
 * default "DoF off" aperture — which is what the modal ships with — picking
 * "24 mm · wide" or "85 mm · portrait" rendered the live viewport framing and the
 * control did nothing. Unit tests can pin the pure FOV choice, but only a rendered
 * pair proves the session honours it.
 *
 * Renders the SAME pose twice with DoF OFF, once per focal length, writes both
 * PNGs and reports the mean absolute pixel difference between them. Before the
 * fix the two frames are byte-identical (diff 0); after it they differ a lot.
 *
 * STATUS (2026-08-31, v0.31.5.144): this probe cannot currently answer the question
 * in this sandbox — BOTH arms time out waiting for samples. It is not this change:
 * `hq-still.mjs` (SAMPLES=4, MODES=agx) times out identically on the same machine,
 * i.e. the `three-gpu-pathtracer` megakernel does not run under headless
 * ANGLE/metal here, which is the documented failure `hq-still.mjs`'s own header
 * describes. Keep the probe — it is the right check to run on a machine where the
 * tracer compiles, or from Claude-in-Chrome against a real GPU.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/hq-lens'
const SAMPLES = Number(process.env.SAMPLES || 8)
const FSTOP = Number(process.env.FSTOP || 0)
const LENSES = (process.env.LENSES || '24,85').split(',').map(Number)
const W = Number(process.env.W || 480)
const H = Number(process.env.H || 300)
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((hour) => {
  const s = window.__store.getState()
  s.setTimeMode?.('manual')
  s.setManualHour?.(hour)
  s.setQualityTier?.('maximum')
}, HOUR)
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const out = await page.evaluate(
  async ({ samples, lenses, fStop, w, h }) => {
    const [{ getHqRenderSource }, { createHqRenderSession }] = await Promise.all([
      import('/src/scene/pathtrace/hqRenderSource.ts'),
      import('/src/scene/pathtrace/hqRenderSession.ts'),
    ])
    const src = getHqRenderSource()
    if (!src) return { error: 'no HQ render source (is the 3D view mounted?)' }
    const liveFov = src.camera?.fov ?? null
    const results = []
    for (const mm of lenses) {
      const r = await new Promise((resolve) => {
        let session = null
        const finish = (payload) => {
          try {
            session?.dispose()
          } catch {}
          resolve(payload)
        }
        createHqRenderSession(src.scene, src.camera, {
          width: w,
          height: h,
          maxSamples: samples,
          denoise: false,
          focalLengthMm: mm,
          fStop: fStop > 0 ? fStop : undefined,
          exposure: src.gl.toneMappingExposure,
          onDone: () => {
            const c = session.canvas
            const g = document.createElement('canvas')
            g.width = c.width
            g.height = c.height
            g.getContext('2d').drawImage(c, 0, 0)
            finish({ mm, png: g.toDataURL('image/png'), samples: session.samples })
          },
          onError: (err) => finish({ mm, error: String(err?.message ?? err) }),
        })
          .then((s) => {
            session = s
          })
          .catch((err) => finish({ mm, error: String(err?.message ?? err) }))
        setTimeout(() => finish({ mm, error: 'timed out waiting for samples' }), 180000)
      })
      results.push(r)
    }
    return { liveFov, results }
  },
  { samples: SAMPLES, lenses: LENSES, fStop: FSTOP, w: W, h: H },
)

console.log(`HQ lens sweep — ${SAMPLES} samples, ${W}x${H}, f-stop ${FSTOP || 'off'}\n`)
if (out.error) {
  console.log(`FAILED: ${out.error}`)
} else {
  console.log(`live viewport fov = ${out.liveFov}deg`)
  const raws = []
  for (const r of out.results) {
    if (r.error) {
      console.log(`${r.mm}mm ERROR: ${r.error}`)
      raws.push(null)
      continue
    }
    const buf = Buffer.from(r.png.split(',')[1], 'base64')
    const file = `${OUT}/lens-${r.mm}mm.png`
    fs.writeFileSync(file, buf)
    const raw = await sharp(buf).removeAlpha().greyscale().raw().toBuffer()
    raws.push(raw)
    let sum = 0
    for (const v of raw) sum += v
    console.log(`${String(r.mm).padStart(3)}mm  mean=${(sum / raw.length).toFixed(1)}  -> ${file}`)
  }
  for (let i = 1; i < raws.length; i++) {
    const a = raws[i - 1]
    const b = raws[i]
    if (!a || !b || a.length !== b.length) continue
    let d = 0
    let changed = 0
    for (let k = 0; k < a.length; k++) {
      const diff = Math.abs(a[k] - b[k])
      d += diff
      if (diff > 2) changed++
    }
    console.log(
      `\n${out.results[i - 1].mm}mm vs ${out.results[i].mm}mm: mean|diff| = ${(d / a.length).toFixed(2)} ` +
        `| pixels differing by >2 = ${((changed / a.length) * 100).toFixed(1)}%`,
    )
    console.log('(0.00 / 0.0% = the lens dropdown did nothing)')
  }
}
await browser.close()
