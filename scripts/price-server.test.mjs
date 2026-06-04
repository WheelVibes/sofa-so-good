import { describe, expect, it } from 'vitest'
import { parseSikResponse, sikUrl } from './price-server.mjs'

// Trimmed shape of a real IKEA SIK search-result-page response.
const sample = {
  searchResultPage: {
    products: {
      main: {
        items: [
          {
            product: {
              name: 'BILLY',
              typeName: 'Bookcase',
              salesPrice: { currencyCode: 'SGD', numeral: 89 },
              pipUrl: 'https://www.ikea.com/sg/en/p/billy-bookcase-white-00522047/',
              mainImageUrl: 'https://www.ikea.com/sg/en/images/products/billy.jpg',
            },
          },
        ],
      },
    },
  },
}

describe('parseSikResponse', () => {
  it('extracts the first product price, title, url and image', () => {
    const r = parseSikResponse(sample)
    expect(r).toEqual({
      price: 89,
      currency: 'SGD',
      url: 'https://www.ikea.com/sg/en/p/billy-bookcase-white-00522047/',
      title: 'BILLY Bookcase',
      retailer: 'ikea-sg',
      image: 'https://www.ikea.com/sg/en/images/products/billy.jpg',
    })
  })

  it('skips items without a usable numeric price', () => {
    const r = parseSikResponse({
      searchResultPage: {
        products: {
          main: {
            items: [
              { product: { name: 'NoPrice', salesPrice: {} } },
              {
                product: {
                  name: 'SÖDERHAMN',
                  typeName: 'Sofa',
                  salesPrice: { numeral: 1299, currencyCode: 'SGD' },
                },
              },
            ],
          },
        },
      },
    })
    expect(r?.price).toBe(1299)
    expect(r?.title).toBe('SÖDERHAMN Sofa')
  })

  it('returns null for an empty / malformed response', () => {
    expect(parseSikResponse({})).toBeNull()
    expect(parseSikResponse({ searchResultPage: { products: { main: { items: [] } } } })).toBeNull()
  })
})

describe('sikUrl', () => {
  it('encodes the query and includes the required API params', () => {
    const u = sikUrl('billy bookcase')
    expect(u).toContain('q=billy%20bookcase')
    expect(u).toContain('types=PRODUCT')
    expect(u).toContain('/sg/en/search-result-page')
  })
})
