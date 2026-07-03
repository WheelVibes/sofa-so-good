// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetModalGuardForTests } from '../../controls/modalGuard'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { LayersPanel } from './LayersPanel'

describe('P22 layers row truncation affordance', () => {
  beforeEach(() => {
    useStore.setState({
      items: [{ id: 'i1', defId: 'sofa-2seat', position: [0, 0], rotation: 0, props: {} } as never],
    })
  })
  it('gives each .lyr-nm a title so the full label is hover-recoverable', () => {
    const { container } = render(<LayersPanel />)
    const nm = container.querySelector('.lyr-nm') as HTMLElement
    expect(nm).not.toBeNull()
    expect(nm.getAttribute('title')).toBe(nm.textContent)
  })
})

describe('P22 modal title truncation affordance', () => {
  beforeEach(() => resetModalGuardForTests())
  it('gives .panel-title a title attribute matching the string title prop', () => {
    render(
      <Modal open onClose={() => {}} title="A very long modal heading">
        <p>body</p>
      </Modal>,
    )
    const el = screen.getByRole('dialog').querySelector('.panel-title') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('title')).toBe('A very long modal heading')
  })
})
