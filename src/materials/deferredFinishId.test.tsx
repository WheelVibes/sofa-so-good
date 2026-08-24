// @vitest-environment happy-dom
/**
 * FINISH-DEFER regression: applying a PHOTO finish must not blank the surface
 * while its textures load.
 *
 * A `textured` def suspends on first use (drei `useTexture`), and every
 * wall/floor/ceiling surface renders inside `<Suspense fallback={null}>` — so a
 * synchronous finish change unmounted the surface for the whole load (measured
 * ~12 s for a 1K ambientCG scan, 5 maps), exposing the bare structural wall body.
 * That is the "photo wall finishes render flat grey at the Performance tier"
 * report: no tier involved, just an unpainted hole until the textures landed.
 *
 * The DOM stand-ins below mirror the real dispatch shape (`useMaterialDef(
 * useDeferredFinishId(id))` inside a nulled Suspense boundary) without needing a
 * WebGL canvas — the assertion is about React's stale-while-suspended behaviour,
 * which is identical for a `<mesh>` and a `<div>`.
 */
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDeferredFinishId } from './useMaterial'

/** A finish whose "textures" resolve only when we say so. */
function makeSlowFinish(id: string) {
  let resolve = () => {}
  const promise = new Promise<void>((r) => {
    resolve = () => r()
  })
  let loaded = false
  void promise.then(() => {
    loaded = true
  })
  return {
    id,
    /** Suspends like `useTexturedMaterial` until the channels are decoded. */
    read() {
      if (!loaded) throw promise
    },
    async finish() {
      resolve()
      await promise
    },
  }
}

let slow = makeSlowFinish('photo-brick')

afterEach(() => {
  slow = makeSlowFinish('photo-brick')
})

/** Stands in for the textured/solid material branches of a surface dispatch. */
function Surface({ finishId }: { finishId: string }) {
  if (finishId === slow.id) slow.read()
  return <div data-testid="surface">{finishId}</div>
}

/** The real render-path shape: deferred id, resolved inside the boundary. */
function DeferredSurface({ finishId }: { finishId: string }) {
  const deferred = useDeferredFinishId(finishId)
  return (
    <Suspense fallback={<div data-testid="blank">blank</div>}>
      <Surface finishId={deferred} />
    </Suspense>
  )
}

/** The pre-fix shape, kept as the control. */
function EagerSurface({ finishId }: { finishId: string }) {
  return (
    <Suspense fallback={<div data-testid="blank">blank</div>}>
      <Surface finishId={finishId} />
    </Suspense>
  )
}

describe('useDeferredFinishId', () => {
  it('keeps the current finish on screen while a photo finish loads', async () => {
    const view = render(<DeferredSurface finishId="wall-paint-white" />)
    expect(screen.getByTestId('surface').textContent).toBe('wall-paint-white')

    view.rerender(<DeferredSurface finishId={slow.id} />)
    // Still painted with the OLD finish, and still SHOWN — the surface is never
    // hidden (`display:none` here is R3F's `visible = false` in the scene, the
    // exact state the audit found on 96 of 130 wall faces).
    expect(screen.getByTestId('surface').textContent).toBe('wall-paint-white')
    expect(screen.getByTestId('surface').style.display).not.toBe('none')
    expect(screen.queryByTestId('blank')).toBeNull()

    await slow.finish()
    view.rerender(<DeferredSurface finishId={slow.id} />)
    expect(screen.getByTestId('surface').textContent).toBe(slow.id)
  })

  it('control: an eagerly-resolved id blanks the surface for the whole load', () => {
    const view = render(<EagerSurface finishId="wall-paint-white" />)
    expect(screen.getByTestId('surface').textContent).toBe('wall-paint-white')

    view.rerender(<EagerSurface finishId={slow.id} />)
    // React hides the committed subtree and shows the (null) fallback — in the
    // scene that is `visible = false` on the wall face, i.e. an unpainted hole
    // where the bare structural body shows through.
    expect(screen.getByTestId('surface').style.display).toBe('none')
    expect(screen.getByTestId('blank')).toBeTruthy()
  })

  it('passes a null finish (no finish set) straight through', () => {
    function Probe({ id }: { id: string | null }) {
      return <div data-testid="probe">{String(useDeferredFinishId(id))}</div>
    }
    render(<Probe id={null} />)
    expect(screen.getByTestId('probe').textContent).toBe('null')
  })
})
