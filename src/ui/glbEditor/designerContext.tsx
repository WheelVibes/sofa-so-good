import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type Group, MathUtils, Mesh, type Object3D } from 'three'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { serializeConfiguredSpec } from '../../furniture/configurator/configuredPersist'
import {
  buildConfigurableProduct,
  crossBucketCombineName,
  type GroupAssignment,
  isPlanExportable,
  planConfigurableExport,
} from '../../furniture/configurator/designerExport'
import { clampConfig } from '../../furniture/configurator/model'
import {
  type AlignMode,
  type Axis3,
  alignParts,
  distributeParts,
} from '../../furniture/glbEdit/arrange'
import {
  type LinearArrayOptions,
  linearArray,
  type RadialArrayOptions,
  radialArray,
} from '../../furniture/glbEdit/arrayBuild'
import { buildEditedObject } from '../../furniture/glbEdit/buildObject'
import { type FaceHit, placeComponentOnFace } from '../../furniture/glbEdit/componentPlace'
import { componentById } from '../../furniture/glbEdit/components'
import type { CsgOp } from '../../furniture/glbEdit/csgCombine'
import { combineGroupToMeshPart, evaluateAllGroups } from '../../furniture/glbEdit/csgEval'
import {
  type AssetEditSpec,
  addCombineGroup,
  addDecal,
  addPart,
  addPartGroup,
  bakeCombineGroup,
  combinedPartIds,
  combineGroups,
  combineSpansPartGroups,
  createEmptySpec,
  DECAL_DEFAULT_SIZE,
  type DecalKind,
  duplicatePart,
  duplicatePartGroup,
  isBuildable,
  type MirrorAxis3,
  mirrorPart,
  mirrorPartAxis,
  mirrorPartGroup,
  mirrorPartsAxis,
  newPartId,
  partGroupMemberIds,
  partGroups,
  removeCombineGroup,
  removeDecal as removeDecalOp,
  removePart,
  renamePart,
  renamePartGroup,
  repeatComponentGroup,
  type ShapePart,
  type SymmetryMode,
  setMeshOverride,
  decals as specDecals,
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
import {
  addPiping,
  canPipe,
  PIPING_DEFAULTS,
  type PipingParams,
} from '../../furniture/glbEdit/piping'
import { exportAndSaveAsset, placementFlags } from '../../furniture/glbEdit/saveAsset'
import { hasSplittableGroups, splitSpecByGroups } from '../../furniture/glbEdit/setSplit'
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
import { buildTemplate, insertTemplate, templateById } from '../../furniture/glbEdit/templates'
import type { FurnitureCategory, UserGltfDef } from '../../furniture/types'
import { parseFurnitureMaterialFinish } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import { useIsMobile } from '../useIsMobile'
import {
  effectiveSnapStep,
  type GridSnapPref,
  loadGridSnap,
  type SnapStepM,
  saveGridSnap,
} from './gridSnapPref'
import type { PlacementKind } from './SavePanel'
import { useCombineResults } from './useCombineResults'

/** Orthographic-style camera preset the viewport can snap to (Stage 4). */
export type ViewPreset = 'home' | 'front' | 'side' | 'top'

/**
 * Asset Studio designer **context** (Stage 4a).
 *
 * `useDesignerController` owns the whole GLB-designer editing model — the spec +
 * bounded undo/redo history, selection (parts + transform group), gizmo mode +
 * live preview mesh registries, armed component/template state, live combine
 * evaluation, the "make configurable" assignments, and every commit/save handler.
 * It runs unconditionally (like the pre-4a `GlbDesignerDialog` body did, so its
 * hooks/effects are stable whether the dialog is open or closed) and exposes the
 * result through `DesignerContext`.
 *
 * The dialog + its focused panels consume this via `useDesigner()` instead of the
 * ~99 hand-threaded props that Stages 0–3 accreted, leaving `GlbDesignerDialog`
 * as pure composition. All pure spec/geometry logic still lives in
 * `src/furniture/glbEdit/`; this file is only the React state wiring.
 */
function useDesignerController() {
  const open = useStore((s) => s.glbDesignerOpen)
  // Pro-only power tool — needs the full canvas. Gated by the `glbDesigner`
  // feature flag (pro tier, so it's forced off in Simple mode; the ⌘K command
  // and the catalog "Design" button share the same gate).
  const enabled = useFeature('glbDesigner')
  const setsEnabled = useFeature('assetSets')
  const configurableEnabled = useFeature('assetConfigurableExport')
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

  // ---- Sets (Stage 3d): also save each top-level group as its own asset ---
  const [splitGroups, setSplitGroups] = useState(false)
  // ---- Make configurable (Stage 3d): per-group variant-slot assignments ---
  const [assignments, setAssignments] = useState<Record<string, GroupAssignment>>({})
  const [cfgBusy, setCfgBusy] = useState(false)

  // ---- Component library — armed fitting + params (Stage 3b) -------------
  const [armedComponentId, setArmedComponentId] = useState<string | null>(null)
  const [armedParams, setArmedParams] = useState<Record<string, number>>({})

  // ---- Template picker — armed template + params (Stage 3c) ---------------
  // While a template is armed the viewport previews the would-be-inserted spec
  // live; "Use template" flattens it in (one undo step). Mutually exclusive with
  // an armed component.
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateParams, setTemplateParams] = useState<Record<string, number>>({})

  // ---- Detail layer — armed decal kind (Stage 5) --------------------------
  // While a decal is armed the next preview click on a part FACE projects that
  // decal onto the part (SWOOD seam, reused). Mutually exclusive with an armed
  // component/template.
  const [armedDecalKind, setArmedDecalKind] = useState<DecalKind | null>(null)

  // ---- Grid snap preference (Stage 4, per-device localStorage) -----------
  const [gridSnap, setGridSnap] = useState<GridSnapPref>(() => loadGridSnap())
  const snapStep = effectiveSnapStep(gridSnap)
  const toggleGridSnap = () =>
    setGridSnap((p) => {
      const next = { ...p, enabled: !p.enabled }
      saveGridSnap(next)
      return next
    })
  const setSnapStep = (step: SnapStepM) =>
    setGridSnap(() => {
      const next: GridSnapPref = { enabled: true, step }
      saveGridSnap(next)
      return next
    })

  // ---- Camera view presets (Stage 4) — a monotonically-bumped request the
  // viewport's in-canvas responder reacts to (so re-picking the same preset
  // re-fits). No persistence. -----------------------------------------------
  const [viewRequest, setViewRequest] = useState<{ preset: ViewPreset; n: number }>({
    preset: 'home',
    n: 0,
  })
  const requestView = (preset: ViewPreset) => setViewRequest((r) => ({ preset, n: r.n + 1 }))

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
  // defined below, so the viewport + the automation seam call the LATEST closure
  // via this ref. ----------------------------------------------------------
  const armedRef = useRef<string | null>(armedComponentId)
  armedRef.current = armedComponentId
  const placeArmedRef = useRef<(hit: FaceHit) => void>(() => {})
  // Latest decal-place closure for the viewport + automation seam (Stage 5).
  const armedDecalRef = useRef<DecalKind | null>(armedDecalKind)
  armedDecalRef.current = armedDecalKind
  const placeDecalRef = useRef<
    (partId: string, point: [number, number, number], normal: [number, number, number]) => void
  >(() => {})

  // Automation seam for the scenario harness (Stage 3d): drive the spec + the
  // "Make configurable" export deterministically. Mirrors `__glbDesignerPlaceOnFace`.
  // The handlers are assigned below via this ref so the seam always calls the
  // latest closures.
  const seamRef = useRef<{
    setSpec: (s: AssetEditSpec) => void
    getSpec: () => AssetEditSpec
    makeConfigurable: (a: Record<string, GroupAssignment>) => Promise<string | null>
  }>({ setSpec: () => {}, getSpec: createEmptySpec, makeConfigurable: async () => null })
  useEffect(() => {
    // Dev-only automation seam (scenarios run against the dev server = DEV build);
    // never registered on a production window (finding 7).
    if (!open || !enabled || !import.meta.env.DEV) return
    const w = window as unknown as {
      __glbDesigner?: {
        setSpec: (s: AssetEditSpec) => void
        getSpec: () => AssetEditSpec
        makeConfigurable: (a: Record<string, GroupAssignment>) => Promise<string | null>
      }
    }
    w.__glbDesigner = {
      setSpec: (s) => seamRef.current.setSpec(s),
      getSpec: () => seamRef.current.getSpec(),
      makeConfigurable: (a) => seamRef.current.makeConfigurable(a),
    }
    return () => {
      w.__glbDesigner = undefined
    }
  }, [open, enabled])
  // Expose a small placement seam while the designer is open so the scenario
  // harness can drive a face-place deterministically (the real UI path is a
  // click in the preview). Mirrors the `window.__store` automation seam.
  useEffect(() => {
    // Dev-only automation seam (see the sibling `__glbDesigner` effect, finding 7).
    if (!open || !enabled || !import.meta.env.DEV) return
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
  // Dev-only decal placement seam (Stage 5) — projects the armed decal onto a
  // part face given the target part id + PART-LOCAL hit point + local normal.
  useEffect(() => {
    if (!open || !enabled || !import.meta.env.DEV) return
    const w = window as unknown as {
      __glbDesignerPlaceDecal?: (
        partId: string,
        point: [number, number, number],
        normal: [number, number, number],
      ) => void
    }
    w.__glbDesignerPlaceDecal = (partId, point, normal) =>
      placeDecalRef.current(partId, point, normal)
    return () => {
      w.__glbDesignerPlaceDecal = undefined
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
      // Esc disarms a pending component or decal placement (before anything
      // else claims it).
      if (key === 'escape' && (armedRef.current || armedDecalRef.current)) {
        e.preventDefault()
        e.stopPropagation()
        setArmedComponentId(null)
        setArmedParams({})
        setArmedDecalKind(null)
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

  // Live template preview (Stage 3c): while a template is armed, the viewport
  // renders the spec AS IT WOULD BE after inserting the (clamped) template, so
  // the user sees the piece live before committing. `buildTemplate` mints fresh
  // ids each recompute — harmless (nothing is selected while previewing).
  const previewSpec = useMemo(() => {
    if (!templateId) return null
    const def = templateById(templateId)
    if (!def) return null
    return insertTemplate(spec, buildTemplate(def, templateParams)).spec
  }, [templateId, templateParams, spec])

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
      setTemplateId(null)
      setTemplateParams({})
      setArmedDecalKind(null)
      setSplitGroups(false)
      setAssignments({})
      setCfgBusy(false)
      sourceSceneRef.current = null
    }
  }, [open])

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
  // The selected transform group's spec (Stage 3a) — the GroupInspector target.
  // Mutually exclusive with a part selection.
  const selectedGroup =
    !sel && selGroupId ? (transformGroups.find((g) => g.id === selGroupId) ?? null) : null

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
  const setSourceScale = (scale: number) =>
    commit((s) => ({ ...s, sourceScale: scale }), { coalesceKey: 'sourceScale' })
  const setMeshColor = (mn: string, hex: string) =>
    commit((s) => setMeshOverride(s, mn, { color: hex }), { coalesceKey: `mesh:${mn}` })
  const toggleMeshHidden = (mn: string, hidden: boolean) =>
    commit((s) => setMeshOverride(s, mn, { hidden }))
  const resetMesh = (mn: string) =>
    commit((s) => setMeshOverride(s, mn, { color: undefined, hidden: false }))

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

  // Numeric/field edit of the selected part (one `updatePart` patch), coalesced.
  const patchSelectedPart = (patch: Partial<ShapePart>) => {
    if (!sel) return
    commit((sp) => updatePart(sp, sel.id, patch), { coalesceKey: 'patch' })
  }

  // Rename a part inline (layers tree / inspector). Blank clears back to the
  // default `kind N` label. Coalesced per part id.
  const renamePartName = (id: string, partName: string) =>
    commit((sp) => renamePart(sp, id, partName), { coalesceKey: `part-name:${id}` })

  // ---- Arrange: align / distribute (Stage 4) -----------------------------
  // Operate on the selected PARTS (`selIds`). Align needs ≥2, distribute ≥3.
  const alignSelection = (axis: Axis3, mode: AlignMode) =>
    commit((sp) => alignParts(sp, selIds, axis, mode))
  const distributeSelection = (axis: Axis3) => commit((sp) => distributeParts(sp, selIds, axis))

  // ---- Arrange: arbitrary-axis mirror (Stage 4) --------------------------
  // Mirror the selected part(s) across the asset origin plane on X or Z,
  // appending mirrored copies (one for a single selection, the whole set for a
  // multi-selection). Selects the new copies.
  const mirrorAxis = (axis: MirrorAxis3) => {
    if (selIds.length === 0) return
    if (selIds.length === 1) {
      const { spec: next, newId } = mirrorPartAxis(spec, selIds[0], axis)
      if (!newId) return
      commit(next)
      setSelId(newId)
    } else {
      const { spec: next, newIds } = mirrorPartsAxis(spec, selIds, axis)
      if (newIds.length === 0) return
      commit(next)
      setSelIds(newIds)
    }
  }

  // ---- Arrange: linear / radial array (Stage 4) --------------------------
  // Source = the selected transform group's members (when a group is selected)
  // else the selected parts. Creates the copies as one named "Array" group.
  const arraySourceIds = selGroupId && selectedGroup ? selectedGroup.partIds : selIds
  const arrayLinear = (opts: LinearArrayOptions) => {
    const { spec: next, groupId } = linearArray(spec, arraySourceIds, opts)
    if (!groupId) return
    commit(next)
    selectGroup(groupId)
  }
  const arrayRadial = (opts: RadialArrayOptions) => {
    const { spec: next, groupId } = radialArray(spec, arraySourceIds, opts)
    if (!groupId) return
    commit(next)
    selectGroup(groupId)
  }

  // Live list of the currently-selected preview Object3Ds (parts + group) for
  // the dimension readout's Box3 union (Stage 4). Reads the mesh/group registries
  // so the bbox is live during a gizmo drag.
  const getSelectionObjects = (): Object3D[] => {
    const objs: Object3D[] = []
    for (const id of selIds) {
      const m = meshRegistry.current.get(id)
      if (m) objs.push(m)
    }
    if (selGroupId) {
      const g = groupRegistry.current.get(selGroupId)
      if (g) objs.push(g)
    }
    return objs
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
    // Arming a component leaves the template picker + armed decal (exclusive).
    setTemplateId(null)
    setTemplateParams({})
    setArmedDecalKind(null)
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
  const placeOnFace = (point: [number, number, number], normal: [number, number, number]) =>
    placeArmed({ point, normal })

  // "Repeat" a placed component group to its symmetric positions about the asset
  // bbox centre (Mirror X/Z or ×4). Selects the last copy so it's easy to tweak.
  const repeatGroup = (groupId: string, mode: SymmetryMode) => {
    const { spec: next, groupIds } = repeatComponentGroup(spec, groupId, mode)
    if (groupIds.length === 0) return
    commit(next)
    selectGroup(groupIds[groupIds.length - 1])
  }

  // ---- Template picker (Stage 3c) ----------------------------------------
  // Arm a template: seed its params from the ergonomic defaults, clear any
  // selection + armed component (the viewport then previews it live).
  const armTemplate = (id: string) => {
    const def = templateById(id)
    if (!def) return
    setTemplateId(id)
    const seed: Record<string, number> = {}
    for (const p of def.params) seed[p.key] = p.default
    setTemplateParams(seed)
    setSelIds([])
    setSelGroupId(null)
    setArmedComponentId(null)
    setArmedParams({})
    setArmedDecalKind(null)
  }
  const cancelTemplate = () => {
    setTemplateId(null)
    setTemplateParams({})
  }
  const setTemplateParam = (key: string, value: number) =>
    setTemplateParams((p) => ({ ...p, [key]: value }))
  // "Use template": flatten the previewed template into the current spec (empty
  // → replaces, non-empty → inserts alongside on +X) as ONE undo step; select
  // the inserted group so it's ready to move/edit.
  const useTemplate = () => {
    const def = templateId ? templateById(templateId) : null
    if (!def) return
    const { spec: next, groupId } = insertTemplate(spec, buildTemplate(def, templateParams))
    commit(next)
    cancelTemplate()
    if (groupId) selectGroup(groupId)
  }

  // ---- Detail layer: decals + piping (Stage 5) ---------------------------
  // Arm a decal kind: the next preview face-click projects it. Clears any armed
  // component/template + the selection (mutually exclusive modes).
  const armDecal = (kind: DecalKind) => {
    setArmedDecalKind(kind)
    setArmedComponentId(null)
    setArmedParams({})
    setTemplateId(null)
    setTemplateParams({})
    setSelIds([])
    setSelGroupId(null)
  }
  const disarmDecal = () => setArmedDecalKind(null)

  // Project the armed decal onto a clicked part face (part-local hit point +
  // local normal), record it, and disarm. Stays selected on nothing (a decal
  // isn't a part/group).
  const placeDecal = (
    partId: string,
    point: [number, number, number],
    normal: [number, number, number],
  ) => {
    const kind = armedDecalRef.current
    if (!kind) return
    const { spec: next, decalId } = addDecal(spec, {
      partId,
      position: point,
      normal,
      size: DECAL_DEFAULT_SIZE[kind],
      kind,
    })
    if (!decalId) return
    commit(next)
    disarmDecal()
  }
  placeDecalRef.current = placeDecal
  const removeDecal = (id: string) => commit((sp) => removeDecalOp(sp, id))

  // "Add piping": trace the selected box/extrude's top-face perimeter as a thin
  // welt, grouped with the host. One undo step; selects the new group.
  const addPipingToSelected = (params: PipingParams = PIPING_DEFAULTS) => {
    if (!canPipe(sel)) return
    const { spec: next, groupId } = addPiping(spec, sel.id, params)
    if (!groupId) return
    commit(next)
    selectGroup(groupId)
  }

  const commitGizmoDrag = () => {
    const m = selMesh
    const part = sel
    if (!m || !part) return
    const patch = gizmoPatch(
      part,
      gizmoActive,
      {
        position: [m.position.x, m.position.y, m.position.z],
        rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
        scale: [m.scale.x, m.scale.y, m.scale.z],
      },
      snapStep,
    )
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
    // A combine's baked result lives under its members' shared transform-group
    // container, so members must all share one home (finding 1) — surface a
    // specific hint rather than the generic failure when they span groups.
    if (combineSpansPartGroups(spec, eligibleCombineIds)) {
      useStore.getState().notify.start({
        title: "Can't combine across different groups",
        message: 'Ungroup them first, or combine parts within one group.',
        kind: 'error',
      })
      return
    }
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

  const renameGroup = (groupId: string, groupName: string) => {
    commit((sp) => renamePartGroup(sp, groupId, groupName), {
      coalesceKey: `group-name:${groupId}`,
    })
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
    const patch = groupGizmoPatch(
      group,
      mode,
      {
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      },
      snapStep,
    )
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
        // Sets (Stage 3d): also save each top-level group as its own catalog
        // asset (named after the group). Placed sets are just the individual
        // assets — no new runtime concept.
        let extra = 0
        if (splitGroups && setsEnabled && !overwriteId && hasSplittableGroups(spec)) {
          const pieces = splitSpecByGroups(spec)
          for (const piece of pieces) {
            const pieceResults = await evaluateAllGroups(piece.spec)
            // FAIL LOUD per piece, exactly like the main save path: a degenerate
            // combine inside a split group must abort the whole save, never bake
            // a piece silently missing its CSG result.
            const pieceFailed = combineGroups(piece.spec).find((g) => !pieceResults.has(g.id))
            if (pieceFailed) {
              notify.start({
                title: `Combine '${pieceFailed.name}' in "${piece.name}" failed — fix or ungroup it before saving`,
                kind: 'error',
              })
              return
            }
            const pieceObj = buildEditedObject(null, piece.spec, pieceResults)
            const pieceRes = await exportAndSaveAsset(
              pieceObj,
              piece.name,
              category,
              placementFlags(placement),
              undefined,
              piece.spec,
            )
            if (pieceRes.ok && !pieceRes.duplicate) extra += 1
          }
        }
        notify.start({
          title: res.duplicate
            ? 'That asset already exists'
            : overwriteId
              ? `Updated "${name}"`
              : extra > 0
                ? `Saved "${name}" + ${extra} piece${extra === 1 ? '' : 's'} to your catalog`
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

  // ---- Make configurable (Stage 3d) --------------------------------------
  const setAssignment = (groupId: string, patch: Partial<GroupAssignment>) => {
    setAssignments((prev) => {
      const cur = prev[groupId] ?? {
        slot: null,
        label: transformGroups.find((g) => g.id === groupId)?.name ?? 'Option',
        price: 0,
      }
      return { ...prev, [groupId]: { ...cur, ...patch } }
    })
  }
  // Distinct non-empty slot keys currently assigned.
  const assignedSlots = new Set(
    Object.values(assignments)
      .map((a) => a.slot)
      .filter((s): s is string => !!s),
  )

  // Export the current design as a user configurable product: plan (pure) → bake
  // each option/base to a self-contained GLB → register in the user-products
  // registry, then open the configurator seeded on it. `openConfigurator` lets
  // the automation seam bake-only. Returns the new product id (or null).
  const exportConfigurable = async (
    openConfigurator: boolean,
    explicit?: Record<string, GroupAssignment>,
  ): Promise<string | null> => {
    if (cfgBusy) return null
    const notify = useStore.getState().notify
    const source = explicit ?? assignments
    // Fill defaults for any group the user never touched (→ base).
    const filled: Record<string, GroupAssignment> = {}
    for (const g of partGroups(spec)) {
      filled[g.id] = source[g.id] ?? { slot: null, label: g.name, price: 0 }
    }
    const plan = planConfigurableExport(spec, filled)
    if (!isPlanExportable(plan)) {
      notify.start({
        title: 'Name a slot on at least one group first',
        kind: 'error',
      })
      return null
    }
    // A combine straddling a slot boundary can't bake into one option's GLB —
    // block with a clear hint rather than silently dropping it (finding 2).
    const straddling = crossBucketCombineName(spec, filled)
    if (straddling) {
      notify.start({
        title: `Combine '${straddling}' spans a slot boundary`,
        message: 'Keep a combine inside one group before making it configurable.',
        kind: 'error',
      })
      return null
    }
    setCfgBusy(true)
    try {
      // Stable product id (finding 5): reuse the id this design was last exported
      // under so a re-export REPLACES its product instead of duplicating. Stamp a
      // fresh id onto the spec on first export so a second export (this session or
      // a re-edit of the saved asset) reuses it.
      const id = spec.exportedProductId ?? `user-cfg-${newPartId()}`
      if (!spec.exportedProductId) commit((s) => ({ ...s, exportedProductId: id }))
      const product = await buildConfigurableProduct(plan, {
        id,
        label: name.trim() || 'Custom product',
        category,
      })
      const saved = useStore.getState().addUserConfigurableProduct(product)
      if (!saved) {
        // Fail loud (finding 4): the localStorage write failed (quota/private
        // mode), so don't claim success or open the configurator on a product
        // the next reload won't have.
        notify.start({
          title: "Couldn't save this product",
          message: 'Storage is full — remove some saved products and try again.',
          kind: 'error',
        })
        return null
      }
      notify.start({ title: `Saved "${product.label}" as a configurable product`, kind: 'success' })
      if (openConfigurator) {
        const seed = clampConfig(product, null)
        useStore.getState().setConfiguratorEditSpec(serializeConfiguredSpec(seed))
        useStore.getState().setConfiguratorOpen(true)
        close()
      }
      return id
    } catch (err) {
      notify.start({
        title: "Couldn't build this product",
        message: err instanceof Error ? err.message : 'A part failed to bake.',
        kind: 'error',
      })
      return null
    } finally {
      setCfgBusy(false)
    }
  }

  // Wire the automation seam to the latest closures (Stage 3d scenario).
  seamRef.current = {
    setSpec: (s) => commit(s),
    getSpec: () => spec,
    makeConfigurable: (a) => {
      setAssignments(a)
      return exportConfigurable(false, a)
    },
  }

  // ---- View-model derived for the live preview ---------------------------
  // While a template is armed the viewport renders the would-be-inserted spec as
  // a live preview and suppresses the gizmo (nothing is selected).
  const viewSpec = previewSpec ?? spec
  const viewSel = previewSpec ? null : sel
  const viewSelMesh = previewSpec ? null : selMesh
  const viewSelGroupObj = previewSpec ? null : selGroupObj
  const armed = !!armedComponentId
  const decalArmed = !!armedDecalKind
  const decalList = specDecals(spec)

  return {
    // lifecycle / chrome
    open,
    enabled,
    configurableEnabled,
    isMobile,
    close,
    // spec + history
    spec,
    canUndo,
    canRedo,
    doUndo,
    doRedo,
    // selection
    sel,
    selIds,
    selGroupId,
    selectedGroup,
    selectMode,
    eligibleGroupCount: eligibleGroupIds.length,
    onSelectPart,
    selectGroup,
    toggleSelectMode: () => setSelectMode((v) => !v),
    // shape building
    addShape,
    duplicate,
    remove,
    mirror,
    patchSelectedPart,
    renamePartName,
    // arrange: align / distribute / mirror-axis / array (Stage 4)
    selCount: selIds.length,
    alignSelection,
    distributeSelection,
    mirrorAxis,
    arrayLinear,
    arrayRadial,
    arraySourceCount: arraySourceIds.length,
    // grid snap (Stage 4)
    gridSnap,
    snapStep,
    toggleGridSnap,
    setSnapStep,
    // camera view presets + live dimension readout (Stage 4)
    viewRequest,
    requestView,
    getSelectionObjects,
    // source picker + mesh recolour
    userGlbs,
    meshNames,
    canRestore: !!restorableSpec,
    pickSource,
    setSourceScale,
    restoreSpec,
    setMeshColor,
    toggleMeshHidden,
    resetMesh,
    // components (Stage 3b)
    armedComponentId,
    armedParams,
    armComponent,
    disarmComponent,
    setArmedParam,
    // templates (Stage 3c)
    templateId,
    templateParams,
    armTemplate,
    cancelTemplate,
    useTemplate,
    setTemplateParam,
    // detail layer: decals + piping (Stage 5)
    armedDecalKind,
    decalArmed,
    decalList,
    armDecal,
    disarmDecal,
    removeDecal,
    canPipeSelected: canPipe(sel),
    addPipingToSelected,
    // transform groups (Stage 3a)
    transformGroups,
    groupSelected,
    ungroupTransform,
    renameGroup,
    patchGroupTransform,
    duplicateGroup,
    mirrorGroup,
    repeatGroup,
    // combine (CSG v2, Stage 1b)
    combineGroupList: groups,
    eligibleCombineCount: eligibleCombineIds.length,
    combining,
    combineResults,
    combineComputing,
    combineErrors,
    readyResultIds,
    combine,
    bake,
    ungroupCombine: ungroup,
    // make configurable (Stage 3d)
    assignments,
    assignedSlotCount: assignedSlots.size,
    cfgBusy,
    setAssignment,
    exportConfigurable,
    // save panel
    name,
    category,
    placement,
    overwrite,
    busy,
    splitGroups,
    setsEnabled,
    setName,
    setCategory,
    setPlacement,
    toggleOverwrite: () => setOverwrite((v) => !v),
    toggleSplitGroups: () => setSplitGroups((v) => !v),
    canSplitGroups: setsEnabled && !overwrite && hasSplittableGroups(spec),
    canSave: isBuildable(spec) && combineErrors.size === 0,
    save,
    // viewport
    viewSpec,
    viewSel,
    viewSelMesh,
    viewSelGroupObj,
    gizmoActive,
    setGizmoMode,
    meshRefFor,
    groupRefFor,
    onScene,
    commitGizmoDrag,
    commitGroupGizmoDrag,
    armed,
    placeOnFace,
    placeDecal,
    sourceUrl,
    finishIds,
  }
}

export type DesignerContextValue = ReturnType<typeof useDesignerController>

/** The raw context — exported so focused unit tests can mount a single panel
 *  with a hand-built partial value instead of the whole provider. */
export const DesignerContext = createContext<DesignerContextValue | null>(null)

/** Owns the whole designer editing model and provides it to the dialog + panels.
 *  Rendered unconditionally (even while the designer is closed) so its hooks stay
 *  stable — the dialog gates its own render on `open`/`enabled`. */
export function DesignerProvider({ children }: { children: ReactNode }) {
  const value = useDesignerController()
  return <DesignerContext.Provider value={value}>{children}</DesignerContext.Provider>
}

/** Consume the designer context. Throws if used outside `DesignerProvider`. */
export function useDesigner(): DesignerContextValue {
  const ctx = useContext(DesignerContext)
  if (!ctx) throw new Error('useDesigner must be used within a DesignerProvider')
  return ctx
}
