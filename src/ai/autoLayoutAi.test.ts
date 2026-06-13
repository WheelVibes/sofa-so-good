import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/featureFlags'
import { buildLayoutRequest, parseLayoutResponse, requestAutoLayout } from './autoLayoutAi'

describe('requestAutoLayout (no-key guard)', () => {
  it('rejects with a clear error when no API key is set (no network)', async () => {
    await expect(
      requestAutoLayout([{ name: 'Living', w: 4, d: 3 }], ['sofa-3seat'], 'cosy', {
        validRooms: new Set(['Living']),
        key: '',
      }),
    ).rejects.toThrow(/key/i)
  })
})

describe('aiLayout flag tiering', () => {
  it('is a pro feature: hidden in Simple, present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').aiLayout).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').aiLayout).toBe(true)
  })
})

const rooms = [
  { name: 'Living', w: 4, d: 3 },
  { name: 'Bedroom', w: 3, d: 3 },
]
const defIds = ['sofa-3seat', 'bed-double', 'coffee-table']

describe('buildLayoutRequest', () => {
  it('embeds the rooms (with sizes), allowed ids, and brief', () => {
    const req = buildLayoutRequest(rooms, defIds, 'cosy scandi', 'm')
    const user = req.messages[1].content as string
    expect(user).toContain('Living (4.0×3.0 m)')
    expect(user).toContain('sofa-3seat')
    expect(user).toContain('cosy scandi')
    expect(req.model).toBe('m')
    expect(req.messages[0].role).toBe('system')
  })

  it('falls back to a default brief when none is given', () => {
    const req = buildLayoutRequest(rooms, defIds, '', 'm')
    expect(req.messages[1].content as string).toMatch(/Furnish the home/i)
  })
})

describe('parseLayoutResponse', () => {
  const opts = { validDefIds: new Set(defIds), validRooms: new Set(['Living', 'Bedroom']) }

  it('parses placements out of fenced JSON and drops invalid entries', () => {
    const text =
      'Sure!\n```json\n{"items":[' +
      '{"defId":"sofa-3seat","room":"Living","x":2,"z":1.5,"rotation":0},' +
      '{"defId":"unknown-def","room":"Living","x":1,"z":1},' + // bad defId
      '{"defId":"bed-double","room":"Garage","x":1,"z":1},' + // bad room
      '{"defId":"coffee-table","room":"Living","x":"nope","z":1},' + // bad coord
      '{"defId":"bed-double","room":"Bedroom","x":1.5,"z":1.5}' +
      ']}\n```'
    const out = parseLayoutResponse(text, opts)
    expect(out.map((p) => p.defId)).toEqual(['sofa-3seat', 'bed-double'])
    expect(out[0]).toMatchObject({ room: 'Living', x: 2, z: 1.5, rotation: 0 })
  })

  it('defaults a non-finite rotation to 0', () => {
    const out = parseLayoutResponse(
      '{"items":[{"defId":"sofa-3seat","room":"Living","x":1,"z":1}]}',
      opts,
    )
    expect(out[0].rotation).toBe(0)
  })

  it('returns [] for empty / non-JSON / wrong-shape replies', () => {
    expect(parseLayoutResponse('', opts)).toEqual([])
    expect(parseLayoutResponse('no json here', opts)).toEqual([])
    expect(parseLayoutResponse('{"walls":[]}', opts)).toEqual([])
  })
})
