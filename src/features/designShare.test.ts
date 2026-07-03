// @vitest-environment happy-dom
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { loadSharedDesignFromUrl } from '../state/storage/bootstrap'
import { useStore } from '../state/store'
import {
  applySharedDesign,
  buildDesignSharePayload,
  buildDesignShareUrl,
  DESIGN_CODE_BUDGET,
  DesignShareError,
  DesignShareTooLargeError,
  decodeDesignShareCode,
  designShareHash,
  encodeDesignShareCode,
  parseDesignRoute,
} from './designShare'

const BUILTIN_ID = Object.keys(BUILTIN_CATALOG)[0]

function toCode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Seed the store with a recognisable design: custom plan + items + finishes. */
function seedDesign() {
  useStore.getState().__resetForTest()
  const s = useStore.getState()
  const roomId = s.floorPlan.rooms[0].id
  useStore.setState({
    floorPlan: { ...s.floorPlan, id: 'custom-3d-share', name: 'Shared 3D Flat' },
    items: [
      { id: 'i1', defId: BUILTIN_ID, position: [1, 1], rotation: 0, props: {} },
      { id: 'i2', defId: 'user-ghost-model', position: [2, 2], rotation: 90, props: {} },
    ],
    finishes: {
      ...s.finishes,
      floor: { ...s.finishes.floor, [roomId]: 'mat:test-oak' },
      walls: { ...s.finishes.walls, [roomId]: 'mat:test-lime' },
    },
  })
  return roomId
}

describe('encodeDesignShareCode / decodeDesignShareCode', () => {
  it('round-trips items + finishes + a custom plan through a #/design code', () => {
    const roomId = seedDesign()
    const code = encodeDesignShareCode(useStore.getState())
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThanOrEqual(DESIGN_CODE_BUDGET)

    const design = decodeDesignShareCode(code)
    expect(design.floorPlan?.name).toBe('Shared 3D Flat')
    expect(design.items.map((i) => i.defId)).toEqual([BUILTIN_ID, 'user-ghost-model'])
    expect(design.finishes.floor[roomId]).toBe('mat:test-oak')
    expect(design.finishes.walls[roomId]).toBe('mat:test-lime')
  })

  it('carries pinned design comments through the share code (F24)', () => {
    seedDesign()
    useStore.getState().addComment({ position: [1.5, 2.5], text: 'love this corner' })
    const upId = useStore
      .getState()
      .addComment({ position: [3, 4], text: 'too dark up here', levelId: 'lvl-2' })!
    useStore.getState().setCommentResolved(upId, true)
    // The payload reuses serialize, so comments ride along…
    const payload = buildDesignSharePayload(useStore.getState())
    expect(payload.comments).toHaveLength(2)
    // …and survive the encode → decode round-trip with level + resolved state.
    const design = decodeDesignShareCode(encodeDesignShareCode(useStore.getState()))
    expect(design.comments?.[0]).toMatchObject({
      position: [1.5, 2.5],
      text: 'love this corner',
      resolved: false,
    })
    expect(design.comments?.[1]).toMatchObject({ levelId: 'lvl-2', resolved: true })
  })

  it('strips session noise + non-portable defs from the payload', () => {
    seedDesign()
    useStore.setState({
      location: { lat: 1.35, lon: 103.87, label: 'home' },
      locationPromptDismissed: true,
      cameraMode: 'firstPerson',
      userFurniture: [
        {
          id: 'user-ghost-model',
          name: 'Ghost',
          category: 'decor',
          kind: 'gltf',
          source: 'user',
          assetId: 'asset-1',
          uploadedAt: '2026-01-01',
          defaultFootprint: { w: 1, d: 1, h: 1 },
        } as never,
      ],
    })
    const payload = buildDesignSharePayload(useStore.getState())
    expect(payload.location).toBeNull()
    expect(payload.locationPromptDismissed).toBe(false)
    expect(payload.cameraMode).toBe('orbit')
    expect(payload.userFurniture).toEqual([])
    expect(payload.userMaterials).toEqual([])
    // ...but the items themselves still travel (dropped with a count on open).
    expect(payload.items).toHaveLength(2)
  })

  it('rejects a design over the ~16 KB budget with a .sofa.json fallback message', () => {
    seedDesign()
    // An incompressible note blows the code straight past the budget.
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let noise = ''
    for (let i = 0; i < 64 * 1024; i++) noise += chars[Math.floor(Math.random() * chars.length)]
    useStore.setState({ designNote: noise })
    let err: unknown
    try {
      encodeDesignShareCode(useStore.getState())
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DesignShareTooLargeError)
    expect((err as Error).message).toContain('.sofa.json')
  })

  it('refuses a decompression bomb that fits the code budget', () => {
    // 8 MB of zeros deflates to a few KB (passes the 16 KB code cap) but blows
    // the 4 MB decompressed cap — the bounded inflate must abort, not expand.
    const bomb = new Uint8Array(8 * 1024 * 1024)
    const code = toCode(deflateSync(bomb, { level: 6 }))
    expect(code.length).toBeLessThanOrEqual(DESIGN_CODE_BUDGET)
    expect(() => decodeDesignShareCode(code)).toThrow(DesignShareTooLargeError)
  })

  it('rejects corrupt and non-design codes with a user-facing error', () => {
    expect(() => decodeDesignShareCode('garbage!!!')).toThrow(DesignShareError)
    const notADesign = toCode(deflateSync(new TextEncoder().encode('{"not":"a design"}')))
    expect(() => decodeDesignShareCode(notADesign)).toThrow(DesignShareError)
  })
})

