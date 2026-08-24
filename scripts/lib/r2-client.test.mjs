import { describe, expect, it } from 'vitest'
import { parseRcloneRemote } from './r2-client.mjs'

const CONF = `[other]
type = s3
access_key_id = OTHERKEY
secret_access_key = othersecret

[sofa-r2]
type = s3
provider = Cloudflare
access_key_id = AKIAEXAMPLE
secret_access_key = shhh
endpoint = https://abc123.r2.cloudflarestorage.com
acl = private
no_check_bucket = true

[trailing]
type = local
`

describe('parseRcloneRemote', () => {
  it('reads only the requested remote, not its neighbours', () => {
    const conf = parseRcloneRemote(CONF, 'sofa-r2')
    expect(conf).toMatchObject({
      access_key_id: 'AKIAEXAMPLE',
      secret_access_key: 'shhh',
      endpoint: 'https://abc123.r2.cloudflarestorage.com',
    })
    expect(conf.no_check_bucket).toBe('true')
  })

  it('stops at the next section header', () => {
    expect(parseRcloneRemote(CONF, 'sofa-r2').type).toBe('s3')
    expect(parseRcloneRemote(CONF, 'other').access_key_id).toBe('OTHERKEY')
  })

  it('returns null for a remote that is not configured', () => {
    expect(parseRcloneRemote(CONF, 'missing')).toBeNull()
  })

  it('does not match a remote whose name is a prefix of another', () => {
    expect(parseRcloneRemote(CONF, 'sofa')).toBeNull()
  })
})
