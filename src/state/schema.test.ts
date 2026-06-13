import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { applySerialized, SerializedStateZ, serialize } from './schema'
import { useStore } from './store'

describe('schema', () => {
  it('serialize → parse round-trip preserves the persistent fields', () => {
    useStore.getState().__resetForTest()
    useStore.getState().resetToDefault()
    useStore.getState().setPresetTime('dusk')
    const out = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(out)
    expect(round.success).toBe(true)
    if (round.success) {
      expect(round.data.timeMode).toBe('manual')
      expect(round.data.manualHour).toBe(18)
      expect(round.data.items.length).toBeGreaterThan(0)
    }
  })

  it('round-trips a polygon (free-form / Auto-room) room shape on a custom plan', () => {
    useStore.getState().__resetForTest()
    const polygon: [number, number][] = [
      [0.2, 0.2],
      [4.0, 0.2],
      [4.0, 2.0],
      [2.0, 2.0],
      [2.0, 4.0],
      [0.2, 4.0],
    ]
    useStore.setState({
      floorPlan: {
        id: 'poly-plan',
        name: 'Poly',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'L', name: 'L-room', origin: [0.2, 0.2], width: 3.8, depth: 3.8, polygon }],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    const room = patch.floorPlan?.rooms.find((r) => r.id === 'L')
    expect(room?.polygon).toEqual(polygon)
  })

  it('round-trips plan notes (PARITY-DIMTEXT) on a custom plan', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'note-plan',
        name: 'Notes',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
        notes: [
          { id: 'n1', x: 1, z: 2, text: 'Feature wall' },
          { id: 'n2', x: 3, z: 1, text: 'Up here', levelId: 'lvl-2' },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.notes).toEqual([
      { id: 'n1', x: 1, z: 2, text: 'Feature wall' },
      { id: 'n2', x: 3, z: 1, text: 'Up here', levelId: 'lvl-2' },
    ])
  })

  it('round-trips per-room floor + wall finishes on a custom plan', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'finish-plan',
        name: 'Finishes',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [
          {
            id: 'R',
            name: 'Room',
            origin: [0.2, 0.2],
            width: 3.8,
            depth: 3.8,
            floor: 'floor-tile-grey',
            wall: 'wall-paint-sage',
          },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    const room = patch.floorPlan?.rooms.find((r) => r.id === 'R')
    expect(room?.floor).toBe('floor-tile-grey')
    expect(room?.wall).toBe('wall-paint-sage')
  })

  it('round-trips imported-GLB metadata on user furniture defs', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setUserFurniture([
      {
        id: 'user-abc',
        name: 'Wall Sconce',
        category: 'decor',
        kind: 'gltf',
        source: 'user',
        assetId: 'abc',
        uploadedAt: '2026-04-01T00:00:00.000Z',
        defaultFootprint: { w: 0.5, d: 0.3, h: 0.4 },
        mounted: true,
        noClip: true,
        verticalSpan: { base: 1.5, top: 2.1 },
        finishTargets: [{ key: 'shade', label: 'Shade' }],
        finishOverrides: { shade: 'mat:brass-01' },
      },
    ])
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const def = parsed.data.userFurniture.find((d) => d.id === 'user-abc')
      expect(def).toBeDefined()
      expect(def?.source).toBe('user')
      expect(def?.mounted).toBe(true)
      expect(def?.noClip).toBe(true)
      expect(def?.verticalSpan).toEqual({ base: 1.5, top: 2.1 })
      if (def?.source === 'user') {
        expect(def.finishTargets).toEqual([{ key: 'shade', label: 'Shade' }])
        expect(def.finishOverrides).toEqual({ shade: 'mat:brass-01' })
      }
    }
  })

  it('round-trips an IkeaGltfDef and strips variant runtime URLs', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setUserFurniture([
      {
        id: 'user-abc',
        name: 'Wall Sconce',
        category: 'decor',
        kind: 'gltf',
        source: 'user',
        assetId: 'abc',
        uploadedAt: '2026-04-01T00:00:00.000Z',
        defaultFootprint: { w: 0.5, d: 0.3, h: 0.4 },
        mounted: true,
        noClip: true,
        verticalSpan: { base: 1.5, top: 2.1 },
        finishTargets: [{ key: 'shade', label: 'Shade' }],
        finishOverrides: { shade: 'mat:brass-01' },
      },
      {
        id: 'ikea-malm',
        name: 'MALM',
        category: 'beds',
        kind: 'gltf',
        source: 'ikea',
        groupKey: 'malm',
        activeVariant: 'black-brown',
        variants: [
          {
            finish: 'black-brown',
            label: 'Black-brown',
            articleNumber: '1',
            url: 'https://x',
            assetId: 'a1',
            runtimeUrl: 'blob:should-be-stripped',
            imageAssetId: 'img-1',
            runtimeImageUrl: 'blob:img-should-be-stripped',
            price: 204,
            swatchHex: '#504c4b',
            footprint: { w: 1, d: 2, h: 1, anchorOffset: [0, 0.5, 0] },
            glbMaterials: [
              { name: 'material_0', hex: '#fff', metallic: 1, roughness: 1, textured: true },
            ],
          },
        ],
        defaultFootprint: { w: 1, d: 2, h: 1 },
        uploadedAt: '2026-05-31T00:00:00Z',
        license: 'IKEA',
        attribution: 'IKEA — imported model',
        sourceUrl: 'https://x',
      },
    ])
    const ser = serialize(useStore.getState())
    const reparsed = SerializedStateZ.parse(JSON.parse(JSON.stringify(ser)))
    const out = reparsed.userFurniture.find((d) => d.id === 'ikea-malm')
    expect(out).toBeTruthy()
    expect(out?.source).toBe('ikea')
    if (out?.source === 'ikea') {
      // runtimeUrl is stripped from the serialized shape (not in the type).
      expect((out.variants[0] as Record<string, unknown>).runtimeUrl).toBeUndefined()
      expect((out.variants[0] as Record<string, unknown>).runtimeImageUrl).toBeUndefined()
      expect(out.variants[0].assetId).toBe('a1')
      // imageAssetId persists so the thumbnail re-resolves on boot.
      expect((out.variants[0] as Record<string, unknown>).imageAssetId).toBe('img-1')
    }
    // The existing user def must still round-trip alongside the IKEA one.
    const userOut = reparsed.userFurniture.find((d) => d.id === 'user-abc')
    expect(userOut).toBeTruthy()
    expect(userOut?.source).toBe('user')
    if (userOut?.source === 'user') {
      expect(userOut.assetId).toBe('abc')
      expect(userOut.mounted).toBe(true)
    }
  })

  it('applySerialized drops items whose def is missing from the catalog', () => {
    useStore.getState().__resetForTest()
    useStore.getState().addItem({
      defId: 'unknown-def',
      position: [1, 1],
      rotation: 0,
      props: {},
    })
    useStore.getState().addItem({
      defId: 'bed-double',
      position: [2, 2],
      rotation: 0,
      props: {},
    })
    const saved = serialize(useStore.getState())
    const known = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(saved, known)
    expect(patch.items?.every((it) => known.has(it.defId))).toBe(true)
    expect(patch.items?.length).toBe(1)
  })

  it('round-trips a custom per-item label', () => {
    useStore.getState().__resetForTest()
    const id = useStore.getState().addItem({
      defId: 'bed-double',
      position: [2, 2],
      rotation: 0,
      props: {},
    })
    useStore.getState().renameItem(id, 'Master bed')
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const item = round.data.items.find((i) => i.defId === 'bed-double')
      expect(item?.label).toBe('Master bed')
    }
  })

  it("round-trips a parametric item's rich props (cabinet engine etc.)", () => {
    useStore.getState().__resetForTest()
    const props = {
      width: 0.8,
      height: 0.72,
      depth: 0.6,
      columns: 2,
      front: 'drawers',
      worktop: 'sink',
      handle: 'knob',
      color: '#3f5d52',
      finish: 'gloss',
    }
    useStore.getState().addItem({ defId: 'cabinet-base', position: [3, 3], rotation: 1, props })
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const item = round.data.items.find((i) => i.defId === 'cabinet-base')
      // Every prop must survive the save format verbatim.
      expect(item?.props).toEqual(props)
      expect(item?.rotation).toBe(1)
    }
    // And it must rehydrate back into the live store via applySerialized.
    const patch = applySerialized(saved, new Set(['cabinet-base']))
    const restored = patch.items?.find((i) => i.defId === 'cabinet-base')
    expect(restored?.props).toEqual(props)
  })

  it('applySerialized resets the session selection + hidden set', () => {
    const saved = {
      version: 2,
      items: [{ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} }],
      doors: {},
      finishes: { floor: {}, walls: {}, wallAccents: {} },
      timeMode: 'system',
    } as unknown as Parameters<typeof applySerialized>[0]
    const patch = applySerialized(saved, new Set(['bed-double']))
    expect(patch.selectedItemId).toBeNull()
    expect(patch.selectedItemIds).toEqual([])
    expect(patch.hiddenItemIds).toEqual([])
  })

  it('round-trips a custom plan’s wall colour', () => {
    useStore.getState().__resetForTest()
    // A custom plan (non-default) so floorPlan is serialized, with a wall colour.
    useStore.setState({
      floorPlan: { ...useStore.getState().floorPlan, id: 'custom-x', wallColor: '#2f6db0' },
    })
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.wallColor).toBe('#2f6db0')
    }
  })

  it('round-trips a custom plan’s per-room finishes (keyed by custom room ids)', () => {
    useStore.getState().__resetForTest()
    // A custom plan whose room id is NOT in the fixed ROOMS table.
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-finishes',
        rooms: [{ id: 'studio-main', name: 'Studio', origin: [0, 0], width: 5, depth: 4 }],
      },
    })
    // Set a floor + wall finish on the custom room (cast as the slice expects RoomId).
    useStore.getState().setFloorFinish('studio-main' as never, 'floor-tile-marble')
    useStore.getState().setWallFinish('studio-main' as never, 'wall-paint-sage')
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      // Custom-room finishes survive the load (regression: were stripped because
      // the id isn't in the fixed ROOMS table).
      expect((patch.finishes?.floor as Record<string, string>)['studio-main']).toBe(
        'floor-tile-marble',
      )
      expect((patch.finishes?.walls as Record<string, string>)['studio-main']).toBe(
        'wall-paint-sage',
      )
    }
  })

  it('round-trips a project design note', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setDesignNote('Client wants warm tones; keep the sofa.')
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.designNote).toBe('Client wants warm tones; keep the sofa.')
    }
  })

  it('applySerialized drops items with non-finite position/rotation', () => {
    const known = new Set(['bed-double'])
    const saved = {
      version: 2,
      items: [
        { defId: 'bed-double', position: [1, 1], rotation: 0, props: {} },
        { defId: 'bed-double', position: [Number.NaN, 0], rotation: 0, props: {} },
        { defId: 'bed-double', position: [0, 0], rotation: Number.POSITIVE_INFINITY, props: {} },
      ],
      doors: {},
      finishes: { floor: {}, walls: {}, wallAccents: {} },
      timeMode: 'system',
    } as unknown as Parameters<typeof applySerialized>[0]
    const patch = applySerialized(saved, known)
    expect(patch.items?.length).toBe(1)
    expect(patch.items?.[0].position).toEqual([1, 1])
  })

  it('round-trips timeMode + manualHour for system mode', () => {
    useStore.getState().__resetForTest()
    // default is system / 12
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('system')
      expect(parsed.data.manualHour).toBe(12)
    }
  })

  it('round-trips timeMode + manualHour for manual mode', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setManualHour(15.5)
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('manual')
      expect(parsed.data.manualHour).toBe(15.5)
    }
  })

  it('round-trips lightsMode and defaults to auto when absent', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setLightsMode('on')
    const out = serialize(useStore.getState())
    expect(out.lightsMode).toBe('on')
    // Absent (legacy) → applySerialized defaults to 'auto'.
    const legacy = { ...out } as Record<string, unknown>
    delete legacy.lightsMode
    const patch = applySerialized(
      legacy as unknown as Parameters<typeof applySerialized>[0],
      new Set(['bed-double']),
    )
    expect((patch as { lightsMode?: string }).lightsMode).toBe('auto')
  })

  it('round-trips pinned measurement annotations', () => {
    useStore.getState().__resetForTest()
    useStore.getState().addAnnotation([0, 0], [3, 2], 'rect')
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.annotations).toHaveLength(1)
      expect(parsed.data.annotations?.[0]).toMatchObject({ a: [0, 0], b: [3, 2], shape: 'rect' })
    }
    // Legacy save (no annotations) → applySerialized defaults to [].
    const patch = applySerialized(
      { ...out, annotations: undefined } as unknown as Parameters<typeof applySerialized>[0],
      new Set(['bed-double']),
    )
    expect((patch as { annotations?: unknown[] }).annotations).toEqual([])
  })

  it('round-trips pinned design comments (incl. levelId + resolved) and defaults absent → []', () => {
    useStore.getState().__resetForTest()
    useStore.getState().addComment({ position: [1.2, 3.4], text: 'move the sofa', author: 'Wei' })
    const upId = useStore
      .getState()
      .addComment({ position: [5, 6], text: 'upstairs reading nook?', levelId: 'lvl-2' })!
    useStore.getState().setCommentResolved(upId, true)
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(JSON.parse(JSON.stringify(out)))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.comments).toHaveLength(2)
      expect(parsed.data.comments?.[0]).toMatchObject({
        position: [1.2, 3.4],
        text: 'move the sofa',
        author: 'Wei',
        resolved: false,
      })
      expect(parsed.data.comments?.[0]?.levelId).toBeUndefined() // ground pin
      expect(parsed.data.comments?.[1]).toMatchObject({
        levelId: 'lvl-2',
        text: 'upstairs reading nook?',
        resolved: true,
      })
      const patch = applySerialized(parsed.data, new Set())
      expect(patch.comments).toHaveLength(2)
      expect(patch.comments?.[1]?.levelId).toBe('lvl-2')
      expect(patch.comments?.[1]?.resolved).toBe(true)
    }
    // Legacy save (no comments) → applySerialized defaults to [].
    const patch = applySerialized(
      { ...out, comments: undefined } as unknown as Parameters<typeof applySerialized>[0],
      new Set(),
    )
    expect(patch.comments).toEqual([])
    // A design with no comments omits the key entirely (stays additive).
    useStore.getState().__resetForTest()
    expect(serialize(useStore.getState()).comments).toBeUndefined()
  })

  it('migrates legacy timeOfDay="day" to manual hour 12', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'day',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    }
    const parsed = SerializedStateZ.parse(legacy)
    expect(parsed.timeMode).toBe('manual')
    expect(parsed.manualHour).toBe(12)
  })

  it('migrates legacy timeOfDay="dusk" to manual hour 18', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'dusk',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    }
    const parsed = SerializedStateZ.parse(legacy)
    expect(parsed.timeMode).toBe('manual')
    expect(parsed.manualHour).toBe(18)
  })

  it('migrates legacy timeOfDay="night" to manual hour 0', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'night',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    }
    const parsed = SerializedStateZ.parse(legacy)
    expect(parsed.timeMode).toBe('manual')
    expect(parsed.manualHour).toBe(0)
  })

  it('applySerialized writes timeMode + manualHour back into the store patch', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setManualHour(7.5)
    const out = serialize(useStore.getState())
    const patch = applySerialized(out, new Set())
    expect(patch.timeMode).toBe('manual')
    expect(patch.manualHour).toBe(7.5)
  })

  it('omits the floor plan for the default flat, round-trips a custom one', () => {
    useStore.getState().__resetForTest()
    // Default flat → no floorPlan in the payload (rebuilt from constants).
    expect(serialize(useStore.getState()).floorPlan).toBeUndefined()
    // A custom plan is persisted and restored.
    useStore.getState().newFloorPlan('Saved Studio')
    const customId = useStore.getState().floorPlan.id
    const out = serialize(useStore.getState())
    expect(out.floorPlan?.name).toBe('Saved Studio')
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    const patch = applySerialized(out, new Set())
    expect(patch.floorPlan?.id).toBe(customId)
    // Applying a default-flat payload restores the default plan.
    useStore.getState().__resetForTest()
    const defPatch = applySerialized(serialize(useStore.getState()), new Set())
    expect(defPatch.floorPlan?.id).toBe('default-hdb-4room')
  })

  it('round-trips a location with a label', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' })
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.location).toEqual({ lat: 51.5, lon: 0, label: 'London, UK' })
      expect(parsed.data.locationPromptDismissed).toBe(false)
    }
  })

  it('defaults missing location fields when reading legacy payloads', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    }
    const parsed = SerializedStateZ.parse(legacy)
    expect(parsed.location).toBeNull()
    expect(parsed.locationPromptDismissed).toBe(false)
  })

  it('applySerialized restores location into the store patch', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setLocation({ lat: 35.68, lon: 139.69, label: 'Tokyo' })
    useStore.getState().dismissLocationPrompt()
    const out = serialize(useStore.getState())
    const patch = applySerialized(out, new Set())
    expect(patch.location).toEqual({ lat: 35.68, lon: 139.69, label: 'Tokyo' })
    expect(patch.locationPromptDismissed).toBe(true)
  })

  it('round-trips groupId on items and serializes as version 2', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setItems([
      {
        id: 'g-a',
        defId: 'dining-chair',
        position: [0, 0],
        rotation: 0,
        groupId: 'grp-1',
        props: {},
      },
      {
        id: 'g-b',
        defId: 'dining-chair',
        position: [1, 0],
        rotation: 0,
        groupId: 'grp-1',
        props: {},
      },
    ])
    const out = serialize(useStore.getState())
    expect(out.version).toBe(2)
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const a = parsed.data.items.find((i) => i.id === 'g-a')
      const b = parsed.data.items.find((i) => i.id === 'g-b')
      expect(a?.groupId).toBe('grp-1')
      expect(b?.groupId).toBe('grp-1')
    }
  })

  it('accepts an item with no groupId (back-compat)', () => {
    useStore.getState().__resetForTest()
    useStore
      .getState()
      .setItems([{ id: 'plain', defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} }])
    const out = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.items.find((i) => i.id === 'plain')?.groupId).toBeUndefined()
    }
  })
})

