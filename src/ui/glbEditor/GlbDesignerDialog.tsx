import { Bounds, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MathUtils, Mesh, type Object3D } from 'three'
import { buildEditedObject, partGeometry } from '../../furniture/glbEdit/buildObject'
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
function PartMesh({ part }: { part: ShapePart }) {
  // `part` is recreated immutably by updatePart on every edit, so depending on
  // it rebuilds the geometry exactly when kind/size change.
  const geom = useMemo(() => partGeometry(part), [part])
  useEffect(() => () => geom.dispose(), [geom])
  const glow = part.emissiveIntensity ?? 0
  const opacity = part.opacity ?? 1
  const rot = part.rotation
  return (
    <mesh
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
function PartsPreview({ spec }: { spec: AssetEditSpec }) {
  return (
    <>
      {spec.parts.map((p) => (
        <PartMesh key={p.id} part={p} />
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
  const [busy, setBusy] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [meshNames, setMeshNames] = useState<string[]>([])
  const sourceSceneRef = useRef<Object3D | null>(null)

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
      setOverwrite(false)
      sourceSceneRef.current = null
    }
  }, [open])

  if (!open || !isPro) return null

  const sel = spec.parts.find((p) => p.id === selId) ?? null

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
                  <PartsPreview spec={spec} />
                </Bounds>
              </Suspense>
              <OrbitControls makeDefault />
            </Canvas>
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
                {(['size', 'position'] as const).map((field) => (
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
