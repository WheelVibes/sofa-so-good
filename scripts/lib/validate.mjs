// Scenario validation and normalisation — pure Node logic, no browser/puppeteer.
// Imported by interact.mjs (runtime) and validate.test.mjs (unit tests).
//
// Two input formats are accepted so scenario files stay concise:
//
//   Keyed format  (compact, recommended in JSON):
//     { "name": "step-name", "click": { "text": "Get started" } }
//     { "screenshot": "onboarding-open" }
//     { "waitFor": { "css": ".modal-overlay" } }
//
//   Typed format  (explicit, useful for programmatic generation):
//     { "name": "step-name", "type": "click", "text": "Get started" }
//     { "type": "screenshot" }
//     { "type": "waitFor", "selector": ".modal-overlay" }
//
// Both forms normalise to the same internal shape used by interact.mjs.

/** All recognised step types. */
export const STEP_TYPES = new Set([
  'eval',
  'waitFor',
  'click',
  'screenshot',
  'store',
  'viewport',
  // Legacy canvas actions (re-used as-is from the original shot.mjs action runner)
  'drag',
  'rdrag',
  'wheel',
  'key',
  'type',
  'select',
  'wait',
])

/**
 * Resolve the type of a raw step object.
 * Accepts the typed format (s.type) or the keyed format (e.g. s.click, s.waitFor).
 * Returns the type string, or null if unresolvable.
 *
 * @param {object} s
 * @returns {string|null}
 */
export function resolveStepType(s) {
  if (typeof s.type === 'string' && STEP_TYPES.has(s.type)) return s.type
  for (const t of STEP_TYPES) {
    if (t in s) return t
  }
  return null
}

/**
 * Validate and normalise a raw scenario object (parsed JSON or .mjs export).
 * Returns a normalised scenario object, or throws an Error naming the offending step.
 *
 * @param {unknown} raw
 * @returns {{ name: string, url: string|null, steps: object[] }}
 */
