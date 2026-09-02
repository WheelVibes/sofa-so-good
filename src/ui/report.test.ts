import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { defaultParamProps } from '../furniture/types'
import { buildReportHtml } from './report'

describe('buildReportHtml', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('includes the plan name, room areas, a budget total and the hero image', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, 'data:image/png;base64,AAAA')
    expect(html).toContain(plan.name)
    expect(html).toContain('Living / Dining')
    expect(html).toMatch(/Total interior/)
    expect(html).toMatch(/\$[\d,]+/) // a dollar amount
    expect(html).toContain('data:image/png;base64,AAAA')
  })

  it('rejects a hero URL that is not a data:image/ URL (defence-in-depth)', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, 'javascript:alert(1)//')
    expect(html).not.toContain('javascript:alert(1)')
    expect(html).not.toContain('<img class="hero"')
    // A valid data-image URL is still embedded.
    const ok = buildReportHtml(plan, items, BUILTIN_CATALOG, 'data:image/png;base64,AAAA')
    expect(ok).toContain('<img class="hero"')
  })

  it('includes a Wall elevations section with per-wall drawings for the furnished flat', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Wall elevations')
    expect(html).toContain('class="elev-grid"')
    // At least one elevation figure with an embedded SVG.
    expect(html).toContain('class="elev-fig"')
    expect(html).toMatch(/<figcaption>Wall \d+ ·/)
    expect(html).toContain('wall elevation,') // svg aria-label
  })

  it('omits the elevations section when there is no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Wall elevations')
  })

  it('includes a cross-section for the furnished flat AND for a bare shell', () => {
    const furnished = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(furnished).toContain('Section A')
    expect(furnished).toContain('class="walls"') // cut wall columns
    expect(furnished).toContain('class="items"') // furniture silhouettes beyond the cut
    // The default flat's plan walls produce a section even with no furniture;
    // the section block stays (graceful), just without silhouettes.
    const bare = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(bare).toContain('Section A')
    expect(bare).not.toContain('class="items"')
  })

  it('includes a Design score section with an overall grade and per-category bars', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Design score')
    expect(html).toContain('class="ds-grade"')
    expect(html).toContain('class="score-fill"')
    expect(html).toMatch(/\/100/)
    for (const label of [
      'Clearance &amp; fit',
      'Furnishing balance',
      'Circulation',
      'Lighting coverage',
    ])
      expect(html).toContain(label)
  })

  it('omits the Design score section when there is no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Design score')
  })

  it('includes an Accessibility section with door-width + turning-circle checks', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Accessibility')
    // Metric: formatLength(0.85, 'metric') = '0.85 m'
    expect(html).toMatch(/doors ≥ 0\.85 m clear/)
    expect(html).toMatch(/turning circle/)
  })

  it('uses imperial units in the Accessibility section when units=imperial', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'imperial')
    expect(html).toContain('Accessibility')
    // formatLength(0.85, 'imperial') → feet+inches, not metres
    expect(html).not.toMatch(/\d+\.\d+ m clear/)
    expect(html).toMatch(/turning circle/)
  })

  it('includes a Hacking & new walls section when the plan diverged from its baseline', () => {
    // Baseline = the default flat; current = default minus one wall (a "hack").
    const baseline = buildDefaultPlan()
    const current = { ...plan, walls: plan.walls.slice(0, -1) }
    const html = buildReportHtml(
      current,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      undefined,
      baseline,
    )
    expect(html).toContain('Hacking &amp; new walls')
    expect(html).toMatch(/wall(s)? hacked/)
    // No baseline → no section.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toContain(
      'Hacking &amp; new walls',
    )
  })

  it('includes an auto-dimensioned plan drawing', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Dimensioned plan')
    expect(html).toMatch(/<svg/)
  })

  it('includes a Renovation timeline with phases + an estimated duration', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Renovation timeline')
    expect(html).toMatch(/Estimated duration/)
    expect(html).toMatch(/weeks \(\d+ working days\)/)
  })

  it('includes HDB compliance hints (permit/caution advisories) for the default flat', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('HDB compliance hints')
    expect(html).toMatch(/permit-sensitive/)
  })

  it('collapses identical advisories into one ×N entry (UIUX-54)', () => {
    // The structural-wall rule emits one advisory PER external wall with the
    // same title + paragraph verbatim — the default flat printed a dozen
    // indistinguishable copies. Two identical external walls → ONE entry with
    // a ×2 count; advisories whose detail differs (per-wall lengths, per-room
    // names) must stay separate, so the grouped entry keeps the true count.
    const twoExternal = {
      ...plan,
      walls: [
        {
          id: 'wa',
          start: [0, 0] as [number, number],
          end: [6, 0] as [number, number],
          thickness: 'external' as const,
        },
        {
          id: 'wb',
          start: [0, 3] as [number, number],
          end: [6, 3] as [number, number],
          thickness: 'external' as const,
        },
      ],
    }
    const html = buildReportHtml(twoExternal, [], BUILTIN_CATALOG, null)
    const copies = html.match(/Likely structural wall — hacking is restricted/g) ?? []
    expect(copies.length).toBe(1)
    expect(html).toContain('Likely structural wall — hacking is restricted ×2')
  })

  it('gates the HDB-compliance section to housingType==="HDB" (SG1)', () => {
    // No category (back-compat) keeps the prior default: full HDB section.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).toContain('HDB compliance hints')

    const condo = {
      ...plan,
      category: { housingType: 'Condominium' as const, projectName: 'p', apartmentType: 'a' },
    }
    const condoHtml = buildReportHtml(condo, items, BUILTIN_CATALOG, null)
    expect(condoHtml).not.toContain('HDB compliance hints')
    expect(condoHtml).toContain('Renovation compliance notes')
    expect(condoHtml).toContain('MCST')

    const landed = {
      ...plan,
      category: { housingType: 'Landed' as const, projectName: 'p', apartmentType: 'a' },
    }
    const landedHtml = buildReportHtml(landed, items, BUILTIN_CATALOG, null)
    expect(landedHtml).not.toContain('HDB compliance hints')
    expect(landedHtml).toContain('Renovation compliance notes')
    expect(landedHtml).toContain('BCA')
  })

  it('surfaces the stair-connectivity advisory for a stair-less multi-storey plan', () => {
    const multi = {
      ...plan,
      upperLevels: [
        {
          id: 'up',
          name: 'Upper storey',
          elevation: 2.9,
          walls: [],
          openings: [],
          rooms: [
            {
              id: 'u-bed',
              name: 'Bedroom',
              origin: [1, 1] as [number, number],
              width: 3,
              depth: 3,
            },
          ],
        },
      ],
    }
    const html = buildReportHtml(multi, items, BUILTIN_CATALOG, null)
    expect(html).toContain('No staircase reaches Upper storey')
    // Single-storey plans never mention it.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toContain('No staircase')
  })

  it('includes an FF&E schedule with per-item rooms, sizes and a grand total', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('FF&amp;E schedule')
    expect(html).toContain('Size (W×D×H)')
    expect(html).toContain('class="ffe"')
    // Size cells use the "× × ×" form.
    expect(html).toMatch(/m × .*m × .*m/)
  })

  it('omits the FF&E schedule when there is no furniture', () => {
    expect(buildReportHtml(plan, [], BUILTIN_CATALOG, null)).not.toContain('FF&amp;E schedule')
  })

  it('includes a Lighting plan + schedule when the design has light fixtures', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    // The default move-in layout has ceiling lights / lamps.
    expect(html).toContain('Lighting plan')
    expect(html).toContain('lighting plan,') // svg aria-label
    expect(html).toMatch(/×\d+/) // a fixture quantity in the schedule
    expect(html).toContain('cd</td>') // intensity column (candela)
  })

  it('escapes user-controlled strings (plan name + note) to prevent HTML injection', () => {
    const evil = '"><script>alert(1)</script>'
    const html = buildReportHtml(
      { ...plan, name: evil },
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      evil, // project note
    )
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;') // the angle brackets are escaped
    expect(html).toContain('&quot;') // the breaking double-quote is escaped too
  })

  it('shows W×D dimensions for rectangular rooms in the rooms table', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    // Default HDB rooms are plain rectangles → a "× … m" dimension appears.
    expect(html).toContain('class="dim"')
    expect(html).toMatch(/\d+\.\d+ × \d+\.\d+ m/)
    // Room schedule has a header + a ceiling-height column.
    expect(html).toContain('Ceiling')
  })

  it('includes a furnishing-per-area figure when there is area + budget', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toMatch(/Furnishing per m²/)
    const imperial = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'imperial')
    expect(imperial).toMatch(/Furnishing per ft²/)
  })

  it('shows the budget target + over/under when one is set', () => {
    const under = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      1_000_000,
    )
    expect(under).toMatch(/Budget target/)
    expect(under).toMatch(/under/)
    const over = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      1,
    )
    expect(over).toMatch(/over/)
    // Omitted target → no budget-target row.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toMatch(/Budget target/)
  })

  it('renders a Finishes-by-room section when finishes are supplied', () => {
    const finishes = {
      floor: { livingDining: 'floor-wood-oak' },
      walls: { livingDining: 'wall-paint-white' },
    }
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'metric', finishes)
    expect(html).toContain('Finishes schedule')
    expect(html).toMatch(/Oak|oak/) // the resolved floor material name
    // Material codes + verify-on-site caveat (G4 — finish schedule depth).
    expect(html).toMatch(/FL-01/)
    expect(html).toMatch(/verify on site/i)
    // Renovation estimate: finishes subtotal + a combined furniture+finishes line.
    expect(html).toContain('Renovation estimate')
    expect(html).toContain('Finishes subtotal')
    expect(html).toContain('Furniture + finishes')
    expect(html).toMatch(/\$[\d,]+\/m²/) // a per-m² rate
  })

  it('omits the Renovation estimate when no finishes are supplied', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).not.toContain('Renovation estimate')
  })

  it('omits the Finishes section when no finishes are supplied', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).not.toContain('Finishes schedule')
  })

  it('includes + escapes a project note when supplied', () => {
    const html = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      'Warm <tones>',
    )
    expect(html).toContain('class="note"')
    expect(html).toContain('Warm &lt;tones&gt;')
    const none = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(none).not.toContain('class="note"')
  })

  it('omits the per-area figure with no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toMatch(/Furnishing per/)
  })

  it('reports the curated default layout as clear (UXW-P2-3)', () => {
    // The move-in layout used to ship a basin inside a door swing; since
    // v0.22.2.85 the default tables are clearance-clean (pinned by
    // furniture/defaultFlatClearance.test.ts) and the report reflects that.
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).not.toContain('block a doorway')
  })

  it('flags an item parked squarely in a doorway path', () => {
    // A wardrobe centred on a door opening — the report surfaces the same
    // blocker the in-app Checks overlay flags.
    const door = plan.openings.find((o) => o.kind === 'door')!
    const wall = plan.walls.find((w) => w.id === door.wallId)!
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    const cx = wall.start[0] + ux * (door.offset + door.width / 2)
    const cz = wall.start[1] + uz * (door.offset + door.width / 2)
    const blocker = {
      id: 'blocker',
      defId: 'wardrobe-3door',
      position: [cx, cz] as [number, number],
      rotation: 0,
      props: {},
    }
    const html = buildReportHtml(plan, [blocker], BUILTIN_CATALOG, null)
    expect(html).toContain('block a doorway')
  })

  it('reports all doorways clear when nothing blocks them', () => {
    // A wall-mounted piece is exempt from the doorway-path check, so a layout of
    // only mounted items reads as clear (doors present, nothing on the floor path).
    const mounted = Object.values(BUILTIN_CATALOG).find((d) => d.mounted)!
    const art = {
      id: 'art',
      defId: mounted.id,
      position: [5, 5] as [number, number],
      rotation: 0,
      props: {},
    }
    const html = buildReportHtml(plan, [art], BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('Everything fits')
  })

  it('omits the Clearance section with no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Clearance &amp; fit')
  })

  it('reports a narrow walkway between two close pieces', () => {
    // Two beds ~0.5 m apart (inside the narrow band 0.4–0.9 m, not overlapping).
    const a = {
      id: 'na',
      defId: 'bed-double',
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const b = { ...a, id: 'nb', position: [3, 4.5] as [number, number] }
    const html = buildReportHtml(plan, [a, b], BUILTIN_CATALOG, null)
    expect(html).toMatch(/narrow walkway/i)
  })

  it('reports overlapping items and pieces inside a wall', () => {
    const overlapA = {
      id: 'oa',
      defId: 'sofa-3seat',
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const overlapB = { ...overlapA, id: 'ob', position: [3.3, 3.1] as [number, number] }
    // A sofa straddling the south external wall (z=0) is embedded in a wall.
    const inWall = { ...overlapA, id: 'iw', position: [2, 0] as [number, number] }
    const html = buildReportHtml(plan, [overlapA, overlapB, inWall], BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('of items overlap')
    expect(html).toContain('sit inside a wall')
  })

  it('handles an empty layout and a missing hero image', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('No furniture placed.')
    expect(html).not.toContain('<img')
  })

  it('includes print page-break rules so PDF sections stay whole', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('@media print')
  })

  it('escapes HTML in the plan name', () => {
    const html = buildReportHtml({ ...plan, name: '<script>x</script>' }, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes a malicious user-furniture name in the shopping list', () => {
    // A user-uploaded/renamed piece carries an arbitrary `name`; it must be
    // escaped where the report lists it (def.name → the furniture rows).
    const evil = '<img src=x onerror=alert(1)>'
    const base = BUILTIN_CATALOG['sofa-3seat']
    const catalog = { ...BUILTIN_CATALOG, evil: { ...base, id: 'evil', name: evil } }
    const evilItem = {
      id: 'e1',
      defId: 'evil',
      position: [5, 5] as [number, number],
      rotation: 0,
      props: {},
    }
    const html = buildReportHtml(plan, [evilItem], catalog, null)
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('buildReportHtml — plan statistics digest (PARITY-PLAN-STATS)', () => {
  const plan = buildDefaultPlan()

  it('renders a Plan statistics section with the room-type breakdown', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Plan statistics')
    expect(html).toContain('Gross floor area')
    expect(html).toContain('Average room size')
    expect(html).toContain('Total wall length')
    expect(html).toContain('Room type')
  })
})

describe('buildReportHtml — daylight & ventilation (PARITY-DAYLIGHT-DIGEST)', () => {
  const plan = buildDefaultPlan()

  it('renders a Daylight & ventilation section with per-room glazing % for a windowed plan', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Daylight &amp; ventilation')
    // The pass-count summary uses the module thresholds (10% glazing / 5% openable).
    expect(html).toMatch(/rooms meet daylight ≥ 10% glazing/)
    expect(html).toMatch(/meet ventilation ≥ 5% openable/)
    // Per-room table column headers.
    expect(html).toContain('>Glazing</td>')
    expect(html).toContain('>Openable</td>')
  })

  it('omits the section for a bare shell with no windowed rooms', () => {
    const bare = { ...plan, openings: [] }
    const html = buildReportHtml(bare, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Daylight &amp; ventilation')
  })
})

describe('buildReportHtml — openings schedule (PARITY-OPENING-SCHED)', () => {
  const plan = buildDefaultPlan()

  it('renders an Openings schedule with typed marks + a door/window count', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Openings schedule')
    expect(html).toContain('Doors &amp; windows')
    // Size column + at least one typed mark (D1/W1).
    expect(html).toContain('Size (W×H)')
    expect(html).toMatch(/>[DW]1<\/td>/)
    // Size cells use the "× " form (W × H).
    expect(html).toMatch(/m × .*m/)
  })

  it('omits the Openings schedule for a plan with no openings', () => {
    const bare = { ...plan, openings: [] }
    const html = buildReportHtml(bare, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Openings schedule')
  })
})
describe('buildReportHtml — design suggestions (PARITY-SUGGESTIONS-SECTION)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('renders a Design suggestions section with per-room tips for the furnished default flat', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Design suggestions')
    // Plural-aware lead-in (the default flat produces multiple suggestions).
    expect(html).toMatch(/idea(s)? to add or improve, room by room/)
    // The rule engine fires the kitchen-storage idea on the default layout; the
    // room name heads its block.
    expect(html).toContain('Kitchen')
    expect(html).toContain('cabinets or shelving')
  })

  it('surfaces an empty-room furnishing tip for a bare habitable room', () => {
    // A single empty bedroom → the "start with a bed…" empty-bedroom tip.
    const bedroomOnly: typeof plan = {
      ...plan,
      rooms: [{ id: 'br', name: 'Master Bedroom', origin: [1, 1], width: 3, depth: 3 }],
    }
    const html = buildReportHtml(bedroomOnly, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Design suggestions')
    expect(html).toContain('Master Bedroom')
    expect(html).toMatch(/Furnish this room — start with a bed/)
  })

  it('omits the Design suggestions section when the rules produce nothing', () => {
    // A plan with no rooms yields no suggestions → no section.
    const noRooms: typeof plan = { ...plan, rooms: [] }
    const html = buildReportHtml(noRooms, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Design suggestions')
  })
})

describe('buildReportHtml — move-in / handover checklist (PARITY-MOVEIN-CHECKLIST)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('renders a Move-in checklist with per-room snags + the generic handover bucket', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Move-in checklist')
    // The kitchen snag rule + the always-present generic items.
    expect(html).toContain('Kitchen')
    expect(html).toMatch(/water-stop valves/i)
    expect(html).toContain('Keys, meters &amp; documents')
    expect(html).toMatch(/Collect all keys/i)
    // Checkbox glyph on each line.
    expect(html).toContain('☐')
  })

  it('still renders the generic handover group for a bare empty plan', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Move-in checklist')
    expect(html).toContain('Keys, meters &amp; documents')
  })
})

