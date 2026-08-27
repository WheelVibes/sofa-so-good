import { describe, expect, it } from 'vitest'
import {
  capabilityCeilingTier,
  type DeviceCapabilities,
  detectDefaultTier,
  FPS_GUARD_WARMUP_MS,
  initialAutoTier,
  RENDER_TIERS,
  shouldSampleFps,
} from './quality'

/** A capable desktop baseline; each test overrides only what it is about. */
function caps(over: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return { renderer: '', cores: 8, coarsePointer: false, webgl2: true, ...over }
}

describe('capabilityCeilingTier (TIER-AUTODETECT — a veto, not a claim)', () => {
  it('never vetoes above high — maximum is always an explicit user choice', () => {
    const samples: DeviceCapabilities[] = [
      caps({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)' }),
      caps({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)' }),
      caps(),
      caps({ coarsePointer: true }),
    ]
    for (const c of samples) {
      expect(['performance', 'medium', 'high']).toContain(capabilityCeilingTier(c))
      expect(capabilityCeilingTier(c)).not.toBe('maximum')
    }
  })

  it('always returns a real tier', () => {
    expect(RENDER_TIERS).toContain(capabilityCeilingTier(caps()))
  })

  it('does not treat an UNKNOWN core count as weak', () => {
    // Privacy-hardened browsers report 0/undefined; that must not read as a
    // 2-core machine and silently veto everyone back to the flat tier.
    expect(capabilityCeilingTier(caps({ cores: 0 }))).toBe('high')
  })

  describe('software rasterisers fall back to the flat tier', () => {
    // These advertise generous limits (SwiftShader reports 16K textures) so they
    // must be matched by NAME — no capability number distinguishes them.
    const software = [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
      'Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)',
      'softpipe',
      'Microsoft Basic Render Driver',
    ]
    for (const renderer of software) {
      it(renderer.slice(0, 40), () => {
        expect(capabilityCeilingTier(caps({ renderer }))).toBe('performance')
      })
    }
  })

  it('keeps phones and tablets on the flat tier', () => {
    // Thermals and fill rate bind on mobile, not peak capability — and a phone
    // can report a "strong"-looking renderer string.
    expect(capabilityCeilingTier(caps({ coarsePointer: true, renderer: 'Apple GPU' }))).toBe(
      'performance',
    )
  })

  it('keeps pre-WebGL2 devices on the flat tier', () => {
    expect(capabilityCeilingTier(caps({ webgl2: false }))).toBe('performance')
  })

  it('keeps very low core counts on the flat tier', () => {
    expect(capabilityCeilingTier(caps({ cores: 2 }))).toBe('performance')
  })

  it('expresses "no opinion" as high, so measurement decides', () => {
    // Returning `high` is the ABSENCE of a veto, not a claim the device can run
    // it — the adaptive ladder still has to earn each rung by measurement.
    const noVeto = [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)',
      'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11)',
      '',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)',
    ]
    for (const renderer of noVeto) {
      expect(capabilityCeilingTier(caps({ renderer }))).toBe('high')
    }
  })

  it('matches renderer names case-insensitively', () => {
    expect(capabilityCeilingTier(caps({ renderer: 'SWIFTSHADER' }))).toBe('performance')
    expect(capabilityCeilingTier(caps({ renderer: 'LLVMpipe' }))).toBe('performance')
  })

  it('spots a software rasteriser even when the string also names real hardware', () => {
    expect(capabilityCeilingTier(caps({ renderer: 'SwiftShader emulating GeForce' }))).toBe(
      'performance',
    )
  })
})

describe('initialAutoTier — the conservative FIRST-VISIT tier', () => {
  it('boots medium when nothing is vetoed', () => {
    // Medium is measurably free on capable hardware (vsync-capped 60fps, same as
    // the flat tier) while adding sun shadows + the IBL probe.
    expect(initialAutoTier(caps())).toBe('medium')
    expect(initialAutoTier(caps({ renderer: 'Apple M4' }))).toBe('medium')
  })

  it('boots performance whenever the capability guard vetoes', () => {
    expect(initialAutoTier(caps({ coarsePointer: true }))).toBe('performance')
    expect(initialAutoTier(caps({ renderer: 'SwiftShader' }))).toBe('performance')
    expect(initialAutoTier(caps({ webgl2: false }))).toBe('performance')
    expect(initialAutoTier(caps({ cores: 2 }))).toBe('performance')
  })

  it('never boots into a post-processing tier unmeasured', () => {
    // The ladder has to earn High by measurement; nobody starts there.
    for (const c of [caps(), caps({ renderer: 'Apple M4' }), caps({ coarsePointer: true })]) {
      expect(['performance', 'medium']).toContain(initialAutoTier(c))
    }
  })
})

describe('detectDefaultTier', () => {
  it('falls back to the flat tier with no context', () => {
    // `resolveQuality` calls this with no argument when a PERSISTED tier is
    // unrecognised — there is no device to inspect, so take the safe floor.
    expect(detectDefaultTier()).toBe('performance')
  })
})

describe('shouldSampleFps (adaptive-guard warm-up)', () => {
  it('never samples before the scene is ready', () => {
    expect(shouldSampleFps(false, 0)).toBe(false)
    expect(shouldSampleFps(false, FPS_GUARD_WARMUP_MS * 10)).toBe(false)
  })

  it('stays quiet through the warm-up window', () => {
    // Boot drives frames continuously (loader, asset streaming, shader compiles,
    // the first shadow/IBL bakes) at the least representative moment there is.
    // Without this gate the guard walked a freshly auto-detected High straight
    // down to Medium and then Performance during warm-up, which made capability
    // detection look broken — observed on the M4 test machine.
    expect(shouldSampleFps(true, 0)).toBe(false)
    expect(shouldSampleFps(true, FPS_GUARD_WARMUP_MS - 1)).toBe(false)
  })

  it('samples once the warm-up window has elapsed', () => {
    expect(shouldSampleFps(true, FPS_GUARD_WARMUP_MS)).toBe(true)
    expect(shouldSampleFps(true, FPS_GUARD_WARMUP_MS + 1)).toBe(true)
  })

  it('allows enough warm-up to be useful', () => {
    // A guard that engages within a second or two is back to measuring boot.
    expect(FPS_GUARD_WARMUP_MS).toBeGreaterThanOrEqual(3000)
  })
})