describe('applySharedDesign', () => {
  it('drops items with unknown defIds and reports the count', () => {
    seedDesign()
    const design = decodeDesignShareCode(encodeDesignShareCode(useStore.getState()))
    const { patch, droppedCount } = applySharedDesign(design, new Set(Object.keys(BUILTIN_CATALOG)))
    expect(droppedCount).toBe(1) // 'user-ghost-model' can't travel in a URL
    expect(patch.items?.map((i) => i.defId)).toEqual([BUILTIN_ID])
  })
})

describe('design route helpers', () => {
  it('round-trips a code through the hash route', () => {
    const code = 'aB-_123'
    expect(parseDesignRoute(designShareHash(code))).toBe(code)
    expect(parseDesignRoute('#/design/xyz')).toBe('xyz')
    expect(parseDesignRoute('#design/xyz')).toBe('xyz')
  })
  it('returns null for non-design hashes (incl. plan links)', () => {
    expect(parseDesignRoute('')).toBeNull()
    expect(parseDesignRoute(null)).toBeNull()
    expect(parseDesignRoute('#/plans/xyz')).toBeNull()
  })
  it('builds a full share URL ending in the design hash', () => {
    expect(buildDesignShareUrl('abc')).toMatch(/#\/design\/abc$/)
  })
})

describe('loadSharedDesignFromUrl', () => {
  it('loads the shared design, drops unknown-def items, and clears the hash', async () => {
    seedDesign()
    const code = encodeDesignShareCode(useStore.getState())

    useStore.getState().__resetForTest()
    expect(useStore.getState().floorPlan.name).not.toBe('Shared 3D Flat')
    window.location.hash = designShareHash(code)
    await loadSharedDesignFromUrl()

    const s = useStore.getState()
    expect(s.floorPlan.name).toBe('Shared 3D Flat')
    expect(s.items.map((i) => i.defId)).toEqual([BUILTIN_ID]) // ghost item dropped
    expect(window.location.hash).toBe('')
    const toast = s.notifications.find((n) => n.title.includes('yours to edit'))
    expect(toast).toBeDefined()
    expect(toast?.message).toContain('1 item skipped')
  })

  it('is a no-op for non-design hashes', async () => {
    useStore.getState().__resetForTest()
    window.location.hash = '#/somewhere-else'
    const before = useStore.getState().floorPlan.name
    await loadSharedDesignFromUrl()
    expect(useStore.getState().floorPlan.name).toBe(before)
    window.location.hash = ''
  })
})
