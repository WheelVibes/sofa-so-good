import { useMemo, useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { Object3D } from 'three';
import { meshMatchesTarget } from './gltf/finishTargets';
import { useStore } from '../state/store';
import { resolveLodUrlSync, prewarmLod, baseUrl } from './gltf/lod';
import { applyTextureBudget } from './gltf/textureBudget';

/** Public footprint shape: axis-aligned size in metres at scale=1, plus the
 *  local-space center offset of that bbox. Many GLBs are not centered on their
 *  local origin, so consumers must add (ox, oz) — rotated by the item's yaw —
 *  to item.position when computing the OBB. */
export interface GltfFootprint {
  w: number;
  d: number;
  h: number;
  ox: number;
  oz: number;
}

/** Module-level bbox cache, keyed by base (high-tier) url. `authoritative` is
 *  true when the footprint came from original (unsimplified) geometry or a
 *  scraper seed; a low/medium variant may seed a non-authoritative footprint
 *  that the original later overwrites. */
const FOOTPRINT_CACHE = new Map<
  string,
  GltfFootprint & { authoritative: boolean }
>();

/** Reads the cached footprint for a GLB if available, else returns null.
 *  Normalises tier-variant urls to their base key, since the cache is always
 *  written under the base url (high-tier footprint is authoritative). */
export function getCachedGltfFootprint(url: string): GltfFootprint | null {
  const e = FOOTPRINT_CACHE.get(baseUrl(url));
  return e ? { w: e.w, d: e.d, h: e.h, ox: e.ox, oz: e.oz } : null;
}

/** Pre-seed the footprint cache from known GLB accessor data (e.g. the IKEA
 *  scraper's footprint) so collision is correct before first render. No-op if
 *  the key is already cached. anchorOffset is the local-space center [x,y,z];
 *  only x/z (→ ox/oz) matter for the OBB. */
export function seedGltfFootprint(
  url: string,
  fp: { w: number; d: number; h: number; anchorOffset: [number, number, number] },
): void {
  const key = baseUrl(url);
  if (FOOTPRINT_CACHE.has(key)) return;
  // Scraper footprint is from the original GLB accessors → authoritative.
  FOOTPRINT_CACHE.set(key, {
    w: Math.max(0.05, fp.w),
    d: Math.max(0.05, fp.d),
    h: Math.max(0.05, fp.h),
    ox: fp.anchorOffset[0],
    oz: fp.anchorOffset[2],
    authoritative: true,
  });
}

interface GltfModelProps {
  url: string;
  scale?: number;
  /** Optional hex tint multiplied into every cloned material's base colour. */
  tint?: string;
  /** Per-finish-target hex tint, keyed by target key. */
  finishOverrides?: Record<string, string>;
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
export function GltfModel({ url, scale = 1, tint, finishOverrides }: GltfModelProps) {
  const qualityTier = useStore((s) => s.qualityTier);
  // Kick the existence probe outside render so a future render upgrades to the
  // variant url; harmless/no-op if already cached or on 'high'.
  useEffect(() => {
    void prewarmLod(url, qualityTier);
  }, [url, qualityTier]);
  const resolvedUrl = resolveLodUrlSync(url, qualityTier);
  const servingOriginal = resolvedUrl === url;
  const gltf = useGLTF(resolvedUrl);
  const cloned = useMemo(
    () => SkeletonUtils.clone(gltf.scene as unknown as Object3D),
    [gltf.scene],
  );
  const tintRef = useRef<string | undefined>();

  // Cache footprint, keyed by the base (high-tier) url so collision is
  // consistent across tiers. Simplified low/medium variants can shift the bbox
  // slightly, so the original geometry is authoritative: a variant may seed the
  // cache (so collision works if only it ever renders), but the original
  // overwrites it when loaded. `servingOriginal` is true on high and on the
  // runtime-texture fallback (geometry untouched there).
  useEffect(() => {
    const fpKey = baseUrl(url);
    const existing = FOOTPRINT_CACHE.get(fpKey);
    // Skip only when an authoritative (original-geometry) footprint is cached.
    if (existing && (existing.authoritative || !servingOriginal)) return;
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
    FOOTPRINT_CACHE.set(fpKey, {
      w: Math.max(0.05, size.x),
      d: Math.max(0.05, size.z),
      h: Math.max(0.05, size.y),
      ox: center.x,
      oz: center.z,
      authoritative: servingOriginal,
    });
  }, [url, cloned, servingOriginal]);

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

  // Per-target finish overrides (key → hex tint). Cloned so instances don't
  // share materials. (The configurator milestone will extend this to full
  // mat:<id>/procedural finishes via getSurfaceMaterial.)
  //
  // NOTE: this effect and the global `tint` effect above both mutate `cloned`
  // materials. In normal use a piece sets one or the other. If both are set,
  // last-effect-wins on any overlapping meshes (this effect runs after the
  // tint effect) — acceptable for this task.
  useEffect(() => {
    if (!finishOverrides || Object.keys(finishOverrides).length === 0) return;
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      for (const [key, hex] of Object.entries(finishOverrides)) {
        if (!meshMatchesTarget(mesh, key)) continue;
        const c = new Color(hex);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = mats.map((m) => {
          const clone = (m as MeshStandardMaterial).clone();
          if ('color' in clone && clone.color) clone.color = c.clone();
          return clone;
        }) as MeshStandardMaterial | MeshStandardMaterial[];
        if (!Array.isArray(mesh.material) || mesh.material.length === 1) {
          mesh.material = (mesh.material as MeshStandardMaterial[])[0];
        }
      }
    });
  }, [cloned, finishOverrides]);

  // Runtime texture-budget fallback: only when we're serving the original asset
  // (no offline variant exists) on a non-high tier.
  useEffect(() => {
    if (servingOriginal && qualityTier !== 'high') {
      applyTextureBudget(cloned, qualityTier);
    }
  }, [cloned, servingOriginal, qualityTier]);

  return <primitive object={cloned} scale={scale} dispose={null} />;
}

/** Preload helper called from app boot for high-frequency models. */
export function preloadGltf(url: string) {
  useGLTF.preload(url);
}
