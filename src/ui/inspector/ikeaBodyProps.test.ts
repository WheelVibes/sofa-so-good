import { describe, expect, it } from 'vitest'
import { finishOverrideKey, variantProps } from './ikeaBodyProps'

describe('IkeaBody prop helpers', () => {
  it('variantProps sets the variant finish key', () => {
    expect(variantProps('white')).toEqual({ variant: 'white' })
  })
  it('finishOverrideKey namespaces a material name', () => {
    expect(finishOverrideKey('STEEL')).toBe('finish:STEEL')
  })
})
