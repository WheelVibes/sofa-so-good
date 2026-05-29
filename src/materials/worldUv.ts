import { PlaneGeometry } from 'three';

/**
 * A plane whose UVs are expressed in metres rather than the default 0..1,
 * so a tiling texture (repeat = tiles-per-metre) covers the surface at a
 * consistent physical scale regardless of the plane's dimensions. This lets
 * one shared material tile correctly across rooms/walls of different sizes.
 */
export function worldUvPlaneGeometry(width: number, height: number): PlaneGeometry {
  const geo = new PlaneGeometry(width, height);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height);
  }
  uv.needsUpdate = true;
  return geo;
}
