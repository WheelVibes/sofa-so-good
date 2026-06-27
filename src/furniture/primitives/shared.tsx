/**
 * Shared utilities for parametric primitive components.
 *
 * These helpers keep the primitive files free of repeated boilerplate
 * (param lookup, fallback) so each primitive stays a focused list of
 * meshes.
 */

import type { MeshStandardMaterial } from 'three'
import {
  applianceFinish,
  getMetalMaterial,
  type MetalFinish,
} from '../../materials/furnitureMaterials'
import type { ParamProps, ParamValue } from '../types'

export function readNum(props: ParamProps, key: string, fallback: number): number {
  const v: ParamValue | undefined = props[key]
  return typeof v === 'number' ? v : fallback
}

export function readStr(props: ParamProps, key: string, fallback: string): string {
  const v: ParamValue | undefined = props[key]
  return typeof v === 'string' ? v : fallback
}

/**
 * Stylized PBR-ish material defaults — high roughness, low metalness — so
 * primitives read clearly from any angle in any lighting preset (spec §3).
 */
export const STYLISED_ROUGHNESS = 0.7
export const STYLISED_METALNESS = 0.05

/**
 * Appliance body finish (MAT-004b). Steel-bodied appliances route their carcass
 * through the shared brushed-metal material (`getMetalMaterial`) so the body
 * reads as real brushed/satin stainless instead of flat grey plastic; every
 * other finish ('matte' painted, 'gloss' lacquer) stays a plain props spread via
 * `applianceFinish`.
 *
 * Returns ONE of:
 *  - `{ material }` — a shared `MeshStandardMaterial`/`MeshPhysicalMaterial`
 *    instance to set on the body mesh's `material=` prop (the steel case), or
 *  - `{ props }` — `{ color, roughness, metalness }` to spread onto the body's
 *    `<meshStandardMaterial {...props} />` (the legacy non-steel case).
 *
 * The material is cached per (finish, color) in `furnitureMaterials.ts`, so
 * every steel appliance + every body part on one appliance shares one GPU
 * material (no per-mesh rebuild). Non-steel finishes are unaffected.
 */
export interface ApplianceBodyFinish {
  /** Shared brushed-metal material for the steel case (cached, reused per body part). */
  material?: MeshStandardMaterial
  /** Plain props for the non-steel case (spread onto a `<meshStandardMaterial>`). */
  props?: { color: string; roughness: number; metalness: number }
}

export function applianceBody(color: string, finish: string): ApplianceBodyFinish {
  if (finish === 'steel') return { material: getMetalMaterial(color, 'stainless') }
  return { props: { color, ...applianceFinish(finish) } }
}

/**
 * Body material child for an appliance body/door mesh (MAT-004b). Renders the
 * non-steel finish declaratively (`<meshStandardMaterial {...props}>`); the steel
 * case renders NOTHING here because the shared brushed-metal material instance is
 * set on the `<mesh material={…}>` prop instead (via {@link applianceBodyMeshProps}).
 *
 * Why split: the steel material is a single cached instance shared across several
 * body parts (carcass + door panel). Setting it on the mesh's `material` prop is
 * the idiomatic R3F way to share one `Material` across meshes; mounting the same
 * object through multiple `<primitive>` elements would fight R3F's object
 * ownership. So a body mesh is always:
 *
 *   <mesh {...applianceBodyMeshProps(body)} position=…>
 *     <boxGeometry … />
 *     <ApplianceBodyMaterial finish={body} />
 *   </mesh>
 *
 * — uniform across finishes, with the steel material on the mesh and the non-steel
 * material as the child.
 */
export function ApplianceBodyMaterial({ finish }: { finish: ApplianceBodyFinish }) {
  if (finish.material) return null
  return <meshStandardMaterial {...finish.props} />
}

/** Mesh-level props for an appliance body mesh: the shared brushed-metal
 *  `material` instance for the steel case, or nothing (the child
 *  `<ApplianceBodyMaterial>` supplies the non-steel material). Spread onto the
 *  body `<mesh {...applianceBodyMeshProps(body)} …>`. */
export function applianceBodyMeshProps(finish: ApplianceBodyFinish): {
  material?: MeshStandardMaterial
} {
  return finish.material ? { material: finish.material } : {}
}

/**
 * Metal legs / frames / rails (METAL-LEGS). The structural metal members of a
 * primitive (chair gas-lifts, stool legs, ladder posts, hairpin legs, bar-cart
 * frames, drying-rack A-frames, taps…) route through the shared brushed-metal
 * material so they read as real anisotropic brushed/satin steel or chrome
 * instead of a flat grey `<meshStandardMaterial>` props spread.
 *
 * Thin wrapper over `getMetalMaterial(color, finish, repeat)`, so it inherits
 * the `pbrSurfaces` gate already inside it: a `MeshPhysicalMaterial` with brush
 * normal + roughness-streak maps + anisotropy when on, and an *identical-to-
 * today* plain `MeshStandardMaterial` (just metalness/roughness, no maps) when
 * off — so the flat Performance tier is unchanged. Cached per `(finish, color,
 * repeat)`, so every metal member on every piece shares one GPU material.
 *
 * Pick a finish that matches the piece's existing colour intent:
 *  - `stainless` — bright modern chrome / stainless legs + frames (the default);
 *  - `satin` — a softer brushed sheen (lighter brushed-aluminium frames);
 *  - `black-steel` — dark matte-stainless (industrial black legs / hairpins).
 * Tint via `color` (the maps are tint-independent greyscale).
 */
export function metalLeg(
  color = '#cfd2d6',
  finish: MetalFinish = 'stainless',
  repeat = 1,
): MeshStandardMaterial {
  return getMetalMaterial(color, finish, repeat)
}
