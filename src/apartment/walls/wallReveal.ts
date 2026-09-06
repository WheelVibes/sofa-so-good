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

/**
 * Marks a mesh as an OVERLAY sitting on top of a wall's body — an interior face
 * plane, a baseboard, a crown, the accent-selection highlight.
 *
 * The body is deliberately ONE watertight extruded shape so it has no internal
 * seams when it fades for the camera reveal. Every overlay on top of it undoes
 * that: with `depthWrite` on and back-to-front transparent sorting, the body
 * blends first and the overlay blends over it, so a translucent wall composites
 * TWICE wherever an overlay covers it and only once where it doesn't — vertical
 * density bands down the wall. At an outside corner it is worse: a face plane is
 * deliberately extended by the abutting wall's half-thickness so the finish
 * reaches the outer edge, which is invisible while that neighbour is opaque and
 * a third composited layer once it isn't.
 *
 * So overlays are HIDDEN for the duration of a fade (see `WallSegment` /
 * `useWallReveal`): a revealing wall renders as exactly one surface per side —
 * the body, with its neutral lift — and the seams cannot occur. They come back
 * the instant the wall is opaque again, where depth testing (not blending)
 * resolves them correctly and the finish must be visible.
 */
export function markWallOverlay(extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, wallOverlay: true }
}

/** True when `userData` came from {@link markWallOverlay}. */
export function isWallOverlay(userData: unknown): boolean {
  return !!userData && (userData as { wallOverlay?: unknown }).wallOverlay === true
}

/**
 * {@link isWallOverlay} for a whole sub-assembly: true when the object OR any
 * ancestor carries the mark. Lets a multi-mesh detail (a door's security gate,
 * a handle) be tagged once on its group instead of on every member.
 *
 * The traverse that uses this must set `visible` on the tagged object and stop
 * descending, so the walk stays shallow.
 */
export function isWallOverlayBranch(o: { userData?: unknown; parent?: unknown } | null): boolean {
  let cur = o
  while (cur) {
    if (isWallOverlay(cur.userData)) return true
    cur = (cur.parent ?? null) as typeof cur
  }
  return false
}

/**
 * Marks a mesh as GLAZING — the transmissive pane itself, never its frame/mullion/grille/sill.
 *
 * Read by `scene/applyVisibilityLightmaps.ts:isCandidate` (GLAZING-LIGHTMAP) to exclude the mesh
 * from the baked-GI material patch: glass has ~no diffuse irradiance to bake (a pane is mostly
 * transmission), so the `replace`-mode injection was writing a synthesised box-atlas irradiance
 * map — grey texel noise — over the transmitted view. By day the transmitted scene swamps it; at
 * night it reads as mid-grey blocky "static" through the pane. See the `glazingLightmapExclude`
 * flag for the full mechanism.
 */
export function markGlazing(extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, glazing: true }
}

/** True when `userData` came from {@link markGlazing}. */
export function isGlazing(userData: unknown): boolean {
  return !!userData && (userData as { glazing?: unknown }).glazing === true
}
