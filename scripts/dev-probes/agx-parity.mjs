/**
 * AGX-PARITY — do Blender's AgX and three's `AgXToneMapping` agree?
 *
 * The whole graphics-realism arc compares an app screenshot against a Cycles reference **in
 * displayed 8-bit counts**, and `docs/skills/blender.md` records the assumption that makes that
 * legitimate: "the app's three.js tiers tone-map with AgX too, so leaving Blender's default alone
 * is the closest match to the real-time view." That was never verified — it is the first of the
 * three items under that file's *Open experiments*.
 *
 * It is worth verifying because the two are not the same implementation. Blender 5.2.1 applies the
 * OCIO AgX config (a real 3D LUT). three r184 applies Filament's port, whose sigmoid is
 * `agxDefaultContrastApprox` — a **6th-order polynomial approximation** — and whose look step is
 * commented out in the chunk. Approximations have error; nobody had measured this one.
 *
 * **This probe does not render a scene.** A scene would add sampling noise, material translation,
 * light-rig differences and pose error to a question that is purely about a transfer function, and
 * the arc has lost rounds to exactly that kind of confounding. Both sides are driven with the SAME
 * known linear values instead:
 *
 * - *Blender*: `agx_lut.py` writes a float image of the probe values and saves it through
 *   `Image.save_render(scene=…)`, which applies the scene's view transform. Exact, instant, and
 *   noise-free — no Cycles involved.
 * - *three*: this file renders one unlit quad per probe value in a real WebGL context on the real
 *   GPU, with `MeshBasicMaterial` (whose fragment shader carries `tonemapping_fragment` and
 *   `colorspace_fragment`, so the value takes the shipped path) and the colour components written
 *   as RAW WORKING-SPACE floats, then reads the framebuffer back.
 *
 * Both therefore answer one question: *a surface whose scene-referred linear radiance is `v`
 * displays as what 8-bit count?*
 *
 * **Chroma is probed, not just grey.** AgX's inset/outset matrices rotate toward Rec.2020 and back,
 * so it is not a per-channel curve — a neutral ramp alone cannot show a hue or saturation error.
 *
 * Usage:
 *   node scripts/dev-probes/agx-parity.mjs                 # three side only, JSON to stdout
 *   node scripts/dev-probes/agx-parity.mjs --out /tmp/agx  # writes three.json
 * Then `python/scripts/blender/agx_lut.py` for the Blender side and `--compare` to diff them.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import puppeteer from 'puppeteer'

/**
 * The probe set, shared with `agx_lut.py` via `--values` so the two sides cannot drift apart.
 *
 * Log-spaced around middle grey rather than linearly spaced: AgX is a log-domain transform, so a
 * linear ramp would spend almost all its samples in the top stop and none where an interior
 * actually sits. 0.18 is middle grey. The range covers deep shadow (2^-8 of grey) to a blown
 * window (2^6), which brackets everything the arc measures.
 */
export function probeValues(dense = false) {
  // `--dense`: a fine NEUTRAL-only ramp. The chroma probes answer "is there a hue error"; this
  // answers "how big is the error at the levels an interior actually occupies", finely enough to
  // invert -- so a count measured in an app frame can be mapped back to linear and forward
  // through Blender's transform, without rendering anything.
  if (dense) {
    const out = []
    for (let i = 0; i <= 384; i++) {
      const ev = -12 + (i / 384) * 20
      const g = 0.18 * 2 ** ev
      out.push([g, g, g])
    }
    return out
  }
  const greys = []
  for (let ev = -8; ev <= 6; ev += 0.5) greys.push(0.18 * 2 ** ev)
  const rgb = []
  // Chroma probes at three levels, so a hue error can be separated from a saturation one.
  for (const s of [0.18, 0.5, 1.5]) {
    rgb.push([s, 0, 0], [0, s, 0], [0, 0, s], [s, s, 0], [0, s, s], [s, 0, s])
    // Partly desaturated — a real interior is never a primary, and the outset matrix's effect
    // is level- AND saturation-dependent.
    rgb.push([s, s * 0.5, s * 0.25], [s * 0.25, s * 0.5, s])
  }
  return [...greys.map((g) => [g, g, g]), ...rgb]
}

