import { isIPv6 } from 'node:net'

export interface ServerConfig {
  /** TCP port, 1–65535. */
  port: number
  /** Address to listen on; IPv6 literals are stored without brackets (as `listen()` expects). */
  host: string
  /** SQLite database file path (resolved against the working directory by its user). */
  dbPath: string
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

const DEFAULTS: ServerConfig = {
  port: 3000,
  host: '127.0.0.1',
  dbPath: 'data/chat.sqlite',
}

type Env = Record<string, string | undefined>

/** Reads PORT, HOST, and CHAT_DB_PATH; unset or empty values use the defaults (design D2). */
export function parseConfig(env: Env = process.env): ServerConfig {
  return {
    port: parsePort(valueOf(env, 'PORT')),
    host: parseHost(valueOf(env, 'HOST')),
    dbPath: valueOf(env, 'CHAT_DB_PATH') ?? DEFAULTS.dbPath,
  }
}

/** Formats a configured host for use inside a URL (IPv6 literals need brackets). */
export function hostForUrl(host: string): string {
  return isIPv6(host) ? `[${host}]` : host
}

function valueOf(env: Env, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULTS.port
  const port = /^[0-9]+$/.test(value) ? Number(value) : NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Invalid PORT ${JSON.stringify(value)}: expected an integer from 1 to 65535`)
  }
  return port
}

function parseHost(value: string | undefined): string {
  if (value === undefined) return DEFAULTS.host
  const invalid = () =>
    new ConfigError(
      `Invalid HOST ${JSON.stringify(value)}: expected a host name or IP address without port or path`,
    )

  // IPv6 literal, with or without brackets (`::1`, `[::1]`, `::`).
  if (value.includes(':') || value.startsWith('[')) {
    const bare = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
    if (!isIPv6(bare)) throw invalid()
    return bare
  }

  // Host name or IPv4 address: letters, digits, dots, and hyphens only (so no port,
  // path, credentials, or whitespace), and accepted by the URL parser as a host.
  if (!/^[A-Za-z0-9.-]+$/.test(value) || !URL.canParse(`http://${value}/`)) throw invalid()
  return value
}
