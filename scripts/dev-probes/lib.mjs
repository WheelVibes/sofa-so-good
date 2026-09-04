import sharp from 'sharp'

/**
 * Per-frame statistics over the CANVAS REGION only (the toolbar/panels are
 * opaque UI and would mask the signal).
 *
 * `blank` uses VARIANCE, not brightness: a white flash is the page background
 * showing through a cleared/transparent drawing buffer, i.e. an almost perfectly
 * uniform region. A brightness threshold alone is wrong — a legitimately blown-out
 * midday render is also bright, which is exactly how a washed-out scene got
 * mis-reported as 30/30 blank frames.
 */
export async function frameStats(buf, box) {
  let img = sharp(buf)
  if (box)
    img = img.extract({
      left: Math.round(box.x),
      top: Math.round(box.y),
      width: Math.round(box.w),
      height: Math.round(box.h),
    })
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = data.length / 3
  let sum = 0,
    sumSq = 0,
    hi = 0
  for (let i = 0; i < data.length; i += 3) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    sum += l
    sumSq += l * l
    if (l > 250) hi++
  }
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  return {
    mean: +mean.toFixed(2),
    sd: +sd.toFixed(2),
    clipped: +(hi / n).toFixed(4), // fraction of pure-white (blown) pixels
    w: info.width,
    h: info.height,
  }
}

/** A frame is blank when the canvas region is essentially featureless. */
export function isBlank(s) {
  return s.sd < 6
}

/**
 * The central slab of the viewport — where the model always sits, and clear of
 * every DOM overlay drawn on top of the canvas (toolbar along the top, the
 * "Get started" card bottom-left, the zoom/compass rail on the right). Measuring
 * the full canvas rect instead lets those opaque panels contribute most of the
 * variance, which masks a genuinely blank canvas.
 */
export function centerBox(vpW, vpH) {
  return { x: vpW * 0.28, y: vpH * 0.18, w: vpW * 0.44, h: vpH * 0.55 }
}

/**
 * Base URL of the dev server under test.
 *
 * Do NOT hardcode `localhost:5173`. Vite silently falls forward to 5174+ when
 * 5173 is taken, and a stray dev server from ANOTHER checkout answering on 5173
 * will happily serve a different branch's code to every probe — the measurement
 * still "works", it is just measuring the wrong tree. Start the server on a
 * known port and pass it here via `SSG_URL`.
 */
export function appUrl() {
  return process.env.SSG_URL || process.env.URL || 'http://localhost:5173/'
}

/**
 * Throw if the R3F error boundary has replaced the scene.
 *
 * Call after every state change a probe makes, before trusting a screenshot.
 * When the 3D scene throws, the app swaps in a "Something went wrong" card — and
 * a card is perfectly stable, so a probe diffing frames reports 0.00 difference
 * for every setting and reads as "this feature changes nothing". That is exactly
 * how a shadow-resolution sweep once returned 0.00 across 512/1024/2048/4096.
 *
 * The usual cause in this worktree is Vite answering `504 (Outdated Optimize
 * Dep)` for the lazily-imported `EffectsImpl` chunk, because `node_modules` is
 * symlinked to the sibling checkout and the two dev servers share
 * `node_modules/.vite`. Start the probe server with
 * `--config vite.probe.config.ts` to give it its own cache dir.
 */
export async function assertSceneAlive(page, label = '') {
  const bad = await page.evaluate(() =>
    /Something went wrong in the 3D scene/.test(document.body.innerText || ''),
  )
  if (bad) {
    throw new Error(
      `3D scene crashed${label ? ` (${label})` : ''} — the error boundary is showing, so every ` +
        'screenshot from here is the error card, not the render. Restart the probe dev server ' +
        'with `--config vite.probe.config.ts` (see assertSceneAlive docs).',
    )
  }
}

/**
 * Wait until the BAKED GI has finished attaching, and report how much of it there is.
 *
 * **Why this is not `loading.active`.** That flag clearing means the plan is loaded;
 * `applyLightmapsFromIndex` runs AFTER it and its textures load asynchronously. A frame or an
 * export taken in between sees the same geometry with a different indirect term — and it looks
 * entirely plausible. `v0.31.7.276` traced item `(z7)`, a "floor is 20 % darker than Cycles"
 * result that survived four versions of investigation, to exactly this: with the wait the floor
 * reads 126.6 against Cycles' 129.0 (ratio 0.981), without it 104.7 (0.811). Ceiling and wall are
 * unaffected because their lightmaps attach early, which is what made the artefact so selective.
 *
 * **Repeatability is not validity**, which is the trap that cost those versions: four unwaited
 * runs returned 104.7, 104.7, 104.7, 105.8 — stable to 1.1 counts — and the stability read as
 * confirmation. So this returns the COUNT and callers print it: a readiness check that says
 * nothing is the thing that failed.
 *
 * Also required before `scene-glb.mjs` exports, for a different reason: `uv1` is COMPUTED by
 * `applyLightmapsFromIndex`, so a GLB exported too early carries no `UVMap.001` — and that is the
 * layer `bake_material.py --uv-layer` needs to make a fresh bake comparable to a shipped map.
 */
export async function waitForBakedGi(page, { polls = 6, intervalMs = 750, maxTries = 80 } = {}) {
  const count = () =>
    page.evaluate(() => {
      let n = 0
      window.__three?.scene?.traverse?.((o) => {
        const m = Array.isArray(o.material) ? o.material[0] : o.material
        if (m?.userData?.visLightmap === true) n += 1
      })
      return n
    })
  let last = -1
  let stable = 0
  for (let i = 0; i < maxTries; i += 1) {
    const n = await count()
    if (n > 0 && n === last) {
      stable += 1
      if (stable >= polls) return { count: n, settled: true }
    } else {
      stable = 0
    }
    last = n
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { count: last, settled: false }
}
