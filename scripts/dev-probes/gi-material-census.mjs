/**
 * Census of every GI-INJECTED material: its per-map gain, and the terms that could attenuate it.
 *
 * Built while eliminating candidates for the uniform ~0.73x by which the app's measured GI term
 * falls short of `texel * visGain * albedo / pi` (`v0.31.7.215`). Two of those candidates are
 * material properties, and both are answered here rather than argued:
 *
 *  - **`aoMap`**: three's `aomap_fragment` does `reflectedLight.indirectDiffuse *= ambientOcclusion`
 *    and sits AFTER the injection point, so an `aoMap` on an injected material would scale the term
 *    down invisibly. Measured: **0 of 107** injected materials carry one, so the chunk compiles out.
 *  - **the per-map gain spread**: 107 injected materials carry **89 distinct `visGain` values from
 *    0.0283 to 51.5 — a 1821x range**. That looks alarming and is NOT a defect: `visGain` is
 *    `scaleFor(map) * IRRADIANCE_GAIN`, and each map is normalised to its own maximum, so the
 *    absolute irradiance `texel * scale` comes back consistent (0.4142 / 0.4061 / 0.4473 at the
 *    three surfaces of `.215`). The spread is the normalisation working. Recorded here precisely
 *    so the number cannot launch another wrong hypothesis.
 *
 * NOTE the tier: GI attaches on `realistic` ONLY, so this sets that tier explicitly. A run at
 * `performance` finds zero injected materials, and a first attempt to read the injection's debug
 * visualiser there came back looking like ordinary renders for exactly that reason.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const p = await b.newPage()
await p.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await p.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await p.waitForFunction(() => !!window.__store, { timeout: 60000 })
await p.evaluate(() => window.__store.getState().setQualityTier('realistic'))
await p
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 14000))
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const out = []
      window.__three.scene.traverse((o) => {
        const m = Array.isArray(o.material) ? o.material[0] : o.material
        if (!m?.customProgramCacheKey) return
        const k = m.customProgramCacheKey()
        if (!String(k).startsWith('visGain')) return
        out.push({
          key: k,
          aoMap: !!m.aoMap,
          aoInt: m.aoMapIntensity,
          lightMap: !!m.lightMap,
          envInt: m.envMapIntensity,
          color: [m.color.r, m.color.g, m.color.b].map((v) => +v.toFixed(3)),
          map: !!m.map,
          rough: m.roughness,
          metal: m.metalness,
        })
      })
      const byGain = new Map()
      for (const r of out) {
        const g = Number(String(r.key).slice(7))
        byGain.set(g, (byGain.get(g) ?? 0) + 1)
      }
      const gains = [...byGain].sort((a, b) => a[0] - b[0])
      return {
        total: out.length,
        anyAoMap: out.some((r) => r.aoMap),
        distinct: gains.length,
        gains: gains.map(([g, n]) => `${g.toFixed(4)} x${n}`),
      }
    }),
    null,
    1,
  ),
)
await b.close()
