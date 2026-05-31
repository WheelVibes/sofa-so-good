import { describe, expect, it } from 'vitest'
import { groupReadyUrls, parseSseData } from './ikeaLive'

describe('parseSseData', () => {
  it('extracts the JSON payload from an SSE data line', () => {
    expect(parseSseData('data: {"phase":"group_ready","group":"malm"}')).toEqual({
      phase: 'group_ready',
      group: 'malm',
    })
  })
  it('returns null for comments / non-data lines', () => {
    expect(parseSseData(': keep-alive')).toBeNull()
  })
})

describe('groupReadyUrls', () => {
  it('builds the served metadata + glb base URL for a group', () => {
    expect(groupReadyUrls('malm-bed-frame-high-90x200')).toEqual({
      metadataUrl: '/assets/ikea/malm-bed-frame-high-90x200/metadata.json',
      baseUrl: '/assets/ikea/malm-bed-frame-high-90x200',
    })
  })
})
