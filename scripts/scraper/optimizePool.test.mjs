import { describe, expect, it } from 'vitest'
import { createOptimizePool } from './optimizePool.mjs'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('createOptimizePool', () => {
  it('never runs more than `concurrency` jobs at once', async () => {
    let active = 0,
      maxActive = 0
    const run = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await tick()
      active--
    }
    const pool = createOptimizePool({ concurrency: 2, run })
    for (let i = 0; i < 6; i++) pool.submit(`f${i}.glb`)
    await pool.drain()
    expect(maxActive).toBe(2)
  })

  it('isolates failures — one rejecting job does not stop the rest', async () => {
    const done = []
    const run = async (f) => {
      await tick()
      if (f === 'bad.glb') throw new Error('boom')
      done.push(f)
    }
    const failed = []
    const pool = createOptimizePool({
      concurrency: 2,
      run,
      onError: (f) => failed.push(f),
    })
    for (const f of ['a.glb', 'bad.glb', 'c.glb']) pool.submit(f)
    await pool.drain()
    expect(done.sort()).toEqual(['a.glb', 'c.glb'])
    expect(failed).toEqual(['bad.glb'])
  })

  it('reports phase transitions via onPhase', async () => {
    const phases = []
    const pool = createOptimizePool({
      concurrency: 1,
      run: async () => {},
      onPhase: (f, phase) => phases.push([f, phase]),
    })
    pool.submit('x.glb')
    await pool.drain()
    expect(phases).toEqual([
      ['x.glb', 'optimizing'],
      ['x.glb', 'done'],
    ])
  })
})
