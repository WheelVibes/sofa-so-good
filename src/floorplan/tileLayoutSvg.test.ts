import { describe, expect, it } from 'vitest'
import type { RoomTileCoursing } from './tileCoursing'
import { roomTileCoursing } from './tileCoursing'
import { tileLayoutSvg } from './tileLayoutSvg'
import type { FloorPlan, PlanRoom } from './types'

const PALETTE = {
  wall: '#111',
  ink: '#222',
  grid: '#999',
  cut: '#cce',
  accent: '#c30',
}

const room = (id: string, name: string, x: number, z: number, w: number, d: number): PlanRoom =>
  ({ id, name, origin: [x, z], width: w, depth: d }) as unknown as PlanRoom

function plan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [10, 8],
    ceilingHeight: 2.8,
    walls: [
      { id: 'n', start: [0, 0], end: [10, 0], thickness: 'external' },
      { id: 'w', start: [0, 0], end: [0, 8], thickness: 'external' },
    ],
    openings: [],
    rooms,
  } as unknown as FloorPlan
}

/** 600x600 module in a 3.0 x 2.4 m room: divides exactly, so no cut. */
const exactCoursing = (): RoomTileCoursing =>
  roomTileCoursing(room('r', 'Bath', 0, 0, 3, 2.4), {
    id: 'm',
    name: 'Porcelain 600',
    moduleMm: [600, 600],
  } as never)!

/** 600x600 in 3.4 x 2.4: leftover 400 on X → 200/200 cuts, not a sliver. */
const cutCoursing = (): RoomTileCoursing =>
  roomTileCoursing(room('r2', 'Kitchen', 4, 0, 3.4, 2.4), {
    id: 'm',
    name: 'Porcelain 600',
    moduleMm: [600, 600],
  } as never)!

