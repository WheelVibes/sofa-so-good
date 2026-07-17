import { describe, expect, it } from 'vitest'
import {
  castleryUrl,
  courtsUrl,
  hipvanUrl,
  parseCastleryResponse,
  parseCourtsResponse,
  parseHipvanResponse,
  parseSikResponse,
  pickBestMatch,
  scoreNameMatch,
  sikUrl,
} from './price-server.mjs'

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

// ──────────────────────────────────────────────────────────────────────────────
// Courts / HipVan / Castlery fixtures below are BEST-EFFORT reconstructions of
// each site's plausible search-response shape, authored in an offline sandbox
// (no outbound network to the retailers). They pin the parsing/matching logic;
// a real-network verification pass of the live shapes is a deferred follow-up
// (see TODO.md). Shape drift on the real site degrades to null ('no match'),
// never a crash.
// ──────────────────────────────────────────────────────────────────────────────

describe('fuzzy top-hit matching', () => {
  it('scores exact token overlap highest, prefix overlap partially', () => {
    expect(scoreNameMatch('queen bed', 'Queen Bed Frame')).toBe(1)
    expect(scoreNameMatch('sofa', 'Sofas & Armchairs')).toBeGreaterThan(0)
    expect(scoreNameMatch('queen bed', 'Dining Table')).toBe(0)
    expect(scoreNameMatch('', 'anything')).toBe(0)
  })

  it('picks the closest-named candidate over the first one', () => {
    const best = pickBestMatch('fabric sofa', [
      { title: 'Coffee Table', price: 99 },
      { title: 'Madison Fabric Sofa', price: 1299 },
    ])
    expect(best?.title).toBe('Madison Fabric Sofa')
  })

  it('falls back to the first candidate when nothing scores, null when empty', () => {
    const best = pickBestMatch('xyzzy', [
      { title: 'First Hit', price: 10 },
      { title: 'Second Hit', price: 20 },
    ])
    expect(best?.title).toBe('First Hit')
    expect(pickBestMatch('sofa', [])).toBeNull()
    expect(pickBestMatch('sofa', undefined)).toBeNull()
  })
})

describe('parseCourtsResponse', () => {
  // Trimmed Magento GraphQL `products` search-result shape (best-effort).
  const sample = {
    data: {
      products: {
        items: [
          {
            name: 'Lyon Coffee Table',
            url_key: 'lyon-coffee-table',
            small_image: { url: 'https://www.courts.com.sg/media/lyon.jpg' },
            price_range: { minimum_price: { final_price: { value: 199, currency: 'SGD' } } },
          },
          {
            name: 'Oslo Queen Bed Frame',
            url_key: 'oslo-queen-bed-frame',
            small_image: { url: 'https://www.courts.com.sg/media/oslo.jpg' },
            price_range: { minimum_price: { final_price: { value: 599, currency: 'SGD' } } },
          },
        ],
      },
    },
  }

  it('extracts candidates and fuzzy-matches the query', () => {
    const r = parseCourtsResponse(sample, 'queen bed')
    expect(r).toEqual({
      price: 599,
      currency: 'SGD',
      url: 'https://www.courts.com.sg/oslo-queen-bed-frame.html',
      title: 'Oslo Queen Bed Frame',
      retailer: 'courts-sg',
      image: 'https://www.courts.com.sg/media/oslo.jpg',
    })
  })

  it('skips items without a usable price and survives shape drift', () => {
    const r = parseCourtsResponse(
      { data: { products: { items: [{ name: 'NoPrice' }, ...sample.data.products.items] } } },
      'coffee table',
    )
    expect(r?.price).toBe(199)
    expect(parseCourtsResponse({}, 'x')).toBeNull()
    expect(parseCourtsResponse({ data: { products: { items: [] } } }, 'x')).toBeNull()
    expect(parseCourtsResponse(null, 'x')).toBeNull()
  })
})

