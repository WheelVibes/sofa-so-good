import { Bounds, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import type { Group, Mesh, Object3D } from 'three'
import { EnsureFurnitureMaterials } from '../../furniture/FurnitureMaterialLoader'
import type { AssetEditSpec, ShapePart } from '../../furniture/glbEdit/editSpec'
import {
  GIZMO_MODES,
  type GizmoMode,
  GROUP_GIZMO_MODES,
  gizmoModesFor,
} from '../../furniture/glbEdit/gizmoWriteBack'
import { secureGltfLoader } from '../../furniture/gltf/loaderSecurity'
import { PartsPreview } from './PartsPreview'

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
export function DesignerViewport({
  spec,
  results,
  sel,
  selMesh,
  selGroupObj,
  finishIds,
  sourceUrl,
  gizmoActive,
  setGizmoMode,
  meshRefFor,
  groupRefFor,
  onScene,
  onCommitGizmoDrag,
  onCommitGroupGizmoDrag,
}: {
  spec: AssetEditSpec
  results: Map<string, ShapePart>
  sel: ShapePart | null
  selMesh: Mesh | null
  /** The selected transform-group's container object (Stage 3a) — the gizmo
   *  attaches to it instead of a part mesh. Mutually exclusive with `sel`. */
  selGroupObj: Group | null
  finishIds: string[]
  sourceUrl: string | null
  gizmoActive: GizmoMode
  setGizmoMode: (m: GizmoMode) => void
  meshRefFor: (id: string) => (m: Mesh | null) => void
  groupRefFor: (groupId: string) => (g: Group | null) => void
  onScene: (o: Object3D | null) => void
  onCommitGizmoDrag: () => void
  onCommitGroupGizmoDrag: () => void
}) {
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
            />
          </Bounds>
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
      ) : selGroupObj ? (
        <div className="seg" style={{ position: 'absolute', top: 8, left: 8 }}>
          {GROUP_GIZMO_MODES.map(({ mode, label, hotkey }) => (
            <button
              key={mode}
              type="button"
              className={groupGizmo === mode ? 'on' : ''}
              aria-label={`Group gizmo: ${label}`}
              title={`${label} the selected group (${hotkey.toUpperCase()})`}
              onClick={() => setGizmoMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}
