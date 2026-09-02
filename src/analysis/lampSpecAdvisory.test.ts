import { describe, expect, it } from 'vitest'
import type { PlanRoom, RoomCategory } from '../floorplan/types'
import {
  buildLampSpecAdvisory,
  type LampSpecInput,
  TASK_CCT_K,
  WET_ROOM_MIN_IP,
} from './lampSpecAdvisory'

const room = (name: string, category: RoomCategory): PlanRoom =>
  ({ id: name, name, origin: [0, 0], width: 3, depth: 3, category }) as unknown as PlanRoom

const fixture = (over: Partial<LampSpecInput> = {}): LampSpecInput => ({
  id: 'f1',
  label: 'Ceiling light',
  room: room('Living', 'living'),
  cct: 3000,
  ip: 20,
  ...over,
})

describe('buildLampSpecAdvisory — ingress protection', () => {
  it('flags a sub-IP44 fixture in a BATH', () => {
    const a = buildLampSpecAdvisory([fixture({ room: room('Bath/WC 1', 'bath') })])
    const f = a.findings.find((x) => x.kind === 'ingress')
    expect(f).toBeTruthy()
    expect(f!.action).toContain(`IP${WET_ROOM_MIN_IP}`)
  })

  it('flags it in a POWDER room too', () => {
    const a = buildLampSpecAdvisory([fixture({ room: room('Powder', 'powder') })])
    expect(a.findings.some((x) => x.kind === 'ingress')).toBe(true)
  })

  it('does NOT flag an already wet-rated fixture', () => {
    const a = buildLampSpecAdvisory([fixture({ room: room('Bath/WC 1', 'bath'), ip: 44 })])
    expect(a.findings.some((x) => x.kind === 'ingress')).toBe(false)
  })

  it('does NOT flag a dry room', () => {
    const a = buildLampSpecAdvisory([fixture()])
    expect(a.findings).toEqual([])
  })

  it('phrases it as a prompt with the escape hatch, not a verdict', () => {
    // Zones are not modelled, so the check is room-level and may flag a fixture
    // outside both zones. A check that reads as a verdict gets ignored after the
    // second false alarm — so it must offer the out.
    const a = buildLampSpecAdvisory([fixture({ room: room('Bath/WC 1', 'bath') })])
    const f = a.findings.find((x) => x.kind === 'ingress')!
    expect(f.action).toMatch(/or confirm this one sits outside both zones/i)
    expect(f.action).not.toMatch(/not permitted|illegal|must not/i)
  })
})

describe('buildLampSpecAdvisory — colour temperature', () => {
  it('raises warm white in a KITCHEN', () => {
    const a = buildLampSpecAdvisory([fixture({ room: room('Kitchen', 'kitchen') })])
    const f = a.findings.find((x) => x.kind === 'colour-temperature')
    expect(f).toBeTruthy()
    expect(f!.action).toContain(`${TASK_CCT_K}K`)
  })

  it('does NOT raise it for a neutral fixture', () => {
    const a = buildLampSpecAdvisory([fixture({ room: room('Kitchen', 'kitchen'), cct: 4000 })])
    expect(a.findings.some((x) => x.kind === 'colour-temperature')).toBe(false)
  })

  it('does NOT raise it in a living room or bedroom — warm is correct there', () => {
    for (const c of ['living', 'bedroom', 'masterBedroom'] as RoomCategory[]) {
      const a = buildLampSpecAdvisory([fixture({ room: room('R', c) })])
      expect(
        a.findings.some((x) => x.kind === 'colour-temperature'),
        c,
      ).toBe(false)
    }
  })

  it('raises BOTH findings for a warm indoor fixture in a bathroom', () => {
    // A bath is both wet AND a task space, so the two checks are independent.
    const a = buildLampSpecAdvisory([fixture({ room: room('Bath/WC 1', 'bath') })])
    expect(a.findings.map((f) => f.kind).sort()).toEqual(['colour-temperature', 'ingress'])
  })
})

describe('buildLampSpecAdvisory — honesty', () => {
  it('counts what was CHECKED so "all clear" cannot mean "nothing looked at"', () => {
    expect(buildLampSpecAdvisory([fixture(), fixture({ id: 'f2' })]).checked).toBe(2)
    expect(buildLampSpecAdvisory([]).checked).toBe(0)
  })

  it('skips a fixture with no resolved room without counting it', () => {
    // A fixture outside every room has no room use to check against.
    const orphan = { ...fixture(), room: undefined } as unknown as LampSpecInput
    const a = buildLampSpecAdvisory([orphan])
    expect(a.checked).toBe(0)
    expect(a.findings).toEqual([])
  })

  it('always carries the room-level scope caveat', () => {
    const a = buildLampSpecAdvisory([])
    expect(a.scopeNote).toMatch(/per ROOM, not per bathroom zone/i)
    expect(a.scopeNote).toMatch(/will not miss one inside them/i)
  })

  it('infers the room use from the NAME when no category is set', () => {
    // RM1: explicit category wins, else the name classifier — so a plan whose
    // rooms predate categories still gets the checks.
    const named = { ...fixture(), room: room('Bath/WC 2', undefined as never) }
    expect(buildLampSpecAdvisory([named]).findings.some((f) => f.kind === 'ingress')).toBe(true)
  })
})

describe('resolveLampSpec — the per-item override', () => {
  it('prefers the item props over the registry default', async () => {
    const { resolveLampSpec } = await import('../furniture/lightEmitters')
    // Registry default for a ceiling light is 3000K / IP20.
    expect(resolveLampSpec('ceiling-light' as never, {})).toEqual({ cct: 3000, ip: 20 })
    expect(resolveLampSpec('ceiling-light' as never, { lampCct: 4000, lampIp: 44 })).toEqual({
      cct: 4000,
      ip: 44,
    })
  })

  it('takes each field independently — one override does not reset the other', () => {
    return import('../furniture/lightEmitters').then(({ resolveLampSpec }) => {
      expect(resolveLampSpec('ceiling-light' as never, { lampIp: 44 })).toEqual({
        cct: 3000,
        ip: 44,
      })
    })
  })

  it('does NOT read the render overrides — they are a separate register', async () => {
    const { resolveLampSpec } = await import('../furniture/lightEmitters')
    // `lightColor`/`lightIntensity` retint and rebrighten the 3D view. Letting
    // them move the SPEC would mean a night-render tweak silently changed the
    // product a contractor is asked to buy.
    const spec = resolveLampSpec('ceiling-light' as never, {
      lightColor: '#88ccff',
      lightIntensity: 12,
    })
    expect(spec).toEqual({ cct: 3000, ip: 20 })
  })

  it('falls back to the generic indoor spec for an unregistered def', async () => {
    const { resolveLampSpec } = await import('../furniture/lightEmitters')
    // A user light-source override on an arbitrary item still needs a spec to
    // quote, rather than a blank schedule cell.
    expect(resolveLampSpec('side-table' as never, {})).toEqual({ cct: 3000, ip: 20 })
  })

  it('clears the wet-room advisory once an IP44 fixture is specified', () => {
    const wet = room('Bath/WC 1', 'bath')
    const before = buildLampSpecAdvisory([fixture({ room: wet, ip: 20 })])
    const after = buildLampSpecAdvisory([fixture({ room: wet, ip: 44 })])
    expect(before.findings.some((f) => f.kind === 'ingress')).toBe(true)
    expect(after.findings.some((f) => f.kind === 'ingress')).toBe(false)
  })
})
