/**
 * Shared HTTP client for Construct Graph CLI commands.
 *
 * The graph service sits behind the my.construct.space gateway (path-prefixed
 * at /api/graph). This helper centralizes: credential loading, the gateway
 * URL, `X-Auth-User-ID` / `X-Auth-Org-ID` header wiring, and readable error
 * messages — so each command file can stay focused on its own behavior.
 */

import * as auth from './auth.js'

export interface GraphReqOptions {
  method?: string
  path: string // e.g. "/api/space-bundles"
  body?: unknown
  orgId?: string // caller's org — required for bundle/install/distribution ops
}

/** Base URL for the graph service, overridable via GRAPH_URL for local dev. */
export function graphBaseURL(): string {
  return process.env.GRAPH_URL || 'https://my.construct.space/api/graph'
}

/**
 * Resolve caller's org id from (in order): explicit option, --org flag CLI
 * conventions pass in, CONSTRUCT_ORG_ID env var. Returns "" when unset; each
 * command decides whether that's fatal.
 */
export function resolveOrgId(explicit?: string): string {
  if (explicit) return explicit
  return process.env.CONSTRUCT_ORG_ID || ''
}

/** Load credentials or exit with a friendly message — every command needs these. */
export function loadCreds(): auth.Credentials {
  try {
    return auth.load()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg + "\nRun 'construct login' first.")
  }
}

/**
 * Perform an authenticated HTTP request against the graph gateway. Throws
 * with the response body on non-2xx so callers can surface errors uniformly.
 */
export async function graphRequest<T = unknown>(opts: GraphReqOptions): Promise<T> {
  const creds = loadCreds()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    'Content-Type': 'application/json',
  }
  if (creds.user?.id) headers['X-Auth-User-ID'] = creds.user.id
  if (opts.orgId) headers['X-Auth-Org-ID'] = opts.orgId

  const resp = await fetch(graphBaseURL() + opts.path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    let msg = text
    try {
      const parsed = JSON.parse(text) as { error?: string }
      if (parsed.error) msg = parsed.error
    } catch {
      // fall through to raw text
    }
    throw new Error(`${resp.status}: ${msg || resp.statusText}`)
  }

  // 204 / empty body
  const text = await resp.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * Require an org id or exit. Bundle + install + distribution commands all
 * need this — it's the same copy in every spot otherwise.
 */
export function requireOrgId(explicit?: string): string {
  const org = resolveOrgId(explicit)
  if (!org) {
    throw new Error(
      'org context required. Pass --org <id> or set CONSTRUCT_ORG_ID. ' +
        'Find your org id on the profile page or via accounts /api/me/scope.',
    )
  }
  return org
}
