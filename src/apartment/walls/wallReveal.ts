/**
 * Shared per-wall reveal opacity, written by WallSegment each frame and read
 * by Windows/Doors so they hide together with their host wall during the
 * camera-reveal fade (they render outside the wall group). Missing entries
 * (e.g. internal walls, which never fade) default to fully visible.
 */
const wallOpacity = new Map<string, number>()

// Dev-only diagnostic: read the live per-wall reveal opacities from the browser
// console (`window.__wallOpacities()`) to tell a frozen fade (values stuck
// mid-range across samples) from a converged one that merely LOOKS washed.
// NOTE: this map is NOT cleared between orbit and the editor, so it mixes stale
// entries — prefer `window.__wallDiag()` below, which reads the LIVE scene graph.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __wallOpacities?: () => Record<string, number> }).__wallOpacities = () =>
    Object.fromEntries(wallOpacity)
  // Per-wall RENDER state from the live scene graph (only walls actually
  // rendering right now). Reports what the pixels are made of: opacity, the
  // `transparent` blend flag, `depthWrite`, whether the mesh is still on its
  // faded material CLONE vs restored to its opaque original, the resolved
  // colour, and emissive lift. This is what distinguishes "fade froze at a mid
  // opacity" from "opacity is 1 but the wall still renders in the transparent
  // pass / on a stale clone / wrong colour".
  ;(window as unknown as { __wallDiag?: () => unknown }).__wallDiag = () => {
    const w = window as unknown as {
      __three?: { scene?: { traverse: (f: (o: unknown) => void) => void } }
    }
    const scene = w.__three?.scene
    if (!scene) return 'no __three.scene (open a 3D view first)'
    const out: unknown[] = []
    scene.traverse((node: unknown) => {
      const o = node as {
        isMesh?: boolean
        material?: unknown
        userData?: { finishTarget?: { kind?: string; roomId?: string }; __revealMat?: unknown }
      }
      if (!o.isMesh || !o.material) return
      const ft = o.userData?.finishTarget
      if (ft?.kind !== 'wall') return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const m = mats[0] as {
        opacity: number
        transparent: boolean
        depthWrite: boolean
        color: { getHexString: () => string }
        emissive?: { getHexString: () => string }
        emissiveIntensity?: number
      }
      out.push({
        room: ft.roomId,
        op: +m.opacity.toFixed(3),
        transparent: m.transparent,
        depthWrite: m.depthWrite,
        onClone: (o.material as unknown) === o.userData?.__revealMat,
        col: `#${m.color.getHexString()}`,
        emI: m.emissiveIntensity,
      })
    })
    return out
  }
}

export function setWallOpacity(wallId: string, opacity: number): void {
  wallOpacity.set(wallId, opacity)
}

export function getWallOpacity(wallId: string): number {
  return wallOpacity.get(wallId) ?? 1
}

/**
 * Per-wall OWN fade strength (WALL-REVEAL-CORNER-SPREAD), written each frame by
 * `WallSegment`/`useWallReveal` and read by a wall's CORNER neighbours to decide
 * corner-spread. This is the wall's fade strength from its OWN facing angle only
 * (rule 1) — it deliberately EXCLUDES any spread the wall itself received, so a
 * wall that fades only BECAUSE of spread publishes 0 here and cannot pull its own
 * neighbours in. That is what keeps spread first-degree (no perimeter-wide
 * cascade). Missing entries default to 0 (not fading). One-frame lag between
 * publish and read is acceptable (mirrors the `setWallOpacity` signal pattern).
 */
const wallOwnStrength = new Map<string, number>()

export function setWallOwnStrength(wallId: string, strength: number): void {
  wallOwnStrength.set(wallId, strength)
}

export function getWallOwnStrength(wallId: string): number {
  return wallOwnStrength.get(wallId) ?? 0
}
