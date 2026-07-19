// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlanLevel } from '../../../../floorplan/levels'
import type { PlanOpening, PlanWall } from '../../../../floorplan/types'
import { OpeningInspector } from './OpeningInspector'

const wall: PlanWall = {
  id: 'w1',
  start: [0, 0],
  end: [4, 0],
  thickness: 'external',
}

const level: PlanLevel = {
  id: 'ground',
  name: 'Ground',
  elevation: 0,
  walls: [wall],
  openings: [],
  rooms: [],
}

const doorOpening: PlanOpening = {
  id: 'd1',
  kind: 'door',
  wallId: 'w1',
  offset: 1,
  width: 0.9,
  sill: 0,
  head: 2,
}

const windowOpening: PlanOpening = {
  id: 'win1',
  kind: 'window',
  wallId: 'w1',
  offset: 1,
  width: 1.2,
  sill: 0.9,
  head: 2.1,
}

describe('OpeningInspector — Style select options (openingStyles)', () => {
  it('lists Bifold alongside the other door styles for a door opening', () => {
    render(<OpeningInspector opening={doorOpening} level={level} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Style' }))
    expect(screen.getByRole('option', { name: 'Panelled' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Flush' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Glazed' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bifold' })).toBeInTheDocument()
  })

  it('lists Invisible grille alongside the other window styles for a window opening', () => {
    render(<OpeningInspector opening={windowOpening} level={level} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Style' }))
    expect(screen.getByRole('option', { name: 'Plain glass' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Safety grille' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Invisible grille' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Louvre' })).toBeInTheDocument()
  })
})

describe('OpeningInspector — Material select (door leaf finish)', () => {
  it('shows the Material select for a door, defaulting to Painted', () => {
    render(<OpeningInspector opening={doorOpening} level={level} />)
    expect(screen.getByRole('combobox', { name: 'Material' })).toHaveTextContent('Painted')
    fireEvent.click(screen.getByRole('combobox', { name: 'Material' }))
    expect(screen.getByRole('option', { name: 'Painted' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Timber / wood grain' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Vinyl / PVC laminate' })).toBeInTheDocument()
  })

  it('defaults a bifold door to Vinyl (the SG toilet-door standard)', () => {
    render(<OpeningInspector opening={{ ...doorOpening, style: 'bifold' }} level={level} />)
    expect(screen.getByRole('combobox', { name: 'Material' })).toHaveTextContent(
      'Vinyl / PVC laminate',
    )
  })

  it('has no Material select for a window opening', () => {
    render(<OpeningInspector opening={windowOpening} level={level} />)
    expect(screen.queryByRole('combobox', { name: 'Material' })).not.toBeInTheDocument()
  })
})
