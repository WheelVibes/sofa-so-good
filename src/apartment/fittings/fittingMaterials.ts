import { MeshStandardMaterial } from 'three'

let neon: MeshStandardMaterial | null = null

/**
 * The little red indicator lamp shared by the wall fittings (a water-heater switch's neon)
 * and the plumbing fittings (the storage heater's own power light). One module-level
 * singleton so both renderers hand three the same material.
 */
export function neonMaterial(): MeshStandardMaterial {
  if (!neon)
    neon = new MeshStandardMaterial({
      color: '#ff5a3c',
      emissive: '#ff3a1c',
      emissiveIntensity: 1.6,
      roughness: 0.4,
    })
  return neon
}
