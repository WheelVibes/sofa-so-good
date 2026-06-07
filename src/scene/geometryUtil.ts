import { useEffect, useRef } from 'react'
import { BoxGeometry, type BufferGeometry, EdgesGeometry } from 'three'

/** Anything with a GPU `dispose()` (geometry / material / texture). */
interface Disposable {
  dispose(): void
}

/**
 * Dispose a set of `new`-created GPU objects (geometries, materials, textures)
 * when the component unmounts. For objects passed to a mesh via `geometry=` /
 * `material=` props — R3F does NOT own those, so without this they leak when the
 * component unmounts (e.g. swapping scene backdrops). Pass memoised objects
 * (stable for the component's life); the latest set is disposed on unmount.
 */
export function useDisposeOnUnmount(objects: Array<Disposable | null | undefined>): void {
  const ref = useRef(objects)
  ref.current = objects
  useEffect(
    () => () => {
      for (const o of ref.current) o?.dispose()
    },
    [],
  )
}

/**
 * Build an `EdgesGeometry` for a box and dispose the throw-away source
 * `BoxGeometry` immediately — `EdgesGeometry` copies the edge lines it needs, so
 * keeping the box around just leaks a GPU buffer. Callers still own the returned
 * geometry's lifecycle (see {@link useDisposeGeometry}).
 */
export function boxEdges(w: number, h: number, d: number): EdgesGeometry {
  const box = new BoxGeometry(w, h, d)
  const edges = new EdgesGeometry(box)
  box.dispose()
  return edges
}

/**
 * Dispose a memoised geometry when it is replaced (deps change) or the component
 * unmounts. Pairs with a `useMemo` that `new`s a geometry per size/shape so the
 * old buffer never leaks — geometries built in JSX (`<boxGeometry/>`) are
 * auto-disposed by R3F, but ones created with `new` are not.
 */
export function useDisposeGeometry(geometry: BufferGeometry | null | undefined): void {
  useEffect(() => () => geometry?.dispose(), [geometry])
}
