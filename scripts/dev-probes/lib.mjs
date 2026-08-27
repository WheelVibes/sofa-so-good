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
