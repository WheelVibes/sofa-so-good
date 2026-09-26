import {
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Scene,
  type WebGLRenderer,
} from 'three'
import { describe, expect, it } from 'vitest'
import { markGlazing } from '../apartment/walls/wallReveal'
import { glazingSitsOut, installGlazingOpaque, type TransparencyAwarePass } from './aoGlazingOpaque'

const pane = (opacity: number) => {
  const m = new Mesh(
    new PlaneGeometry(),
    new MeshPhysicalMaterial({ transparent: true, opacity, transmission: 0.99 }),
  )
  m.userData = markGlazing()
  return m
}

describe('glazingSitsOut', () => {
  it('takes full-opacity glazing out of the redraw', () => {
    expect(glazingSitsOut(pane(1))).toBe(true)
  })

  it('keeps a pane that is see-through in alpha (fading with its wall, or a non-transmission tier)', () => {
    expect(glazingSitsOut(pane(0.4))).toBe(false)
  })

  it('leaves everything that is not glazing alone', () => {
    const shade = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ transparent: true }))
    expect(glazingSitsOut(shade)).toBe(false)
  })
})

describe('installGlazingOpaque', () => {
  it('marks glass only for the duration of renderTransparency, then restores the pass', () => {
    const scene = new Scene()
    const glass = pane(1)
    const fading = pane(0.5)
    scene.add(glass, fading)
    const seen: boolean[][] = []
    const pass: TransparencyAwarePass = {
      scene,
      renderTransparency: () => {
        seen.push([glass.userData.treatAsOpaque === true, fading.userData.treatAsOpaque === true])
      },
    }
    const own = pass.renderTransparency
    const uninstall = installGlazingOpaque(pass)
    pass.renderTransparency({} as WebGLRenderer)
    expect(seen).toEqual([[true, false]])
    expect(glass.userData.treatAsOpaque).toBeUndefined()
    uninstall()
    expect(pass.renderTransparency).toBe(own)
  })

  it('installing twice still unwinds to the prototype method in one uninstall', () => {
    class Pass {
      scene = new Scene()
      renderTransparency(_r: WebGLRenderer) {}
    }
    const pass = new Pass()
    installGlazingOpaque(pass)
    const uninstall = installGlazingOpaque(pass)
    expect(Object.hasOwn(pass, 'renderTransparency')).toBe(true)
    uninstall()
    expect(Object.hasOwn(pass, 'renderTransparency')).toBe(false)
    expect(pass.renderTransparency).toBe(Pass.prototype.renderTransparency)
  })

  it('restores the marks even if the redraw throws', () => {
    const scene = new Scene()
    const glass = pane(1)
    scene.add(glass)
    const pass: TransparencyAwarePass = {
      scene,
      renderTransparency: () => {
        throw new Error('boom')
      },
    }
    installGlazingOpaque(pass)
    expect(() => pass.renderTransparency({} as WebGLRenderer)).toThrow('boom')
    expect(glass.userData.treatAsOpaque).toBeUndefined()
  })
})
