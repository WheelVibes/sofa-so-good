import { describe, expect, it } from 'vitest'
import { normaliseScenario, resolveStepType, STEP_TYPES, validateScenario } from './validate.mjs'

// ──────────────────────────────────────────────────────────────────────────────
// resolveStepType
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveStepType', () => {
  it('resolves typed format (s.type)', () => {
    expect(resolveStepType({ type: 'eval', code: 'x' })).toBe('eval')
    expect(resolveStepType({ type: 'screenshot' })).toBe('screenshot')
  })

  it('resolves keyed format (step key = type name)', () => {
    expect(resolveStepType({ eval: 'console.log(1)' })).toBe('eval')
    expect(resolveStepType({ waitFor: { css: '.foo' } })).toBe('waitFor')
    expect(resolveStepType({ click: { text: 'Get started' } })).toBe('click')
    expect(resolveStepType({ screenshot: 'step-01' })).toBe('screenshot')
    expect(resolveStepType({ store: { action: 'setUiMode', args: ['pro'] } })).toBe('store')
    expect(resolveStepType({ viewport: { width: 390, height: 844 } })).toBe('viewport')
    expect(resolveStepType({ wait: 500 })).toBe('wait')
    expect(resolveStepType({ key: 'Enter' })).toBe('key')
  })

  it('returns null for unknown types', () => {
    expect(resolveStepType({ unknown: 'value' })).toBeNull()
    expect(resolveStepType({})).toBeNull()
  })

  it('typed format takes priority over keyed format', () => {
    // Both present: typed wins
    expect(resolveStepType({ type: 'eval', screenshot: 'foo' })).toBe('eval')
  })

  it('covers all STEP_TYPES entries', () => {
    for (const t of STEP_TYPES) {
      const obj = { [t]: true }
      expect(resolveStepType(obj)).toBe(t)
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — structure validation
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario', () => {
  it('rejects non-object inputs', () => {
    expect(() => normaliseScenario(null)).toThrow('Scenario must be a JSON object')
    expect(() => normaliseScenario('string')).toThrow()
    expect(() => normaliseScenario(42)).toThrow()
  })

  it('rejects missing/empty steps array', () => {
    expect(() => normaliseScenario({})).toThrow('"steps" array')
    expect(() => normaliseScenario({ steps: [] })).toThrow('empty')
    expect(() => normaliseScenario({ steps: 'not-array' })).toThrow('"steps" array')
  })

  it('normalises scenario name', () => {
    const s = normaliseScenario({ steps: [{ screenshot: 'x' }] })
    expect(s.name).toBe('unnamed-scenario')
    const s2 = normaliseScenario({ name: 'my-flow', steps: [{ screenshot: 'x' }] })
    expect(s2.name).toBe('my-flow')
  })

  it('preserves url field', () => {
    const s = normaliseScenario({
      url: 'http://localhost:5211/',
      steps: [{ screenshot: 'x' }],
    })
    expect(s.url).toBe('http://localhost:5211/')
  })

  it('defaults url to null', () => {
    const s = normaliseScenario({ steps: [{ screenshot: 'x' }] })
    expect(s.url).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — eval steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — eval', () => {
  it('accepts keyed inline eval', () => {
    const s = normaliseScenario({ steps: [{ name: 'init', eval: 'window.x=1' }] })
    expect(s.steps[0].type).toBe('eval')
    expect(s.steps[0].code).toBe('window.x=1')
  })

  it('accepts keyed file eval', () => {
    const s = normaliseScenario({ steps: [{ eval: { file: '/tmp/init.mjs' } }] })
    expect(s.steps[0].type).toBe('eval')
    expect(s.steps[0].file).toBe('/tmp/init.mjs')
  })

  it('accepts typed eval with code', () => {
    const s = normaliseScenario({ steps: [{ type: 'eval', code: 'window.x=1' }] })
    expect(s.steps[0].type).toBe('eval')
    expect(s.steps[0].code).toBe('window.x=1')
  })

  it('rejects eval with neither code nor file', () => {
    expect(() => normaliseScenario({ steps: [{ type: 'eval' }] })).toThrow('eval')
    expect(() => normaliseScenario({ steps: [{ eval: {} }] })).toThrow('eval')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — waitFor steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — waitFor', () => {
  it('normalises waitFor css condition', () => {
    const s = normaliseScenario({ steps: [{ waitFor: { css: '.modal-overlay' } }] })
    const step = s.steps[0]
    expect(step.type).toBe('waitFor')
    expect(step.selector).toBe('.modal-overlay')
    expect(step.until).toBe('css')
    expect(step.visible).toBe(true)
    expect(step.timeout).toBe(15000)
    expect(step.failMessage).toMatch(/timed out/)
  })

  it('normalises waitFor css disappears (visible:false)', () => {
    const s = normaliseScenario({
      steps: [{ waitFor: { css: '.spinner', visible: false } }],
    })
    expect(s.steps[0].visible).toBe(false)
  })

  it('normalises waitFor text condition', () => {
    const s = normaliseScenario({ steps: [{ waitFor: { text: 'Get started' } }] })
    const step = s.steps[0]
    expect(step.until).toBe('text')
    expect(step.text).toBe('Get started')
  })

  it('normalises waitFor store predicate', () => {
    const s = normaliseScenario({
      steps: [{ waitFor: { store: 'state.onboardingOpen === true' } }],
    })
    const step = s.steps[0]
    expect(step.until).toBe('store')
    expect(step.predicate).toBe('state.onboardingOpen === true')
  })

  it('normalises waitFor storeExists', () => {
    const s = normaliseScenario({ steps: [{ waitFor: { storeExists: true } }] })
    expect(s.steps[0].until).toBe('storeExists')
  })

  it('uses custom timeout', () => {
    const s = normaliseScenario({
      steps: [{ waitFor: { css: '.foo' }, timeout: 30000 }],
    })
    expect(s.steps[0].timeout).toBe(30000)
  })

  it('rejects waitFor with no condition', () => {
    expect(() => normaliseScenario({ steps: [{ waitFor: {} }] })).toThrow('waitFor')
    expect(() => normaliseScenario({ steps: [{ type: 'waitFor' }] })).toThrow('waitFor')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — click steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — click', () => {
  it('normalises keyed click by selector string', () => {
    const s = normaliseScenario({ steps: [{ click: '.btn-accent' }] })
    expect(s.steps[0].type).toBe('click')
    expect(s.steps[0].selector).toBe('.btn-accent')
  })

  it('normalises keyed click by object selector', () => {
    const s = normaliseScenario({ steps: [{ click: { selector: '.btn-accent' } }] })
    expect(s.steps[0].selector).toBe('.btn-accent')
  })

  it('normalises keyed click by text', () => {
    const s = normaliseScenario({ steps: [{ click: { text: 'Get started' } }] })
    expect(s.steps[0].type).toBe('click')
    expect(s.steps[0].text).toBe('Get started')
  })

  it('normalises typed click with selector', () => {
    const s = normaliseScenario({ steps: [{ type: 'click', selector: '.foo' }] })
    expect(s.steps[0].selector).toBe('.foo')
  })

  it('rejects click with no selector, text, or x/y', () => {
    expect(() => normaliseScenario({ steps: [{ click: {} }] })).toThrow('click')
    expect(() => normaliseScenario({ steps: [{ type: 'click' }] })).toThrow('click')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — screenshot steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — screenshot', () => {
  it('normalises keyed screenshot with name string', () => {
    const s = normaliseScenario({ steps: [{ screenshot: 'onboarding-open' }] })
    expect(s.steps[0].type).toBe('screenshot')
    expect(s.steps[0].screenshotName).toBe('onboarding-open')
  })

  it('falls back to step name when screenshot value is not a string', () => {
    const s = normaliseScenario({ steps: [{ name: 'my-shot', screenshot: true }] })
    expect(s.steps[0].screenshotName).toBe('my-shot')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — store steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — store', () => {
  it('normalises keyed store step', () => {
    const s = normaliseScenario({
      steps: [{ store: { action: 'setUiMode', args: ['pro'] } }],
    })
    const step = s.steps[0]
    expect(step.type).toBe('store')
    expect(step.action).toBe('setUiMode')
    expect(step.args).toEqual(['pro'])
  })

  it('defaults args to []', () => {
    const s = normaliseScenario({ steps: [{ store: { action: 'resetToDefault' } }] })
    expect(s.steps[0].args).toEqual([])
  })

  it('rejects store without action', () => {
    expect(() => normaliseScenario({ steps: [{ store: {} }] })).toThrow('store')
    expect(() => normaliseScenario({ steps: [{ type: 'store' }] })).toThrow('store')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — viewport steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — viewport', () => {
  it('normalises keyed viewport step', () => {
    const s = normaliseScenario({ steps: [{ viewport: { width: 390, height: 844 } }] })
    const step = s.steps[0]
    expect(step.type).toBe('viewport')
    expect(step.width).toBe(390)
    expect(step.height).toBe(844)
  })

  it('rejects viewport without dimensions', () => {
    expect(() => normaliseScenario({ steps: [{ viewport: {} }] })).toThrow('viewport')
    expect(() => normaliseScenario({ steps: [{ viewport: { width: 390 } }] })).toThrow('viewport')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — wait and key steps
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — wait', () => {
  it('normalises keyed wait step', () => {
    const s = normaliseScenario({ steps: [{ wait: 1500 }] })
    expect(s.steps[0].type).toBe('wait')
    expect(s.steps[0].ms).toBe(1500)
  })

  it('accepts typed wait with ms', () => {
    const s = normaliseScenario({ steps: [{ type: 'wait', ms: 2000 }] })
    expect(s.steps[0].ms).toBe(2000)
  })

  it('rejects wait without ms', () => {
    expect(() => normaliseScenario({ steps: [{ type: 'wait' }] })).toThrow('wait')
  })
})

describe('normaliseScenario — key', () => {
  it('normalises keyed key step', () => {
    const s = normaliseScenario({ steps: [{ key: 'Escape' }] })
    expect(s.steps[0].type).toBe('key')
    expect(s.steps[0].keyName).toBe('Escape')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — drag/rdrag/wheel legacy canvas actions
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — legacy canvas actions', () => {
  it('normalises keyed drag step', () => {
    const s = normaliseScenario({
      steps: [{ drag: { from: [100, 200], to: [300, 400] } }],
    })
    expect(s.steps[0].type).toBe('drag')
    expect(s.steps[0].from).toEqual([100, 200])
    expect(s.steps[0].to).toEqual([300, 400])
  })

  it('normalises keyed wheel step', () => {
    const s = normaliseScenario({ steps: [{ wheel: { x: 800, y: 500, dy: -400 } }] })
    expect(s.steps[0].type).toBe('wheel')
    expect(s.steps[0].dy).toBe(-400)
  })

  it('rejects drag without from/to', () => {
    expect(() => normaliseScenario({ steps: [{ drag: {} }] })).toThrow('drag')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// validateScenario (error list helper)
// ──────────────────────────────────────────────────────────────────────────────

describe('validateScenario', () => {
  it('returns [] for a valid scenario', () => {
    const errors = validateScenario({ steps: [{ screenshot: 'boot' }] })
    expect(errors).toEqual([])
  })

  it('returns error array for invalid scenario', () => {
    const errors = validateScenario({ steps: [] })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/empty/)
  })

  it('returns error for unknown type', () => {
    const errors = validateScenario({ steps: [{ bogus: true }] })
    expect(errors[0]).toMatch(/unknown or missing type/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// normaliseScenario — a complete realistic scenario (integration-style)
// ──────────────────────────────────────────────────────────────────────────────

describe('normaliseScenario — realistic first-run scenario', () => {
  const raw = {
    name: 'first-run',
    url: 'http://localhost:5211/',
    steps: [
      { name: 'store-ready', waitFor: { storeExists: true }, timeout: 20000 },
      { name: 'onboarding-open', waitFor: { store: 'state.onboardingOpen === true' } },
      { name: 'shot-welcome', screenshot: 'welcome' },
      { name: 'next-step-1', click: { text: 'Get started' } },
      { name: 'shot-tour-overview', screenshot: 'tour-overview' },
      { name: 'next-step-2', click: { text: 'Next' } },
      { name: 'shot-choices', screenshot: 'choices' },
      { name: 'dismiss-onboarding', store: { action: 'setOnboardingOpen', args: [false] } },
      { name: 'tour-open', waitFor: { store: 'state.tourOpen === true' }, timeout: 5000 },
      { name: 'shot-tour-step1', screenshot: 'tour-step-1' },
      { name: 'tour-next', click: { text: 'Next' } },
      { name: 'shot-tour-step2', screenshot: 'tour-step-2' },
      { name: 'end-tour', store: { action: 'endTour', args: [] } },
      {
        name: 'location-visible',
        waitFor: { css: '.modal-overlay' },
        timeout: 8000,
      },
      { name: 'shot-location', screenshot: 'location-prompt' },
      { name: 'dismiss-location', click: { text: 'Skip — use default location' } },
      { name: 'shot-final', screenshot: 'final-scene' },
    ],
  }

  it('normalises without errors', () => {
    expect(() => normaliseScenario(raw)).not.toThrow()
  })

  it('produces correct step count', () => {
    const s = normaliseScenario(raw)
    expect(s.steps.length).toBe(raw.steps.length)
  })

  it('first step is waitFor storeExists', () => {
    const s = normaliseScenario(raw)
    expect(s.steps[0].type).toBe('waitFor')
    expect(s.steps[0].until).toBe('storeExists')
    expect(s.steps[0].timeout).toBe(20000)
  })

  it('screenshot steps carry screenshotName', () => {
    const s = normaliseScenario(raw)
    const shots = s.steps.filter((st) => st.type === 'screenshot')
    expect(shots.length).toBe(7)
    expect(shots[0].screenshotName).toBe('welcome')
    expect(shots[shots.length - 1].screenshotName).toBe('final-scene')
  })
})
