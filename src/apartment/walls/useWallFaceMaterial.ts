/**
 * The interior wall-FACE material: a per-face clone of the shared cached finish,
 * biased forward in the depth test, whose textures track the source across a
 * PERF-C worker upgrade (WALL-FACE-CLONE-STALE).
 *
 * Both wall implementations (`WallSegment` for curated plans, `PlanWallFace` for
 * custom ones) need the same three things, and used to hand-roll them:
 * · a CLONE, so a face can fade for the camera reveal without touching the
 *   shared cached material every other surface in the room renders with;
 * · `polygonOffset`, so the face reliably wins the depth test against the wall
 *   body it sits 1 mm above (the world-space offset alone z-fights at zoomed-out
 *   orbit distances, where depth precision shrinks with range);
 * · and — the part that was missing — a re-sync when the procedural worker
 *   hot-swaps the source's maps. See `materialMapSync.ts` for why a clone goes
 *   stale: it captured the 64² quick preview and nothing rebuilt it, so every
 *   tiled wall face in the app rendered at 1/8 linear resolution permanently.
 */
import { invalidate } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
import { syncMaterialMaps } from '../../materials/materialMapSync'
import { subscribeProceduralSwap } from '../../materials/proceduralSwapSignal'

export function useWallFaceMaterial(material: MeshStandardMaterial): MeshStandardMaterial {
  const face = useMemo(() => {
    const m = material.clone()
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -1
    return m
  }, [material])
  // Textures are shared by reference, so disposing the clone frees only its own
  // GPU program — never the maps the cached source still owns.
  useEffect(() => () => face.dispose(), [face])
  useEffect(() => {
    const sync = () => {
      if (!syncMaterialMaps(material, face)) return
      face.needsUpdate = true
      // The Canvas is `frameloop="demand"`: without this the upgraded texture
      // would sit unshown until some unrelated change requested a frame.
      invalidate()
    }
    // Run once up front — the swap may have landed before this effect attached,
    // in which case no future notification would ever correct this clone.
    sync()
    return subscribeProceduralSwap(sync)
  }, [material, face])
  return face
}