async function threeSide(values, toneMapping = 'AgX') {
  // three's build is split (`three.module.js` re-exports `./three.core.js`), so it cannot be
  // injected as a string — a module script needs a real origin to resolve the relative specifier
  // against. A throwaway static server over `build/` is the smallest thing that gives it one, and
  // it keeps the probe running the SHIPPED build rather than a hand-assembled copy.
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><html><body></body></html>')
      return
    }
    const file = path.join('node_modules/three/build', path.basename(req.url))
    if (!fs.existsSync(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(fs.readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
    ],
  })
  try {
    const page = await browser.newPage()
    page.on('pageerror', (e) => {
      throw e
    })
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({
      content: `import * as T from '${origin}/three.module.js'; window.THREE = T;`,
      type: 'module',
    })
    await page.waitForFunction('window.THREE !== undefined', { timeout: 20000 })
    return await page.evaluate(
      async (vals, tm) => {
        const T = window.THREE
        const N = vals.length
        // 8 px per probe so a readback can sample the CENTRE of each cell and never straddle a
        // seam; the arc has been bitten by crop edges before.
        const CELL = 8
        const canvas = document.createElement('canvas')
        canvas.width = N * CELL
        canvas.height = CELL
        const renderer = new T.WebGLRenderer({ canvas, antialias: false })
        renderer.setPixelRatio(1)
        renderer.setSize(N * CELL, CELL, false)
        renderer.outputColorSpace = T.SRGBColorSpace
        renderer.toneMapping = tm === 'None' ? T.NoToneMapping : T.AgXToneMapping
        renderer.toneMappingExposure = 1
        const gl = renderer.getContext()
        const dbg = gl.getExtension('WEBGL_debug_renderer_info')
        const rendererName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'

        const scene = new T.Scene()
        // Orthographic over the full strip in probe-index units, so quad i covers exactly cell i.
        const cam = new T.OrthographicCamera(0, N, 1, 0, -1, 1)
        for (let i = 0; i < N; i++) {
          const m = new T.MeshBasicMaterial()
          // RAW working-space (linear-sRGB) components. Assigning .r/.g/.b bypasses every colour
          // -space conversion `setRGB`/`setStyle` would apply, which is the point: the probe value
          // must reach the shader unchanged, including above 1.
          const [r, g, b] = vals[i]
          m.color.r = r
          m.color.g = g
          m.color.b = b
          const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), m)
          mesh.position.set(i + 0.5, 0.5, 0)
          scene.add(mesh)
        }
        renderer.render(scene, cam)
        const px = new Uint8Array(N * CELL * CELL * 4)
        gl.readPixels(0, 0, N * CELL, CELL, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const out = []
        for (let i = 0; i < N; i++) {
          const x = i * CELL + CELL / 2
          const y = CELL / 2
          const o = (y * N * CELL + x) * 4
          out.push([px[o], px[o + 1], px[o + 2]])
        }
        return { renderer: rendererName, counts: out }
      },
      values,
      toneMapping,
    )
  } finally {
    await browser.close()
    await new Promise((r) => server.close(r))
  }
}

function fmt(v) {
  return Number.isFinite(v) ? v.toFixed(2) : String(v)
}

/**
 * Piecewise-linear interpolation of `ys` at `x`, keyed on a MONOTONE `xs`. Shared by both
 * directions of the mapping below so an off-by-one can only exist in one place.
 */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const f = xs[i] === xs[i - 1] ? 0 : (x - xs[i - 1]) / (xs[i] - xs[i - 1])
      return ys[i - 1] + (ys[i] - ys[i - 1]) * f
    }
  }
  return ys[ys.length - 1]
}

/**
 * Convert a count measured in an APP frame into the count the SAME scene radiance would show in a
 * Cycles reference — the operational form of this probe's finding.
 *
 * Built from the `--dense` neutral ramp: invert three's AgX to recover the linear value, then push
 * that through Blender's. Both transforms are monotone on the neutral axis, so the inversion is
 * well-defined; it is NOT valid for a saturated pixel, where the two disagree by up to 44 counts
 * in a channel and the mapping is not one-dimensional. Luminance percentiles of an interior crop —
 * what the arc actually quotes — are the intended input.
 */
export function mapAppCountToBlender(dense, count) {
  const lin = dense.three.values.map((v) => v[0])
  const three = dense.three.counts.map((c) => c[1])
  const blender = dense.blender.counts.map((c) => c[1])
  const linear = interp(three, lin, count)
  return { count, linear, blender: interp(lin, blender, linear) }
}

/** Diff two `{values, counts}` sets and print the table the decision rests on. */
export function compare(a, b, labelA, labelB) {
  const rows = []
  for (let i = 0; i < a.values.length; i++) {
    const [ar, ag, ab] = a.counts[i]
    const [br, bg, bb] = b.counts[i]
    rows.push({
      value: a.values[i],
      [labelA]: [ar, ag, ab],
      [labelB]: [br, bg, bb],
      d: [ar - br, ag - bg, ab - bb],
    })
  }
  const all = rows.flatMap((r) => r.d)
  const abs = all.map(Math.abs).sort((x, y) => x - y)
  const mean = all.reduce((s, v) => s + v, 0) / all.length
  return {
    rows,
    summary: {
      n: all.length,
      meanSigned: +mean.toFixed(3),
      meanAbs: +(abs.reduce((s, v) => s + v, 0) / abs.length).toFixed(3),
      p50Abs: abs[Math.floor(abs.length / 2)],
      p95Abs: abs[Math.floor(abs.length * 0.95)],
      maxAbs: abs[abs.length - 1],
    },
  }
}

