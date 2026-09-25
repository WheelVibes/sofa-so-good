// @vitest-environment happy-dom
import { deflateSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import {
  installShareRouteListener,
  loadSharedDesignFromUrl,
  onShareRouteChange,
  resetShareRouteListenerForTests,
} from '../state/storage/bootstrap'
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
  isShowroomRoute,
  parseDesignRoute,
} from './designShare'
import { encodePlan } from './planShare'

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

    const { design, viewOnly } = decodeDesignShareCode(code)
    expect(viewOnly).toBe(false)
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
    const { design } = decodeDesignShareCode(encodeDesignShareCode(useStore.getState()))
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
    const { design } = decodeDesignShareCode(encodeDesignShareCode(useStore.getState()))
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

describe('viewOnly capability flag (U1 showroom links)', () => {
  it('omits the key entirely for an editable link — old links stay byte-identical', () => {
    seedDesign()
    // `serialize()` stamps a millisecond `savedAt`, so two payloads built a tick
    // apart legitimately differ; normalise it and everything else must match.
    const legacy = buildDesignSharePayload(useStore.getState())
    const explicitFalse = buildDesignSharePayload(useStore.getState(), false)
    expect('viewOnly' in legacy).toBe(false)
    expect('viewOnly' in explicitFalse).toBe(false)
    // An explicit `false` behaves exactly like the default — same keys, same values.
    expect(Object.keys(explicitFalse).sort()).toEqual(Object.keys(legacy).sort())
    expect({ ...explicitFalse, savedAt: legacy.savedAt }).toEqual(legacy)
    // …so the encoded bytes are what the pre-showroom encoder produced, too.
    expect(encodePlan({ ...explicitFalse, savedAt: legacy.savedAt })).toBe(encodePlan(legacy))
  })

  it('round-trips viewOnly: true through encode → decode alongside the design', () => {
    const roomId = seedDesign()
    const { design, viewOnly } = decodeDesignShareCode(
      encodeDesignShareCode(useStore.getState(), true),
    )
    expect(viewOnly).toBe(true)
    // The design itself is unaffected by the envelope flag.
    expect(design.floorPlan?.name).toBe('Shared 3D Flat')
    expect(design.finishes.floor[roomId]).toBe('mat:test-oak')
  })

  it('keeps the flag OUT of the validated design, so it can never reach a save', () => {
    seedDesign()
    const { design } = decodeDesignShareCode(encodeDesignShareCode(useStore.getState(), true))
    // zod strips unknown keys — the capability is envelope-only by construction.
    expect('viewOnly' in design).toBe(false)
  })

  it('reads a legacy (pre-showroom) code as editable — backwards compatible', () => {
    seedDesign()
    // Exactly what an older build emitted: the payload with no envelope key.
    const legacy = encodePlan(buildDesignSharePayload(useStore.getState()))
    const { design, viewOnly } = decodeDesignShareCode(legacy)
    expect(viewOnly).toBe(false)
    expect(design.floorPlan?.name).toBe('Shared 3D Flat')
  })

  it('only honours a literal `true` — a hand-edited truthy value is not the contract', () => {
    seedDesign()
    const payload = buildDesignSharePayload(useStore.getState()) as Record<string, unknown>
    for (const bogus of [1, 'yes', {}, 'true']) {
      const { viewOnly } = decodeDesignShareCode(encodePlan({ ...payload, viewOnly: bogus }))
      expect(viewOnly).toBe(false)
    }
  })

  it('routes a showroom link to #/showroom/ and still parses its code', () => {
    const code = 'aB-_123'
    expect(designShareHash(code, true)).toBe(`#/showroom/${code}`)
    expect(designShareHash(code)).toBe(`#/design/${code}`)
    expect(buildDesignShareUrl(code, true)).toMatch(/#\/showroom\/aB-_123$/)
    // Both routes decode to the same code, so one loader handles both.
    expect(parseDesignRoute(`#/showroom/${code}`)).toBe(code)
    expect(parseDesignRoute(`#showroom/${code}`)).toBe(code)
    expect(isShowroomRoute(`#/showroom/${code}`)).toBe(true)
    expect(isShowroomRoute(`#/design/${code}`)).toBe(false)
    expect(isShowroomRoute(null)).toBe(false)
  })
})

describe('loadSharedDesignFromUrl — showroom links', () => {
  it('enters view-only mode, withholds the editing flags, and KEEPS the hash', async () => {
    seedDesign()
    const code = encodeDesignShareCode(useStore.getState(), true)

    useStore.getState().__resetForTest()
    expect(useStore.getState().viewOnly).toBe(false)
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()

    const s = useStore.getState()
    expect(s.floorPlan.name).toBe('Shared 3D Flat')
    expect(s.viewOnly).toBe(true)
    expect(s.featureFlags.floorPlanEditor).toBe(false)
    expect(s.featureFlags.modelUpload).toBe(false)
    // …while the tour stays whole.
    expect(s.featureFlags.shareExport).toBe(true)
    expect(s.featureFlags.walkthrough).toBe(true)
    // The fragment survives so a reload returns to the showroom, not a blank flat.
    expect(window.location.hash).toBe(designShareHash(code, true))
    expect(s.notifications.some((n) => n.title.includes('Showroom'))).toBe(true)

    window.location.hash = ''
    useStore.getState().__resetForTest()
  })

  it('honours the #/showroom/ route even if the payload flag is missing', async () => {
    seedDesign()
    // An editable-payload code served on the showroom route (hand-built link, or
    // a payload from an older encoder): the route alone must still gate.
    const code = encodeDesignShareCode(useStore.getState(), false)

    useStore.getState().__resetForTest()
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()

    expect(useStore.getState().viewOnly).toBe(true)
    window.location.hash = ''
    useStore.getState().__resetForTest()
  })

  it('honours the payload flag even on the plain #/design/ route', async () => {
    seedDesign()
    const code = encodeDesignShareCode(useStore.getState(), true)

    useStore.getState().__resetForTest()
    window.location.hash = designShareHash(code, false)
    await loadSharedDesignFromUrl()

    expect(useStore.getState().viewOnly).toBe(true)
    window.location.hash = ''
    useStore.getState().__resetForTest()
  })

  it('leaves an ordinary 3D link fully editable and still clears its hash', async () => {
    seedDesign()
    const code = encodeDesignShareCode(useStore.getState())

    useStore.getState().__resetForTest()
    window.location.hash = designShareHash(code)
    await loadSharedDesignFromUrl()

    expect(useStore.getState().viewOnly).toBe(false)
    expect(window.location.hash).toBe('')
    useStore.getState().__resetForTest()
  })
})

/**
 * SHARE-ROUTE-REACTIVE (audit finding V12) — the route used to be read at boot only,
 * so an in-session hash change to `#/showroom/<code>` opened the sender's design with
 * every authoring surface intact.
 */
describe('in-session share-route changes', () => {
  it('a hashchange into #/showroom/ gates the already-booted session', async () => {
    seedDesign()
    const code = encodeDesignShareCode(useStore.getState(), true)

    useStore.getState().__resetForTest()
    resetShareRouteListenerForTests()
    installShareRouteListener()
    expect(useStore.getState().viewOnly).toBe(false)

    // A real same-document hash change — exactly what pasting a showroom link into
    // the address bar of an open tab does.
    window.location.hash = designShareHash(code, true)
    await new Promise((r) => setTimeout(r, 0))

    const s = useStore.getState()
    expect(s.viewOnly).toBe(true)
    expect(s.floorPlan.name).toBe('Shared 3D Flat')
    expect(s.featureFlags.floorPlanEditor).toBe(false)
    expect(window.location.hash).toBe(designShareHash(code, true))

    window.location.hash = ''
    resetShareRouteListenerForTests()
    useStore.getState().__resetForTest()
  })

  it('a hashchange to an ordinary #/design/ link from a showroom un-gates it, like a fresh load', async () => {
    seedDesign()
    const editable = encodeDesignShareCode(useStore.getState(), false)

    useStore.getState().__resetForTest()
    useStore.getState().setViewOnly(true)
    window.location.hash = designShareHash(editable, false)
    await onShareRouteChange()

    expect(useStore.getState().viewOnly).toBe(false)
    expect(window.location.hash).toBe('')
    useStore.getState().__resetForTest()
  })

  it('leaving a showroom route with no route left forces a real document load', async () => {
    useStore.getState().__resetForTest()
    useStore.getState().setViewOnly(true)
    window.location.hash = '#/not-a-route'
    const reload = vi.fn()
    const spy = vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      ...window.location,
      hash: '#/not-a-route',
      reload,
    } as unknown as Location)

    await onShareRouteChange()
    expect(reload).toHaveBeenCalledTimes(1)

    spy.mockRestore()
    window.location.hash = ''
    useStore.getState().__resetForTest()
  })

  it('does nothing when an ordinary editable session changes hash to a non-route', async () => {
    useStore.getState().__resetForTest()
    window.location.hash = '#/not-a-route'
    await onShareRouteChange()
    expect(useStore.getState().viewOnly).toBe(false)
    window.location.hash = ''
    useStore.getState().__resetForTest()
  })
})