describe('buildReportHtml — multi-storey fan-out (F13)', () => {
  const plan = buildDefaultPlan()
  const upper = {
    id: 'up',
    name: 'Upper storey',
    elevation: 2.9,
    walls: [
      {
        id: 'uw1',
        start: [0.1, 0.1] as [number, number],
        end: [6, 0.1] as [number, number],
        thickness: 'external' as const,
      },
      {
        id: 'uw2',
        start: [0.1, 0.1] as [number, number],
        end: [0.1, 6] as [number, number],
        thickness: 'external' as const,
      },
    ],
    openings: [],
    rooms: [
      {
        id: 'up-bed',
        name: 'Bedroom (up)',
        origin: [0.2, 0.2] as [number, number],
        width: 5,
        depth: 5,
      },
    ],
  }
  const multi = { ...plan, upperLevels: [upper] }

  it('renders one captioned plan + dimensioned diagram per storey', () => {
    const html = buildReportHtml(multi, [], BUILTIN_CATALOG, null)
    // Storey captions above the per-level diagrams.
    expect(html).toContain('>Ground floor</div>')
    expect(html).toContain('>Upper storey</div>')
    // Upper rooms join the rooms table + total.
    expect(html).toContain('Bedroom (up)')
    // Single-storey reports carry no storey captions.
    const singleHtml = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(singleHtml).not.toContain('>Ground floor</div>')
  })

  it('filters lighting fixtures to their storey', () => {
    const lampUp = {
      id: 'l1',
      defId: 'floor-lamp',
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
      levelId: 'up',
    }
    const html = buildReportHtml(multi, [lampUp], BUILTIN_CATALOG, null)
    expect(html).toContain('Lighting plan')
    // Only the lit storey gets a diagram: one lighting-plan svg, captioned Upper.
    expect(html.match(/aria-label="lighting plan/g)).toHaveLength(1)
  })

  it('diffs demolition per storey and calls out an added storey', () => {
    const html = buildReportHtml(
      multi,
      [],
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      undefined,
      plan, // baseline without the upper storey
    )
    expect(html).toContain('Hacking &amp; new walls')
    expect(html).toContain('Entire storey added')
  })
})

describe('buildReportHtml — electrical points (PARITY-ELECTRICAL-SCHED)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('renders an indicative Electrical points section with per-room counts + a total', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Electrical points (indicative)')
    // Per-room table column headers.
    expect(html).toContain('>Lighting</td>')
    expect(html).toContain('>Power</td>')
    // The furnished default flat has lighting + power points → the lead-in
    // mentions both, and a grand-total row appears.
    expect(html).toMatch(/lighting · \d+ power/)
    // Labelled indicative, not a certified layout.
    expect(html).toMatch(/not a certified electrical layout/i)
  })

  it('still renders the section for a bare (unfurnished) plan with habitable rooms', () => {
    // No furniture: the per-kind socket floor still gives each habitable room
    // power points, so the section renders (lighting columns read 0).
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('Electrical points (indicative)')
  })

  it('omits the section for a plan with no rooms', () => {
    const noRooms = { ...plan, rooms: [] }
    const html = buildReportHtml(noRooms, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Electrical points (indicative)')
  })
})

