import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Group, MathUtils, Mesh, type Object3D } from 'three'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { buildEditedObject } from '../../furniture/glbEdit/buildObject'
import { type FaceHit, placeComponentOnFace } from '../../furniture/glbEdit/componentPlace'
import { componentById } from '../../furniture/glbEdit/components'
import type { CsgOp } from '../../furniture/glbEdit/csgCombine'
import { combineGroupToMeshPart, evaluateAllGroups } from '../../furniture/glbEdit/csgEval'
import {
  type AssetEditSpec,
  addCombineGroup,
  addPart,
  addPartGroup,
  bakeCombineGroup,
  combinedPartIds,
  combineGroups,
  createEmptySpec,
  duplicatePart,
  duplicatePartGroup,
  isBuildable,
  mirrorPart,
  mirrorPartGroup,
  newPartId,
  partGroupMemberIds,
  partGroups,
  removeCombineGroup,
  removePart,
  renamePartGroup,
  repeatComponentGroup,
  type SymmetryMode,
  setMeshOverride,
  updatePart,
  updatePartGroupTransform,
} from '../../furniture/glbEdit/editSpec'
import {
  GIZMO_MODES,
  type GizmoMode,
  gizmoModesFor,
  gizmoPatch,
  groupGizmoPatch,
} from '../../furniture/glbEdit/gizmoWriteBack'
import { ungroupPartGroup } from '../../furniture/glbEdit/groupTransform'
import { exportAndSaveAsset, placementFlags } from '../../furniture/glbEdit/saveAsset'
import {
  createSpecHistory,
  currentSpec,
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  redo as histRedo,
  undo as histUndo,
  type PushOptions,
  pushSpec,
  type SpecHistory,
} from '../../furniture/glbEdit/specHistory'
import { parseAssetSpec } from '../../furniture/glbEdit/specPersist'
import type { FurnitureCategory, UserGltfDef } from '../../furniture/types'
import { parseFurnitureMaterialFinish } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { CombinePanel } from './CombinePanel'
import { ComponentsPanel } from './ComponentsPanel'
import { DesignerToolbar } from './DesignerToolbar'
import { DesignerViewport } from './DesignerViewport'
import { GroupInspector } from './GroupInspector'
import { LayersPanel } from './LayersPanel'
import { PartInspector } from './PartInspector'
import { type PlacementKind, SavePanel } from './SavePanel'
import { SourcePanel } from './SourcePanel'
import { useCombineResults } from './useCombineResults'

/**
 * GLB Asset Designer — compose a new asset from primitive shapes and/or start
 * from an uploaded GLB (uniformly scaled) to make a custom variant, preview it
 * live, then export → save into the catalog (reusing the upload pipeline).
 *
 * This file is the composition + state wiring; the focused UI lives in sibling
 * modules (`DesignerViewport` / `DesignerToolbar` / `LayersPanel` / `SourcePanel`
 * / `CombinePanel` / `SavePanel` / `PartInspector`) and all pure spec/geometry
 * logic in `src/furniture/glbEdit/`.
 */
