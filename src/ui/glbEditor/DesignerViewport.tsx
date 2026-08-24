import { Bounds, OrbitControls, TransformControls, useBounds, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Box3, type Object3D, PCFShadowMap, Vector3 } from 'three'
import { EnsureFurnitureMaterials } from '../../furniture/FurnitureMaterialLoader'
import type { FaceSnapHit } from '../../furniture/glbEdit/faceSnap'
import {
  GIZMO_MODES,
  type GizmoMode,
  GROUP_GIZMO_MODES,
  gizmoModesFor,
} from '../../furniture/glbEdit/gizmoWriteBack'
import { PIVOT_MODES } from '../../furniture/glbEdit/pivot'
import { secureGltfLoader } from '../../furniture/gltf/loaderSecurity'
import { Segmented } from '../controls/Segmented'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'
import { DesignerEnvironment } from './DesignerEnvironment'
import { useDesigner, type ViewPreset } from './designerContext'
import { SNAP_STEP_LABEL, SNAP_STEPS } from './gridSnapPref'
import { PartsPreview } from './PartsPreview'
import {
  loadPreviewEnv,
  PREVIEW_ENV_LABEL,
  PREVIEW_ENVS,
  type PreviewEnv,
  savePreviewEnv,
} from './previewEnvPref'

/** The gizmo-mode segmented switch overlaying the preview's top-left corner —
 *  shared by the part-gizmo and group-gizmo (Stage 3a) overlays, parameterised
 *  on the available `modes`, the `active` mode, and the `subject` it drives. */
