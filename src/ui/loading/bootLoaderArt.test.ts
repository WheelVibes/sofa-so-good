// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The static boot loader (index.html) must follow the same compositor rule as
 *  LoadingOverlay: every element carrying an animation class is an HTML
 *  element, never an SVG child — otherwise the animation runs on the main
 *  thread and stutters during Canvas warm-up (the old `.bl-static` freeze
 *  existed only to hide that stutter; it must stay gone). */
describe('boot loader art (index.html)', () => {
  // Tests run from the project root (vitest.config.ts lives there).
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
  const doc = new DOMParser().parseFromString(html, 'text/html')

  it('puts every animation class on an HTML element, never an SVG node', () => {
    const animated = doc.querySelectorAll('#boot-loader .bl-art, .bl-draw, .bl-pop')
    // bob wrapper + 2 draw layers + 4 furniture pop layers
    expect(animated.length).toBe(7)
    for (const el of animated) {
      expect(
        el instanceof (doc.defaultView ?? window).HTMLElement || el.tagName.toLowerCase() === 'div',
        `<${el.tagName.toLowerCase()}> carries ${el.className}`,
      ).toBe(true)
    }
  })

  it('has no .bl-static freeze path (the art keeps animating through warm-up)', () => {
    expect(html.includes('bl-static')).toBe(false)
  })

  it('still renders the line-art SVG content inside the animated layers', () => {
    const loader = doc.querySelector('#boot-loader')
    expect(loader).not.toBeNull()
    expect((loader as Element).querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
