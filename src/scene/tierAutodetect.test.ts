import { describe, expect, it } from 'vitest'
import {
  BOOT_TIER,
  DEVICE_CLASSES,
  type DeviceCapabilities,
  deviceClassFor,
  FPS_GUARD_WARMUP_MS,
  RENDER_TIERS,
  shouldSampleFps,
} from './quality'

/** A capable desktop baseline; each test overrides only what it is about. */
function caps(over: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return { renderer: '', cores: 8, coarsePointer: false, webgl2: true, ...over }
}

describe('capabilityCeilingTier (TIER-AUTODETECT — a veto, not a claim)', () => {
  it('always returns a real device class', () => {
    expect(DEVICE_CLASSES).toContain(deviceClassFor(caps()))
  })

  it('does not treat an UNKNOWN core count as weak', () => {
    // Privacy-hardened browsers report 0/undefined; that must not read as a
    // 2-core machine and silently veto everyone back to the flat tier.
    expect(deviceClassFor(caps({ cores: 0 }))).toBe('capable')
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
        expect(deviceClassFor(caps({ renderer }))).toBe('weak')
      })
    }
  })

  it('keeps phones and tablets on the flat tier', () => {
    // Thermals and fill rate bind on mobile, not peak capability — and a phone
    // can report a "strong"-looking renderer string.
    expect(deviceClassFor(caps({ coarsePointer: true, renderer: 'Apple GPU' }))).toBe('weak')
  })

  it('keeps pre-WebGL2 devices on the flat tier', () => {
    expect(deviceClassFor(caps({ webgl2: false }))).toBe('weak')
  })

  it('keeps very low core counts on the flat tier', () => {
    expect(deviceClassFor(caps({ cores: 2 }))).toBe('weak')
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
      expect(deviceClassFor(caps({ renderer }))).toBe('capable')
    }
  })

  it('matches renderer names case-insensitively', () => {
    expect(deviceClassFor(caps({ renderer: 'SWIFTSHADER' }))).toBe('weak')
    expect(deviceClassFor(caps({ renderer: 'LLVMpipe' }))).toBe('weak')
  })

  it('spots a software rasteriser even when the string also names real hardware', () => {
    expect(deviceClassFor(caps({ renderer: 'SwiftShader emulating GeForce' }))).toBe('weak')
  })
})

describe('BOOT_TIER', () => {
  it('is the performance mode on every device — capability picks the variant', () => {
    // This replaced `initialAutoTier`, which after the two-mode collapse ignored
    // its `DeviceCapabilities` argument entirely. Not a behaviour change: the old
    // boot rung was `medium` on capable hardware, and that preset is now
    // `performance`/`capable`, so a capable machine still boots with sun shadows
    // and the IBL probe.
    expect(BOOT_TIER).toBe('performance')
    expect(RENDER_TIERS).toContain(BOOT_TIER)
    expect(deviceClassFor(caps({ renderer: 'Apple M4' }))).toBe('capable')
    expect(deviceClassFor(caps({ coarsePointer: true }))).toBe('weak')
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
