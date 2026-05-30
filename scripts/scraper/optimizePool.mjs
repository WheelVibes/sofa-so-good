/** A bounded-concurrency job pool. `run(item)` does the work (async). Jobs are
 *  submitted as they arrive (overlapping producer); `drain()` resolves when the
 *  queue is empty and all in-flight jobs settle. Failures are isolated:
 *  `onError(item, err)` is called and the pool keeps going. `onPhase(item,
 *  phase)` fires 'optimizing' at start and 'done' on success. */
export function createOptimizePool({ concurrency = 3, run, onError, onPhase }) {
  const queue = [];
  let active = 0;
  let drainResolvers = [];

  function maybeDrained() {
    if (active === 0 && queue.length === 0) {
      drainResolvers.forEach((r) => r());
      drainResolvers = [];
    }
  }

  function pump() {
    while (active < concurrency && queue.length > 0) {
      const item = queue.shift();
      active++;
      onPhase?.(item, 'optimizing');
      Promise.resolve(run(item))
        .then(() => onPhase?.(item, 'done'))
        .catch((err) => onError?.(item, err))
        .finally(() => {
          active--;
          pump();
          maybeDrained();
        });
    }
  }

  return {
    submit(item) {
      queue.push(item);
      pump();
    },
    drain() {
      return new Promise((resolve) => {
        drainResolvers.push(resolve);
        maybeDrained();
      });
    },
  };
}