describe('parseHipvanResponse', () => {
  // Trimmed Algolia-style multi-index response (best-effort).
  const sample = {
    results: [
      {
        hits: [
          { name: 'Aiken Study Desk', price: 349, slug: 'aiken-study-desk', image_url: 'a.jpg' },
          { name: 'Nolan Fabric Sofa', price: 1099, slug: 'nolan-fabric-sofa' },
        ],
      },
    ],
  }

  it('extracts hits and fuzzy-matches the query', () => {
    const r = parseHipvanResponse(sample, 'fabric sofa')
    expect(r).toEqual({
      price: 1099,
      currency: 'SGD',
      url: 'https://www.hipvan.com/products/nolan-fabric-sofa',
      title: 'Nolan Fabric Sofa',
      retailer: 'hipvan-sg',
      image: null,
    })
  })

  it('accepts a flat hits array and survives shape drift', () => {
    const r = parseHipvanResponse({ hits: sample.results[0].hits }, 'study desk')
    expect(r?.title).toBe('Aiken Study Desk')
    expect(r?.image).toBe('a.jpg')
    expect(parseHipvanResponse({}, 'x')).toBeNull()
    expect(parseHipvanResponse({ results: [] }, 'x')).toBeNull()
    expect(parseHipvanResponse(undefined, 'x')).toBeNull()
  })
})

describe('parseCastleryResponse', () => {
  // Trimmed snapshot of the LIVE search page (verified 2026-07): the results are
  // rendered as a Next.js RSC payload that embeds the Algolia response, and each
  // product's price/image live on its first variant. This mirrors the real
  // `"hits":[…]` shape (minus the hundreds of unused fields per hit).
  const html = `<!doctype html><html><body><script>self.__next_f.push([1,"…\
    {"query":"sofa","page":0,"results":[{"hits":[
      {"objectID":"6609","name":"Seb Side Table","slug":"seb-side-table",
        "variants":[{"price":"269.0","list_price":"269.0",
          "images":[{"large":"https://res.cloudinary.com/castlery/seb.jpg"}]}]},
      {"objectID":"7020","name":"Adams 3 Seater Sofa","slug":"adams-sofa",
        "variants":[{"price":"2199.0","list_price":"2199.0","images":[]}]}
    ],"nbHits":2,"query":"sofa"}]}"])</script></body></html>`

  it('extracts embedded Algolia hits and fuzzy-matches the query', () => {
    const r = parseCastleryResponse(html, '3 seater sofa')
    expect(r).toEqual({
      price: 2199,
      currency: 'SGD',
      url: 'https://www.castlery.com/sg/products/adams-sofa',
      title: 'Adams 3 Seater Sofa',
      retailer: 'castlery-sg',
      image: null,
    })
  })

  it('reads the first variant price + image and skips priceless hits', () => {
    const r = parseCastleryResponse(html, 'side table')
    expect(r?.price).toBe(269)
    expect(r?.image).toBe('https://res.cloudinary.com/castlery/seb.jpg')
    const priceless = `<script>self.__next_f.push([1,"{"hits":[{"name":"No Variant"}]}"])</script>`
    expect(parseCastleryResponse(priceless, 'x')).toBeNull()
  })

  it('falls back to JSON-LD Product / @graph blocks when no hits are embedded', () => {
    const direct = `<script type="application/ld+json">{"@graph":[{"@type":"Product",
      "name":"Dawson Armchair","url":"u","offers":{"price":899,"priceCurrency":"SGD"}}]}</script>`
    expect(parseCastleryResponse(direct, 'armchair')?.price).toBe(899)
    const itemList = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","item":{"@type":"Product","name":"Nolan Sofa","url":"u2",
        "image":["n.jpg"],"offers":{"price":"1299","priceCurrency":"SGD"}}}]}</script>`
    expect(parseCastleryResponse(itemList, 'sofa')?.price).toBe(1299)
    expect(parseCastleryResponse('<html>no data</html>', 'x')).toBeNull()
    expect(parseCastleryResponse(undefined, 'x')).toBeNull()
  })
})

describe('retailer search URLs', () => {
  it('encode the query', () => {
    expect(courtsUrl('queen bed')).toContain('courts.com.sg/graphql')
    expect(courtsUrl('queen bed')).toContain(encodeURIComponent('"queen bed"'))
    expect(hipvanUrl('study desk')).toContain('q=study%20desk')
    expect(castleryUrl('sofa bed')).toContain('castlery.com/sg/search?q=sofa%20bed')
  })
})
