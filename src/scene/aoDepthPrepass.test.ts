import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AO_DEPTH_FIX_MIN_POSTPROCESSING,
  aoMsaaDecision,
  postprocessingSatisfiesDepthFix,
} from './aoDepthPrepass'

/**
 * AO-DEPTH-ISOLATION (R7-F). Two kinds of guard:
 *
 *  1. The **policy** — pure, so the whole MSAA gate is testable without a GPU.
 *  2. The **dependency floor** — the fix that makes the policy safe lives in
 *     `postprocessing` v6.39.3 (pmndrs/postprocessing #745), not in this repo. A
 *     downgrade would silently restore a per-frame `GL_INVALID_OPERATION` flood that
 *     `tsc`, biome and every render test are blind to, so the floor is asserted against
 *     the ACTUAL installed package, not against the range in `package.json` (a caret
 *     range says what npm may pick, not what is on disk).
 */
describe('postprocessingSatisfiesDepthFix', () => {
  it('accepts the fixed release and everything after it', () => {
    expect(postprocessingSatisfiesDepthFix('6.39.3')).toBe(true)
    expect(postprocessingSatisfiesDepthFix('6.39.5')).toBe(true)
    expect(postprocessingSatisfiesDepthFix('6.40.0')).toBe(true)
    expect(postprocessingSatisfiesDepthFix('7.0.0')).toBe(true)
  })

  it('rejects the releases that carry the format mismatch', () => {
    // 6.39.0 is the regression itself — it changed the stable depth texture to
    // FloatType while the MSAA renderbuffer stayed 24-bit unorm.
    expect(postprocessingSatisfiesDepthFix('6.39.0')).toBe(false)
    expect(postprocessingSatisfiesDepthFix('6.39.1')).toBe(false)
    expect(postprocessingSatisfiesDepthFix('6.39.2')).toBe(false)
    expect(postprocessingSatisfiesDepthFix('6.38.9')).toBe(false)
    expect(postprocessingSatisfiesDepthFix('5.99.99')).toBe(false)
  })

  it('reads an unparseable version as NOT fixed', () => {
    // Fail towards "no MSAA": a weird pin may cost antialiasing, never correctness.
    expect(postprocessingSatisfiesDepthFix('next')).toBe(false)
    expect(postprocessingSatisfiesDepthFix('')).toBe(false)
  })

  it('tolerates a prerelease suffix on the installed version', () => {
    expect(postprocessingSatisfiesDepthFix('7.0.0-beta.16')).toBe(true)
  })
})

describe('the installed postprocessing carries the #745 depth-format fix', () => {
  const installed = JSON.parse(
    readFileSync(join(process.cwd(), 'node_modules', 'postprocessing', 'package.json'), 'utf8'),
  ).version as string

  it(`is at least ${AO_DEPTH_FIX_MIN_POSTPROCESSING}`, () => {
    expect(postprocessingSatisfiesDepthFix(installed)).toBe(true)
  })

  it('still contains the code that implements the fix', () => {
    // A version number is a claim; this is the claim checked. `createDepthTexture`
    // must assign matching-format depth textures to BOTH ping-pong buffers and force
    // three to rebuild their renderbuffers, or the MSAA depth attachment keeps the
    // 24-bit format it was first allocated with and every depth blit fails.
    const src = readFileSync(
      join(process.cwd(), 'node_modules', 'postprocessing', 'build', 'index.js'),
      'utf8',
    )
    expect(src).toContain('this.inputBuffer.depthTexture = inputDepthTexture')
    expect(src).toContain('this.outputBuffer.depthTexture = outputDepthTexture')
    expect(src).toContain('this.inputBuffer.dispose()')
  })
})

describe('aoMsaaDecision', () => {
  const on = { full: true, deviceClass: 'weak', softwareRenderer: false, flagOn: true, samples: 4 }

  it('multisamples the full stack on the weak class when the flag is on', () => {
    expect(aoMsaaDecision(on)).toEqual({
      samples: 4,
      reason: 'on:composer-depth-format-matched',
    })
  })

  it('keeps the SwiftShader exclusion (REALISTIC-SOFTWARE-FALLBACK)', () => {
    // A software rasteriser has no tile memory: every sample is real ALU work on the
    // tier with the least headroom. Unrelated to the depth-format fix, so it survives it.
    expect(aoMsaaDecision({ ...on, softwareRenderer: true })).toEqual({
      samples: 0,
      reason: 'off:software-rasteriser',
    })
  })

  it('is off for the capable class, with the flag off, and outside the full stack', () => {
    expect(aoMsaaDecision({ ...on, deviceClass: 'capable' }).reason).toBe('off:device-class')
    expect(aoMsaaDecision({ ...on, flagOn: false }).reason).toBe('off:flag-off')
    expect(aoMsaaDecision({ ...on, full: false }).reason).toBe('off:not-full-stack')
  })

  it('no longer vetoes MSAA merely because AO is mounted', () => {
    // The whole point of R7-F. `ao` is not an input at all now: `quality.ts` sets
    // `ao: true` on every tier with `postprocessing: true`, so an `ao` veto made this
    // function constant-0 and `mobileMsaa` unreachable dead configuration.
    expect(Object.keys(on)).not.toContain('ao')
    expect(aoMsaaDecision({ ...on, samples: 4 }).samples).toBe(4)
  })

  it('passes the caller’s sample count through rather than hardcoding one', () => {
    expect(aoMsaaDecision({ ...on, samples: 2 }).samples).toBe(2)
    expect(aoMsaaDecision({ ...on, samples: 0 }).samples).toBe(0)
  })
})
