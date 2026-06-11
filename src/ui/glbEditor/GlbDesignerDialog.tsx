import { Bounds, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MathUtils, Mesh, type Object3D } from 'three'
import { useModalGuard } from '../../controls/modalGuard'
import { buildEditedObject, partGeometry } from '../../furniture/glbEdit/buildObject'
import {
  CSG_OPS,
  type CsgOp,
  canCombineParts,
  combineParts,
} from '../../furniture/glbEdit/csgCombine'
import {
  type AssetEditSpec,
  addPart,
  createEmptySpec,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  duplicatePart,
  isBuildable,
  mirrorPart,
  removePart,
  SHAPE_KINDS,
  SHAPE_LABEL,
  type ShapePart,
  setMeshOverride,
  updatePart,
} from '../../furniture/glbEdit/editSpec'
import {
  GIZMO_MODES,
  type GizmoMode,
  gizmoModesFor,
  gizmoPatch,
} from '../../furniture/glbEdit/gizmoWriteBack'
import { exportAndSaveAsset, placementFlags } from '../../furniture/glbEdit/saveAsset'
import type { UserGltfDef } from '../../furniture/types'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'

/** Loaded source GLB, uniformly scaled; reports its scene up for export. */
function SourceModel({
  url,
  scale,
  onScene,
}: {
  url: string
  scale: number
  onScene: (o: Object3D | null) => void
}) {
  const gltf = useGLTF(url)
  useEffect(() => {
    onScene(gltf.scene)
    return () => onScene(null)
  }, [gltf.scene, onScene])
  return <primitive object={gltf.scene} scale={scale} />
}

/** One primitive part, built from the SAME `partGeometry` the export uses (so
 *  the preview can never drift from the saved GLB). Geometry is memoised on the
 *  part's kind+size and disposed when it changes/unmounts. */
