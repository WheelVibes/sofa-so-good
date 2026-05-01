import { useMemo, useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { Object3D } from 'three';

/** Module-level bbox cache: GLB url → axis-aligned size in metres at scale=1,
 *  plus the local-space center offset of that bbox. Many GLBs are not
 *  centered on their local origin, so consumers must add (ox, oz) — rotated
 *  by the item's yaw — to item.position when computing the OBB. */
const FOOTPRINT_CACHE = new Map<
  string,
  { w: number; d: number; h: number; ox: number; oz: number }
>();

/** Reads the cached footprint for a GLB if available, else returns null. */
export function getCachedGltfFootprint(
  url: string,
): { w: number; d: number; h: number; ox: number; oz: number } | null {
  return FOOTPRINT_CACHE.get(url) ?? null;
}

interface GltfModelProps {
  url: string;
  scale?: number;
  /** Optional hex tint multiplied into every cloned material's base colour. */
  tint?: string;
}

/**
 * Renders a GLB by URL. Handles two reuse cases:
 *   1. Built-in URLs are stable strings → useGLTF hits its internal cache.
 *   2. User-upload blob URLs are stable per asset id → same cache hit.
 *
 * The original scene is cloned (skeleton-aware) so multiple instances of the
 * same GLB don't share transforms. Materials are cloned only when a tint is
 * applied to keep the common case (no tint) cheap.
 */
export function GltfModel({ url, scale = 1, tint }: GltfModelProps) {
  const gltf = useGLTF(url);
  const cloned = useMemo(
    () => SkeletonUtils.clone(gltf.scene as unknown as Object3D),
    [gltf.scene],
  );
  const tintRef = useRef<string | undefined>();

  // Cache footprint once.
  useEffect(() => {
    if (FOOTPRINT_CACHE.has(url)) return;
    // Compute bbox from visible meshes only. setFromObject traverses every
    // descendant including lights, empties, collision proxies, and hidden
    // helper geometry that some GLBs ship with — those can inflate the
    // footprint well beyond the rendered shape.
    cloned.updateWorldMatrix(true, true);
    const box = new Box3();
    const meshBox = new Box3();
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox;
      if (!gb) return;
      meshBox.copy(gb).applyMatrix4(mesh.matrixWorld);
      box.union(meshBox);
    });
    const size = new Vector3();
    const center = new Vector3();
    if (box.isEmpty()) {
      box.setFromObject(cloned);
    }
    box.getSize(size);
    box.getCenter(center);
    FOOTPRINT_CACHE.set(url, {
      w: Math.max(0.05, size.x),
      d: Math.max(0.05, size.z),
      h: Math.max(0.05, size.y),
      ox: center.x,
      oz: center.z,
    });
  }, [url, cloned]);

  // Apply tint by walking the cloned tree once when it changes.
  useEffect(() => {
    if (tint === tintRef.current) return;
    tintRef.current = tint;
    if (!tint) return;
    const c = new Color(tint);
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m) => {
        const clone = (m as MeshStandardMaterial).clone();
        if ('color' in clone && clone.color) {
          clone.color = clone.color.clone().multiply(c);
        }
        return clone;
      }) as MeshStandardMaterial | MeshStandardMaterial[];
      // If the original was a single material, keep it as such.
      if (!Array.isArray(mesh.material) || mesh.material.length === 1) {
        mesh.material = (mesh.material as MeshStandardMaterial[])[0];
      }
    });
  }, [cloned, tint]);

  return <primitive object={cloned} scale={scale} dispose={null} />;
}

/** Preload helper called from app boot for high-frequency models. */
export function preloadGltf(url: string) {
  useGLTF.preload(url);
}
