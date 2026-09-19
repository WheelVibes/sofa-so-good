// @vitest-environment happy-dom
/**
 * W5 (walk-photoreal review, 2026-09-19): `showCeilingFixtures` defaults to
 * `false` (an orbit/dollhouse-editor decluttering decision that predates walk
 * mode), so `CeilingLight` returned `null` for its whole body in every room —
 * a glow with no emitter body, the "most immediately computer-graphics tell"
 * finding in the review. Fixed by also showing the body while `cameraMode`
 * is `'firstPerson'`, regardless of the toggle: a walker is standing where
 * the fixture actually is, and the ceiling glow + HUD prompt already imply
 * one exists. The orbit default (hidden) is deliberately left alone.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { CeilingLight } from './CeilingLight'

async function renderBodyMeshCount(props: ParamProps): Promise<number> {
  const renderer = await ReactThreeTestRenderer.create(<CeilingLight props={props} />)
  const meshes = renderer.scene.findAll((n) => n.type === 'Mesh')
  const count = meshes.length
  await renderer.unmount()
  return count
}

describe('CeilingLight — showCeilingFixtures / walk-mode visibility (W5)', () => {
  it('renders no body in orbit mode with the toggle at its default (off)', async () => {
    useStore.setState({ showCeilingFixtures: false, cameraMode: 'orbit' })
    expect(await renderBodyMeshCount({})).toBe(0)
  })

  it('renders the body in orbit mode once the toggle is switched on', async () => {
    useStore.setState({ showCeilingFixtures: true, cameraMode: 'orbit' })
    expect(await renderBodyMeshCount({})).toBeGreaterThan(0)
  })

  it('renders the body in walk mode even with the toggle at its default (off) — the W5 fix', async () => {
    useStore.setState({ showCeilingFixtures: false, cameraMode: 'firstPerson' })
    expect(await renderBodyMeshCount({})).toBeGreaterThan(0)
  })

  it('a pendant cluster also honours the walk-mode override', async () => {
    useStore.setState({ showCeilingFixtures: false, cameraMode: 'firstPerson' })
    expect(await renderBodyMeshCount({ arrangement: 'cluster', count: 4 })).toBeGreaterThan(0)
  })
})