function PartMesh({ part, meshRef }: { part: ShapePart; meshRef?: (m: Mesh | null) => void }) {
  // `part` is recreated immutably by updatePart on every edit, so depending on
  // it rebuilds the geometry exactly when kind/size change.
  const geom = useMemo(() => partGeometry(part), [part])
  useEffect(() => () => geom.dispose(), [geom])
  const glow = part.emissiveIntensity ?? 0
  const opacity = part.opacity ?? 1
  const rot = part.rotation
  return (
    <mesh
      ref={meshRef}
      position={part.position}
      rotation={
        rot
          ? [MathUtils.degToRad(rot[0]), MathUtils.degToRad(rot[1]), MathUtils.degToRad(rot[2])]
          : undefined
      }
      castShadow
      receiveShadow
      geometry={geom}
    >
      <meshStandardMaterial
        color={part.color}
        roughness={part.roughness ?? DEFAULT_PART_ROUGHNESS}
        metalness={part.metalness ?? DEFAULT_PART_METALNESS}
        emissive={glow > 0 ? part.color : '#000000'}
        emissiveIntensity={glow}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

/** The composed primitive parts, rendered declaratively (export uses buildEditedObject). */
function PartsPreview({
  spec,
  meshRefFor,
}: {
  spec: AssetEditSpec
  meshRefFor: (id: string) => (m: Mesh | null) => void
}) {
  return (
    <>
      {spec.parts.map((p) => (
        <PartMesh key={p.id} part={p} meshRef={meshRefFor(p.id)} />
      ))}
    </>
  )
}

const SHAPES: { kind: (typeof SHAPE_KINDS)[number]; label: string }[] = SHAPE_KINDS.map((kind) => ({
  kind,
  label: SHAPE_LABEL[kind],
}))

/**
 * GLB Asset Designer — compose a new asset from primitive shapes and/or start
 * from an uploaded GLB (uniformly scaled) to make a custom variant, preview it
 * live, then export → save into the catalog (reusing the upload pipeline).
 */
export function GlbDesignerDialog() {
  const open = useStore((s) => s.glbDesignerOpen)
  // Pro-only tool: a power feature that needs the full canvas. Simple mode keeps
  // the UI minimal, so never surface it there (defensive — the ⌘K entry is also
  // hidden in simple mode).
  const isPro = useStore((s) => s.uiMode === 'pro')
  const isMobile = useIsMobile()
  const close = () => useStore.getState().setGlbDesignerOpen(false)
  // Select the stable array ref, filter in a memo — filtering inside the selector
  // returns a fresh array every render and spins Zustand into an update loop.
  const userFurniture = useStore((s) => s.userFurniture)
  const userGlbs = useMemo(
    () => userFurniture.filter((d): d is UserGltfDef => d.source === 'user' && !!d.runtimeUrl),
    [userFurniture],
  )

  const [spec, setSpec] = useState<AssetEditSpec>(createEmptySpec)
  const [name, setName] = useState('Custom asset')
  const [category, setCategory] = useState<FurnitureCategory>('others')
  const [placement, setPlacement] = useState<'floor' | 'wall' | 'floorCovering'>('floor')
  const [selId, setSelId] = useState<string | null>(null)
  // Second pick for a CSG combine ("with…"); the selected part is the first operand.
  const [combineId, setCombineId] = useState('')
  const [combining, setCombining] = useState(false)
  const [busy, setBusy] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [meshNames, setMeshNames] = useState<string[]>([])
  const sourceSceneRef = useRef<Object3D | null>(null)

  // ---- Drag gizmo (GE2b) -------------------------------------------------
  // Mode for the TransformControls gizmo on the selected part. The gizmo is
  // the FAST path; the numeric inputs stay the precision path — a finished
  // drag is written back through the same `updatePart` (see commitGizmoDrag).
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

  // This dialog is a modal-style overlay that doesn't build on `Modal`, so it
  // registers with the modal guard itself: global scene hotkeys no-op while
  // it's open, which also keeps the dialog-scoped G/R/S keys below conflict-free.
  useModalGuard(open && isPro)

  // Dialog-scoped Blender-style hotkeys: G = move, R = rotate, S = scale.
  // Ignored while typing in the dialog's inputs/selects.
  useEffect(() => {
    if (!open || !isPro) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'SELECT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return
      }
      const hit = GIZMO_MODES.find((m) => m.hotkey === e.key.toLowerCase())
      if (!hit) return
      e.preventDefault()
      setGizmoMode(hit.mode)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isPro])
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

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setSpec(createEmptySpec())
      setName('Custom asset')
      setCategory('others')
      setPlacement('floor')
      setSelId(null)
      setCombineId('')
      setOverwrite(false)
      setGizmoMode('translate')
      setSelMesh(null)
      sourceSceneRef.current = null
    }
  }, [open])

  if (!open || !isPro) return null

  const sel = spec.parts.find((p) => p.id === selId) ?? null
  // Stale picks (removed part / now the selected part) fall back to "with…".
  const combineWithId = sel && canCombineParts(spec, sel.id, combineId) ? combineId : ''

  // A mesh (CSG) part has no scale mode (its triangles are baked) — fall back
  // to translate rather than showing a gizmo that can't write back.
  const gizmoActive: GizmoMode =
    sel && !gizmoModesFor(sel.kind).includes(gizmoMode) ? 'translate' : gizmoMode

  // Write one finished gizmo drag back to the part's numeric fields (coalesced
  // per drag-END, never per frame) through the same `updatePart` the inputs
  // use; `gizmoPatch` snaps to the inputs' precision. The spec stays the source
  // of truth: scale is reset to 1 (geometry rebuilds at the new size) and a
  // no-op drag snaps the live object back to the part's stored transform.
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
      setSpec((sp) => updatePart(sp, part.id, patch))
    } else {
      const r = part.rotation ?? [0, 0, 0]
      m.position.set(part.position[0], part.position[1], part.position[2])
      m.rotation.set(MathUtils.degToRad(r[0]), MathUtils.degToRad(r[1]), MathUtils.degToRad(r[2]))
    }
  }

  const combine = async (op: CsgOp) => {
    if (!sel || !combineWithId || combining) return
    setCombining(true)
    try {
      // `combineParts` dynamic-imports the CSG engine (three-bvh-csg) on first use.
      const next = await combineParts(spec, sel.id, combineWithId, op)
      setSpec(next.spec)
      setSelId(next.partId)
      setCombineId('')
    } catch {
      // Non-manifold/degenerate output (e.g. intersecting disjoint shapes).
      useStore.getState().notify.start({ title: "Couldn't combine these shapes", kind: 'error' })
    } finally {
      setCombining(false)
    }
  }

  const save = async () => {
    if (!isBuildable(spec) || busy) return
    setBusy(true)
    try {
      const obj = buildEditedObject(sourceSceneRef.current, spec)
      const overwriteId = overwrite && spec.sourceAssetId ? spec.sourceAssetId : undefined
      const res = await exportAndSaveAsset(
        obj,
        name,
        category,
        placementFlags(placement),
        overwriteId,
      )
      const notify = useStore.getState().notify
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
            <Canvas shadows camera={{ position: [1.6, 1.3, 1.8], fov: 40 }}>
              <ambientLight intensity={0.7} />
              <hemisphereLight intensity={0.6} />
              <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
              <gridHelper args={[6, 12, '#999', '#ccc']} />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.2}>
                  {sourceUrl && (
                    <SourceModel url={sourceUrl} scale={spec.sourceScale} onScene={onScene} />
                  )}
                  <PartsPreview spec={spec} meshRefFor={meshRefFor} />
                </Bounds>
              </Suspense>
              {/* OrbitControls is makeDefault, so drei's TransformControls
                  auto-disables it while a gizmo handle is being dragged
                  (the standard `dragging-changed` wiring lives inside drei). */}
              <OrbitControls makeDefault />
              {sel && selMesh ? (
                <TransformControls
                  object={selMesh}
                  mode={gizmoActive}
                  onMouseUp={commitGizmoDrag}
                />
              ) : null}
            </Canvas>
            {/* Gizmo mode switch — overlays the preview's top-left corner. */}
            {sel ? (
              <div className="seg" style={{ position: 'absolute', top: 8, left: 8 }}>
                {GIZMO_MODES.filter(({ mode }) => gizmoModesFor(sel.kind).includes(mode)).map(
                  ({ mode, label, hotkey }) => (
                    <button
                      key={mode}
                      type="button"
                      className={gizmoActive === mode ? 'on' : ''}
                      aria-label={`Gizmo: ${label}`}
                      title={`${label} the selected shape (${hotkey.toUpperCase()})`}
                      onClick={() => setGizmoMode(mode)}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            ) : null}
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
            <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
              <div className="sec-h">
                <span>Start from</span>
              </div>
              <select
                className="input"
                aria-label="Source model"
                value={spec.sourceAssetId ?? ''}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, sourceAssetId: e.target.value || undefined }))
                }
                style={{ width: '100%' }}
              >
                <option value="">Blank (compose from shapes)</option>
                {userGlbs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {spec.sourceAssetId ? (
                <label className="fld" style={{ marginTop: 'var(--s-2)' }}>
                  <span>Scale ×{spec.sourceScale.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.05}
                    value={spec.sourceScale}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, sourceScale: Number(e.target.value) }))
                    }
                    aria-label="Source scale"
                  />
                </label>
              ) : null}
            </div>

            {meshNames.length > 0 ? (
              <div className="sec">
                <div className="sec-h">
                  <span>Recolour parts</span>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {meshNames.map((mn) => {
                    const ov = spec.meshOverrides[mn] ?? {}
                    return (
                      <div key={mn} className="lyr-row" style={{ gap: 'var(--s-2)' }}>
                        <input
                          type="color"
                          value={ov.color ?? '#cccccc'}
                          aria-label={`Recolour ${mn}`}
                          onChange={(e) =>
                            setSpec((s) => setMeshOverride(s, mn, { color: e.target.value }))
                          }
                          disabled={ov.hidden}
                        />
                        <span className="lyr-nm" title={mn}>
                          {mn}
                        </span>
                        <button
                          type="button"
                          className={`icon-btn${ov.hidden ? ' on' : ''}`}
                          aria-label={`${ov.hidden ? 'Show' : 'Hide'} ${mn}`}
                          title={ov.hidden ? 'Show part' : 'Hide part'}
                          onClick={() =>
                            setSpec((s) => setMeshOverride(s, mn, { hidden: !ov.hidden }))
                          }
                        >
                          <Icon.Eye width={14} height={14} />
                        </button>
                        {ov.color !== undefined || ov.hidden ? (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Reset ${mn}`}
                            title="Reset to original"
                            onClick={() =>
                              setSpec((s) =>
                                setMeshOverride(s, mn, { color: undefined, hidden: false }),
                              )
                            }
                          >
                            <Icon.Close width={13} height={13} />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="sec">
              <div className="sec-h">
                <span>Add shape</span>
              </div>
              <div className="action-grid two">
                {SHAPES.map((s) => (
                  <button
                    key={s.kind}
                    type="button"
                    className="act"
                    onClick={() =>
                      setSpec((sp) => {
                        const next = addPart(sp, s.kind)
                        setSelId(next.parts[next.parts.length - 1].id)
                        return next
                      })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {spec.parts.length > 0 ? (
                <div style={{ marginTop: 'var(--s-2)', display: 'grid', gap: 4 }}>
                  {spec.parts.map((p, i) => (
                    <div
                      key={p.id}
                      className={`lyr-row${selId === p.id ? ' sel' : ''}`}
                      onClick={() => setSelId(p.id)}
                    >
                      <span
                        className="swatch"
                        style={{ background: p.color, width: 16, height: 16, borderRadius: 3 }}
                      />
                      <span className="lyr-nm">
                        {p.kind} {i + 1}
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Duplicate ${p.kind} ${i + 1}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSpec((sp) => {
                            const next = duplicatePart(sp, p.id)
                            if (next.parts.length > sp.parts.length) {
                              setSelId(next.parts[next.parts.length - 1]!.id)
                            }
                            return next
                          })
                        }}
                      >
                        <Icon.Copy width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${p.kind} ${i + 1}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSpec((sp) => removePart(sp, p.id))
                          if (selId === p.id) setSelId(null)
                        }}
                      >
                        <Icon.Close width={13} height={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {sel ? (
              <div className="sec">
                <div className="sec-h">
                  <span>Edit {sel.kind}</span>
                </div>
                {/* A combined (mesh) part's triangles are baked — size is fixed;
                    position/rotation still move the whole result. */}
                {sel.kind === 'mesh' ? (
                  <div
                    style={{
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      marginBottom: 'var(--s-2)',
                    }}
                  >
                    Combined shape: move and rotate it freely (gizmo or fields). Its size is baked
                    by the combine, so there's no Scale gizmo or size fields.
                  </div>
                ) : null}
                {(
                  (sel.kind === 'mesh' ? ['position'] : ['size', 'position']) as (
                    | 'size'
                    | 'position'
                  )[]
                ).map((field) => (
                  <div key={field} style={{ marginBottom: 'var(--s-2)' }}>
                    <div
                      className="label"
                      style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                    >
                      {field === 'size' ? 'Size (m)' : 'Position (m)'}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0, 1, 2].map((axis) => (
                        <input
                          key={axis}
                          type="number"
                          className="input"
                          step={0.05}
                          min={field === 'size' ? 0.02 : -3}
                          value={sel[field][axis]}
                          aria-label={`${sel.kind} ${field} ${'XYZ'[axis]}`}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setSpec((sp) =>
                              updatePart(sp, sel.id, {
                                [field]: sel[field].map((o, k) => (k === axis ? v : o)) as [
                                  number,
                                  number,
                                  number,
                                ],
                              }),
                            )
                          }}
                          style={{ width: '33%' }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ marginBottom: 'var(--s-2)' }}>
                  <div
                    className="label"
                    style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                  >
                    Rotation (°)
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map((axis) => (
                      <input
                        key={axis}
                        type="number"
                        className="input"
                        step={15}
                        min={-180}
                        max={180}
                        value={(sel.rotation ?? [0, 0, 0])[axis]}
                        aria-label={`${sel.kind} rotation ${'XYZ'[axis]}`}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setSpec((sp) =>
                            updatePart(sp, sel.id, {
                              rotation: (sel.rotation ?? [0, 0, 0]).map((o, k) =>
                                k === axis ? v : o,
                              ) as [number, number, number],
                            }),
                          )
                        }}
                        style={{ width: '33%' }}
                      />
                    ))}
                  </div>
                </div>
                <label className="fld">
                  <span>Colour</span>
                  <input
                    type="color"
                    value={sel.color}
                    aria-label="Shape colour"
                    onChange={(e) =>
                      setSpec((sp) => updatePart(sp, sel.id, { color: e.target.value }))
                    }
                  />
                </label>
                {(
                  [
                    {
                      prop: 'roughness',
                      value: sel.roughness ?? DEFAULT_PART_ROUGHNESS,
                      min: 0,
                      max: 1,
                    },
                    {
                      prop: 'metalness',
                      value: sel.metalness ?? DEFAULT_PART_METALNESS,
                      min: 0,
                      max: 1,
                    },
                    {
                      prop: 'emissiveIntensity',
                      value: sel.emissiveIntensity ?? 0,
                      min: 0,
                      max: 3,
                    },
                    { prop: 'opacity', value: sel.opacity ?? 1, min: 0.1, max: 1 },
                  ] as const
                ).map(({ prop, value, min, max }) => (
                  <div key={prop} style={{ marginTop: 'var(--s-2)' }}>
                    <div
                      className="label"
                      style={{
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--text-3)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ textTransform: 'capitalize' }}>
                        {prop === 'emissiveIntensity' ? 'glow' : prop}
                      </span>
                      <span>{value.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      className="slider"
                      min={min}
                      max={max}
                      step={0.05}
                      value={value}
                      aria-label={`${sel.kind} ${prop}`}
                      onChange={(e) =>
                        setSpec((sp) => updatePart(sp, sel.id, { [prop]: Number(e.target.value) }))
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-3)' }}
                  onClick={() =>
                    setSpec((sp) => {
                      const next = mirrorPart(sp, sel.id)
                      if (next.parts.length > sp.parts.length) {
                        setSelId(next.parts[next.parts.length - 1]!.id)
                      }
                      return next
                    })
                  }
                >
                  <Icon.Copy width={14} height={14} />
                  Mirror across centre
                </button>
              </div>
            ) : null}

            {sel && spec.parts.length > 1 ? (
              <div className="sec">
                <div className="sec-h">
                  <span>Combine (boolean)</span>
                </div>
                <select
                  className="input"
                  aria-label="Combine with"
                  value={combineWithId}
                  onChange={(e) => setCombineId(e.target.value)}
                  style={{ width: '100%', marginBottom: 'var(--s-2)' }}
                >
                  <option value="">with…</option>
                  {spec.parts.map((p, i) =>
                    p.id === sel.id ? null : (
                      <option key={p.id} value={p.id}>
                        {p.kind} {i + 1}
                      </option>
                    ),
                  )}
                </select>
                <div className="action-grid two">
                  {CSG_OPS.map(({ op, label }) => (
                    <button
                      key={op}
                      type="button"
                      className="act"
                      disabled={!combineWithId || combining}
                      aria-label={`${label} ${sel.kind} with selected part`}
                      onClick={() => combine(op)}
                    >
                      {combining ? '…' : label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
                  Merges both shapes into one ("{SHAPE_LABEL.mesh}"), keeping this shape's colour.
                  Subtract carves the picked shape out of this one. Shapes only — the source model
                  can't be combined. There's no undo here: re-add the shapes if you change your
                  mind.
                </div>
              </div>
            ) : null}

            <div className="sec">
              <div className="sec-h">
                <span>Save to catalog</span>
              </div>
              <input
                className="input"
                value={name}
                aria-label="Asset name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Asset name"
                style={{ width: '100%', marginBottom: 'var(--s-2)' }}
              />
              <select
                className="input"
                aria-label="Asset category"
                value={category}
                onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                style={{ width: '100%', marginBottom: 'var(--s-2)' }}
              >
                {FURNITURE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Placement type"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as typeof placement)}
                style={{ width: '100%', marginBottom: 'var(--s-2)' }}
              >
                <option value="floor">Stands on the floor</option>
                <option value="wall">Mounts on a wall</option>
                <option value="floorCovering">Floor covering (rug — never blocks)</option>
              </select>
              {spec.sourceAssetId ? (
                <label
                  className="row"
                  style={{ cursor: 'pointer', marginBottom: 'var(--s-2)' }}
                  title="Replace the source asset in place — every piece already placed from it updates to this edit."
                >
                  <div
                    className="rk"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                  >
                    <div>Update original</div>
                    <div
                      style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}
                    >
                      Overwrite the source asset (keeps placed copies)
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={overwrite}
                    aria-label="Update original"
                    onClick={() => setOverwrite((v) => !v)}
                    className={`switch${overwrite ? ' on' : ''}`}
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="btn btn-accent btn-block"
                disabled={!isBuildable(spec) || busy}
                onClick={save}
              >
                {busy
                  ? 'Saving…'
                  : overwrite && spec.sourceAssetId
                    ? 'Update original'
                    : 'Save asset'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
