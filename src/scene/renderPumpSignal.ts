/**
 * Shared flag: is RenderPump currently driving the scene continuously (every
 * frame), versus idle / settle-tail single frames in demand mode. Module
 * singleton (polled in useFrame, never a React re-render) — same pattern as
 * fixtureGlow / animatedSources.
 *
 * QualityController reads this so it only samples FPS while a sustained render
 * is actually happening: in demand mode the gap between two idle frames can be
 * seconds, which would otherwise read as ~0 FPS and trigger a spurious quality
 * downgrade.
 */
let continuous = false

export function setRenderingContinuously(v: boolean): void {
  continuous = v
}

export function isRenderingContinuously(): boolean {
  return continuous
}