describe('buildReportHtml — electrical points, persisted design overrides the heuristic (H-D3)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('uses the designed points ("as designed") instead of the heuristic when any exist', () => {
    const room = plan.rooms[0]!
    const designed = {
      ...plan,
      electricalPoints: [
        {
          id: 'e1',
          x: room.origin[0] + room.width / 2,
          z: room.origin[1] + room.depth / 2,
          kind: 'socket' as const,
          mountHeightMm: 300,
        },
        {
          id: 'e2',
          x: room.origin[0] + room.width / 2 + 0.2,
          z: room.origin[1] + room.depth / 2,
          kind: 'switch' as const,
          mountHeightMm: 1200,
        },
      ],
    }
    const html = buildReportHtml(designed, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Electrical points (as designed)')
    expect(html).not.toContain('Electrical points (indicative)')
    expect(html).toContain('2 points as placed in the plan')
    expect(html).toContain('300mm × 1')
    expect(html).toContain('1200mm × 1')
  })

  it('falls back to the heuristic "(indicative)" section when no points are designed yet', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Electrical points (indicative)')
    expect(html).not.toContain('Electrical points (as designed)')
  })
})

describe('report suggestions cover every storey (F13)', () => {
  /** The default flat plus one upstairs room the rule engine will fire on. */
  const withUpstairsRoom = () => {
    const base = buildDefaultPlan()
    return {
      ...base,
      upperLevels: [
        {
          id: 'upper',
          name: 'Upper',
          elevation: 3,
          walls: [],
          openings: [],
          rooms: [
            {
              id: 'u-liv',
              name: 'Upstairs Lounge',
              category: 'living',
              origin: [0, 0],
              width: 5,
              depth: 4,
            },
          ],
        },
      ],
    } as unknown as ReturnType<typeof buildDefaultPlan>
  }

  it('counts an UPSTAIRS room in the suggestion tally', async () => {
    // The discriminating measurement is the IDEAS COUNT, not the room name.
    // Asserting `toContain('Upstairs Lounge')` passes with or without the fix,
    // because several other sections name every room — measured directly in
    // both arms rather than reasoned about, after three earlier versions of
    // this test passed for the wrong reason. With the fix: 9 ideas. Without: 8.
    const { useStore } = await import('../state/store')
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const html = buildReportHtml(withUpstairsRoom(), [], BUILTIN_CATALOG, null)
    const tally = /(\d+) ideas? to add or improve/.exec(html)
    expect(tally, 'no Design suggestions tally in the report').toBeTruthy()
    expect(Number(tally![1])).toBe(9)
  })

  it('is one FEWER on the same plan with the storey removed', () => {
    // Pins the delta rather than the absolute, so a change to the rule set that
    // shifts the baseline does not silently make the test vacuous.
    const two = buildReportHtml(withUpstairsRoom(), [], BUILTIN_CATALOG, null)
    const oneStorey = buildReportHtml(
      { ...withUpstairsRoom(), upperLevels: [] } as unknown as ReturnType<typeof buildDefaultPlan>,
      [],
      BUILTIN_CATALOG,
      null,
    )
    const count = (h: string) => Number(/(\d+) ideas? to add or improve/.exec(h)![1])
    expect(count(two)).toBe(count(oneStorey) + 1)
  })
})