describe('multi-level plans (F13 / ML1)', () => {
  it('round-trips upperLevels and item levelId', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      items: [
        {
          id: 'it-up',
          defId: 'bed-queen',
          position: [1, 1],
          rotation: 0,
          levelId: 'lvl-2',
          props: {},
        },
      ],
      floorPlan: {
        id: 'ml-plan',
        name: 'Maisonette',
        ceilingHeight: 2.6,
        extent: [8, 6],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [7.9, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'g-liv', name: 'Living', origin: [0.2, 0.2], width: 7.6, depth: 5.6 }],
        upperLevels: [
          {
            id: 'lvl-2',
            name: 'Upper floor',
            elevation: 2.9,
            walls: [{ id: 'uw', start: [0.1, 0.1], end: [7.9, 0.1], thickness: 'external' }],
            openings: [
              {
                id: 'uo',
                kind: 'window',
                wallId: 'uw',
                offset: 1,
                width: 1.2,
                sill: 0.9,
                head: 2.1,
              },
            ],
            rooms: [
              {
                id: 'up-bed',
                name: 'Bedroom',
                origin: [0.2, 0.2],
                width: 4,
                depth: 4,
                floor: 'floor-carpet-grey',
              },
            ],
          },
        ],
      },
    } as never)
    // Finishes keyed by an upper-level room id must survive the load filter.
    useStore.setState(
      (s) =>
        ({
          finishes: {
            ...s.finishes,
            floor: { ...s.finishes.floor, 'up-bed': 'floor-carpet-grey' },
          },
        }) as never,
    )
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>(['bed-queen']))
    const lvl = patch.floorPlan?.upperLevels?.[0]
    expect(lvl?.id).toBe('lvl-2')
    expect(lvl?.elevation).toBe(2.9)
    expect(lvl?.rooms[0]?.floor).toBe('floor-carpet-grey')
    expect(lvl?.openings[0]?.kind).toBe('window')
    expect(patch.items?.[0]?.levelId).toBe('lvl-2')
    expect((patch.finishes?.floor as Record<string, string>)['up-bed']).toBe('floor-carpet-grey')
  })
})
