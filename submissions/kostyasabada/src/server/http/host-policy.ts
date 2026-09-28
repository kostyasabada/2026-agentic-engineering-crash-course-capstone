import { hostForUrl, type ServerConfig } from '../config'

/**
 * Host and Origin allowlist (design D2, Proposal P19; spec "Local host and origin
 * restriction"). Built once at startup; the composition root (task 4.2) applies it to
 * every HTTP request and upgrade (`Host`) and to the Socket.IO handshake (`Origin`).
 */
export type HostPolicy = {
  /** Normalized own hosts (`host[:port]`, lowercase, default port 80 omitted, IPv6 bracketed). */
  readonly allowedHosts: ReadonlySet<string>
  /** Normalized own origins: `http://` plus each allowed host. */
  readonly allowedOrigins: ReadonlySet<string>
  /** Whether a `Host` header value is one of the own hosts. Missing, malformed, or foreign → false. */
  isAllowedHost(value: unknown): boolean
  /**
   * Whether an `Origin` header value is one of the own origins. Missing (`undefined`),
   * `null`, the string `"null"`, malformed, non-`http`, or foreign → false. Accepting a
   * handshake without an `Origin` is the caller's decision (design D2: only after the
   * `Host` check has passed).
   */
  isAllowedOrigin(value: unknown): boolean
}

/** Hosts that are always own hosts (design D2). */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * Wildcard listen addresses in normalized form; they add no allowed host. `[::ffff:0:0]`
 * is the IPv4-mapped form of `0.0.0.0` (e.g. `HOST=::ffff:0.0.0.0`), which Node also
 * listens on as the IPv4 wildcard (review finding F3).
 */
const WILDCARD_HOSTNAMES = new Set(['0.0.0.0', '[::]', '[::ffff:0:0]'])

// Shape of an acceptable `Host` value before URL parsing: a name or IPv4 address made
// of letters, digits, dots, and hyphens, or a bracketed IPv6 literal, optionally followed
// by `:` and a decimal port. This rejects userinfo (`@`), paths (`/`, `\`), queries,
// fragments, whitespace, percent-encoding, and empty ports, which `new URL` would
// otherwise accept or silently drop (spec review N24).
const HOST_SHAPE = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::[0-9]+)?$/

const ORIGIN_SCHEME = /^http:\/\//i

/**
 * Normalizes a `Host`-style value (`host[:port]`) the way the allowlist entries are
 * normalized: parsed as `new URL("http://" + value)` and reduced to `.host` (lowercase,
 * default port 80 omitted, IPv6 bracketed and compressed). Returns `null` for anything
 * that is not a string of the accepted shape or that the URL parser rejects.
 */
export function normalizeHost(value: unknown): string | null {
  if (typeof value !== 'string' || !HOST_SHAPE.test(value)) return null
  let url: URL
  try {
    url = new URL(`http://${value}`)
  } catch {
    return null
  }
  return url.host === '' ? null : url.host
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !ORIGIN_SCHEME.test(value)) return null
  const host = normalizeHost(value.replace(ORIGIN_SCHEME, ''))
  return host === null ? null : `http://${host}`
}

/**
 * Builds the policy from the parsed config (`parseConfig` stores IPv6 hosts without
 * brackets; `hostForUrl` adds them back). Throws if the configured host cannot be
 * normalized, which `parseConfig` already prevents.
 */
export function createHostPolicy(config: Pick<ServerConfig, 'host' | 'port'>): HostPolicy {
  const entry = (host: string): string => {
    const normalized = normalizeHost(`${host}:${config.port}`)
    if (normalized === null) throw new Error(`Cannot build the host allowlist for host ${JSON.stringify(host)}`)
    return normalized
  }

  const hosts = new Set(LOOPBACK_HOSTS.map(entry))
  const configured = entry(hostForUrl(config.host))
  // `.hostname` is the host without the port (IPv6 stays bracketed).
  if (!WILDCARD_HOSTNAMES.has(new URL(`http://${configured}`).hostname)) hosts.add(configured)
  const origins = new Set([...hosts].map((host) => `http://${host}`))

  return {
    allowedHosts: hosts,
    allowedOrigins: origins,
    isAllowedHost(value) {
      const host = normalizeHost(value)
      return host !== null && hosts.has(host)
    },
    isAllowedOrigin(value) {
      const origin = normalizeOrigin(value)
      return origin !== null && origins.has(origin)
    },
  }
}
