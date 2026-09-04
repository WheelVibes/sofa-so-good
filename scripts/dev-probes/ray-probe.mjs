/**
 * Cast EXPLICIT rays at the live scene and report what they hit. No camera, no screenshot.
 *
 * Written after a wrong published claim. Item `(x)` asserted a "0.3 m ring of open envelope" on
 * the multi-storey templates, reasoning that a horizontal ray at 2.75 m "hits nothing by
 * construction" because the wall boxes span 0–2.6 and 2.9–5.5. That reasoning ignored `LevelSlab`,
 * which occupies 2.65–2.9 across the whole footprint — so the actually-open band is 0.05 m, not
 * 0.3, and the ray does hit. The error is the one this arc keeps making: a quantity ASSUMED
 * instead of read.
 *
 * Camera-based probes cannot settle it either: `aim-look.mjs` in orbit mode has its requested eye
 * height adjusted by the controls (asked 2.50, got 2.71), which tilts the ray and moves the hit.
 * A geometry question deserves a geometry instrument — origin and direction in, first opaque hit
 * out, nothing in between to reinterpret.
 *
 * RAYS is `label:ox,oy,oz>dx,dy,dz` entries separated by `;`.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
const FURNISH = process.env.FURNISH === '1'
const TIER = process.env.TIER || 'realistic'
const WALK = process.env.WALK === '1'
const HOUR = Number(process.env.HOUR || 13)
const RAYS = (process.env.RAYS || 'north:4.2,2.62,-9>0,0,1').split(';').map((s) => {
  const [label, rest] = s.split(':')
  const [o, d] = rest.split('>')
  return { label, origin: o.split(',').map(Number), dir: d.split(',').map(Number) }
})

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
  defaultViewport: { width: 1024, height: 640, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
// `v0.31.7.263`: this probe had NO hour control, so every run sat at system time. Traces run in
// the evening aimed their "toward the sun" rays at a sun 25 deg BELOW the horizon with intensity
// 0 — the geometry answers stayed valid, but any sun-direction result was against a night sun.
// A probe that reports a sun vector must be able to say which sun.
await page.evaluate((h) => {
  const st = window.__store.getState()
  st.setTimeMode('manual')
  st.setManualHour(h)
}, HOUR)
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 2500))

if (PLAN) {
  const swapped = await page.evaluate(
    async ({ id, furnish }) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
      if (!tpl) return null
      const st = window.__store.getState()
      st.replaceFloorPlan(structuredClone(tpl), { furniture: furnish ? 'clear' : 'rehome' })
      if (furnish) st.applyLayoutPreset('move-in')
      return tpl.name
    },
    { id: PLAN, furnish: FURNISH },
  )
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await new Promise((r) => setTimeout(r, 2500))
  console.log(`plan -> ${swapped} (${PLAN})`)
}
if (WALK) await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
if (LEVEL) await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
await new Promise((r) => setTimeout(r, 2000))

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return `${st.qualityTier}/${st.lightsMode}/${st.cameraMode}/view=${st.viewLevelId}`
})
console.log(`resolved ${resolved}`)

const hits = await page.evaluate(
  ({ rays, process_env_all, process_env_mat }) => {
    const scene = window.__three.scene
    const rc = new window.__three.raycaster.constructor()
    const V3 = window.__three.camera.position.constructor
    const out = []
    for (const r of rays) {
      rc.set(new V3(...r.origin), new V3(...r.dir).normalize())
      // ALL opaque hits along the ray, not just the first: "the envelope is closed" is a claim
      // about the sequence of surfaces a ray crosses, and the first hit alone hides whether the
      // thing that stopped it was the wall or something behind the gap.
      const all = rc
        .intersectObjects(scene.children, true)
        .filter((h) => {
          const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
          // ALL=1 keeps transparent and zero-opacity hits. Needed because the ceiling OCCLUDERS are
          // `transparent: true, opacity: 0` by design, so the default filter skips exactly the
          // meshes a shadow question is about — three's shadow pass does not filter on transparency.
          // `v0.31.7.262`: without this, a ray test "proving" the occluder is not on the path would
          // have been guaranteed by the filter rather than measured.
          if (!h.object.visible || !m) return false
          if (process_env_all !== '1' && (m.transparent === true || m.opacity === 0)) return false
          let p = h.object.parent
          while (p) {
            if (p.visible === false) return false
            p = p.parent
          }
          return true
        })
        .slice(0, 4)
        .map((h) => {
          let itemId = null
          let o = h.object
          while (o && !itemId) {
            itemId = o.userData?.itemId ?? null
            o = o.parent
          }
          const it = itemId ? window.__store.getState().items.find((i) => i.id === itemId) : null
          return {
            transparent: (() => {
              const mm = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
              return mm?.transparent === true || mm?.opacity === 0
            })(),
            // Shadow flags of the mesh actually hit. `v0.31.7.263`: a `receiveShadow` experiment was
            // run and reported a null result WITHOUT ever checking that the flag reached the mesh —
            // the same "measure the byte, assume the state" error `.217`, `.215` and `.259` each cost
            // a round. A shadow question should not have to guess which mesh answered it.
            recv: h.object.receiveShadow,
            cast: h.object.castShadow,
            d: +h.distance.toFixed(2),
            x: +h.point.x.toFixed(2),
            y: +h.point.y.toFixed(2),
            z: +h.point.z.toFixed(2),
            // `??` not `||` printed BLANK for every mesh in the shell: `name` is the empty
            // string, which is not nullish, so it won an identity race it should have lost. Two
            // coincident hits both read as `@1.72m` with no name, which is precisely the case
            // where identity is the whole question.
            what: it?.defId || h.object.name || h.object.type,
            geo: h.object.geometry?.type ?? '?',
            // Rounded so two instances of the same box read identically.
            size: (() => {
              const p2 = h.object.geometry?.parameters
              if (!p2) return '?'
              const n = (v) => (typeof v === 'number' ? +v.toFixed(2) : '?')
              return [p2.width, p2.height, p2.depth].every((v) => v === undefined)
                ? '?'
                : `${n(p2.width)}x${n(p2.height)}x${n(p2.depth)}`
            })(),
            col: h.object.material?.color?.getHexString?.() ?? '?',
            // MAT=1: the full material record for the mesh hit. Added for `(z7)`, where the app's
            // floor reads 20 % darker than a Cycles reference built from a three-EXPORTED GLB.
            // That signature is equally consistent with the app being wrong and with the export
            // dropping a map, and the two have opposite fixes — so the census has to be taken on
            // both sides of the export rather than assumed on either.
            mat:
              process_env_mat !== '1'
                ? null
                : (() => {
                    const mm = Array.isArray(h.object.material)
                      ? h.object.material[0]
                      : h.object.material
                    if (!mm) return null
                    const tex = (t) =>
                      !t
                        ? null
                        : {
                            w: t.image?.width ?? null,
                            h: t.image?.height ?? null,
                            // Repeat is where a tiling difference would hide: the app tiles by
                            // world-metre UVs, and a GLB carries baked UVs instead.
                            repeat: t.repeat
                              ? [+t.repeat.x.toFixed(4), +t.repeat.y.toFixed(4)]
                              : null,
                            colorSpace: t.colorSpace ?? null,
                          }
                    return {
                      type: mm.type,
                      name: mm.name || null,
                      // Whether the baked-irradiance injection is attached. `(z7)` turns on this:
                      // if the surface IS lightmapped, a level error is the injection's, and if it
                      // is not, the same error means something entirely different.
                      visLightmap: h.object.material?.userData?.visLightmap === true,
                      // The `visGain` vec3 ACTUALLY BOUND, recovered by invoking the material's
                      // own `onBeforeCompile` against a stub. `(z10)`: the same tree renders this
                      // floor 22 counts apart on two dev servers, and the leading suspect is
                      // `surfaceOrientation()` classifying it differently depending on whether
                      // parent transforms are settled at attach time. The tint's CHROMA RATIO
                      // (z/x) names the strength that was applied, so this reads the answer off
                      // the material instead of inferring it from a rendered colour.
                      visGain: (() => {
                        const mm = Array.isArray(h.object.material)
                          ? h.object.material[0]
                          : h.object.material
                        if (typeof mm?.onBeforeCompile !== 'function') return null
                        const stub = {
                          uniforms: {},
                          vertexShader: 'void main() {\n#include <begin_vertex>\n}',
                          fragmentShader:
                            'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
                        }
                        try {
                          mm.onBeforeCompile(stub, null)
                        } catch {
                          return null
                        }
                        const g = stub.uniforms?.visGain?.value
                        if (!g || typeof g !== 'object' || !('x' in g)) return null
                        return {
                          rgb: [+g.x.toFixed(4), +g.y.toFixed(4), +g.z.toFixed(4)],
                          luma: +(0.2126 * g.x + 0.7152 * g.y + 0.0722 * g.z).toFixed(4),
                          // Sky chroma is blue-heavy, so z/x rises with tint strength.
                          zOverX: +(g.z / g.x).toFixed(4),
                        }
                      })(),
                      cacheKey:
                        typeof h.object.material?.customProgramCacheKey === 'function'
                          ? h.object.material.customProgramCacheKey()
                          : null,
                      hasUv1: !!h.object.geometry?.attributes?.uv1,
                      color: mm.color?.getHexString?.() ?? null,
                      roughness: mm.roughness ?? null,
                      metalness: mm.metalness ?? null,
                      envMapIntensity: mm.envMapIntensity ?? null,
                      map: tex(mm.map),
                      normalMap: tex(mm.normalMap),
                      roughnessMap: tex(mm.roughnessMap),
                      aoMap: tex(mm.aoMap),
                      normalScale: mm.normalScale
                        ? [+mm.normalScale.x.toFixed(3), +mm.normalScale.y.toFixed(3)]
                        : null,
                    }
                  })(),
          }
        })
      out.push({ label: r.label, all })
    }
    return out
  },
  {
    rays: RAYS,
    process_env_all: process.env.ALL ?? '0',
    process_env_mat: process.env.MAT ?? '0',
  },
)

// The sun's ACTUAL world direction, read from the light rather than re-derived. Reconstructing it
// from the hour would mean re-walking SunCalc and the plan's `orientationDeg` by hand, and a
// hand-derived vector is what `--sun-dir` needs for a Cycles cross-check — the one number in that
// comparison it would be easiest to get silently wrong.
const sun = await page.evaluate(() => {
  let found = null
  window.__three.scene.traverse((o) => {
    if (!found && o.isDirectionalLight) found = o
  })
  if (!found) return null
  // `Vector3` via the camera's own position, the same trick the raycast above uses — the probe
  // has no import of three and `window.__three.THREE` is not exposed.
  const V3 = window.__three.camera.position.constructor
  const p = found.getWorldPosition(new V3())
  const t = found.target.getWorldPosition(new V3())
  const d = p.clone().sub(t).normalize()
  return {
    toSun: [+d.x.toFixed(5), +d.y.toFixed(5), +d.z.toFixed(5)],
    altDeg: +((Math.asin(d.y) * 180) / Math.PI).toFixed(2),
    intensity: +found.intensity.toFixed(3),
    cast: found.castShadow,
  }
})
if (sun) {
  console.log(
    `  sun  toSun=${sun.toSun.join(',')}  alt=${sun.altDeg}deg  i=${sun.intensity}  cast${sun.cast ? 1 : 0}`,
  )
} else {
  console.log('  sun  NO DirectionalLight in the scene')
}

if (process.env.MAT === '1') {
  for (const h of hits) {
    for (const a of h.all) {
      console.log(`  MAT ${h.label}/${a.what}@${a.d}m  ${JSON.stringify(a.mat)}`)
    }
  }
}

for (const h of hits) {
  if (h.all.length === 0) {
    console.log(`  ${h.label.padEnd(12)} NOTHING — the ray leaves the scene`)
    continue
  }
  console.log(
    `  ${h.label.padEnd(12)} ${h.all.map((a) => `${a.transparent ? '[T]' : ''}${a.what}@${a.d}m (${a.x},${a.y},${a.z}) recv${a.recv ? 1 : 0}/cast${a.cast ? 1 : 0} ${a.geo}:${a.size} #${a.col}`).join('  ->  ')}`,
  )
}
await assertSceneAlive(page)
await browser.close()