export function GlbDesignerDialog() {
  const open = useStore((s) => s.glbDesignerOpen)
  // Pro-only power tool — needs the full canvas. Gated by the `glbDesigner`
  // feature flag (pro tier, so it's forced off in Simple mode; the ⌘K command
  // and the catalog "Design" button share the same gate).
  const enabled = useFeature('glbDesigner')
  const isMobile = useIsMobile()
  const close = () => useStore.getState().setGlbDesignerOpen(false)
  // Select the stable array ref, filter in a memo — filtering inside the selector
  // returns a fresh array every render and spins Zustand into an update loop.
  const userFurniture = useStore((s) => s.userFurniture)
  const userGlbs = useMemo(
    () => userFurniture.filter((d): d is UserGltfDef => d.source === 'user' && !!d.runtimeUrl),
    [userFurniture],
  )

  // ---- Spec + bounded undo/redo history (specHistory.ts) -----------------
  const [hist, setHist] = useState<SpecHistory>(() => createSpecHistory(createEmptySpec()))
  const spec = currentSpec(hist)
  const canUndo = histCanUndo(hist)
  const canRedo = histCanRedo(hist)
  /** Commit a spec edit (value or updater) into history. `coalesceKey` merges a
   *  rapid stream (slider/field drag) into one undo step. */
  const commit = (
    next: AssetEditSpec | ((s: AssetEditSpec) => AssetEditSpec),
    opts?: PushOptions,
  ) => {
    setHist((h) => {
      const cur = currentSpec(h)
      const resolved = typeof next === 'function' ? next(cur) : next
      if (resolved === cur) return h
      return pushSpec(h, resolved, opts)
    })
  }
  const doUndo = () => setHist((h) => histUndo(h))
  const doRedo = () => setHist((h) => histRedo(h))

  // Select one part (resets the multi-selection + clears any group selection).
  // `null` clears it.
  const setSelId = (id: string | null) => {
    setSelIds(id ? [id] : [])
    if (id) setSelGroupId(null)
  }
  // Toggle a part in/out of the multi-selection (shift/⌘-click or select mode).
  const toggleSel = (id: string) => {
    setSelGroupId(null)
    setSelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }
  const onSelectPart = (id: string, additive: boolean) => (additive ? toggleSel(id) : setSelId(id))
  // Select a whole transform group for the group gizmo (clears part selection).
  const selectGroup = (id: string) => {
    setSelIds([])
    setSelGroupId((cur) => (cur === id ? null : id))
  }

  // ---- Live combine-group evaluation (CSG v2, off the main thread) --------
  const {
    results: combineResults,
    computing: combineComputing,
    errors: combineErrors,
  } = useCombineResults(spec)

  const [name, setName] = useState('Custom asset')
  const [category, setCategory] = useState<FurnitureCategory>('others')
  const [placement, setPlacement] = useState<PlacementKind>('floor')
  // Multi-select (CSG v2): the LAST id is the "primary" (inspector + gizmo
  // target); the whole array is the combine selection. A single click resets to
  // one; additive click toggles.
  const [selIds, setSelIds] = useState<string[]>([])
  const selId = selIds.length > 0 ? selIds[selIds.length - 1] : null
  // The selected TRANSFORM group (Stage 3a) — the group gizmo target. Mutually
  // exclusive with the part selection.
  const [selGroupId, setSelGroupId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [combining, setCombining] = useState(false)
  const [busy, setBusy] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [meshNames, setMeshNames] = useState<string[]>([])
  const sourceSceneRef = useRef<Object3D | null>(null)

  // ---- Component library — armed fitting + params (Stage 3b) -------------
  const [armedComponentId, setArmedComponentId] = useState<string | null>(null)
  const [armedParams, setArmedParams] = useState<Record<string, number>>({})

  // ---- Drag gizmo (GE2b) -------------------------------------------------
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate')
  // The selected part's live preview Mesh (what TransformControls attaches to).
  const [selMesh, setSelMesh] = useState<Mesh | null>(null)
  // Registry of part id → mounted preview mesh. Ref callbacks must be STABLE
  // (cached per id) — a fresh closure each render would detach/attach every
  // render and the setState inside would loop the dialog forever.
  const meshRegistry = useRef(new Map<string, Mesh>())
  const meshRefCallbacks = useRef(new Map<string, (m: Mesh | null) => void>())
  const selIdRef = useRef(selId)
  selIdRef.current = selId
  const meshRefFor = (id: string) => {
    let cb = meshRefCallbacks.current.get(id)
    if (!cb) {
      cb = (m: Mesh | null) => {
        if (m) meshRegistry.current.set(id, m)
        else meshRegistry.current.delete(id)
        const want = selIdRef.current
        setSelMesh(want ? (meshRegistry.current.get(want) ?? null) : null)
      }
      meshRefCallbacks.current.set(id, cb)
    }
    return cb
  }
  // Selection changes don't fire mount refs — re-derive the attached mesh.
  useEffect(() => {
    setSelMesh(selId ? (meshRegistry.current.get(selId) ?? null) : null)
  }, [selId])

  // ---- Group gizmo (Stage 3a) — a registry of transform-group id → container
  // Object3D, mirroring the per-part mesh registry so the gizmo can attach to a
  // whole group. -----------------------------------------------------------
  const [selGroupObj, setSelGroupObj] = useState<Group | null>(null)
  const groupRegistry = useRef(new Map<string, Group>())
  const groupRefCallbacks = useRef(new Map<string, (g: Group | null) => void>())
  const selGroupIdRef = useRef(selGroupId)
  selGroupIdRef.current = selGroupId
  const groupRefFor = (id: string) => {
    let cb = groupRefCallbacks.current.get(id)
    if (!cb) {
      cb = (g: Group | null) => {
        if (g) groupRegistry.current.set(id, g)
        else groupRegistry.current.delete(id)
        const want = selGroupIdRef.current
        setSelGroupObj(want ? (groupRegistry.current.get(want) ?? null) : null)
      }
      groupRefCallbacks.current.set(id, cb)
    }
    return cb
  }
  useEffect(() => {
    setSelGroupObj(selGroupId ? (groupRegistry.current.get(selGroupId) ?? null) : null)
  }, [selGroupId])

  // ---- Component placement seam (Stage 3b) — the armed-place handler is
  // defined below (after the early return), so the viewport + the automation
  // seam call the LATEST closure via this ref. ------------------------------
  const armedRef = useRef<string | null>(armedComponentId)
  armedRef.current = armedComponentId
  const placeArmedRef = useRef<(hit: FaceHit) => void>(() => {})
  // Expose a small placement seam while the designer is open so the scenario
  // harness can drive a face-place deterministically (the real UI path is a
  // click in the preview). Mirrors the `window.__store` automation seam.
  useEffect(() => {
    if (!open || !enabled) return
    const w = window as unknown as {
      __glbDesignerPlaceOnFace?: (
        point: [number, number, number],
        normal: [number, number, number],
      ) => void
    }
    w.__glbDesignerPlaceOnFace = (point, normal) => placeArmedRef.current({ point, normal })
    return () => {
      w.__glbDesignerPlaceOnFace = undefined
    }
  }, [open, enabled])

  // This dialog is a modal-style overlay that doesn't build on `Modal`, so it
  // registers with the modal guard itself: global scene hotkeys (incl. the
  // global ⌘Z undo) no-op while it's open, which keeps the dialog-scoped
  // G/R/S + ⌘Z/⇧⌘Z keys below conflict-free.
  useModalGuard(open && enabled)

  // Dialog-scoped hotkeys: G = move, R = rotate, S = scale; ⌘Z / ⇧⌘Z (⌘Y) =
  // undo / redo of the spec. Ignored while typing in the dialog's inputs so
  // native text editing / text-undo keeps working there.
  useEffect(() => {
    if (!open || !enabled) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'SELECT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      // Esc disarms a pending component placement (before anything else claims it).
      if (key === 'escape' && armedRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setArmedComponentId(null)
        setArmedParams({})
        return
      }
      // Undo / redo — handle locally (the modal guard suppresses global undo).
      // Inlined (not the `doUndo`/`doRedo` handlers) so the effect deps stay
      // `[open, enabled]` — `setHist` is a stable setter.
      if (mod && !e.altKey && (key === 'z' || key === 'y')) {
        if (typing) return // let the field's native text-undo win
        e.preventDefault()
        if (key === 'y' || e.shiftKey) setHist((h) => histRedo(h))
        else setHist((h) => histUndo(h))
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (typing) return
      const hit = GIZMO_MODES.find((m) => m.hotkey === key)
      if (!hit) return
      e.preventDefault()
      setGizmoMode(hit.mode)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, enabled])
  // ------------------------------------------------------------------------

  // Capture the loaded source scene (for export) + its named meshes (for the
  // recolour/hide list). Clears both when the source is removed/changed.
  const onScene = (o: Object3D | null) => {
    sourceSceneRef.current = o
    if (!o) {
      setMeshNames([])
      return
    }
    const names = new Set<string>()
    o.traverse((m) => {
      if (m instanceof Mesh && m.name) names.add(m.name)
    })
    setMeshNames([...names])
  }

  const sourceUrl = useMemo(() => {
    const def = userGlbs.find((d) => d.id === spec.sourceAssetId)
    return def?.runtimeUrl ?? null
  }, [userGlbs, spec.sourceAssetId])

  // The picked source's restorable designer spec (Asset Studio S0) — present
  // only for a def that was itself built in the designer (carries `assetSpec`).
  const restorableSpec = useMemo(() => {
    if (!spec.sourceAssetId) return null
    const def = userGlbs.find((d) => d.id === spec.sourceAssetId)
    return def?.assetSpec ? parseAssetSpec(def.assetSpec) : null
  }, [userGlbs, spec.sourceAssetId])

  // Distinct catalog material ids picked as part textures (GE3c) — fed to the
  // same loader placed furniture uses so they build into the shared cache.
  const finishIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of spec.parts) {
      const id = p.finish ? parseFurnitureMaterialFinish(p.finish) : null
      if (id) set.add(id)
      if (p.geometry?.materials) {
        for (const gm of p.geometry.materials) {
          const gmId = gm.finish ? parseFurnitureMaterialFinish(gm.finish) : null
          if (gmId) set.add(gmId)
        }
      }
    }
    return [...set]
  }, [spec.parts])

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setHist(createSpecHistory(createEmptySpec()))
      setName('Custom asset')
      setCategory('others')
      setPlacement('floor')
      setSelIds([])
      setSelGroupId(null)
      setSelectMode(false)
      setOverwrite(false)
      setGizmoMode('translate')
      setSelMesh(null)
      setSelGroupObj(null)
      setArmedComponentId(null)
      setArmedParams({})
      sourceSceneRef.current = null
    }
  }, [open])

  if (!open || !enabled) return null

  const sel = spec.parts.find((p) => p.id === selId) ?? null
  // Selected FREE parts (not already consumed by a group) are the operands a new
  // combine can take. ≥2 enables the Union/Subtract/Intersect actions.
  const consumedIds = combinedPartIds(spec)
  const eligibleCombineIds = selIds.filter((id) => !consumedIds.has(id))
  const groups = combineGroups(spec)
  const readyResultIds = new Set([...combineResults.keys()])
  // Transform groups (Stage 3a). Selected parts NOT already in a transform group
  // are the ones a new Group can take (≥2 enables it).
  const transformGroups = partGroups(spec)
  const grouped = partGroupMemberIds(spec)
  const eligibleGroupIds = selIds.filter((id) => !grouped.has(id))

  // A mesh (CSG) part has no scale mode (its triangles are baked) — fall back
  // to translate rather than showing a gizmo that can't write back.
  const gizmoActive: GizmoMode =
    sel && !gizmoModesFor(sel.kind).includes(gizmoMode) ? 'translate' : gizmoMode

  // ---- Handlers ----------------------------------------------------------
  const pickSource = (v: string) => {
    commit((s) => ({ ...s, sourceAssetId: v || undefined }))
    // Editing an existing asset: seed name + category from the picked source so
    // "Update original" keeps them instead of clobbering the def name.
    const src = v ? userGlbs.find((d) => d.id === v) : undefined
    if (src) {
      setName(src.name)
      setCategory(src.category)
    }
  }

  const restoreSpec = () => {
    if (!restorableSpec) return
    // Reopen the asset's original editable shapes (a distinct undo step); the
    // restored spec carries its OWN source (usually none), replacing the frozen
    // source-mesh path with the editable part list.
    commit(restorableSpec)
    setSelId(restorableSpec.parts[0]?.id ?? null)
  }

  const addShape = (kind: Parameters<typeof addPart>[1]) => {
    // Compute OUTSIDE the updater: `addPart` mints a fresh part id (impure), so
    // inside an updater StrictMode's double-invocation could leave `selId`
    // pointing at the discarded invocation's id.
    const next = addPart(spec, kind)
    commit(next)
    setSelId(next.parts[next.parts.length - 1].id)
  }

  const duplicate = (id: string) => {
    const next = duplicatePart(spec, id)
    commit(next)
    if (next.parts.length > spec.parts.length) {
      setSelId(next.parts[next.parts.length - 1]!.id)
    }
  }

  const remove = (id: string) => {
    commit((sp) => removePart(sp, id))
    // Drop the removed id from the multi-selection (removePart also dissolves any
    // combine group that falls below 2 members).
    setSelIds((ids) => ids.filter((x) => x !== id))
  }

  const mirror = () => {
    if (!sel) return
    const next = mirrorPart(spec, sel.id)
    commit(next)
    if (next.parts.length > spec.parts.length) {
      setSelId(next.parts[next.parts.length - 1]!.id)
    }
  }

  // ---- Component library (Stage 3b) --------------------------------------
  // Arm a fitting: seed its params from the defaults, clear any part/group
  // selection (the next preview click PLACES rather than selects).
  const armComponent = (id: string) => {
    const def = componentById(id)
    if (!def) return
    setArmedComponentId(id)
    const seed: Record<string, number> = {}
    for (const p of def.params) seed[p.key] = p.default
    setArmedParams(seed)
    setSelIds([])
    setSelGroupId(null)
  }
  const disarmComponent = () => {
    setArmedComponentId(null)
    setArmedParams({})
  }
  const setArmedParam = (key: string, value: number) =>
    setArmedParams((p) => ({ ...p, [key]: value }))

  // Place the armed component onto a clicked face (SWOOD): orient to the normal,
  // snap, land as a named PartGroup, select it, and disarm.
  const placeArmed = (hit: FaceHit) => {
    const def = armedComponentId ? componentById(armedComponentId) : null
    if (!def) return
    const { spec: next, groupId } = placeComponentOnFace(spec, def, armedParams, hit)
    if (!groupId) return
    commit(next)
    disarmComponent()
    selectGroup(groupId)
  }
  placeArmedRef.current = placeArmed

  // "Repeat" a placed component group to its symmetric positions about the asset
  // bbox centre (Mirror X/Z or ×4). Selects the last copy so it's easy to tweak.
  const repeatGroup = (groupId: string, mode: SymmetryMode) => {
    const { spec: next, groupIds } = repeatComponentGroup(spec, groupId, mode)
    if (groupIds.length === 0) return
    commit(next)
    selectGroup(groupIds[groupIds.length - 1])
  }

  const commitGizmoDrag = () => {
    const m = selMesh
    const part = sel
    if (!m || !part) return
    const patch = gizmoPatch(part, gizmoActive, {
      position: [m.position.x, m.position.y, m.position.z],
      rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
      scale: [m.scale.x, m.scale.y, m.scale.z],
    })
    m.scale.set(1, 1, 1)
    if (patch) {
      commit((sp) => updatePart(sp, part.id, patch))
    } else {
      const r = part.rotation ?? [0, 0, 0]
      m.position.set(part.position[0], part.position[1], part.position[2])
      m.rotation.set(MathUtils.degToRad(r[0]), MathUtils.degToRad(r[1]), MathUtils.degToRad(r[2]))
    }
  }

  // Record a non-destructive combine group over the selected free parts (CSG v2).
  // The operands stay editable; the live preview evaluates the result. Order
  // follows selection order (first-selected is the subtract base without holes).
  const combine = (op: CsgOp) => {
    if (eligibleCombineIds.length < 2 || combining) return
    const { spec: next, groupId } = addCombineGroup(spec, eligibleCombineIds, op)
    if (!groupId) {
      useStore.getState().notify.start({ title: "Couldn't combine these parts", kind: 'error' })
      return
    }
    commit(next)
    setSelectMode(false)
    // Keep the operands selected so the user can immediately tweak the hole etc.
  }

  // "Bake to mesh": freeze a combine group into one editable-position mesh part.
  const bake = async (groupId: string) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group || combining) return
    // Reuse the already-computed live preview result when it's ready — clone it
    // with a fresh persistable id instead of re-running the CSG fold. Falls back
    // to a fresh evaluation only when no cached result exists yet.
    const cached = combineResults.get(groupId)
    if (cached) {
      const meshPart = { ...cached, id: newPartId() }
      commit((sp) => bakeCombineGroup(sp, groupId, meshPart))
      setSelId(meshPart.id)
      return
    }
    setCombining(true)
    try {
      const meshPart = await combineGroupToMeshPart(spec, group, { bake: true })
      commit((sp) => bakeCombineGroup(sp, groupId, meshPart))
      setSelId(meshPart.id)
    } catch {
      useStore.getState().notify.start({ title: "Couldn't bake this combine", kind: 'error' })
    } finally {
      setCombining(false)
    }
  }

  // Ungroup: dissolve a combine group; its member parts stay exactly as they were.
  const ungroup = (groupId: string) => {
    commit((sp) => removeCombineGroup(sp, groupId))
  }

  // ---- Transform group actions (Stage 3a) --------------------------------
  // Group the selected (ungrouped) parts into one named transform group.
  const groupSelected = () => {
    if (eligibleGroupIds.length < 2) return
    const { spec: next, groupId } = addPartGroup(spec, eligibleGroupIds)
    if (!groupId) {
      useStore.getState().notify.start({ title: "Couldn't group these parts", kind: 'error' })
      return
    }
    commit(next)
    setSelectMode(false)
    selectGroup(groupId)
  }

  // Ungroup: release members with their transforms flattened (no jump). Undo of
  // this restores the group (one history entry).
  const ungroupTransform = (groupId: string) => {
    commit((sp) => ungroupPartGroup(sp, groupId))
    if (selGroupId === groupId) setSelGroupId(null)
  }

  const renameGroup = (groupId: string, name: string) => {
    commit((sp) => renamePartGroup(sp, groupId, name), { coalesceKey: `group-name:${groupId}` })
  }

  // Numeric group-transform edit (the GroupInspector fields — same target as the
  // group gizmo write-back); coalesced into one undo step.
  const patchGroupTransform = (
    groupId: string,
    patch: { position?: [number, number, number]; rotation?: [number, number, number] },
  ) => {
    commit((sp) => updatePartGroupTransform(sp, groupId, patch), { coalesceKey: 'group-xf' })
  }

  const duplicateGroup = (groupId: string) => {
    const { spec: next, groupId: newId } = duplicatePartGroup(spec, groupId)
    if (!newId) return
    commit(next)
    selectGroup(newId)
  }

  const mirrorGroup = (groupId: string) => {
    const { spec: next, groupId: newId } = mirrorPartGroup(spec, groupId)
    if (!newId) return
    commit(next)
    selectGroup(newId)
  }

  // Write a finished GROUP gizmo drag back onto the group transform (same 5mm/1°
  // snap as a part; coalesced into one undo step).
  const commitGroupGizmoDrag = () => {
    const obj = selGroupObj
    const group = transformGroups.find((g) => g.id === selGroupId)
    if (!obj || !group) return
    const mode: GizmoMode = gizmoMode === 'scale' ? 'translate' : gizmoMode
    const patch = groupGizmoPatch(group, mode, {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    })
    if (patch) {
      commit((sp) => updatePartGroupTransform(sp, group.id, patch), { coalesceKey: 'group-gizmo' })
    } else {
      // No-op drag — snap the object back to the spec transform.
      const p = group.position ?? [0, 0, 0]
      const r = group.rotation ?? [0, 0, 0]
      obj.position.set(p[0], p[1], p[2])
      obj.rotation.set(MathUtils.degToRad(r[0]), MathUtils.degToRad(r[1]), MathUtils.degToRad(r[2]))
    }
  }

  const save = async () => {
    if (!isBuildable(spec) || busy) return
    const notify = useStore.getState().notify
    // Update-original is destructive (every placed copy changes, irreversible) —
    // gate it behind an explicit confirm before the overwrite path runs.
    if (overwrite && spec.sourceAssetId) {
      const ok = await useStore.getState().confirmAction({
        title: 'Update original asset?',
        message: "All placed copies change and this can't be undone.",
        confirmLabel: 'Update original',
        danger: true,
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      // Evaluate every combine group fresh so the exported GLB bakes each result
      // (holes carved, not exported as geometry) even if the live preview hadn't
      // settled. Off the main thread via the shared pool (fallback on the main).
      const groupResults = await evaluateAllGroups(spec)
      // FAIL LOUD: a group that failed to evaluate (degenerate) is dropped by
      // evaluateAllGroups (fine for the live preview), but it must NOT silently
      // vanish from a saved asset — block the save and name the offending group.
      const failed = combineGroups(spec).find((g) => !groupResults.has(g.id))
      if (failed) {
        notify.start({
          title: `Combine '${failed.name}' failed — fix or ungroup it before saving`,
          kind: 'error',
        })
        return
      }
      const obj = buildEditedObject(sourceSceneRef.current, spec, groupResults)
      const overwriteId = overwrite && spec.sourceAssetId ? spec.sourceAssetId : undefined
      const res = await exportAndSaveAsset(
        obj,
        name,
        category,
        placementFlags(placement),
        overwriteId,
        spec,
      )
      if (res.ok) {
        notify.start({
          title: res.duplicate
            ? 'That asset already exists'
            : overwriteId
              ? `Updated "${name}"`
              : `Saved "${name}" to your catalog`,
          kind: res.duplicate ? 'info' : 'success',
        })
        close()
      } else {
        notify.start({ title: `Couldn't save: ${res.reason}`, kind: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div
        className="panel glb-designer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100dvh',
          maxWidth: 'none',
          maxHeight: 'none',
          borderRadius: 0,
        }}
      >
        <div className="panel-head">
          <div className="panel-title">3D asset designer</div>
          <button type="button" className="icon-btn" aria-label="Close designer" onClick={close}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <hr className="hr" />
        {/* On mobile the side-by-side layout collapses the preview to a sliver and
            overflows the controls — stack vertically (preview on top) instead. */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 'var(--s-3)',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Live preview */}
          <div
            style={{
              flex: isMobile ? '0 0 38vh' : '1 1 60%',
              minWidth: 0,
              minHeight: 0,
              borderRadius: 'var(--r-2)',
              overflow: 'hidden',
              background: 'var(--scene-b)',
              position: 'relative',
            }}
          >
            <DesignerViewport
              spec={spec}
              results={combineResults}
              sel={sel}
              selMesh={selMesh}
              selGroupObj={selGroupObj}
              finishIds={finishIds}
              sourceUrl={sourceUrl}
              gizmoActive={gizmoActive}
              setGizmoMode={setGizmoMode}
              meshRefFor={meshRefFor}
              groupRefFor={groupRefFor}
              onScene={onScene}
              onCommitGizmoDrag={commitGizmoDrag}
              onCommitGroupGizmoDrag={commitGroupGizmoDrag}
              armed={!!armedComponentId}
              onPlaceFace={(point, normal) => placeArmed({ point, normal })}
            />
          </div>

          {/* Controls */}
          <div
            className="panel-body"
            style={{
              flex: isMobile ? '1 1 auto' : '1 1 40%',
              minWidth: 0,
              width: isMobile ? '100%' : undefined,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <SourcePanel
              spec={spec}
              userGlbs={userGlbs}
              meshNames={meshNames}
              canRestore={!!restorableSpec}
              onPickSource={pickSource}
              onScaleChange={(scale) =>
                commit((s) => ({ ...s, sourceScale: scale }), { coalesceKey: 'sourceScale' })
              }
              onRestoreSpec={restoreSpec}
              onSetMeshColor={(mn, hex) =>
                commit((s) => setMeshOverride(s, mn, { color: hex }), { coalesceKey: `mesh:${mn}` })
              }
              onToggleMeshHidden={(mn, hidden) => commit((s) => setMeshOverride(s, mn, { hidden }))}
              onResetMesh={(mn) =>
                commit((s) => setMeshOverride(s, mn, { color: undefined, hidden: false }))
              }
            />

            <DesignerToolbar
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={doUndo}
              onRedo={doRedo}
              onAddShape={addShape}
            />

            <ComponentsPanel
              armedId={armedComponentId}
              params={armedParams}
              onArm={armComponent}
              onDisarm={disarmComponent}
              onParam={setArmedParam}
            />

            <LayersPanel
              spec={spec}
              selIds={selIds}
              selGroupId={selGroupId}
              selectMode={selectMode}
              eligibleGroupCount={eligibleGroupIds.length}
              onSelect={onSelectPart}
              onSelectGroup={selectGroup}
              onToggleSelectMode={() => setSelectMode((v) => !v)}
              onGroup={groupSelected}
              onUngroup={ungroupTransform}
              onRenameGroup={renameGroup}
              onDuplicateGroup={duplicateGroup}
              onMirrorGroup={mirrorGroup}
              onDuplicate={duplicate}
              onRemove={remove}
            />

            {sel ? (
              <PartInspector
                part={sel}
                onPatch={(patch) =>
                  commit((sp) => updatePart(sp, sel.id, patch), {
                    coalesceKey: 'patch',
                  })
                }
                onMirror={mirror}
              />
            ) : null}

            {!sel && selGroupId
              ? (() => {
                  const g = transformGroups.find((x) => x.id === selGroupId)
                  return g ? (
                    <GroupInspector
                      group={g}
                      onRename={(name) => renameGroup(g.id, name)}
                      onPatchTransform={(patch) => patchGroupTransform(g.id, patch)}
                      onUngroup={() => ungroupTransform(g.id)}
                      onDuplicate={() => duplicateGroup(g.id)}
                      onMirror={() => mirrorGroup(g.id)}
                      onRepeat={(mode) => repeatGroup(g.id, mode)}
                    />
                  ) : null
                })()
              : null}

            {spec.parts.length > 1 || groups.length > 0 ? (
              <CombinePanel
                eligibleCount={eligibleCombineIds.length}
                combining={combining}
                groups={groups}
                results={readyResultIds}
                errors={combineErrors}
                computing={combineComputing}
                onCombine={combine}
                onBake={bake}
                onUngroup={ungroup}
              />
            ) : null}

            <SavePanel
              name={name}
              category={category}
              placement={placement}
              hasSource={!!spec.sourceAssetId}
              overwrite={overwrite}
              busy={busy}
              // Block save while any combine group is reporting a degenerate
              // result — saving would silently drop it (fail-loud, finding 1).
              canSave={isBuildable(spec) && combineErrors.size === 0}
              onName={setName}
              onCategory={setCategory}
              onPlacement={setPlacement}
              onToggleOverwrite={() => setOverwrite((v) => !v)}
              onSave={save}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
