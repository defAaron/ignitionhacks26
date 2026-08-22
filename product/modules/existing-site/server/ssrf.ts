/**
 * Keep user-supplied URLs pointed at the public internet. Checks the literal
 * host and every address it resolves to; anything ambiguous is rejected.
 */
import { lookup } from 'node:dns/promises'

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((n) => n <= 255) ? parts : null
}

export function isPrivateIPv4(host: string): boolean {
  const p = ipv4Parts(host)
  if (!p) return false
  const [a, b] = p
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::1' || h === '::') return true
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true // fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true // fe80::/10
  return false
}

function isPrivateAddress(addr: string): boolean {
  return isPrivateIPv4(addr) || isPrivateIPv6(addr)
}

function isBlockedHostname(host: string): boolean {
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  return false
}

export async function validatePublicUrl(raw: unknown): Promise<UrlCheck> {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'url is required' }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'invalid url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http(s) urls are allowed' }
  }
  if (url.username || url.password) return { ok: false, reason: 'urls with credentials are not allowed' }
  const host = url.hostname.toLowerCase()
  if (isBlockedHostname(host)) return { ok: false, reason: 'local hosts are not allowed' }
  if (isPrivateAddress(host)) return { ok: false, reason: 'private addresses are not allowed' }
  // Hostnames (not IP literals): resolve and check every address too.
  if (!ipv4Parts(host) && !host.includes(':')) {
    try {
      const addrs = await lookup(host, { all: true })
      if (addrs.length === 0) return { ok: false, reason: 'host did not resolve' }
      if (addrs.some((a) => isPrivateAddress(a.address))) {
        return { ok: false, reason: 'host resolves to a private address' }
      }
    } catch {
      return { ok: false, reason: 'host did not resolve' }
    }
  }
  return { ok: true, url }
}
