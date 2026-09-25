/**
 * The shader link-error hook (SHADER-LINK-CHECK).
 *
 * three r184 validates every program the first time it draws
 * (`WebGLProgram.js:onFirstUse`) and, if `renderer.debug.checkShaderErrors` is
 * on, calls `renderer.debug.onShaderError` — or, when that is unset, writes its
 * own `THREE.WebGLProgram: Shader Error …` to the console and nothing else.
 *
 * ## Why a hook is worth having even though it changes no behaviour
 *
 * `docs/audit/code-review-r7-2026-09-25.md` describes this repo's worst-case
 * failure shape: a hand-written `ShaderChunk` replacement (`boxProjectEnv.ts`,
 * `visibilityLightmap.ts`) that a Mali or Adreno driver rejects while Metal and
 * SwiftShader accept it. The glossy surfaces in three rooms render black or
 * vanish; `tsc` is green, the tests are green, `RoomProbes`' DEV log says the
 * attachment succeeded, and the console — with three's default handler — says
 * `Shader Error` **once, on the machine that has the broken driver**, which is
 * never the machine the developer is sitting at.
 *
 * So the console is the wrong sink. This module keeps a bounded RING BUFFER of
 * whatever linked badly, readable from anywhere in the app, and still writes the
 * console line three would have written (setting `onShaderError` REPLACES that
 * default output — a hook that only recorded would make a dev build quieter than
 * an unhooked one, which is the opposite of the point).
 *
 * **There is deliberately no telemetry here.** The ring buffer is the seam a
 * future reporter attaches to: read {@link shaderLinkErrors} from a diagnostics
 * panel, or drain it from an uploader. Adding the uploader is a separate,
 * consent-shaped decision and is not this module's to make.
 *
 * Nothing here imports three, so it is unit-testable.
 */

/** One program that failed to link, as three's hook reports it. */
export interface ShaderLinkError {
  /** `getProgramInfoLog(program)` — usually the linker's own message. */
  programLog: string
  /** `getShaderInfoLog(vertexShader)`. */
  vertexLog: string
  /** `getShaderInfoLog(fragmentShader)`. */
  fragmentLog: string
  /** `performance.now()` at the moment of the failure. */
  at: number
}

/**
 * How many failures to keep.
 *
 * A broken injected chunk does not fail once — every material carrying the
 * injection fails, and this repo's lightmap path clones material per mesh
 * (LIGHTMAP-NEIGHBOUR-INHERIT: 522 clones on the default flat). An unbounded
 * array would therefore be a leak proportional to the scene, and the 501st
 * identical failure says nothing the 1st did not. Small enough to be free,
 * large enough to show that more than one program is affected.
 */
export const SHADER_LINK_ERROR_LIMIT = 8

const ring: ShaderLinkError[] = []

/** Minimal structural view of a WebGL context — avoids a three/DOM type import. */
interface GlInfoLogSource {
  getProgramInfoLog(program: never): string | null
  getShaderInfoLog(shader: never): string | null
}

/** Minimal structural view of `WebGLRenderer.debug`. */
export interface ShaderErrorDebugTarget {
  onShaderError?:
    | ((gl: never, program: never, vertexShader: never, fragmentShader: never) => void)
    | null
}

/** The failures recorded so far, oldest first. Empty is the healthy state. */
export function shaderLinkErrors(): readonly ShaderLinkError[] {
  return ring
}

/** Drop everything recorded. For tests, and for a future reporter that drains. */
export function clearShaderLinkErrors(): void {
  ring.length = 0
}

/**
 * Record one failure, evicting the oldest past {@link SHADER_LINK_ERROR_LIMIT}.
 *
 * Separate from {@link installShaderErrorHook} so the buffer's behaviour can be
 * tested without a WebGL context.
 */
export function recordShaderLinkError(error: ShaderLinkError): void {
  ring.push(error)
  while (ring.length > SHADER_LINK_ERROR_LIMIT) ring.shift()
}

/**
 * The console line three would have written had no hook been installed.
 *
 * Kept close in shape to three's own (`THREE.WebGLProgram: Shader Error …`) so a
 * search for that string still finds this, and prefixed so it is obvious which
 * of the two is speaking.
 */
export function formatShaderLinkError(error: ShaderLinkError): string {
  const parts = [error.programLog, error.vertexLog, error.fragmentLog]
    .map((s) => s.trim())
    .filter(Boolean)
  return `THREE.WebGLProgram: Shader Error — ${parts.join(' | ') || '(no info log)'}`
}

/**
 * Point `gl.debug.onShaderError` at the ring buffer.
 *
 * Idempotent and cheap: the hook is only ever CALLED while
 * `gl.debug.checkShaderErrors` is true, so installing it costs nothing when the
 * checking is off — which is why `RendererTierController` installs it once at
 * mount rather than tracking the flag.
 *
 * **Ordering caveat, worth knowing before trusting a clean buffer.**
 * `RendererTierController`'s effect runs after its subtree's first render, so a
 * program that reaches `onFirstUse` before that effect commits is validated by
 * three's DEFAULT path and reported to the console rather than here. That is the
 * safe direction (it is checked, just not captured), but it means an empty ring
 * is not proof that every program linked — only that none failed after mount.
 */
export function installShaderErrorHook(debug: ShaderErrorDebugTarget): void {
  debug.onShaderError = (gl, _program, vertexShader, fragmentShader) => {
    const ctx = gl as unknown as GlInfoLogSource
    const error: ShaderLinkError = {
      programLog: ctx.getProgramInfoLog(_program) ?? '',
      vertexLog: ctx.getShaderInfoLog(vertexShader) ?? '',
      fragmentLog: ctx.getShaderInfoLog(fragmentShader) ?? '',
      at: performance.now(),
    }
    recordShaderLinkError(error)
    // Restore what three would have printed — see the module docblock.
    console.error(formatShaderLinkError(error))
  }
}
