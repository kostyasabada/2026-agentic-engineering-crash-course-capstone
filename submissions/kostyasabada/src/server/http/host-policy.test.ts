import { describe, expect, it } from 'vitest'
import { parseConfig } from '../config'
import { createHostPolicy, normalizeHost } from './host-policy'

/** Policy for the given environment, parsed by the real config module (HOST/PORT normalization). */
function policyFor(env: Record<string, string> = {}) {
  return createHostPolicy(parseConfig(env))
}

describe('allowlist construction', () => {
  it('allows localhost, 127.0.0.1, and [::1] on the configured port by default (HOST=127.0.0.1)', () => {
    const policy = policyFor()
    expect([...policy.allowedHosts].sort()).toEqual(['127.0.0.1:3000', '[::1]:3000', 'localhost:3000'])
    expect([...policy.allowedOrigins].sort()).toEqual([
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://localhost:3000',
    ])
  })

  it('adds a non-wildcard HOST on the configured port', () => {
    const policy = policyFor({ HOST: 'chat.local', PORT: '4000' })
    expect([...policy.allowedHosts].sort()).toEqual([
      '127.0.0.1:4000',
      '[::1]:4000',
      'chat.local:4000',
      'localhost:4000',
    ])
    expect(policy.allowedOrigins.has('http://chat.local:4000')).toBe(true)
    expect(policy.isAllowedHost('chat.local:4000')).toBe(true)
    expect(policy.isAllowedOrigin('http://chat.local:4000')).toBe(true)
  })

  it('adds a LAN IPv4 HOST, which is then trusted (accepted residual risk)', () => {
    const policy = policyFor({ HOST: '192.168.1.20' })
    expect(policy.isAllowedHost('192.168.1.20:3000')).toBe(true)
    expect(policy.isAllowedHost('192.168.1.21:3000')).toBe(false)
  })

  it('normalizes an uppercase HOST to lowercase', () => {
    const policy = policyFor({ HOST: 'Chat.LOCAL' })
    expect(policy.allowedHosts.has('chat.local:3000')).toBe(true)
    expect(policy.isAllowedHost('CHAT.local:3000')).toBe(true)
  })

  it('adds an IPv6 HOST given unbracketed or bracketed (config strips brackets; the policy re-adds them)', () => {
    for (const HOST of ['2001:db8::1', '[2001:db8::1]', '2001:DB8:0:0:0:0:0:1']) {
      const policy = policyFor({ HOST })
      expect(policy.allowedHosts.has('[2001:db8::1]:3000')).toBe(true)
      expect(policy.allowedOrigins.has('http://[2001:db8::1]:3000')).toBe(true)
      expect(policy.allowedHosts.size).toBe(4)
    }
  })

  it('does not duplicate an entry when HOST is one of the default hosts', () => {
    for (const HOST of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) {
      expect(policyFor({ HOST }).allowedHosts.size).toBe(3)
    }
  })

  it.each(['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0', '0', '::ffff:0.0.0.0', '[::ffff:0:0]', '::FFFF:0:0'])(
    'adds nothing for the wildcard HOST %j',
    (HOST) => {
      const policy = policyFor({ HOST })
      expect([...policy.allowedHosts].sort()).toEqual(['127.0.0.1:3000', '[::1]:3000', 'localhost:3000'])
      expect(policy.isAllowedHost('0.0.0.0:3000')).toBe(false)
      expect(policy.isAllowedHost('[::]:3000')).toBe(false)
      expect(policy.isAllowedOrigin('http://0.0.0.0:3000')).toBe(false)
      expect(policy.isAllowedOrigin('http://[::]:3000')).toBe(false)
      expect(policy.isAllowedHost('[::ffff:0:0]:3000')).toBe(false)
      // A LAN address is not trusted with a wildcard HOST.
      expect(policy.isAllowedHost('192.168.1.20:3000')).toBe(false)
      // The own hosts still work.
      expect(policy.isAllowedHost('localhost:3000')).toBe(true)
      expect(policy.isAllowedHost('127.0.0.1:3000')).toBe(true)
      expect(policy.isAllowedHost('[::1]:3000')).toBe(true)
    },
  )

  it('omits the default port 80 from entries (PORT=80)', () => {
    const policy = policyFor({ PORT: '80' })
    expect([...policy.allowedHosts].sort()).toEqual(['127.0.0.1', '[::1]', 'localhost'])
    expect([...policy.allowedOrigins].sort()).toEqual(['http://127.0.0.1', 'http://[::1]', 'http://localhost'])
  })

  it('throws for a configured host that cannot be normalized', () => {
    expect(() => createHostPolicy({ host: 'bad host', port: 3000 })).toThrow(/host/i)
  })
})

