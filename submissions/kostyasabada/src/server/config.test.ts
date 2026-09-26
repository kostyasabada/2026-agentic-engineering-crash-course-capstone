import { describe, expect, it } from 'vitest'
import { ConfigError, hostForUrl, parseConfig } from './config'

describe('parseConfig', () => {
  it('uses the defaults when nothing is set', () => {
    expect(parseConfig({})).toEqual({
      port: 3000,
      host: '127.0.0.1',
      dbPath: 'data/chat.sqlite',
    })
  })

  it('treats empty values as unset', () => {
    expect(parseConfig({ PORT: '', HOST: '', CHAT_DB_PATH: '' })).toEqual({
      port: 3000,
      host: '127.0.0.1',
      dbPath: 'data/chat.sqlite',
    })
  })

  it('reads PORT, HOST, and CHAT_DB_PATH', () => {
    expect(
      parseConfig({ PORT: '4123', HOST: 'localhost', CHAT_DB_PATH: '/tmp/x/chat.sqlite' }),
    ).toEqual({ port: 4123, host: 'localhost', dbPath: '/tmp/x/chat.sqlite' })
  })

  it('accepts the port range limits', () => {
    expect(parseConfig({ PORT: '1' }).port).toBe(1)
    expect(parseConfig({ PORT: '65535' }).port).toBe(65535)
  })

  it.each(['abc', '0', '65536', '-1', '3000.5', '3e3', ' 3000', '3000abc', '0x10'])(
    'rejects invalid PORT %j',
    (value) => {
      expect(() => parseConfig({ PORT: value })).toThrow(ConfigError)
      expect(() => parseConfig({ PORT: value })).toThrow(/PORT/)
    },
  )

  it('accepts IPv6 literals with or without brackets and stores them unbracketed', () => {
    expect(parseConfig({ HOST: '::1' }).host).toBe('::1')
    expect(parseConfig({ HOST: '[::1]' }).host).toBe('::1')
    expect(parseConfig({ HOST: '::' }).host).toBe('::')
    expect(parseConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })

  it.each([':::1', '[::1', 'localhost:3000', 'evil.example/x', 'a b', 'user@host', '[localhost]'])(
    'rejects invalid HOST %j',
    (value) => {
      expect(() => parseConfig({ HOST: value })).toThrow(ConfigError)
      expect(() => parseConfig({ HOST: value })).toThrow(/HOST/)
    },
  )
})

describe('hostForUrl', () => {
  it('brackets IPv6 literals so that the result can be used in a URL', () => {
    expect(hostForUrl('::1')).toBe('[::1]')
    expect(new URL(`http://${hostForUrl('::1')}:3000/`).host).toBe('[::1]:3000')
  })

  it('leaves host names and IPv4 addresses unchanged', () => {
    expect(hostForUrl('localhost')).toBe('localhost')
    expect(hostForUrl('127.0.0.1')).toBe('127.0.0.1')
  })
})
