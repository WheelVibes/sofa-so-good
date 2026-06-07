import { describe, expect, it } from 'vitest'
import { isLightingSceneActive, LIGHTING_SCENES, lightingSceneState } from './lightingScenes'

describe('lighting scenes', () => {
  it('each scene maps to a manual-time + lights patch', () => {
    for (const sc of LIGHTING_SCENES) {
      const st = lightingSceneState(sc)
      expect(st.timeMode).toBe('manual')
      expect(st.manualHour).toBe(sc.hour)
      expect(st.lightsMode).toBe(sc.lights)
    }
  })

  it('isLightingSceneActive matches only when time + lights agree', () => {
    const sc = LIGHTING_SCENES[2] // cosy: hour 20.5, lights 'on'
    expect(
      isLightingSceneActive(sc, { timeMode: 'manual', manualHour: 20.5, lightsMode: 'on' }),
    ).toBe(true)
    expect(
      isLightingSceneActive(sc, { timeMode: 'manual', manualHour: 20.5, lightsMode: 'off' }),
    ).toBe(false)
    expect(
      isLightingSceneActive(sc, { timeMode: 'manual', manualHour: 13, lightsMode: 'on' }),
    ).toBe(false)
    expect(
      isLightingSceneActive(sc, { timeMode: 'system', manualHour: 20.5, lightsMode: 'on' }),
    ).toBe(false)
  })

  it('has stable unique ids', () => {
    const ids = LIGHTING_SCENES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