describe('normalizeHost', () => {
  it.each([
    ['localhost:3000', 'localhost:3000'],
    ['LOCALHOST:3000', 'localhost:3000'],
    ['LocalHost:3000', 'localhost:3000'],
    ['127.0.0.1:3000', '127.0.0.1:3000'],
    ['[::1]:3000', '[::1]:3000'],
    ['[0:0:0:0:0:0:0:1]:3000', '[::1]:3000'],
    ['localhost:80', 'localhost'],
    ['localhost', 'localhost'],
    ['localhost:03000', 'localhost:3000'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    3000,
    ['localhost:3000'],
    'evil@localhost:3000',
    'user:pw@localhost:3000',
    'localhost:3000/x',
    'localhost:3000/',
    'localhost:3000?x',
    'localhost:3000?',
    'localhost:3000#x',
    'localhost:3000#',
    'localhost:3000\\x',
    'http://localhost:3000',
    ' localhost:3000',
    'localhost:3000 ',
    'localhost :3000',
    'local host:3000',
    'localhost:',
    'localhost:99999',
    'localhost:3000:3000',
    '::1:3000',
    '[::1',
    '[::1]x',
    'local%68ost:3000',
    'bad_host:3000',
    '[',
    ':3000',
  ])('rejects %j', (input) => {
    expect(normalizeHost(input)).toBeNull()
  })
})

describe('isAllowedHost', () => {
  const policy = policyFor()

  it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000', '[0:0:0:0:0:0:0:1]:3000'])(
    'accepts %j',
    (value) => {
      expect(policy.isAllowedHost(value)).toBe(true)
    },
  )

  it.each([
    null,
    undefined,
    '',
    'null',
    'evil.example:3000',
    'EVIL.example:3000',
    'localhost',
    'localhost:3001',
    'localhost:80',
    '0.0.0.0:3000',
    'evil@localhost:3000',
    'localhost:3000@evil.example',
    'localhost:3000/x',
    'localhost:3000?x',
    'localhost:3000#x',
    'localhost.:3000',
    'not a host',
    'http://localhost:3000',
    42,
  ])('rejects %j', (value) => {
    expect(policy.isAllowedHost(value)).toBe(false)
  })

  it('compares with PORT=80 in normalized form', () => {
    const port80 = policyFor({ PORT: '80' })
    expect(port80.isAllowedHost('localhost:80')).toBe(true)
    expect(port80.isAllowedHost('localhost')).toBe(true)
    expect(port80.isAllowedHost('LOCALHOST')).toBe(true)
    expect(port80.isAllowedHost('[::1]:80')).toBe(true)
    expect(port80.isAllowedHost('localhost:3000')).toBe(false)
  })
})

describe('IPv4 shorthand (user decision 2026-09-28)', () => {
  const policy = policyFor()

  it.each(['127.1:3000', '0x7f.1:3000', '2130706433:3000', '0177.0.0.1:3000'])(
    'accepts the loopback shorthand Host %j as 127.0.0.1:3000',
    (value) => {
      expect(normalizeHost(value)).toBe('127.0.0.1:3000')
      expect(policy.isAllowedHost(value)).toBe(true)
    },
  )

  it('accepts the loopback shorthand Origin http://127.1:3000', () => {
    expect(policy.isAllowedOrigin('http://127.1:3000')).toBe(true)
  })

  it('does not accept a shorthand for a non-loopback address', () => {
    expect(policy.isAllowedHost('127.2:3000')).toBe(false)
  })
})

describe('isAllowedOrigin', () => {
  const policy = policyFor()

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://LOCALHOST:3000',
    'HTTP://localhost:3000',
  ])('accepts %j', (value) => {
    expect(policy.isAllowedOrigin(value)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    'null',
    'http://evil.example',
    'http://evil.example:3000',
    'https://localhost:3000',
    'ws://localhost:3000',
    'http://localhost',
    'http://localhost:3001',
    'localhost:3000',
    'http://',
    'http:/localhost:3000',
    'http://localhost:3000/',
    'http://localhost:3000/x',
    'http://localhost:3000?x',
    'http://localhost:3000#x',
    'http://evil@localhost:3000',
    'http://localhost:3000@evil.example',
    'http://0.0.0.0:3000',
    'not a url',
    '%%%',
    'http://[::1',
    42,
    {},
  ])('rejects %j', (value) => {
    expect(policy.isAllowedOrigin(value)).toBe(false)
  })

  it('compares with PORT=80 in normalized form', () => {
    const port80 = policyFor({ PORT: '80' })
    expect(port80.isAllowedOrigin('http://localhost')).toBe(true)
    expect(port80.isAllowedOrigin('http://localhost:80')).toBe(true)
    expect(port80.isAllowedOrigin('http://localhost:3000')).toBe(false)
  })
})
