/**
 * Density rules for the 2D plan editor's text overlays (room labels + dimension
 * labels). Zoomed out or on a small screen, fixed-size labels collide with each
 * other and the walls; these pure helpers decide *what* to show and *how big*,
 * from the current px-per-metre scale and viewport — so the plan stays readable
 * instead of a wall of overlapping text.
 *
 * All sizes are in screen pixels (the editor SVG is rendered 1:1, so SVG user
 * units are CSS px).
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Dimension-label font, scaled with zoom but clamped legible↔unobtrusive. */
export function dimFontPx(pxPerMetre: number): number {
  return clamp(pxPerMetre * 0.16, 8, 13)
}

/** Room name/area font — a touch larger than dimensions, same clamp idea. */
export function roomFontPx(pxPerMetre: number): number {
  return clamp(pxPerMetre * 0.2, 9, 15)
}

/**
 * A wall's length label + dimension line only render when the wall spans enough
 * screen pixels to fit the callout without colliding with its neighbours.
 */
export function showWallDim(lengthM: number, pxPerMetre: number): boolean {
  return lengthM * pxPerMetre >= 46
}

/**
 * Opening (door/window) width labels are the least important and the most
 * numerous, so they need more room and drop out entirely on small screens.
 */
export function showOpeningDim(widthM: number, pxPerMetre: number, isMobile: boolean): boolean {
  return widthM * pxPerMetre >= (isMobile ? 70 : 44)
}

/**
 * Wrap a label into lines that each fit within `maxChars`, breaking on spaces;
 * a single word longer than the line is hyphenated across lines (so e.g.
 * "Household Shelter" wraps to two lines, and an extreme word still fits its
 * room). Always returns at least one line.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars))
  const lines: string[] = []
  let cur = ''
  for (let word of text.split(/\s+/).filter(Boolean)) {
    // Hyphenate a word that can't fit on a line by itself.
    if (word.length > limit) {
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      while (word.length > limit) {
        const take = Math.max(1, limit - 1) // leave room for the hyphen
        lines.push(`${word.slice(0, take)}-`)
        word = word.slice(take)
      }
      cur = word
      continue
    }
    const candidate = cur ? `${cur} ${word}` : word
    if (candidate.length <= limit) cur = candidate
    else {
      if (cur) lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

export type RoomLabelDetail = 'full' | 'name' | 'none'

/**
 * Progressive room-label detail from the room's on-screen area (m² × px/m²):
 * full (name + area), name only, or hidden when too small to read. Importance
 * order — the name matters more than the area figure, which matters more than
 * nothing — so the area drops first, then the name.
 */
export function roomLabelDetail(areaM2: number, pxPerMetre: number): RoomLabelDetail {
  const areaPx2 = areaM2 * pxPerMetre * pxPerMetre
  if (areaPx2 < 2600) return 'none'
  if (areaPx2 < 9000) return 'name'
  return 'full'
}
