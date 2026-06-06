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
