import { describe, expect, it } from 'vitest'
import {
  assembleEquirect,
  dirFromEquirect,
  FACES,
  type FaceName,
  type PixelGrid,
  sampleForDir,
} from './equirect'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe('dirFromEquirect', () => {
  it('maps the image centre to the camera forward (-Z)', () => {
    const [x, y, z] = dirFromEquirect(0.5, 0.5)
    close(x, 0)
    close(y, 0)
    close(z, -1)
  })
  it('maps poles and cardinal longitudes correctly', () => {
    close(dirFromEquirect(0.5, 0)[1], 1) // top row → zenith
    close(dirFromEquirect(0.5, 1)[1], -1) // bottom row → nadir
    const right = dirFromEquirect(0.75, 0.5) // quarter turn right of forward
    close(right[0], 1)
    close(right[2], 0)
    const back = dirFromEquirect(0, 0.5)
    close(back[2], 1)
  })
})

describe('sampleForDir', () => {
  it('lands each face axis on that face centre', () => {
    const expectCentre = (dir: [number, number, number], face: FaceName) => {
      const s = sampleForDir(dir)
      expect(s.face).toBe(face)
      close(s.u, 0.5)
      close(s.v, 0.5)
    }
    expectCentre([0, 0, -1], 'front')
    expectCentre([0, 0, 1], 'back')
    expectCentre([-1, 0, 0], 'left')
    expectCentre([1, 0, 0], 'right')
    expectCentre([0, 1, 0], 'up')
    expectCentre([0, -1, 0], 'down')
  })

  it('projects 45° diagonals onto face edges', () => {
    // Halfway between front and right → the front face's right edge (u=1).
    const d = Math.SQRT1_2
    const s = sampleForDir([d, 0, -d])
    expect(['front', 'right']).toContain(s.face)
    if (s.face === 'front') close(s.u, 1)
    else close(s.u, 0)
  })

  it('round-trips equirect pixels through their face projection', () => {
    // dir → face/uv → reconstructed dir must match (sanity over a grid).
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 8; j++) {
        const dir = dirFromEquirect(i / 8, j / 8)
        const s = sampleForDir(dir)
        const f = FACES.find((x) => x.name === s.face)!
        const x = s.u * 2 - 1
        const y = 1 - s.v * 2
        const rec = [
          f.forward[0] + x * f.right[0] + y * f.up[0],
          f.forward[1] + x * f.right[1] + y * f.up[1],
          f.forward[2] + x * f.right[2] + y * f.up[2],
        ]
        const len = Math.hypot(...(rec as [number, number, number]))
        close(rec[0] / len, dir[0])
        close(rec[1] / len, dir[1])
        close(rec[2] / len, dir[2])
      }
    }
  })
})

describe('assembleEquirect', () => {
  const solid = (r: number, g: number, b: number, size = 4): PixelGrid => {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = r
      data[i * 4 + 1] = g
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    }
    return { data, width: size, height: size }
  }

  it('places each solid-colour face in its equirect region', () => {
    const faces: Record<FaceName, PixelGrid> = {
      front: solid(255, 0, 0),
      back: solid(0, 255, 0),
      left: solid(0, 0, 255),
      right: solid(255, 255, 0),
      up: solid(255, 0, 255),
      down: solid(0, 255, 255),
    }
    const out = assembleEquirect(faces, 64)
    expect(out.width).toBe(64)
    expect(out.height).toBe(32)
    const px = (u: number, v: number) => {
      const x = Math.min(63, Math.floor(u * 64))
      const y = Math.min(31, Math.floor(v * 32))
      const o = (y * 64 + x) * 4
      return [out.data[o], out.data[o + 1], out.data[o + 2]]
    }
    expect(px(0.5, 0.5)).toEqual([255, 0, 0]) // centre → front
    expect(px(0.01, 0.5)).toEqual([0, 255, 0]) // wrap edge → back
    expect(px(0.25, 0.5)).toEqual([0, 0, 255]) // quarter left → left
    expect(px(0.75, 0.5)).toEqual([255, 255, 0]) // quarter right → right
    expect(px(0.5, 0.02)).toEqual([255, 0, 255]) // zenith → up
    expect(px(0.5, 0.98)).toEqual([0, 255, 255]) // nadir → down
  })
})
