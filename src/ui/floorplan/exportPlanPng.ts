/**
 * Export the 2D floor-plan SVG as a downloadable PNG — a shareable/printable
 * client deliverable. The plan SVG styles its fills/strokes with CSS custom
 * properties (`var(--accent)` …) which don't resolve when an SVG is rendered as
 * an <img>, so we serialize the SVG and substitute each var with its resolved
 * value before rasterising. The trace-photo backdrop is stripped (export the
 * clean plan, not the reference image). Fail-soft: throws on a load error so the
 * caller can notify.
 */

/** CSS custom properties the plan SVG references (kept in sync with the editor). */
const PLAN_VARS = [
  '--accent',
  '--accent-soft',
  '--accent-soft-text',
  '--border',
  '--border-2',
  '--plan-annot',
  '--plan-cat-appliances',
  '--plan-cat-bathroom',
  '--plan-cat-beds',
  '--plan-cat-decor',
  '--plan-cat-electronics',
  '--plan-cat-kids',
  '--plan-cat-kitchen',
  '--plan-cat-laundry',
  '--plan-cat-lighting',
  '--plan-cat-others',
  '--plan-cat-outdoor',
  '--plan-cat-pets',
  '--plan-cat-seating',
  '--plan-cat-storage',
  '--plan-cat-tables',
  '--plan-cat-textiles',
  '--plan-wall',
  '--surface',
  '--surface-2',
  '--surface-solid',
  '--text',
  '--text-2',
  '--text-3',
] as const

/** Optional crop (in SVG pixels) so the export is the plan's bounding box +
 *  padding rather than the whole open grid canvas. */
export interface ExportCrop {
  x: number
  y: number
  w: number
  h: number
}

export async function exportPlanPng(
  svg: SVGSVGElement,
  name = 'floor-plan',
  crop?: ExportCrop,
): Promise<void> {
  const cs = getComputedStyle(document.documentElement)
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Drop the trace backdrop (its blob URL wouldn't resolve in the <img> render
  // anyway, and the deliverable is the clean plan).
  for (const n of clone.querySelectorAll('image')) n.remove()
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  // Crop to the plan bounds: a viewBox windows into the open canvas, and the
  // width/height become the crop size so the raster is just the plan + padding.
  const w = crop ? crop.w : svg.width.baseVal.value || svg.clientWidth || 940
  const h = crop ? crop.h : svg.height.baseVal.value || svg.clientHeight || 620
  if (crop) {
    clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.w} ${crop.h}`)
    clone.setAttribute('width', String(crop.w))
    clone.setAttribute('height', String(crop.h))
  }

  let markup = new XMLSerializer().serializeToString(clone)
  for (const v of PLAN_VARS) {
    const val = cs.getPropertyValue(v).trim()
    if (val) markup = markup.split(`var(${v})`).join(val)
  }

  const scale = 2 // crisp on hi-dpi / print

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not rasterise the plan SVG.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable.')
  // Paper background so the PNG isn't transparent where the SVG is.
  ctx.fillStyle = cs.getPropertyValue('--surface').trim() || '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${name}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      resolve()
    }, 'image/png')
  })
}
