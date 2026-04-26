import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import { useCatalog } from '../furniture/catalog';
import { canPlace, itemFootprint } from '../collision/placement';
import { Furniture } from '../furniture/Furniture';
import {
  defaultParamProps,
  type FurnitureDef,
  type FurnitureItem,
  type ParamProps,
} from '../furniture/types';

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def);
  return def.scale != null ? { scale: def.scale } : {};
}

/**
 * Live preview that follows the cursor while a catalog card is being
 * dragged. Reads the cursor from the placement slice (CatalogCard
 * writes it) and unprojects to the floor plane each frame so the
 * pointer-tracking stays cheap and avoids re-rendering the whole
 * scene graph.
 */
export function PlacementGhost() {
  const activeDefId = useStore((s) => s.activeDefId);
  const cursor = useStore(useShallow((s) => s.cursor));
  const items = useStore(useShallow((s) => s.items));
  const doors = useStore(useShallow((s) => s.doors));
  const catalog = useCatalog();
  const { camera, gl } = useThree();

  const def = activeDefId ? catalog[activeDefId] : null;
  const ghostItem = useMemo<FurnitureItem | null>(() => {
    if (!def) return null;
    return {
      id: '__ghost',
      defId: def.id,
      position: [0, 0],
      rotation: def.defaultRotation ?? 0,
      props: defaultProps(def),
    };
  }, [def]);

  const groupRef = useRef<import('three').Group>(null);
  const validRef = useRef(true);
  const pointerNDC = useRef(new Vector2());
  const raycaster = useRef(new Raycaster());
  const target = useRef(new Vector3());
  // Pre-build the OBB tint material so we can mutate its color directly
  // each frame without forcing React re-renders.
  const tintMaterial = useMemo(() => {
    const m = new MeshBasicMaterial({
      color: '#22c55e',
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    return m;
  }, []);
  const greenColor = useMemo(() => new Color('#22c55e'), []);
  const redColor = useMemo(() => new Color('#ef4444'), []);

  useFrame(() => {
    if (!def || !ghostItem || !cursor || !groupRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    pointerNDC.current.set(
      ((cursor.x - rect.left) / rect.width) * 2 - 1,
      -(((cursor.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.current.setFromCamera(pointerNDC.current, camera);
    const hit = raycaster.current.ray.intersectPlane(FLOOR_PLANE, target.current);
    if (!hit) return;
    groupRef.current.position.set(target.current.x, 0, target.current.z);
    ghostItem.position = [target.current.x, target.current.z];
    const valid = canPlace(ghostItem, def, {
      others: items,
      defs: catalog,
      doors,
    });
    if (valid !== validRef.current) {
      validRef.current = valid;
      tintMaterial.color.copy(valid ? greenColor : redColor);
    }
    useStore
      .getState()
      .setGhostWorld([target.current.x, target.current.z], valid);
  });

  if (!def || !ghostItem) return null;

  // Render an OBB-shaped translucent disc under the ghost so the
  // collision result is visible without disturbing the Furniture
  // primitive's own material.
  const obb = itemFootprint(ghostItem, def);
  return (
    <group ref={groupRef}>
      <Furniture item={ghostItem} def={def} passive />
      <mesh
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={tintMaterial}
      >
        <planeGeometry args={[obb.hx * 2, obb.hz * 2]} />
      </mesh>
    </group>
  );
}
