import { describe, expect, it } from 'vitest'
import {
  type DeviceCapabilities,
  detectDefaultTier,
  FPS_GUARD_WARMUP_MS,
  RENDER_TIERS,
  shouldSampleFps,
  tierForCapabilities,
} from './quality'

/** A capable desktop baseline; each test overrides only what it is about. */
function caps(over: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return { renderer: '', cores: 8, coarsePointer: false, webgl2: true, ...over }
}

describe('tierForCapabilities (TIER-AUTODETECT)', () => {
  it('never picks a tier above medium — those stay explicit user choices', () => {
    const samples: DeviceCapabilities[] = [
      caps({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)' }),
      caps({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)' }),
      caps(),
      caps({ coarsePointer: true }),
    ]
    for (const c of samples) {
      expect(['performance', 'medium']).toContain(tierForCapabilities(c))
    }
  })

  it('always returns a real tier', () => {
    expect(RENDER_TIERS).toContain(tierForCapabilities(caps()))
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
        expect(tierForCapabilities(caps({ renderer }))).toBe('performance')
      })
    }
  })

  it('keeps phones and tablets on the flat tier', () => {
    // Thermals and fill rate bind on mobile, not peak capability — and a phone
    // can report a "strong"-looking renderer string.
    expect(tierForCapabilities(caps({ coarsePointer: true, renderer: 'Apple GPU' }))).toBe(
      'performance',
    )
  })

  it('keeps pre-WebGL2 devices on the flat tier', () => {
    expect(tierForCapabilities(caps({ webgl2: false }))).toBe('performance')
  })

  it('keeps very low core counts on the flat tier', () => {
    expect(tierForCapabilities(caps({ cores: 2 }))).toBe('performance')
  })

  it('does not treat an UNKNOWN core count as weak', () => {
    // Privacy-hardened browsers report 0/undefined; that must not be read as a
    // 2-core machine and silently pin everyone to the flat tier again.
    expect(tierForCapabilities(caps({ cores: 0 }))).toBe('medium')
  })

  it('never auto-selects a post-processing tier', () => {
    // High averages 39.9fps and Maximum 34fps under sustained orbit on the M4
    // reference machine at Retina DPR, with 83ms spikes — above the 30fps floor
    // on average, but one bad sample window is enough for QualityController to
    // step DOWN, so an auto-selected High visibly downgrades itself mid-orbit.
    // They stay an explicit opt-in. See tierForCapabilities' docblock.
    const strong = [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)',
      'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11)',
    ]
    for (const renderer of strong) {
      expect(tierForCapabilities(caps({ renderer }))).toBe('medium')
    }
  })

  it('matches renderer names case-insensitively', () => {
    expect(tierForCapabilities(caps({ renderer: 'SWIFTSHADER' }))).toBe('performance')
    expect(tierForCapabilities(caps({ renderer: 'LLVMpipe' }))).toBe('performance')
  })

  it('spots a software rasteriser even when the string also names real hardware', () => {
    expect(tierForCapabilities(caps({ renderer: 'SwiftShader emulating GeForce' }))).toBe(
      'performance',
    )
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