function GizmoModeOverlay({
  modes,
  active,
  subject,
  ariaPrefix,
  onPick,
}: {
  modes: { mode: GizmoMode; label: string; hotkey: string }[]
  active: GizmoMode
  /** Noun for the title copy, e.g. `'shape'` / `'group'`. */
  subject: string
  /** Aria-label prefix, e.g. `'Gizmo'` / `'Group gizmo'`. */
  ariaPrefix: string
  onPick: (m: GizmoMode) => void
}) {
  return (
    <div className="seg dv-ov dv-ov-gizmo" style={{ position: 'absolute', top: 8, left: 8 }}>
      {modes.map(({ mode, label, hotkey }) => (
        <button
          key={mode}
          type="button"
          className={active === mode ? 'on' : ''}
          aria-label={`${ariaPrefix}: ${label}`}
          title={`${label} the selected ${subject} (${hotkey.toUpperCase()})`}
          onClick={() => onPick(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Dev-only: expose the DESIGNER canvas's renderer + scene on a distinct global
 *  (`window.__glbDesignerThree`) so the Stage-6f scenario can read
 *  `gl.info.render.calls` for the instanced-array draw-call measurement. Kept
 *  separate from the main scene's `window.__three` so the two canvases never
 *  clobber each other. Tree-shaken from production by the DEV guard at the mount
 *  site. */
function DevGlExpose() {
  const { gl, scene, camera, invalidate } = useThree()
  useEffect(() => {
    ;(window as unknown as { __glbDesignerThree?: unknown }).__glbDesignerThree = {
      gl,
      scene,
      camera,
      // `invalidate` lets a headless scenario pump the demand render-loop so
      // deferred work (e.g. drei <Bounds> auto-fit easing) can settle before a
      // screenshot — a raw `gl.render()` doesn't advance R3F's own frame logic.
      invalidate,
    }
    return () => {
      ;(window as unknown as { __glbDesignerThree?: unknown }).__glbDesignerThree = undefined
    }
  }, [gl, scene, camera, invalidate])
  return null
}

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
  // SEC-1: same shared foreign-URL-blocking manager as GltfModel — a model
  // opened for editing here can be an uploaded/IKEA-imported GLB, so it must
  // not be able to fetch a foreign host via its own embedded uris either.
  const gltf = useGLTF(url, true, true, secureGltfLoader)
  useEffect(() => {
    onScene(gltf.scene)
    return () => onScene(null)
  }, [gltf.scene, onScene])
  // Apply the preview scale on a WRAPPER group, never on the `<primitive>` — a
  // `scale` prop on `<primitive object={gltf.scene}>` mutates the shared
  // useGLTF-cached scene's own `.scale`. That scale then (a) leaks into the
  // object reported by `onScene` (used for export), so `buildEditedObject`'s
  // `multiplyScalar(sourceScale)` double-applies it and an "Update original"
  // saves geometry scaled 4×/8× instead of ×sourceScale, and (b) corrupts the
  // cache for any other consumer of the same GLB (e.g. the placed instance).
  return (
    <group scale={scale}>
      <primitive object={gltf.scene} />
    </group>
  )
}

/** In-canvas responder to a camera view-preset request (Stage 4). A child of
 *  `<Bounds>`, so it drives the camera through the drei Bounds API — which
 *  cooperates with OrbitControls (animating to the pose + re-enabling orbit
 *  after). Frames the content looking down the requested axis (Front/Side/Top)
 *  or an iso Home pose, fit to the content bounds. Keeps the perspective camera. */
function CameraViews({ request }: { request: { preset: ViewPreset; n: number } }) {
  const bounds = useBounds()
  const seen = useRef(request.n)
  useEffect(() => {
    if (request.n === seen.current) return
    seen.current = request.n
    // Recompute the content bounds, then frame from the requested direction at
    // the fit distance drei computes for the current camera.
    const { center, distance } = bounds.refresh().getSize()
    const d = distance || 2
    let pos: [number, number, number]
    switch (request.preset) {
      case 'front':
        pos = [center.x, center.y, center.z + d]
        break
      case 'side':
        pos = [center.x + d, center.y, center.z]
        break
      case 'top':
        pos = [center.x, center.y + d, center.z]
        break
      default:
        pos = [center.x + d * 0.55, center.y + d * 0.45, center.z + d * 0.65]
    }
    // Straight-down needs a non-Y up to avoid a degenerate lookAt.
    const up: [number, number, number] = request.preset === 'top' ? [0, 0, -1] : [0, 1, 0]
    bounds.moveTo(pos).lookAt({ target: [center.x, center.y, center.z], up })
  }, [request, bounds])
  return null
}

/** In-canvas live bbox reporter (Stage 4 dimension readout). Each frame it unions
 *  the currently-selected preview objects' world bounding boxes and, when the
 *  rounded centimetre size changes, reports W×D×H — so the overlay updates live
 *  during a gizmo drag (frames invalidate then) and once per selection change. */
function LiveDimensions({
  getObjects,
  onChange,
}: {
  getObjects: () => Object3D[]
  onChange: (dims: [number, number, number] | null) => void
}) {
  const box = useRef(new Box3())
  const tmp = useRef(new Vector3())
  const last = useRef<string | null>(null)
  useFrame(() => {
    const objs = getObjects()
    if (objs.length === 0) {
      if (last.current !== null) {
        last.current = null
        onChange(null)
      }
      return
    }
    box.current.makeEmpty()
    for (const o of objs) box.current.expandByObject(o)
    if (box.current.isEmpty()) return
    const s = box.current.getSize(tmp.current)
    const cm: [number, number, number] = [
      Math.round(s.x * 100),
      Math.round(s.y * 100),
      Math.round(s.z * 100),
    ]
    const key = cm.join('x')
    if (key !== last.current) {
      last.current = key
      onChange(cm)
    }
  })
  return null
}

/** Brief accent-edge highlight on the face plane(s) a magnetic drag just snapped
 *  to (Stage 6d). One thin bright quad per fired snap, spanning the snapped
 *  selection's AABB on the two axes perpendicular to the snap axis. Rendered as a
 *  child of the Canvas so it repaints on the state change and clears with it. */
function SnapHintOverlay({
  hint,
}: {
  hint: { hits: FaceSnapHit[]; min: [number, number, number]; max: [number, number, number] } | null
}) {
  if (!hint) return null
  const { min, max } = hint
  const span: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const mid: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]
  const THIN = 0.006
  return (
    <>
      {hint.hits.map((h) => {
        const size: [number, number, number] =
          h.axis === 'x'
            ? [THIN, span[1], span[2]]
            : h.axis === 'y'
              ? [span[0], THIN, span[2]]
              : [span[0], span[1], THIN]
        const pos: [number, number, number] =
          h.axis === 'x'
            ? [h.coord, mid[1], mid[2]]
            : h.axis === 'y'
              ? [mid[0], h.coord, mid[2]]
              : [mid[0], mid[1], h.coord]
        return (
          <mesh key={`${h.axis}-${h.kind}`} position={pos}>
            <boxGeometry args={size} />
            <meshBasicMaterial
              color={h.kind === 'abut' ? '#4ade80' : '#38bdf8'}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        )
      })}
    </>
  )
}

/**
 * The designer's live 3D preview: the R3F canvas, the composed parts (built from
 * the SAME `partGeometry`/`partMaterials` the export uses so the preview can
 * never drift from the saved GLB), the optional source GLB, the drag gizmo
 * (`TransformControls`) on the selected part, and the gizmo-mode overlay switch.
 *
 * Stage 4 adds: a grid-snap toggle + step select (top-right), orthographic-style
 * view presets + Home (below it), and a live W×D×H dimension readout of the
 * selection (bottom-left). Purely presentational — all spec state + write-back
 * live in the designer context.
 */
export function DesignerViewport() {
  const {
    viewSpec: spec,
    combineResults: results,
    viewSel: sel,
    viewSelMesh: selMesh,
    viewSelGroupObj: selGroupObj,
    finishIds,
    sourceUrl,
    gizmoActive,
    setGizmoMode,
    meshRefFor,
    groupRefFor,
    onScene,
    beginPartDrag,
    applyLivePartDragSnap,
    endPartDrag,
    beginGroupDrag,
    applyLiveGroupDragSnap,
    endGroupDrag,
    armed,
    placeOnFace: onPlaceFace,
    decalArmed,
    placeDecal: onPlaceDecal,
    selIds,
    selectGroup,
    gridSnap,
    toggleGridSnap,
    setSnapStep,
    pivot,
    setPivot,
    snapHint,
    viewRequest,
    requestView,
    getSelectionObjects,
  } = useDesigner()
  // A group has no Scale gizmo (its members' sizes are their own) — clamp the
  // shared mode to translate/rotate while a group is the gizmo target.
  const groupGizmo: GizmoMode = gizmoActive === 'scale' ? 'translate' : gizmoActive
  const [dims, setDims] = useState<[number, number, number] | null>(null)
  // Stage 8a — preview-environment toggle (per-device pref). `studio` = the fixed
  // 3-light rig (byte-identical default); `room` = the app's procedural
  // Lightformer IBL probe so physical finishes respond as they do when placed.
  const [previewEnv, setPreviewEnv] = useState<PreviewEnv>(() => loadPreviewEnv())
  const pickPreviewEnv = (env: PreviewEnv) => {
    setPreviewEnv(env)
    savePreviewEnv(env)
  }
  // Stage 7b — rAF gate for the live during-drag snap: TransformControls'
  // `objectChange` fires per pointer-move; coalesce to at most ONE snap
  // computation per frame (the ProfileEditor rAF-gate precedent).
  const dragRafRef = useRef<number | null>(null)
  const scheduleLiveSnap = (fn: () => void) => {
    if (dragRafRef.current !== null) return
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null
      fn()
    })
  }
  const cancelLiveSnap = () => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
  }
  // Cancel any pending drag-snap frame on unmount (reads the ref directly so the
  // effect stays dependency-free).
  useEffect(
    () => () => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
    },
    [],
  )
  return (
    <>
      {/* frameloop="demand": only repaint on demand — drei's OrbitControls +
          TransformControls invalidate during interaction, and any spec/profile/
          ghost prop change re-renders the R3F tree (which invalidates a frame in
          demand mode), so the preview stays live without a permanent 60fps loop. */}
      <Canvas
        frameloop="demand"
        shadows={{ type: PCFShadowMap }}
        camera={{ position: [1.6, 1.3, 1.8], fov: 40 }}
      >
        {import.meta.env.DEV ? <DevGlExpose /> : null}
        {previewEnv === 'studio' ? (
          <>
            {/* Studio rig — byte-identical to the pre-Stage-8a viewport. */}
            <ambientLight intensity={0.7} />
            <hemisphereLight intensity={0.6} />
            <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
          </>
        ) : (
          <>
            {/* Room — the app's procedural IBL probe drives reflections/bounce;
                a single dimmed key stays for shadow grounding, and ambient/hemi
                fill is dropped so physical finishes (sheen/clearcoat/transmission)
                read against the environment rather than being washed flat. */}
            <directionalLight position={[3, 5, 2]} intensity={0.55} castShadow />
            <Suspense fallback={null}>
              <DesignerEnvironment />
            </Suspense>
          </>
        )}
        <gridHelper args={[6, 12, '#999', '#ccc']} />
        <Suspense fallback={null}>
          {/* Builds picked part textures (`mat:<id>`) into the material
              cache; parts fall back to their solid colour until built. */}
          <EnsureFurnitureMaterials ids={finishIds} />
          <Bounds fit clip observe margin={1.2}>
            {sourceUrl && (
              <SourceModel url={sourceUrl} scale={spec.sourceScale} onScene={onScene} />
            )}
            <PartsPreview
              spec={spec}
              results={results}
              meshRefFor={meshRefFor}
              groupRefFor={groupRefFor}
              onPlaceFace={armed ? onPlaceFace : undefined}
              onPlaceDecal={decalArmed ? onPlaceDecal : undefined}
              selIds={selIds}
              onSelectGroup={selectGroup}
            />
            {/* View-preset responder — inside <Bounds> so `useBounds()` resolves. */}
            <CameraViews request={viewRequest} />
          </Bounds>
          {/* Ground click target for floor placement (Stage 3b) — only while a
              component is armed, and OUTSIDE <Bounds> so it never affects the
              auto-framing. Rotated flat so its world normal is +Y (up). */}
          {armed ? (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e) => {
                e.stopPropagation()
                onPlaceFace([e.point.x, e.point.y, e.point.z], [0, 1, 0])
              }}
            >
              <planeGeometry args={[20, 20]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          ) : null}
        </Suspense>
        {/* OrbitControls is makeDefault, so drei's TransformControls
            auto-disables it while a gizmo handle is being dragged
            (the standard `dragging-changed` wiring lives inside drei). */}
        <OrbitControls makeDefault />
        {sel && selMesh ? (
          <TransformControls
            object={selMesh}
            mode={gizmoActive}
            onMouseDown={beginPartDrag}
            onObjectChange={
              gizmoActive === 'translate'
                ? () => scheduleLiveSnap(applyLivePartDragSnap)
                : undefined
            }
            onMouseUp={() => {
              cancelLiveSnap()
              endPartDrag()
            }}
          />
        ) : selGroupObj ? (
          <TransformControls
            object={selGroupObj}
            mode={groupGizmo}
            onMouseDown={beginGroupDrag}
            onObjectChange={
              groupGizmo === 'translate'
                ? () => scheduleLiveSnap(applyLiveGroupDragSnap)
                : undefined
            }
            onMouseUp={() => {
              cancelLiveSnap()
              endGroupDrag()
            }}
          />
        ) : null}
        <LiveDimensions getObjects={getSelectionObjects} onChange={setDims} />
        <SnapHintOverlay hint={snapHint} />
      </Canvas>
      {/* Gizmo mode switch — overlays the preview's top-left corner. */}
      {sel ? (
        <GizmoModeOverlay
          modes={GIZMO_MODES.filter(({ mode }) => gizmoModesFor(sel.kind).includes(mode))}
          active={gizmoActive}
          subject="shape"
          ariaPrefix="Gizmo"
          onPick={setGizmoMode}
        />
      ) : selGroupObj ? (
        <GizmoModeOverlay
          modes={GROUP_GIZMO_MODES}
          active={groupGizmo}
          subject="group"
          ariaPrefix="Group gizmo"
          onPick={setGizmoMode}
        />
      ) : null}

      {/* Pivot control (Stage 6d) — the reference point for numeric rotation +
          gizmo scale of the selected part/group (Centre = default). Below the
          gizmo-mode switch (top-left). */}
      {sel || selGroupObj ? (
        <div
          className="seg dv-ov dv-ov-pivot"
          style={{ position: 'absolute', top: 44, left: 8, display: 'flex' }}
          role="radiogroup"
          aria-label="Pivot"
        >
          {PIVOT_MODES.map(({ mode, label, title }) => (
            <button
              key={mode}
              type="button"
              className={pivot === mode ? 'on' : ''}
              aria-label={`Pivot: ${label}`}
              aria-pressed={pivot === mode}
              title={title}
              onClick={() => setPivot(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Grid snap toggle + step (top-right). */}
      <div
        className="dv-ov dv-ov-snap"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 'var(--s-1)',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className={`icon-btn${gridSnap.enabled ? ' on' : ''}`}
          aria-label="Toggle grid snap"
          aria-pressed={gridSnap.enabled}
          title={gridSnap.enabled ? 'Grid snap on' : 'Grid snap off'}
          onClick={toggleGridSnap}
        >
          <Icon.Snap width={15} height={15} />
        </button>
        <Select
          className="input"
          ariaLabel="Snap step"
          value={String(gridSnap.step)}
          onChange={(v) => setSnapStep(Number(v) as (typeof SNAP_STEPS)[number])}
          style={{ width: 74, height: 28 }}
          options={SNAP_STEPS.map((s) => ({ value: String(s), label: SNAP_STEP_LABEL[s] }))}
        />
      </div>

      {/* View presets + Home (below the snap controls). */}
      {/* Each button carries its own aria-label, so the container needs no role. */}
      <div
        className="seg dv-ov dv-ov-views"
        style={{ position: 'absolute', top: 44, right: 8, display: 'flex' }}
      >
        <button
          type="button"
          aria-label="Front view"
          title="Front view"
          onClick={() => requestView('front')}
        >
          Front
        </button>
        <button
          type="button"
          aria-label="Side view"
          title="Side view"
          onClick={() => requestView('side')}
        >
          Side
        </button>
        <button
          type="button"
          aria-label="Top view"
          title="Top view"
          onClick={() => requestView('top')}
        >
          Top
        </button>
        <button
          type="button"
          aria-label="Home view"
          title="Reset view"
          onClick={() => requestView('home')}
        >
          <Icon.Home width={13} height={13} />
        </button>
      </div>

      {/* Live dimension readout (bottom-left) — the selection's W×D×H in cm. */}
      {dims ? (
        <div
          className="badge neutral mono dv-ov dv-ov-dims"
          role="status"
          aria-label="Selection dimensions"
        >
          {dims[0]} × {dims[2]} × {dims[1]} cm
        </div>
      ) : null}

      {/* Preview-environment toggle (bottom-right) — Studio rig vs Room IBL. */}
      <div className="dv-ov dv-ov-env" style={{ position: 'absolute', bottom: 8, right: 8 }}>
        <Segmented
          ariaLabel="Preview environment"
          value={previewEnv}
          onChange={(v) => pickPreviewEnv(v as PreviewEnv)}
          options={PREVIEW_ENVS.map((env) => ({
            value: env,
            label: PREVIEW_ENV_LABEL[env],
            title:
              env === 'studio'
                ? 'Fixed studio lighting rig'
                : 'Room lighting — physical finishes respond as they do when placed',
          }))}
        />
      </div>
    </>
  )
}