// ENTRY-POINT GUARD. Everything below is the CLI; everything above is pure and importable.
//
// Without this the module ran its MEASUREMENT on import -- and `agxParity.test.ts` imports
// `probeValues`/`compare`/`mapAppCountToBlender` precisely because "the measurement itself needs a
// GPU and a Blender install, so it cannot run here". It ran anyway: locally the browser launch
// succeeded (Apple/Metal), so every `npm test` silently drove a real GPU probe and passed; on a
// GPU-less CI runner `threeSide` threw `Error creating WebGL context` and failed the shard.
//
// The failure mode is what makes this worth a comment: the bug was INVISIBLE on the machine that
// wrote it and only appeared where there was no GPU. A probe module that is also imported must
// guard its entry point -- `view-matrix.mjs` is the pattern.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
  /**
   * CONTROL ARM. `--tone-mapping None` pairs with the Blender side's `--view-transform Standard`:
   * both then reduce to the plain sRGB transfer function on the same linear input, so the two
   * measurement PATHS can be checked against each other with the transform under test removed.
   * Without this, an instrument bug and a real AgX difference look identical — and the arc's own
   * record is that most of its corrections were harness faults, not graphics discoveries.
   */
  const toneMapping = args.includes('--tone-mapping')
    ? args[args.indexOf('--tone-mapping') + 1]
    : 'AgX'
  const cmp = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null

  const mapDir = args.includes('--map') ? args[args.indexOf('--map') + 1] : null
  const mapCounts = args.includes('--counts')
    ? args[args.indexOf('--counts') + 1].split(',').map(Number)
    : []

  if (mapDir) {
    const dense = {
      three: JSON.parse(fs.readFileSync(path.join(mapDir, 'three.json'), 'utf8')),
      blender: JSON.parse(fs.readFileSync(path.join(mapDir, 'blender.json'), 'utf8')),
    }
    if (dense.three.values.length < 200)
      throw new Error('--map needs a --dense LUT pair; this one is the sparse probe set')
    console.log('app count (three AgX) -> implied linear -> same radiance under Blender AgX')
    for (const c of mapCounts) {
      const r = mapAppCountToBlender(dense, c)
      console.log(
        String(c).padStart(7),
        ' lin',
        r.linear.toFixed(4).padStart(9),
        ' blender',
        r.blender.toFixed(1).padStart(7),
        ' delta',
        (c - r.blender).toFixed(1).padStart(6),
      )
    }
  } else if (cmp) {
    const three = JSON.parse(fs.readFileSync(path.join(cmp, 'three.json'), 'utf8'))
    const blender = JSON.parse(fs.readFileSync(path.join(cmp, 'blender.json'), 'utf8'))
    if (JSON.stringify(three.values) !== JSON.stringify(blender.values))
      throw new Error('probe value sets differ — the two sides did not measure the same inputs')
    const { rows, summary } = compare(three, blender, 'three', 'blender')
    console.log(
      'renderer:',
      three.renderer,
      '| three toneMapping:',
      three.toneMapping,
      '| blender:',
      blender.version,
      blender.view_transform,
      `look=${blender.look}`,
    )
    console.log('\nlinear in            three RGB        blender RGB      delta (three - blender)')
    for (const r of rows) {
      const v = r.value.map(fmt).join(',')
      console.log(
        v.padEnd(21),
        String(r.three).padEnd(17),
        String(r.blender).padEnd(17),
        String(r.d),
      )
    }
    console.log('\nsummary', JSON.stringify(summary))
    fs.writeFileSync(path.join(cmp, 'compare.json'), JSON.stringify({ rows, summary }, null, 2))
  } else {
    const values = probeValues(args.includes('--dense'))
    const { renderer, counts } = await threeSide(values, toneMapping)
    const out = { side: 'three', renderer, toneMapping, values, counts }
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'three.json'), JSON.stringify(out, null, 2))
      console.log(
        `wrote ${path.join(outDir, 'three.json')} (${values.length} probes, ${toneMapping}, ${renderer})`,
      )
    } else {
      console.log(JSON.stringify(out, null, 2))
    }
  }
}
