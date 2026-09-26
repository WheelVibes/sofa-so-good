import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearShaderLinkErrors,
  formatShaderLinkError,
  installShaderErrorHook,
  recordShaderLinkError,
  SHADER_LINK_ERROR_LIMIT,
  type ShaderErrorDebugTarget,
  shaderLinkErrors,
} from './shaderLinkError'

const err = (programLog: string) => ({
  programLog,
  vertexLog: '',
  fragmentLog: '',
  at: 0,
})

/** A `gl.debug` stand-in plus the context three hands the hook. */
function fakeGl(logs: { program?: string; vertex?: string; fragment?: string } = {}) {
  const debug: ShaderErrorDebugTarget = {}
  const ctx = {
    getProgramInfoLog: () => logs.program ?? null,
    getShaderInfoLog: (s: unknown) => (s === 'vs' ? logs.vertex : logs.fragment) ?? null,
  }
  return { debug, ctx }
}

describe('shaderLinkError ring buffer', () => {
  beforeEach(() => clearShaderLinkErrors())
  afterEach(() => clearShaderLinkErrors())

  it('starts empty — the healthy state', () => {
    expect(shaderLinkErrors()).toHaveLength(0)
  })

  it('records failures oldest-first', () => {
    recordShaderLinkError(err('first'))
    recordShaderLinkError(err('second'))
    expect(shaderLinkErrors().map((e) => e.programLog)).toEqual(['first', 'second'])
  })

  it('is BOUNDED, evicting the oldest', () => {
    // A broken injected chunk fails on every material carrying it, and the lightmap path
    // clones material per mesh (522 clones on the default flat) — unbounded, this would be
    // a leak proportional to the scene.
    for (let i = 0; i < SHADER_LINK_ERROR_LIMIT + 5; i++) recordShaderLinkError(err(`e${i}`))
    expect(shaderLinkErrors()).toHaveLength(SHADER_LINK_ERROR_LIMIT)
    expect(shaderLinkErrors()[0]?.programLog).toBe('e5')
  })
})

describe('formatShaderLinkError', () => {
  it('keeps threes own prefix so a search for it still finds this', () => {
    expect(formatShaderLinkError(err('link failed'))).toContain('THREE.WebGLProgram: Shader Error')
    expect(formatShaderLinkError(err('link failed'))).toContain('link failed')
  })

  it('joins every non-empty info log and never renders an empty message', () => {
    const msg = formatShaderLinkError({
      programLog: 'P',
      vertexLog: '',
      fragmentLog: 'F',
      at: 0,
    })
    expect(msg).toContain('P | F')
    expect(formatShaderLinkError(err(''))).toContain('(no info log)')
  })
})

describe('installShaderErrorHook', () => {
  beforeEach(() => clearShaderLinkErrors())
  afterEach(() => {
    clearShaderLinkErrors()
    vi.restoreAllMocks()
  })

  it('captures a failure into the buffer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { debug, ctx } = fakeGl({ program: 'P', vertex: 'V', fragment: 'F' })
    installShaderErrorHook(debug)
    expect(debug.onShaderError).toBeTypeOf('function')
    // three calls it as (gl, program, vertexShader, fragmentShader).
    ;(debug.onShaderError as unknown as (...a: unknown[]) => void)(ctx, 'prog', 'vs', 'fs')
    const [captured] = shaderLinkErrors()
    expect(captured).toMatchObject({ programLog: 'P', vertexLog: 'V', fragmentLog: 'F' })
  })

  it('STILL writes the console line three would have written', () => {
    // Setting `onShaderError` replaces three's own default console output, so a hook that
    // only recorded would make a dev build quieter than an unhooked one.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { debug, ctx } = fakeGl({ program: 'boom' })
    installShaderErrorHook(debug)
    ;(debug.onShaderError as unknown as (...a: unknown[]) => void)(ctx, 'prog', 'vs', 'fs')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toContain('boom')
  })

  it('tolerates a driver that returns null info logs', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { debug, ctx } = fakeGl()
    installShaderErrorHook(debug)
    ;(debug.onShaderError as unknown as (...a: unknown[]) => void)(ctx, 'prog', 'vs', 'fs')
    expect(shaderLinkErrors()[0]).toMatchObject({ programLog: '', vertexLog: '', fragmentLog: '' })
  })
})