describe('tileLayoutSvg', () => {
  it('draws a grid line per module boundary, struck from the origin', () => {
    const c = exactCoursing()
    const svg = tileLayoutSvg(plan([room('r', 'Bath', 0, 0, 3, 2.4)]), [c], {
      palette: PALETTE,
      widthPx: 1000,
    })
    const grid = svg.match(/<g class="grid">(.*?)<\/g>/s)?.[1] ?? ''
    // 3.0 m / 0.6 = 5 divisions → 6 vertical lines (0..5 inclusive);
    // 2.4 / 0.6 = 4 → 5 horizontal. Drawn from the room min corner (cut = 0).
    const vertical = [...grid.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1"/g)]
    expect(vertical.length).toBe(6)
    const horizontal = [...grid.matchAll(/y1="([\d.]+)" x2="[\d.]+" y2="\1"/g)]
    expect(horizontal.length).toBe(5)
  })

  it('marks the setting-out origin', () => {
    const svg = tileLayoutSvg(plan([room('r', 'Bath', 0, 0, 3, 2.4)]), [exactCoursing()], {
      palette: PALETTE,
      widthPx: 1000,
    })
    expect(svg).toContain('class="origin"')
  })

  it('tints the perimeter cut bands only when there IS a cut', () => {
    const withCut = tileLayoutSvg(plan([room('r2', 'Kitchen', 4, 0, 3.4, 2.4)]), [cutCoursing()], {
      palette: PALETTE,
      widthPx: 1000,
    })
    const noCut = tileLayoutSvg(plan([room('r', 'Bath', 0, 0, 3, 2.4)]), [exactCoursing()], {
      palette: PALETTE,
      widthPx: 1000,
    })
    expect(withCut).toContain('fill-opacity="0.35"')
    // An exactly-dividing room must not get a zero-width band rectangle.
    expect(noCut).not.toContain('fill-opacity="0.35"')
  })

  it('prints the module, full-tile field and cut widths per room', () => {
    const svg = tileLayoutSvg(plan([room('r2', 'Kitchen', 4, 0, 3.4, 2.4)]), [cutCoursing()], {
      palette: PALETTE,
      widthPx: 1000,
    })
    expect(svg).toContain('600×600')
    expect(svg).toContain('cut 200/0 mm')
  })

  it('calls a sliver out ON THE DRAWING, not just in a column', () => {
    // A sliver needs a room NARROWER THAN HALF A MODULE on an axis — see the
    // reachability test below for why nothing wider can produce one. A 250 mm
    // strip with a 600 tile: full = 0, leftover = 250, cut = 125 < 150.
    const sliverRoom = room('s', 'Duct', 0, 5, 0.25, 2.4)
    const c = roomTileCoursing(sliverRoom, {
      id: 'm',
      name: 'Porcelain 600',
      moduleMm: [600, 600],
    } as never)!
    // The fixture must actually produce a sliver, or the assertions below prove
    // nothing. An earlier fixture (3.05 m) did not, which is how the structural
    // property came to light.
    expect(c.sliver).toBe(true)
    const svg = tileLayoutSvg(plan([sliverRoom]), [c], { palette: PALETTE, widthPx: 1000 })
    expect(svg).toContain('SLIVER')
    expect(svg).toContain('Re-set the origin')
  })

  it('draws a room with no specified module as a dashed outline, never an invented grid', () => {
    const svg = tileLayoutSvg(plan([room('r', 'Bath', 0, 0, 3, 2.4)]), [], {
      palette: PALETTE,
      widthPx: 1000,
      omittedRooms: 1,
    })
    expect(svg).toContain('stroke-dasharray="3 3"')
    expect(svg).not.toContain('class="grid"')
    expect(svg).toContain('1 room omitted')
  })

  it('states how many rooms were covered so a partial sheet cannot read as complete', () => {
    const svg = tileLayoutSvg(
      plan([room('r', 'Bath', 0, 0, 3, 2.4), room('r2', 'Kitchen', 4, 0, 3.4, 2.4)]),
      [exactCoursing()],
      { palette: PALETTE, widthPx: 1000, omittedRooms: 1 },
    )
    expect(svg).toContain('2 rooms · 1 with a specified module')
  })

  it('drops the grid when the module would print as solid ink', () => {
    // A 50 mm mosaic on a narrow output width: step falls under MIN_GRID_PX.
    const mosaic = roomTileCoursing(room('r', 'Bath', 0, 0, 3, 2.4), {
      id: 'm',
      name: 'Mosaic 50',
      moduleMm: [50, 50],
    } as never)!
    const svg = tileLayoutSvg(plan([room('r', 'Bath', 0, 0, 3, 2.4)]), [mosaic], {
      palette: PALETTE,
      widthPx: 200,
    })
    expect(svg).not.toContain('class="grid"')
    // The numbers still reach the reader.
    expect(svg).toContain('50×50')
  })

  it('escapes a room name and emits well-formed SVG', () => {
    const nasty = room('r', 'Bath <"&\'>', 0, 0, 3, 2.4)
    const c = roomTileCoursing(nasty, {
      id: 'm',
      name: 'Porcelain 600',
      moduleMm: [600, 600],
    } as never)!
    const svg = tileLayoutSvg(plan([nasty]), [c], { palette: PALETTE, widthPx: 1000 })
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&amp;')
    expect(svg).not.toMatch(/<text[^>]*>[^<]*<"/)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('does not throw on an empty or malformed plan', () => {
    expect(() => tileLayoutSvg({} as unknown as FloorPlan, [], { palette: PALETTE })).not.toThrow()
    expect(() =>
      tileLayoutSvg(null as unknown as FloorPlan, [], { palette: PALETTE }),
    ).not.toThrow()
  })
})

describe('tileLayoutSvg — note that will not fit its room', () => {
  it('tags a narrow room and moves the note to the key, instead of overlapping', () => {
    // Drawn inline unconditionally, the notes for small rooms overlapped
    // illegibly — three of them collided in the first frame of this sheet.
    const narrow = room('wc', 'Bath/WC 1', 0, 0, 1.2, 1.6)
    const c = roomTileCoursing(narrow, {
      id: 'm',
      name: 'Porcelain 600',
      moduleMm: [600, 600],
    } as never)!
    const svg = tileLayoutSvg(plan([narrow]), [c], { palette: PALETTE, widthPx: 500 })
    // Tag on the plan…
    expect(svg).toMatch(/font-weight="bold">T1</)
    // …full text in the key below, once.
    expect(svg).toContain('T1 — Bath/WC 1 · 600×600')
    // And NOT drawn inline as well.
    const inline = svg.slice(0, svg.indexOf('class="legend"'))
    expect(inline).not.toContain('Bath/WC 1 · 600×600')
  })

  it('keeps the note inline when the room is wide enough', () => {
    const wide = room('liv', 'Living', 0, 0, 8, 4)
    const c = roomTileCoursing(wide, {
      id: 'm',
      name: 'Porcelain 600',
      moduleMm: [600, 600],
    } as never)!
    const svg = tileLayoutSvg(plan([wide]), [c], { palette: PALETTE, widthPx: 1400 })
    const inline = svg.slice(0, svg.indexOf('class="legend"'))
    expect(inline).toContain('Living · 600×600')
    expect(svg).not.toContain('T1 —')
  })

  it('grows the sheet height for the key rather than clipping it', () => {
    const narrow = room('wc', 'Bath/WC 1', 0, 0, 1.2, 1.6)
    const c = roomTileCoursing(narrow, {
      id: 'm',
      name: 'Porcelain 600',
      moduleMm: [600, 600],
    } as never)!
    const tagged = tileLayoutSvg(plan([narrow]), [c], { palette: PALETTE, widthPx: 500 })
    const untagged = tileLayoutSvg(plan([narrow]), [], { palette: PALETTE, widthPx: 500 })
    const h = (s: string) => Number(/height="([\d.]+)"/.exec(s)![1])
    expect(h(tagged)).toBeGreaterThan(h(untagged))
  })
})