export function normaliseScenario(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('Scenario must be a JSON object')
  if (!Array.isArray(raw.steps)) throw new Error('Scenario must have a "steps" array')
  if (raw.steps.length === 0) throw new Error('Scenario "steps" must not be empty')

  const steps = raw.steps.map((s, i) => {
    if (typeof s !== 'object' || s === null) {
      throw new Error(`step[${i}]: must be an object`)
    }

    const type = resolveStepType(s)
    const label = s.name ? `step[${i}] "${s.name}"` : `step[${i}]`
    if (!type) {
      const keys = Object.keys(s).filter((k) => k !== 'name' && k !== 'timeout')
      throw new Error(
        `${label}: unknown or missing type — present keys: [${keys.join(', ')}]. Valid types: ${[...STEP_TYPES].join(', ')}`,
      )
    }

    const name = s.name ?? `${type}-${i}`

    // Normalise keyed-format steps into a flat typed shape.
    // Typed-format steps pass through as-is (already flat).
    let norm = { ...s, type, name }

    if (type === 'eval') {
      // Keyed: { eval: "code string" } or { eval: { file: "path" } }
      // Typed: { type: "eval", code: "..." } or { type: "eval", file: "..." }
      if (!norm.code && !norm.file) {
        const keyed = s.eval
        if (typeof keyed === 'string') {
          norm = { ...norm, code: keyed }
        } else if (keyed && typeof keyed === 'object' && typeof keyed.file === 'string') {
          norm = { ...norm, file: keyed.file }
        } else {
          throw new Error(`${label} (eval): must have "code" or "file", or use { eval: "..." }`)
        }
      }
    }

    if (type === 'waitFor') {
      // Keyed: { waitFor: { css: ".selector" } } or { waitFor: { text: "..." } }
      //        { waitFor: { store: "predicateExpression" } }
      //        { waitFor: { storeExists: true } }
      // Typed: { type: "waitFor", selector: "...", until: "css" } etc.
      const keyed = s.waitFor
      if (keyed && typeof keyed === 'object') {
        if (typeof keyed.css === 'string') {
          norm = {
            ...norm,
            selector: keyed.css,
            until: 'css',
            visible: keyed.visible !== false,
          }
        } else if (typeof keyed.text === 'string') {
          norm = { ...norm, text: keyed.text, until: 'text' }
        } else if (typeof keyed.store === 'string') {
          norm = { ...norm, predicate: keyed.store, until: 'store' }
        } else if (keyed.storeExists === true) {
          norm = { ...norm, until: 'storeExists' }
        } else {
          throw new Error(`${label} (waitFor): needs css/text/store/storeExists field`)
        }
      }
      // Accept typed format as-is: must have selector/text/predicate/storeExists OR until:'storeExists'
      if (!norm.selector && !norm.text && !norm.predicate && norm.until !== 'storeExists') {
        throw new Error(
          `${label} (waitFor): must have "selector", "text", "predicate", or until:"storeExists"`,
        )
      }
      norm.timeout = norm.timeout ?? 15000
      norm.failMessage =
        norm.failMessage ?? `waitFor step "${norm.name}" timed out after ${norm.timeout} ms`
    }

    if (type === 'click') {
      // Keyed: { click: ".selector" } or { click: { selector: "..." } } or { click: { text: "..." } }
      // Typed: { type: "click", selector: "..." } or { type: "click", text: "..." } or { type: "click", x, y }
      const keyed = s.click
      if (keyed != null && !norm.selector && !norm.text && norm.x == null) {
        if (typeof keyed === 'string') {
          norm = { ...norm, selector: keyed }
        } else if (typeof keyed === 'object') {
          if (typeof keyed.selector === 'string') norm = { ...norm, selector: keyed.selector }
          else if (typeof keyed.text === 'string') norm = { ...norm, text: keyed.text }
        }
      }
      if (!norm.selector && !norm.text && (norm.x == null || norm.y == null)) {
        throw new Error(`${label} (click): must have "selector", "text", or "x"+"y"`)
      }
    }

    if (type === 'drag') {
      const keyed = s.drag
      if (keyed && typeof keyed === 'object' && !norm.from) {
        norm = { ...norm, from: keyed.from, to: keyed.to }
      }
      if (!Array.isArray(norm.from) || !Array.isArray(norm.to)) {
        throw new Error(`${label} (drag): must have "from" and "to" [x,y] arrays`)
      }
    }

    if (type === 'rdrag') {
      const keyed = s.rdrag
      if (keyed && typeof keyed === 'object' && !norm.from) {
        norm = { ...norm, from: keyed.from, to: keyed.to }
      }
      if (!Array.isArray(norm.from) || !Array.isArray(norm.to)) {
        throw new Error(`${label} (rdrag): must have "from" and "to" [x,y] arrays`)
      }
    }

    if (type === 'wheel') {
      const keyed = s.wheel
      if (keyed && typeof keyed === 'object' && norm.x == null) {
        norm = { ...norm, x: keyed.x, y: keyed.y, dy: keyed.dy }
      }
    }

    if (type === 'screenshot') {
      // Keyed: { screenshot: "step-name" } or { name: "foo", screenshot: true }
      const keyed = s.screenshot
      if (!norm.screenshotName) {
        norm.screenshotName = typeof keyed === 'string' ? keyed : name
      }
    }

    if (type === 'store') {
      // Keyed: { store: { action: "setUiMode", args: ["pro"] } }
      const keyed = s.store
      if (keyed && typeof keyed === 'object' && !norm.action) {
        norm = { ...norm, action: keyed.action, args: keyed.args ?? [] }
      }
      if (!norm.action) throw new Error(`${label} (store): must have "action"`)
    }

    if (type === 'viewport') {
      // Keyed: { viewport: { width: 390, height: 844 } }
      const keyed = s.viewport
      if (keyed && typeof keyed === 'object' && !norm.width) {
        norm = { ...norm, width: keyed.width, height: keyed.height }
      }
      if (!norm.width || !norm.height) {
        throw new Error(`${label} (viewport): must have "width" and "height"`)
      }
    }

    if (type === 'wait') {
      // Keyed: { wait: 1000 }
      const keyed = s.wait
      if (typeof keyed === 'number' && norm.ms == null) {
        norm = { ...norm, ms: keyed }
      }
      if (norm.ms == null) {
        throw new Error(`${label} (wait): must have "ms" number`)
      }
    }

    if (type === 'key') {
      // Keyed: { key: "Enter" }
      const keyed = s.key
      if (typeof keyed === 'string' && !norm.keyName) {
        norm = { ...norm, keyName: keyed }
      } else if (!norm.keyName && norm.key && norm.type === 'key') {
        norm = { ...norm, keyName: norm.key }
      }
      if (!norm.keyName) throw new Error(`${label} (key): must have a key name`)
    }

    if (type === 'select') {
      // Keyed: { select: { selector: "select", value: "kitchen" } }
      const keyed = s.select
      if (keyed && typeof keyed === 'object' && !norm.value) {
        norm = { ...norm, selector: keyed.selector || 'select', value: keyed.value }
      }
      if (norm.value == null) throw new Error(`${label} (select): must have "value"`)
    }

    if (type === 'type') {
      // Keyed: { type: "text to type", x: 0, y: 0 } — NOTE: 'type' field already IS the type.
      // This action's keyed form is { "type": "type", "text": "...", "x": ..., "y": ... }
      // No separate keyed-object form needed since the type name IS "type".
      if (!norm.text) throw new Error(`${label} (type action): must have "text"`)
    }

    return norm
  })

  return {
    name: raw.name ?? 'unnamed-scenario',
    url: raw.url ?? null,
    // When true, the harness keeps the first-run onboarding + location prompt
    // (instead of auto-dismissing them) so the scenario can walk those flows.
    keepFirstRun: raw.keepFirstRun === true,
    steps,
  }
}

/**
 * Return a list of validation error strings (empty = valid). Handy for tests
 * that want to assert specific error messages without try/catch.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function validateScenario(raw) {
  try {
    normaliseScenario(raw)
    return []
  } catch (e) {
    return [e.message]
  }
}
