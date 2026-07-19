import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseJavaProperties, parseSh3f, resolveArchivePath, Sh3fParseError } from './sh3f'

const enc = (s: string) => new TextEncoder().encode(s)

/** A minimal unit-cube OBJ — real enough to convert in a browser (the dev hook). */
const CUBE_OBJ = `# unit cube
o cube
v -0.5 0 -0.5
v 0.5 0 -0.5
v 0.5 0 0.5
v -0.5 0 0.5
v -0.5 1 -0.5
v 0.5 1 -0.5
v 0.5 1 0.5
v -0.5 1 0.5
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`

const CATALOG = `# Sweet Home 3D furniture catalog
! bang comment
name#1 = Wooden Chair
category#1 = Seats
model#1 = chair/chair.obj
icon#1 = chair/chair.png
width#1 = 58.5
depth#1 = 59
height#1 = 90.5
elevation#1 = 0
movable#1 = true
doorOrWindow#1 = false
creator#1 = eTeks

name#2 = Front Door
category#2 = Doors and windows
model#2 = door/door.3ds
width#2 = 100
depth#2 = 20
height#2 = 200
elevation#2 = 0
movable#2 = false
doorOrWindow#2 = true
`

/** Build a synthetic `.sh3f` archive (a catalog + a cube OBJ + a stub icon). */
function buildSh3fFixture(): Uint8Array {
  return zipSync({
    'PluginFurnitureCatalog.properties': enc(CATALOG),
    'chair/chair.obj': enc(CUBE_OBJ),
    'chair/chair.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    'door/door.3ds': new Uint8Array([0x4d, 0x4d, 0x00, 0x00]),
  })
}

describe('parseJavaProperties', () => {
  it('reads =, :, and whitespace separators', () => {
    const p = parseJavaProperties('a=1\nb : 2\nc   3\n')
    expect(p.get('a')).toBe('1')
    expect(p.get('b')).toBe('2')
    expect(p.get('c')).toBe('3')
  })

  it('skips # and ! comment lines and blank lines', () => {
    const p = parseJavaProperties('# comment\n\n! bang\nreal=yes\n')
    expect(p.size).toBe(1)
    expect(p.get('real')).toBe('yes')
  })

  it('decodes standard escapes and \\uXXXX', () => {
    const p = parseJavaProperties('k=a\\tb\\nc\\u00e9d\n')
    expect(p.get('k')).toBe('a\tb\ncéd')
  })

  it('honours escaped separators inside a key', () => {
    const p = parseJavaProperties('a\\:b\\=c=value\n')
    expect(p.get('a:b=c')).toBe('value')
  })

  it('joins line continuations', () => {
    const p = parseJavaProperties('long=one \\\n   two \\\n   three\n')
    expect(p.get('long')).toBe('one two three')
  })

  it('keeps #index suffixes on keys', () => {
    const p = parseJavaProperties('name#12=Chair\n')
    expect(p.get('name#12')).toBe('Chair')
  })
})

describe('parseSh3f', () => {
  it('maps entries: dims cm→m, category, flags, elevation, creator', () => {
    const result = parseSh3f(buildSh3fFixture(), 'My Library')
    expect(result.libraryName).toBe('My Library')
    expect(result.entries).toHaveLength(2)

    const chair = result.entries.find((e) => e.index === 1)!
    expect(chair.name).toBe('Wooden Chair')
    expect(chair.category).toBe('seating')
    expect(chair.width).toBeCloseTo(0.585)
    expect(chair.depth).toBeCloseTo(0.59)
    expect(chair.height).toBeCloseTo(0.905)
    expect(chair.movable).toBe(true)
    expect(chair.doorOrWindow).toBe(false)
    expect(chair.creator).toBe('eTeks')
    expect(chair.modelPath).toBe('chair/chair.obj')
    expect(chair.modelFormat).toBe('obj')

    const door = result.entries.find((e) => e.index === 2)!
    expect(door.doorOrWindow).toBe(true)
    expect(door.movable).toBe(false)
    expect(door.modelFormat).toBe('3ds')
    expect(door.rawCategory).toBe('Doors and windows')
  })

  it('flags an unknown model extension as unsupported (modelFormat null)', () => {
    const zip = zipSync({
      'PluginFurnitureCatalog.properties': enc(
        'name#1=Blob\nmodel#1=blob/blob.max\nwidth#1=50\ndepth#1=50\nheight#1=50\n',
      ),
      'blob/blob.max': new Uint8Array([1, 2, 3]),
    })
    const result = parseSh3f(zip)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.modelFormat).toBeNull()
  })

  it('warns and drops an entry with no model declared', () => {
    const zip = zipSync({
      'PluginFurnitureCatalog.properties': enc('name#1=Ghost\nwidth#1=50\n'),
    })
    expect(() => parseSh3f(zip)).toThrow(Sh3fParseError)
  })

  it('merges entries across multiple catalog files', () => {
    const zip = zipSync({
      'PluginFurnitureCatalog.properties': enc('name#1=A\nmodel#1=a.obj\n'),
      'PluginFurnitureCatalog_extra.properties': enc('name#1=B\nmodel#1=b.obj\n'),
      'a.obj': enc(CUBE_OBJ),
      'b.obj': enc(CUBE_OBJ),
    })
    const result = parseSh3f(zip)
    expect(result.entries.map((e) => e.name).sort()).toEqual(['A', 'B'])
  })

  it('decodes ISO-8859-1 (Latin-1) catalog bytes', () => {
    // 0xE9 is 'é' in Latin-1; a UTF-8 decode would mangle it.
    const bytes = new Uint8Array([...enc('name#1=Caf'), 0xe9, ...enc('\nmodel#1=x.obj\n')])
    const zip = zipSync({ 'PluginFurnitureCatalog.properties': bytes, 'x.obj': enc(CUBE_OBJ) })
    const result = parseSh3f(zip)
    expect(result.entries[0]!.name).toBe('Café')
  })

  it('throws on a non-zip input', () => {
    expect(() => parseSh3f(new Uint8Array([1, 2, 3, 4]))).toThrow(Sh3fParseError)
  })

  it('throws when the archive has no furniture catalog', () => {
    const zip = zipSync({ 'readme.txt': enc('hi') })
    expect(() => parseSh3f(zip)).toThrow(Sh3fParseError)
  })
})

describe('resolveArchivePath', () => {
  const files = {
    'chair/chair.obj': enc('a'),
    'textures/wood.jpg': enc('b'),
  }
  it('resolves an exact path', () => {
    expect(resolveArchivePath(files, 'chair/chair.obj')).toBe(files['chair/chair.obj'])
  })
  it('resolves a leading-slash path by suffix', () => {
    expect(resolveArchivePath(files, '/chair/chair.obj')).toBe(files['chair/chair.obj'])
  })
  it('resolves by basename when the prefix differs', () => {
    expect(resolveArchivePath(files, 'com/eteks/wood.jpg')).toBe(files['textures/wood.jpg'])
  })
  it('returns null when nothing matches', () => {
    expect(resolveArchivePath(files, 'missing.obj')).toBeNull()
  })
})
