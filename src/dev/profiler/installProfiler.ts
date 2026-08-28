import { useStore } from '../../state/store'
import { profilerBridge } from './profilerBridge'
import { getObjectBreakdown, runCostBreakdown } from './profilerEngine'
import type { ProfilerApi } from './profilerTypes'

/** Expose the profiler API on `window.__profiler` so the detached window
 *  (a separate module realm) can reach the parent's singletons. Dev-only. */
export function installProfilerApi(): void {
  const apiObj: ProfilerApi = {
    subscribe: (cb) => profilerBridge.subscribe(cb),
    getSnapshot: () => profilerBridge.getSnapshot(),
    runCostBreakdown: (onProgress, opts) => runCostBreakdown(onProgress, opts),
    getObjectBreakdown: () => getObjectBreakdown(),
    selectItem: (id) => useStore.getState().selectItem(id),
  }
  ;(window as unknown as { __profiler?: ProfilerApi }).__profiler = apiObj
}
