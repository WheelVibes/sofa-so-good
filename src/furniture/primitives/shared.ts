/**
 * Shared utilities for parametric primitive components.
 *
 * These helpers keep the primitive files free of repeated boilerplate
 * (param lookup, fallback) so each primitive stays a focused list of
 * meshes.
 */

import type { ParamProps, ParamValue } from '../types';

export function readNum(props: ParamProps, key: string, fallback: number): number {
  const v: ParamValue | undefined = props[key];
  return typeof v === 'number' ? v : fallback;
}

export function readStr(props: ParamProps, key: string, fallback: string): string {
  const v: ParamValue | undefined = props[key];
  return typeof v === 'string' ? v : fallback;
}

/**
 * Stylized PBR-ish material defaults — high roughness, low metalness — so
 * primitives read clearly from any angle in any lighting preset (spec §3).
 */
export const STYLISED_ROUGHNESS = 0.7;
export const STYLISED_METALNESS = 0.05;
