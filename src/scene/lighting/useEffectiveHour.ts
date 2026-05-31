import { useEffect, useState } from 'react'
import { useStore } from '../../state/store'

/** Fractional hour-of-day for a Date. */
export function hoursFromDate(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

/** Returns the current "effective" hour ∈ [0, 24).
 *
 *  - `manual` mode: returns `manualHour` directly.
 *  - `system` mode: reads `new Date()` on mount and re-reads every 60 s,
 *    triggering a re-render. Sub-minute accuracy is unnecessary because
 *    the lighting tween smooths visible jumps. */
export function useEffectiveHour(): number {
  const timeMode = useStore((s) => s.timeMode)
  const manualHour = useStore((s) => s.manualHour)
  const [systemHour, setSystemHour] = useState(() => hoursFromDate(new Date()))

  useEffect(() => {
    if (timeMode !== 'system') return
    setSystemHour(hoursFromDate(new Date()))
    const id = setInterval(() => {
      setSystemHour(hoursFromDate(new Date()))
    }, 60_000)
    return () => clearInterval(id)
  }, [timeMode])

  return timeMode === 'system' ? systemHour : manualHour
}
