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
  getSolidMaterial,
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
 * Appliance body material (MAT-004b) — a **single-representation** resolver that
 * returns ONE shared `MeshStandardMaterial` instance for EVERY finish, always set
 * on the body mesh's `material=` prop:
 *  - `'steel'`  → the shared brushed-metal material (`getMetalMaterial`), so the
 *    carcass reads as real brushed/satin stainless instead of flat grey plastic;
 *  - `'matte'`/`'gloss'`/unknown → a shared painted material (`getSolidMaterial`)
 *    carrying the EXACT `{ color, roughness, metalness }` the finish preset gives
 *    (`applianceFinish`) — byte-identical params to the old
 *    `<meshStandardMaterial {...props}>` child, so no visual change.
 *
 * Why one representation (the MAT-004b reconciliation): the old code routed steel
 * through the mesh `material` PROP and non-steel through a `<meshStandardMaterial>`
 * CHILD. When a user swapped steel↔matte in the inspector, R3F could not cleanly
 * reconcile between the prop-material and child-material forms and left a stale
 * (white) body. Routing BOTH finishes through the same `material=` prop makes the
 * swap a plain material-instance change on one mesh, which R3F reconciles reliably.
 *
 * Both branches return cached instances (keyed in `furnitureMaterials.ts`), so
 * every appliance + every body part on one appliance shares one GPU material — no
 * per-instance material, no per-mesh rebuild. Glass fronts / control panels /
 * handles keep their own inline materials (untouched).
 *
 * Usage — a body mesh is always uniform across finishes:
 *
 *   const body = applianceBodyMaterial(color, finish)
 *   <BeveledBox material={body} … />            // or <mesh material={body}>…geometry…</mesh>
 */
export function applianceBodyMaterial(color: string, finish: string): MeshStandardMaterial {
  if (finish === 'steel') return getMetalMaterial(color, 'stainless')
  const { roughness, metalness } = applianceFinish(finish)
  return getSolidMaterial(color, roughness, metalness)
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
