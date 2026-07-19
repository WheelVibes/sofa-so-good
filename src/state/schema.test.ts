import { describe, expect, it } from 'vitest'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../floorplan/roomFinishes'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import {
  applySerialized,
  FloorPlanZ,
  preserveUnresolvedItems,
  SerializedStateZ,
  serialize,
} from './schema'
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

  it('round-trips the key-collection date for the DLP tracker (R4-8)', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setKeyCollectionDate('2026-07-19')
    const saved = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(saved)
    expect(parsed.success).toBe(true)
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.keyCollectionDate).toBe('2026-07-19')
  })

  it("round-trips a door's absent-leaf flag (BSJ-4 bare BTO / strip-out)", () => {
    useStore.getState().__resetForTest()
    useStore.getState().applyBareBto()
    const saved = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(saved)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.doors['door-mainBedroom']?.leaf).toBe('none')
      expect(parsed.data.doors['door-mainBedroom']?.open).toBe(true)
      // A provided door has no leaf flag.
      expect(parsed.data.doors['door-main']?.leaf).toBeUndefined()
    }
  })

  it('defaults the key-collection date to null when absent', () => {
    useStore.getState().__resetForTest()
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.keyCollectionDate).toBeNull()
  })

  it('round-trips per-item handover metadata (ITEM-META: url/price/brand/model/supplier/description/remarks/custom)', () => {
    useStore.getState().__resetForTest()
    const id = useStore
      .getState()
      .addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    useStore.getState().setItemMeta(id, {
      url: 'https://example.com/product',
      price: 249,
      brand: 'Acme',
      model: 'X-100',
      supplier: 'Acme Direct',
      description: 'A description',
      remarks: 'existing — retain',
      custom: [
        { key: 'Fabric', value: 'Linen' },
        { key: 'Warranty', value: '2 years' },
      ],
    })
    const saved = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(saved)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const knownDefIds = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(parsed.data, knownDefIds)
    const item = patch.items?.find((i) => i.id === id)
    expect(item?.meta).toEqual({
      url: 'https://example.com/product',
      price: 249,
      brand: 'Acme',
      model: 'X-100',
      supplier: 'Acme Direct',
      description: 'A description',
      remarks: 'existing — retain',
      custom: [
        { key: 'Fabric', value: 'Linen' },
        { key: 'Warranty', value: '2 years' },
      ],
    })
  })

  it('clamps item-meta custom entries on import: caps count, truncates length, drops malformed entries (SEC-001-style neutralize)', () => {
    const base = {
      version: 2,
      apartmentId: 'serangoon-north-vista-4r',
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: new Date().toISOString(),
    } as const
    // Over the 20-entry cap, plus over-long key/value, plus malformed shapes.
    const many = Array.from({ length: 25 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
    const parsed = SerializedStateZ.safeParse({
      ...base,
      items: [
        {
          id: 'a',
          defId: 'dining-chair',
          position: [0, 0],
          rotation: 0,
          props: {},
          meta: {
            custom: [...many, { key: 'k'.repeat(60), value: 'v'.repeat(600) }, 'not-an-object', 42],
          },
        },
      ],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const custom = parsed.data.items[0].meta?.custom
    expect(custom).toBeDefined()
    // Malformed trailing entries ('not-an-object', 42) and the 26th
    // well-formed one are dropped by the 20-entry cap.
    expect(custom).toHaveLength(20)
    expect(custom?.[0]).toEqual({ key: 'k0', value: 'v0' })
  })

  it('drops a fully-malformed item-meta `custom` (non-array) rather than rejecting the record', () => {
    const parsed = SerializedStateZ.safeParse({
      version: 2,
      apartmentId: 'serangoon-north-vista-4r',
      items: [
        {
          id: 'a',
          defId: 'dining-chair',
          position: [0, 0],
          rotation: 0,
          props: {},
          meta: { custom: 'not-an-array', remarks: 'kept' },
        },
      ],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: new Date().toISOString(),
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.items[0].meta?.custom).toBeUndefined()
    expect(parsed.data.items[0].meta?.remarks).toBe('kept')
  })

  it('loads an old save with no `meta` field on its items fine (back-compat)', () => {
    useStore.getState().__resetForTest()
    const id = useStore
      .getState()
      .addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const saved = serialize(useStore.getState())
    // Simulate a legacy save: items never carried a `meta` key.
    const legacy = { ...saved, items: saved.items.map(({ meta: _drop, ...rest }) => rest) }
    const parsed = SerializedStateZ.safeParse(legacy)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const knownDefIds = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(parsed.data, knownDefIds)
    const item = patch.items?.find((i) => i.id === id)
    expect(item?.meta).toBeUndefined()
  })

  it('round-trips the drawing-set handover template, incl. paper size + orientation (TODO G2/G5)', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setDrawingSetTemplate({
      projectName: 'Reno Project',
      projectAddress: '1 Example Ave',
      client: 'The Tans',
      drawnBy: 'A. Designer',
      checkedBy: 'B. Reviewer',
      revision: 'C',
      revisionNote: 'For construction',
      paperSize: 'a3',
      orientation: 'portrait',
    })
    const saved = serialize(useStore.getState())
    const parsed = SerializedStateZ.safeParse(saved)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const knownDefIds = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(parsed.data, knownDefIds)
    expect(patch.drawingSetTemplate).toEqual({
      projectName: 'Reno Project',
      projectAddress: '1 Example Ave',
      client: 'The Tans',
      drawnBy: 'A. Designer',
      checkedBy: 'B. Reviewer',
      revision: 'C',
      revisionNote: 'For construction',
      paperSize: 'a3',
      orientation: 'portrait',
    })
  })

  it('defaults an old save with no paperSize/orientation to a4/landscape (back-compat)', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setDrawingSetTemplate({
      projectName: 'Legacy Project',
      projectAddress: '',
      client: '',
      drawnBy: '',
      checkedBy: '',
      revision: 'A',
      revisionNote: '',
      paperSize: 'a4',
      orientation: 'landscape',
    })
    const saved = serialize(useStore.getState())
    // Simulate a legacy save predating paperSize/orientation.
    const legacy = {
      ...saved,
      drawingSetTemplate: saved.drawingSetTemplate
        ? (({ paperSize: _p, orientation: _o, ...rest }) => rest)(saved.drawingSetTemplate)
        : undefined,
    }
    const parsed = SerializedStateZ.safeParse(legacy)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const knownDefIds = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(parsed.data, knownDefIds)
    expect(patch.drawingSetTemplate?.paperSize).toBe('a4')
    expect(patch.drawingSetTemplate?.orientation).toBe('landscape')
  })

  it('neutralizes an invalid item-meta price (negative/NaN/wrong-type) on import', () => {
    const base = {
      version: 2,
      apartmentId: 'serangoon-north-vista-4r',
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: new Date().toISOString(),
    } as const
    for (const badPrice of [-5, Number.NaN, 'free', null]) {
      const parsed = SerializedStateZ.safeParse({
        ...base,
        items: [
          {
            id: 'a',
            defId: 'dining-chair',
            position: [0, 0],
            rotation: 0,
            props: {},
            meta: { price: badPrice, remarks: 'kept' },
          },
        ],
      })
      expect(parsed.success).toBe(true)
      if (!parsed.success) continue
      expect(parsed.data.items[0].meta?.price).toBeUndefined()
      expect(parsed.data.items[0].meta?.remarks).toBe('kept')
    }
    // A valid, non-negative price passes through untouched.
    const good = SerializedStateZ.safeParse({
      ...base,
      items: [
        {
          id: 'a',
          defId: 'dining-chair',
          position: [0, 0],
          rotation: 0,
          props: {},
          meta: { price: 0 },
        },
      ],
    })
    expect(good.success).toBe(true)
    if (good.success) expect(good.data.items[0].meta?.price).toBe(0)
  })

  it('drops a javascript: URL from item meta on import (SEC-001 trust boundary)', () => {
    const parsed = SerializedStateZ.safeParse({
      version: 2,
      apartmentId: 'serangoon-north-vista-4r',
      items: [
        {
          id: 'a',
          defId: 'dining-chair',
          position: [0, 0],
          rotation: 0,
          props: {},
          meta: { url: 'javascript:alert(1)', remarks: 'kept' },
        },
      ],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeMode: 'system',
      manualHour: 12,
      cameraMode: 'orbit',
      savedAt: new Date().toISOString(),
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.items[0].meta?.url).toBeUndefined()
    expect(parsed.data.items[0].meta?.remarks).toBe('kept')
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

  it('round-trips custom dimension lines (PARITY-DIMTEXT) on a custom plan', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'dim-plan',
        name: 'Dims',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
        dimensions: [{ id: 'd1', a: [0.2, 0.2], b: [4.0, 0.2] }],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.dimensions).toEqual([{ id: 'd1', a: [0.2, 0.2], b: [4.0, 0.2] }])
  })

  it('round-trips polyline annotations (PARITY-POLYLINE) on a custom plan', () => {
    useStore.getState().__resetForTest()
    const polyline = {
      id: 'p1',
      points: [
        [0.2, 0.2],
        [4.0, 0.2],
        [4.0, 4.0],
      ] as [number, number][],
      closed: true,
      dashed: true,
    }
    useStore.setState({
      floorPlan: {
        id: 'poly-plan',
        name: 'Polys',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
        polylines: [polyline],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.polylines).toEqual([polyline])
  })

  it('round-trips a parametric roof incl. dormers through FloorPlanZ (additive, back-compat)', () => {
    useStore.getState().__resetForTest()
    const roof = {
      style: 'gable' as const,
      pitchDeg: 32,
      overhang: 0.4,
      ridgeAxis: 'auto' as const,
      material: 'metal-seam' as const,
      dormers: [{ wallSide: 'S' as const, offset: 1.2, width: 1.4 }],
    }
    useStore.setState({
      floorPlan: {
        id: 'roof-plan',
        name: 'Roofed',
        ceilingHeight: 2.6,
        extent: [6.2, 10.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [6.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
        roof,
      },
    } as never)
    const saved = serialize(useStore.getState())
    // Exercise the real zod parse path (storage load), not just applySerialized.
    const parsed = FloorPlanZ.parse(saved.floorPlan)
    expect(parsed.roof).toEqual(roof)
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.roof).toEqual(roof)
  })

  it('loads a plan with no roof field fine (back-compat)', () => {
    const parsed = FloorPlanZ.parse({
      id: 'no-roof',
      name: 'Plain',
      ceilingHeight: 2.6,
      extent: [4, 4],
      walls: [],
      openings: [],
      rooms: [],
    })
    expect(parsed.roof).toBeUndefined()
  })

  it('round-trips electrical + plumbing points (MEP layer, G1) on a custom plan', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'mep-plan',
        name: 'MEP',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
        electricalPoints: [
          { id: 'ep1', x: 1, z: 1, kind: 'socket', mountHeightMm: 300, label: 'Fridge' },
          { id: 'ep2', x: 2, z: 2, kind: 'switch', levelId: 'lvl-2' },
        ],
        plumbingPoints: [
          { id: 'pp1', x: 1.5, z: 1.5, kind: 'water-point', mountHeightMm: 600 },
          { id: 'pp2', x: 2.5, z: 0.5, kind: 'floor-trap', levelId: 'lvl-2' },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.electricalPoints).toEqual([
      { id: 'ep1', x: 1, z: 1, kind: 'socket', mountHeightMm: 300, label: 'Fridge' },
      { id: 'ep2', x: 2, z: 2, kind: 'switch', levelId: 'lvl-2' },
    ])
    expect(patch.floorPlan?.plumbingPoints).toEqual([
      { id: 'pp1', x: 1.5, z: 1.5, kind: 'water-point', mountHeightMm: 600 },
      { id: 'pp2', x: 2.5, z: 0.5, kind: 'floor-trap', levelId: 'lvl-2' },
    ])
  })

  it('MEP points are absent on a plan that predates them (back-compat)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'legacy-plan',
        name: 'Legacy',
        ceilingHeight: 2.6,
        extent: [4.2, 4.2],
        walls: [{ id: 'w', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
        openings: [],
        rooms: [{ id: 'R', name: 'Room', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.floorPlan?.electricalPoints).toBeUndefined()
    expect(patch.floorPlan?.plumbingPoints).toBeUndefined()
  })

  it('rejects an unknown electrical/plumbing kind on a point record', () => {
    const base = {
      id: 'mep-bad-plan',
      name: 'Bad MEP',
      ceilingHeight: 2.6,
      extent: [4.2, 4.2] as [number, number],
      walls: [],
      openings: [],
      rooms: [],
    }
    const badElectrical = FloorPlanZ.safeParse({
      ...base,
      electricalPoints: [{ id: 'ep1', x: 1, z: 1, kind: 'not-a-kind' }],
    })
    expect(badElectrical.success).toBe(false)
    const badPlumbing = FloorPlanZ.safeParse({
      ...base,
      plumbingPoints: [{ id: 'pp1', x: 1, z: 1, kind: 'not-a-kind' }],
    })
    expect(badPlumbing.success).toBe(false)
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

  it('round-trips a movable room-name label offset (PARITY-ROOMLABEL)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        id: 'label-plan',
        name: 'Labels',
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
            labelOffset: [1.2, -0.6],
            labelAngle: 0.5,
            labelFontScale: 1.4,
          },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const patch = applySerialized(saved, new Set<string>())
    const room = patch.floorPlan?.rooms.find((r) => r.id === 'R')
    expect(room?.labelOffset).toEqual([1.2, -0.6])
    expect(room?.labelAngle).toBe(0.5)
    expect(room?.labelFontScale).toBe(1.4)
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

  it('preserveUnresolvedItems puts back items applySerialized dropped for an unknown defId (BUG-2)', () => {
    useStore.getState().__resetForTest()
    useStore.getState().addItem({ defId: 'unknown-def', position: [1, 1], rotation: 0, props: {} })
    useStore.getState().addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
    const saved = serialize(useStore.getState())
    const known = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(saved, known)
    // Baseline: applySerialized alone still drops the unresolved item.
    expect(patch.items?.length).toBe(1)

    const unresolvedIds = preserveUnresolvedItems(saved, known, patch)

    expect(unresolvedIds.length).toBe(1)
    expect(patch.items?.length).toBe(2)
    expect(patch.items?.some((it) => it.defId === 'unknown-def')).toBe(true)
  })

  it('preserveUnresolvedItems does NOT resurrect an item dropped for a corrupt (non-finite) transform', () => {
    const known = new Set(['bed-double'])
    const saved = {
      version: 2,
      items: [
        { id: 'ok', defId: 'unknown-def', position: [1, 1], rotation: 0, props: {} },
        {
          id: 'corrupt',
          defId: 'unknown-def',
          position: [Number.NaN, 0],
          rotation: 0,
          props: {},
        },
      ],
      doors: {},
      finishes: { floor: {}, walls: {}, wallAccents: {} },
      timeMode: 'system',
    } as unknown as Parameters<typeof applySerialized>[0]
    const patch = applySerialized(saved, known)
    expect(patch.items?.length).toBe(0)

    const unresolvedIds = preserveUnresolvedItems(saved, known, patch)

    expect(unresolvedIds).toEqual(['ok'])
    expect(patch.items?.map((it) => it.id)).toEqual(['ok'])
  })

  it('preserveUnresolvedItems is a no-op when every def is already known', () => {
    useStore.getState().__resetForTest()
    useStore.getState().addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
    const saved = serialize(useStore.getState())
    const known = new Set(Object.keys(BUILTIN_CATALOG))
    const patch = applySerialized(saved, known)
    const before = patch.items

    const unresolvedIds = preserveUnresolvedItems(saved, known, patch)

    expect(unresolvedIds).toEqual([])
    expect(patch.items).toBe(before)
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

  it('default-plan finish picks survive a save/load via the finishes map (FIN-DEFAULT-FORK)', () => {
    useStore.getState().__resetForTest()
    // Paint a floor + wall on the seeded DEFAULT plan (no fork — painting a
    // surface must not turn the move-in flat into a custom plan).
    const room = 'livingDining' as never
    useStore.getState().setFloorFinish(room, 'floor-parquet-oak' as never)
    useStore.getState().setWallFinish(room, 'wall-brick-red' as never)
    expect(isDefaultPlan(useStore.getState().floorPlan)).toBe(true)

    const saved = serialize(useStore.getState())
    // serialize() drops the default plan, so the plan's own room.floor/wall is
    // NOT persisted — the finishes map is the only durable record of the pick.
    expect(saved.floorPlan).toBeUndefined()

    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (!round.success) return
    const patch = applySerialized(round.data, new Set())
    // The default plan regenerates fresh from constants — so its own room.floor
    // is back at the template default (the desync the picker used to show).
    expect(patch.floorPlan && isDefaultPlan(patch.floorPlan)).toBe(true)
    const finishes = patch.finishes ?? useStore.getState().finishes
    const defaultRoom = patch.floorPlan?.rooms.find((r) => r.id === room)
    expect(defaultRoom).toBeDefined()
    if (!defaultRoom) return
    // The canonical resolver (what every consumer now reads) recovers the pick
    // from the restored finishes map against the freshly-regenerated default room.
    expect(resolvePlanRoomFloor(finishes, defaultRoom)).toBe('floor-parquet-oak')
    expect(resolvePlanRoomWall(finishes, defaultRoom)).toBe('wall-brick-red')
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

  it('round-trips a custom plan’s template category', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-cat',
        category: { housingType: 'Condominium', projectName: 'Sky Habitat', apartmentType: 'Loft' },
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.category).toEqual({
        housingType: 'Condominium',
        projectName: 'Sky Habitat',
        apartmentType: 'Loft',
      })
    }
  })

  it('round-trips the additive Landed housing type (SG1)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-landed',
        category: {
          housingType: 'Landed',
          projectName: 'My Terrace',
          apartmentType: 'Terrace House',
        },
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.category).toEqual({
        housingType: 'Landed',
        projectName: 'My Terrace',
        apartmentType: 'Terrace House',
      })
    }
  })

  it('back-compat: a serialized plan with no category still parses + keeps housingType absent', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'no-category',
        category: undefined,
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.category).toBeUndefined()
    }
  })

  it('round-trips a per-wall baseboard override (PARITY-BASEBOARD)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-bb',
        walls: [
          {
            id: 'w1',
            start: [0, 0],
            end: [4, 0],
            thickness: 'external',
            baseboard: { height: 0.25, color: '#3a2a1a', hidden: false },
          },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      const wall = patch.floorPlan?.walls.find((w) => w.id === 'w1')
      expect(wall?.baseboard).toEqual({ height: 0.25, color: '#3a2a1a', hidden: false })
    }
  })

  it('round-trips a per-wall structural classification (TODO G7)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-structure',
        walls: [
          {
            id: 'w1',
            start: [0, 0],
            end: [4, 0],
            thickness: 'external',
            structure: 'load-bearing',
          },
          { id: 'w2', start: [4, 0], end: [4, 3], thickness: 'internal' },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.walls.find((w) => w.id === 'w1')?.structure).toBe('load-bearing')
      // Absent structure survives as absent (defaults to 'unknown' at read sites).
      expect(patch.floorPlan?.walls.find((w) => w.id === 'w2')?.structure).toBeUndefined()
    }
  })

  it('round-trips a per-room explicit category (RM1)', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-category',
        rooms: [
          {
            id: 'r1',
            name: "Ella's room",
            origin: [0, 0],
            width: 3,
            depth: 3,
            category: 'bedroom',
          },
          { id: 'r2', name: 'Kitchen', origin: [3, 0], width: 2, depth: 2 },
        ],
      },
    } as never)
    const saved = serialize(useStore.getState())
    const round = SerializedStateZ.safeParse(saved)
    expect(round.success).toBe(true)
    if (round.success) {
      const patch = applySerialized(round.data, new Set())
      expect(patch.floorPlan?.rooms.find((r) => r.id === 'r1')?.category).toBe('bedroom')
      // Absent category survives as absent (falls back to name inference).
      expect(patch.floorPlan?.rooms.find((r) => r.id === 'r2')?.category).toBeUndefined()
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

  it('round-trips lightMood and defaults to none when absent', () => {
    useStore.getState().__resetForTest()
    useStore.getState().setLightMood('movie')
    const out = serialize(useStore.getState())
    expect(out.lightMood).toBe('movie')
    const parsed = SerializedStateZ.safeParse(out)
    expect(parsed.success).toBe(true)
    // Absent (legacy, pre-mood-presets) → applySerialized defaults to 'none'.
    const legacy = { ...out } as Record<string, unknown>
    delete legacy.lightMood
    const patch = applySerialized(
      legacy as unknown as Parameters<typeof applySerialized>[0],
      new Set(['bed-double']),
    )
    expect((patch as { lightMood?: string }).lightMood).toBe('none')
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

  it('migrates the legacy default timeOfDay="day" to system mode (follow the clock, not pinned noon)', () => {
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
    // 'day' was the old *default* (users who never picked a time landed here),
    // so it migrates to 'system' so a migrated design follows the real clock
    // like a fresh one — never stuck at 12:00 PM.
    expect(parsed.timeMode).toBe('system')
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

  it('neutralizes javascript:/data: URLs on an imported IKEA def (SEC-001)', () => {
    useStore.getState().__resetForTest()
    useStore.getState().resetToDefault()
    const base = serialize(useStore.getState())
    const malicious = {
      ...base,
      userFurniture: [
        {
          id: 'ikea-evil',
          name: 'Evil Sofa',
          category: 'seating',
          kind: 'gltf' as const,
          source: 'ikea' as const,
          groupKey: 'evil',
          activeVariant: 'a',
          variants: [
            {
              finish: 'a',
              label: 'A',
              articleNumber: '000',
              url: 'https://ikea.com/p/evil',
              assetId: null,
              glbMaterials: [],
            },
          ],
          defaultFootprint: { w: 2, d: 1, h: 1 },
          uploadedAt: '2026-01-01T00:00:00.000Z',
          license: 'IKEA' as const,
          attribution: 'IKEA',
          // The XSS payloads:
          sourceUrl: 'javascript:alert(document.domain)',
          productInfo: {
            mainImageUrl: 'data:text/html,<script>alert(1)</script>',
            documents: [
              { name: 'Manual', url: 'javascript:alert(2)' },
              { name: 'Real', url: 'https://ikea.com/doc.pdf' },
            ],
          },
        },
      ],
    }
    const parsed = SerializedStateZ.safeParse(malicious)
    // Import must NOT throw — just neutralize the bad URLs.
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const def = parsed.data.userFurniture[0] as Record<string, unknown>
    expect(def.sourceUrl).toBeUndefined()
    const info = def.productInfo as Record<string, unknown>
    expect(info.mainImageUrl).toBeUndefined()
    const docs = info.documents as { name: string; url?: string }[]
    expect(docs[0].url).toBeUndefined() // javascript: dropped
    expect(docs[1].url).toBe('https://ikea.com/doc.pdf') // legit kept
    // Legit IKEA def fields survive untouched.
    expect(def.id).toBe('ikea-evil')
    expect((def.variants as { url: string }[])[0].url).toBe('https://ikea.com/p/evil')
  })

  it('price-rule library round-trips (persisted only when non-default, sanitised on load)', () => {
    useStore.getState().__resetForTest()
    // Default rate card is omitted from the payload (saves space).
    expect(serialize(useStore.getState()).priceRules).toBeUndefined()

    // A custom rate is persisted and restored intact.
    useStore.getState().setPriceRules({
      ...useStore.getState().priceRules,
      floor: { ...useStore.getState().priceRules.floor, wood: 175 },
      carpentryPerM: 410,
    })
    const saved = serialize(useStore.getState())
    expect(saved.priceRules?.floor?.wood).toBe(175)
    const patch = applySerialized(saved, new Set<string>())
    expect(patch.priceRules?.floor.wood).toBe(175)
    expect(patch.priceRules?.carpentryPerM).toBe(410)
    // Untouched buckets keep their defaults.
    expect(patch.priceRules?.wall.paint).toBe(useStore.getState().priceRules.wall.paint)

    // A corrupt persisted rate is clamped back to the default on load.
    const corrupt = { ...saved, priceRules: { floor: { wood: -50 }, carpentryPerM: -1 } }
    const safe = applySerialized(corrupt as typeof saved, new Set<string>())
    expect(safe.priceRules?.floor.wood).toBeGreaterThan(0)
    expect(safe.priceRules?.carpentryPerM).toBeGreaterThan(0)
  })
})
