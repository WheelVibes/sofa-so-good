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
      // WHAT IS NOT MAPPED, and why. 28 % coverage bounds what this feature can be worth
      // (`v0.31.7.224`: a 30 % change to the baked term moved the whole-frame mean ~1 %), so the
      // question "is coverage a lever or a structural ceiling" decides whether it is worth chasing.
      // Classify every visible mesh: shell geometry versus a tagged furniture item, mapped or not.
      const cls = { shellMapped: 0, shellUnmapped: 0, itemMapped: 0, itemUnmapped: 0 }
      const unmappedItems = new Map()
      const unmappedShell = []
      const bigUnmapped = []
      window.__three.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return
        let p = o.parent
        while (p) {
          if (p.visible === false) return
          p = p.parent
        }
        const m = Array.isArray(o.material) ? o.material[0] : o.material
        if (!m) return
        const mapped = !!m.userData?.visMapUrl
        let itemId = null
        let q = o
        while (q && !itemId) {
          itemId = q.userData?.itemId ?? null
          q = q.parent
        }
        if (itemId) {
          cls[mapped ? 'itemMapped' : 'itemUnmapped'] += 1
          if (!mapped) {
            const it = window.__store.getState().items.find((i) => i.id === itemId)
            const k = it?.defId ?? '(unknown)'
            unmappedItems.set(k, (unmappedItems.get(k) ?? 0) + 1)
          }
        } else {
          cls[mapped ? 'shellMapped' : 'shellUnmapped'] += 1
          if (!mapped) {
            // Bucket by MATERIAL TYPE and FOOTPRINT. The injection is written against
            // MeshStandardMaterial's lighting chunks, so a Basic or Lambert mesh cannot carry it
            // at all — a structural exclusion, not a coverage gap. Footprint separates real
            // surfaces from the trim/reveal slivers a lightmap texel could never resolve.
            const g = o.geometry
            if (g && !g.boundingBox) g.computeBoundingBox()
            const bb = g?.boundingBox
            const d = bb
              ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].sort(
                  (a, b) => b - a,
                )
              : [0, 0, 0]
            const area = d[0] * d[1]
            const bucket = area >= 1 ? 'ge1m2' : area >= 0.1 ? '0.1to1m2' : 'lt0.1m2'
            unmappedShell.push(`${m.type}|${bucket}`)
            // The ge1m2 Standard bucket is the only real coverage headroom, so name its members:
            // world-space centre and size, which is enough to say WHAT they are.
            if (
              bucket === 'ge1m2' &&
              m.type === 'MeshStandardMaterial' &&
              bigUnmapped.length < 45
            ) {
              o.updateWorldMatrix(true, false)
              const c = bb
                ? {
                    x: (bb.min.x + bb.max.x) / 2,
                    y: (bb.min.y + bb.max.y) / 2,
                    z: (bb.min.z + bb.max.z) / 2,
                  }
                : { x: 0, y: 0, z: 0 }
              const w = o.matrixWorld.elements
              const wy = w[1] * c.x + w[5] * c.y + w[9] * c.z + w[13]
              bigUnmapped.push(
                `y=${wy.toFixed(2)} size=${d[0].toFixed(2)}x${d[1].toFixed(2)}x${d[2].toFixed(2)} uv1=${o.geometry?.attributes?.uv1 ? 'yes' : 'NO'}`,
              )
            }
          }
        }
      })
      // SURFACE AREA as the BAKE measures it (`bake_material.py --min-area`, default 3.0 m2):
      // the sum of world-space triangle areas, NOT a footprint. This is the quantity that decides
      // coverage, and confusing it with a bounding-box footprint is what made `v0.31.7.225` call
      // 38 meshes "headroom" when most are under the threshold on purpose — a 2.60 x 0.55 m wall
      // face is 1.43 m2 of surface, not 1.43 m2 of "big".
      const triArea = (o) => {
        const g = o.geometry
        const pos = g?.getAttribute?.('position')
        if (!pos) return 0
        o.updateWorldMatrix(true, false)
        const e = o.matrixWorld.elements
        const tx = (x, y, z) => [
          e[0] * x + e[4] * y + e[8] * z + e[12],
          e[1] * x + e[5] * y + e[9] * z + e[13],
          e[2] * x + e[6] * y + e[10] * z + e[14],
        ]
        const idx = g.index
        const n = idx ? idx.count : pos.count
        let sum = 0
        for (let i = 0; i + 2 < n; i += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k))
          const P = [a, b, c].map((j) => tx(pos.getX(j), pos.getY(j), pos.getZ(j)))
          const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]]
          const v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]]
          const cx = u[1] * v[2] - u[2] * v[1]
          const cy = u[2] * v[0] - u[0] * v[2]
          const cz = u[0] * v[1] - u[1] * v[0]
          sum += 0.5 * Math.hypot(cx, cy, cz)
        }
        return sum
      }
      // For every UNMAPPED shell mesh with a Standard-family material, how many would qualify at
      // each candidate `--min-area`? This is the cost/benefit of lowering the bake threshold.
      const thresholds = [3.0, 2.5, 2.0, 1.5, 1.0, 0.5]
      const gained = thresholds.map(() => 0)
      let unmappedStdShell = 0
      window.__three.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return
        let q = o.parent
        while (q) {
          if (q.visible === false) return
          q = q.parent
        }
        const m = Array.isArray(o.material) ? o.material[0] : o.material
        if (!m || !('aoMap' in m)) return
        if (m.userData?.visMapUrl) return
        let itemId = null
        let r = o
        while (r && !itemId) {
          itemId = r.userData?.itemId ?? null
          r = r.parent
        }
        if (itemId) return
        unmappedStdShell += 1
        const a = triArea(o)
        thresholds.forEach((t, i) => {
          if (a >= t) gained[i] += 1
        })
      })
      const byGain = new Map()
      for (const r of out) {
        const g = Number(String(r.key).slice(7))
        byGain.set(g, (byGain.get(g) ?? 0) + 1)
      }
      const gains = [...byGain].sort((a, b) => a[0] - b[0])
      return {
        coverage: cls,
        unmappedStdShell,
        gainedByThreshold: thresholds.map((t, i) => `>=${t}m2: +${gained[i]}`),
        unmappedItemDefs: [...unmappedItems]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([k, n]) => `${k} x${n}`),
        bigUnmapped,
        unmappedShellByKind: (() => {
          const t = new Map()
          for (const k of unmappedShell) t.set(k, (t.get(k) ?? 0) + 1)
          return [...t].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`)
        })(),
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
