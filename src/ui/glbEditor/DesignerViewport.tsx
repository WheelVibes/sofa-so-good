import { Bounds, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import type { Object3D } from 'three'
import { EnsureFurnitureMaterials } from '../../furniture/FurnitureMaterialLoader'
import {
  GIZMO_MODES,
  type GizmoMode,
  GROUP_GIZMO_MODES,
  gizmoModesFor,
} from '../../furniture/glbEdit/gizmoWriteBack'
import { secureGltfLoader } from '../../furniture/gltf/loaderSecurity'
import { useDesigner } from './designerContext'
import { PartsPreview } from './PartsPreview'

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
    <div className="seg" style={{ position: 'absolute', top: 8, left: 8 }}>
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

/**
 * The designer's live 3D preview: the R3F canvas, the composed parts (built from
 * the SAME `partGeometry`/`partMaterials` the export uses so the preview can
 * never drift from the saved GLB), the optional source GLB, the drag gizmo
 * (`TransformControls`) on the selected part, and the gizmo-mode overlay switch.
 * Purely presentational — all spec state + write-back live in the dialog.
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
    commitGizmoDrag: onCommitGizmoDrag,
    commitGroupGizmoDrag: onCommitGroupGizmoDrag,
    armed,
    placeOnFace: onPlaceFace,
  } = useDesigner()
  // A group has no Scale gizmo (its members' sizes are their own) — clamp the
  // shared mode to translate/rotate while a group is the gizmo target.
  const groupGizmo: GizmoMode = gizmoActive === 'scale' ? 'translate' : gizmoActive
  return (
    <>
      {/* frameloop="demand": only repaint on demand — drei's OrbitControls +
          TransformControls invalidate during interaction, and any spec/profile/
          ghost prop change re-renders the R3F tree (which invalidates a frame in
          demand mode), so the preview stays live without a permanent 60fps loop. */}
      <Canvas frameloop="demand" shadows camera={{ position: [1.6, 1.3, 1.8], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <hemisphereLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
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
            />
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
          <TransformControls object={selMesh} mode={gizmoActive} onMouseUp={onCommitGizmoDrag} />
        ) : selGroupObj ? (
          <TransformControls
            object={selGroupObj}
            mode={groupGizmo}
            onMouseUp={onCommitGroupGizmoDrag}
          />
        ) : null}
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
    </>
  )
}
