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

/**
 * Base URL for the graph service. Defaults to direct (graph.construct.space)
 * rather than my.construct.space's /api/graph gateway because the CLI
 * authenticates with bearer tokens — we don't need the gateway's session
 * cookie handling, and calling direct avoids the path-prefix rewrite the
 * gateway does (`/api/graph/*` → `${GRAPH}/api/*`), which would require
 * every command's path to know whether it's going through the gateway.
 *
 * Override with GRAPH_URL for local dev (e.g. http://localhost:8080).
 */
export function graphBaseURL(): string {
  return process.env.GRAPH_URL || 'https://graph.construct.space'
}

/**
 * Resolve caller's org id from (in order): explicit option, --org flag CLI
 * conventions pass in, CONSTRUCT_ORG_ID env var, then the profileId stored
 * at login (when a desktop org profile was picked, its id is `org:<uuid>`).
 * Returns "" when unset; each command decides whether that's fatal.
 */
export function resolveOrgId(explicit?: string): string {
  if (explicit) return explicit
  if (process.env.CONSTRUCT_ORG_ID) return process.env.CONSTRUCT_ORG_ID
  try {
    const creds = auth.load()
    const pid = creds.profileId || ''
    if (pid.startsWith('org:')) return pid.slice('org:'.length)
  } catch {
    // not logged in — fall through
  }
  return ''
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
 *
 * Note: we deliberately do NOT forward X-Auth-Org-ID from the client. The
 * graph service strips every X-Auth-* header on the way in and attests them
 * from the bearer token, so sending one is both useless and a sign of an
 * attempted spoof. Org context is derived server-side from /me/scope.
 */
export async function graphRequest<T = unknown>(opts: GraphReqOptions): Promise<T> {
  const creds = loadCreds()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    'Content-Type': 'application/json',
  }

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
 * requireOrgId was the old stern gate for bundle/install/distribution paths.
 * Now that graph attests org context from the bearer token, the CLI no
 * longer needs one — we pass the explicit id (if any) through opts.orgId
 * purely as a courtesy and let the server accept / reject. Kept as a
 * pass-through so existing callers don't have to change shape.
 */
export function requireOrgId(explicit?: string): string {
  return resolveOrgId(explicit)
}
