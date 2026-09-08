import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { dataDir, profilesDir } from './appdir.js'

// Legacy CLI-only credentials file. New writes go to profiles/<id>/auth.json
// so the CLI and the desktop app share one source of truth. We still READ
// this file once at first load to migrate existing CLI users, then ignore it.
const LEGACY_CREDENTIALS_FILE = 'credentials.json'
const PROFILES_REGISTRY = 'profiles.json'
export const DEFAULT_PORTAL = 'https://my.construct.space/api/developer'

export interface User {
  id: string
  name: string
  email: string
}

export interface Credentials {
  // Construct identity token (cat_*). Sent as `Authorization: Bearer ...`
  // on every API call. The pre-2.0 mixed bag (cst_live_*, csk_live_*)
  // is gone -- cst_live_* is rejected at login, csk_live_* lives in
  // `publisherKey` below, not here.
  token: string
  portal: string
  user?: User
  profileId?: string
  // Publisher API key (csk_live_*) when the active profile has one.
  // Carries publisher identity -- for an org-context profile this is the
  // org's key, so publishing with it attributes spaces to the org. The
  // app writes this to auth.json on enroll; CLI publish prefers it over
  // `token` so org attribution works without a separate `--scope=org`.
  publisherKey?: string
  // Convenience: which kind of publisher the key belongs to ("user" or
  // "org"). Used for the publish-summary line so the user sees who
  // they're publishing as before confirming.
  publisherKind?: string
  publisherName?: string
}

export interface DesktopProfile {
  id: string // directory name (uuid or "org:<uuid>")
  token: string
  user?: {
    id?: string
    name?: string
    email?: string
    username?: string
  }
  updatedAt?: string
  authenticated?: boolean
}

// listDesktopProfiles scans the desktop app's profiles dir for auth.json
// files. Each profile dir corresponds to a signed-in user or org. Returns
// only profiles that are currently authenticated.
export function listDesktopProfiles(): DesktopProfile[] {
  const dir = profilesDir()
  if (!existsSync(dir)) return []

  const results: DesktopProfile[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    try {
      if (!statSync(full).isDirectory()) continue
      const authPath = join(full, 'auth.json')
      if (!existsSync(authPath)) continue
      const data = JSON.parse(readFileSync(authPath, 'utf-8')) as {
        user?: DesktopProfile['user']
        token?: string
        authenticated?: boolean
        updated_at?: string
      }
      if (!data.token) continue
      if (data.authenticated !== undefined && !data.authenticated) continue
      results.push({
        id: entry,
        token: data.token,
        user: data.user,
        updatedAt: data.updated_at,
        authenticated: true,
      })
    } catch {
      // Ignore malformed entries
    }
  }
  return results
}

function legacyCredentialsPath(): string {
  return join(dataDir(), LEGACY_CREDENTIALS_FILE)
}

function registryPath(): string {
  return join(dataDir(), PROFILES_REGISTRY)
}

interface ProfileRegistry {
  active_profile?: string
  profiles?: Array<{ id: string; name?: string; email?: string; avatar?: string }>
  version?: number
}

function readRegistry(): ProfileRegistry {
  const path = registryPath()
  if (!existsSync(path)) return {}
  try { return JSON.parse(readFileSync(path, 'utf-8')) as ProfileRegistry }
  catch { return {} }
}

function writeRegistry(reg: ProfileRegistry): void {
  const path = registryPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ version: 1, ...reg }, null, 2))
}

export function store(creds: Credentials): void {
  // Resolve which profile dir owns this auth state. The CLI uses the
  // user's UUID as the profile id, matching the desktop app's convention --
  // so a CLI login for the same user lands in the same profile that
  // desktop already manages, and the two surfaces stay in sync via one
  // file instead of duplicating state in credentials.json.
  const profileId = creds.profileId || creds.user?.id
  if (!profileId) {
    throw new Error('cannot store credentials without a profile id (user.id or profileId)')
  }
  const profilePath = join(profilesDir(), profileId, 'auth.json')
  mkdirSync(dirname(profilePath), { recursive: true })

  // Read-modify-write so we don't clobber fields the desktop app owns
  // (oauth_token, full user object, publisher block written by enrollment).
  let existing: Record<string, any> = {}
  if (existsSync(profilePath)) {
    try { existing = JSON.parse(readFileSync(profilePath, 'utf-8')) } catch { /* overwrite */ }
  }
  existing.token = creds.token
  existing.authenticated = true
  existing.updated_at = new Date().toISOString()
  if (creds.user) {
    existing.user = { ...existing.user, ...creds.user }
  }
  if (creds.publisherKey) {
    existing.publisher = {
      ...existing.publisher,
      name: creds.publisherName || existing.publisher?.name || '',
      kind: creds.publisherKind || existing.publisher?.kind || 'user',
      api_key: creds.publisherKey,
    }
  }
  writeFileSync(profilePath, JSON.stringify(existing, null, 2), { mode: 0o600 })

  // Register the profile + mark it active in the shared registry. Desktop
  // reads this same file to populate its profile picker, so a CLI login
  // for a new user appears there too.
  const reg = readRegistry()
  reg.active_profile = profileId
  reg.profiles = reg.profiles || []
  const existingEntry = reg.profiles.find(p => p.id === profileId)
  if (existingEntry) {
    if (creds.user?.name) existingEntry.name = creds.user.name
    if (creds.user?.email) existingEntry.email = creds.user.email
  } else if (creds.user) {
    reg.profiles.push({
      id: profileId,
      name: creds.user.name,
      email: creds.user.email,
    })
  }
  writeRegistry(reg)
}

/**
 * Migrate legacy ~/.../Construct/credentials.json into the matching
 * profile's auth.json. One-shot: on first load that finds the legacy
 * file but no matching profile, we mirror its contents, then ignore the
 * file forever after. The legacy file is left on disk for a release as a
 * safety net; a future cleanup can delete it.
 */
function migrateLegacyCredentials(): void {
  const legacy = legacyCredentialsPath()
  if (!existsSync(legacy)) return
  try {
    const data = JSON.parse(readFileSync(legacy, 'utf-8')) as Credentials
    if (!data.token) return
    const pid = data.profileId || data.user?.id
    if (!pid) return
    const profilePath = join(profilesDir(), pid, 'auth.json')
    if (existsSync(profilePath)) return // already migrated / handled by desktop
    store({ ...data, profileId: pid })
  } catch { /* malformed -- ignore */ }
}

export function load(): Credentials {
  migrateLegacyCredentials()
  const fromProfile = loadFromActiveProfile()
  if (fromProfile) return fromProfile
  throw new Error("not logged in -- run 'construct login' first")
}

// loadFromActiveProfile reads the desktop's profiles.json registry, finds
// the active profile, and synthesizes a Credentials object from its
// auth.json. Returns null when no profile is active or no auth.json exists.
function loadFromActiveProfile(): Credentials | null {
  try {
    const regPath = join(dataDir(), 'profiles.json')
    if (!existsSync(regPath)) return null
    const reg = JSON.parse(readFileSync(regPath, 'utf-8')) as {
      active_profile?: string
    }
    const activeId = reg.active_profile
    if (!activeId) return null
    const authPath = join(profilesDir(), activeId, 'auth.json')
    if (!existsSync(authPath)) return null
    const a = JSON.parse(readFileSync(authPath, 'utf-8')) as {
      token?: string
      authenticated?: boolean
      user?: {
        id?: string
        uuid?: string
        name?: string
        username?: string
        email?: string
      }
      publisher?: {
        name?: string
        kind?: string
        api_key?: string
      }
    }
    if (!a.token) return null
    if (a.authenticated === false) return null
    const u = a.user || {}
    return {
      token: a.token,
      portal: DEFAULT_PORTAL,
      profileId: activeId,
      user: {
        id: u.id || u.uuid || activeId,
        name: u.name || u.username || activeId,
        email: u.email || '',
      },
      publisherKey: a.publisher?.api_key,
      publisherKind: a.publisher?.kind,
      publisherName: a.publisher?.name,
    }
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  try {
    load()
    return true
  } catch {
    return false
  }
}

export function clear(): void {
  // Mark the active profile signed-out instead of deleting auth.json.
  // The desktop app honors `authenticated: false` (listDesktopProfiles
  // filters them out and the auth store treats them as logged out), so
  // setting the flag is enough to log the user out from both surfaces
  // while preserving user metadata the desktop owns.
  const reg = readRegistry()
  const activeId = reg.active_profile
  if (activeId) {
    const profilePath = join(profilesDir(), activeId, 'auth.json')
    if (existsSync(profilePath)) {
      try {
        const data = JSON.parse(readFileSync(profilePath, 'utf-8')) as Record<string, unknown>
        data.authenticated = false
        data.updated_at = new Date().toISOString()
        writeFileSync(profilePath, JSON.stringify(data, null, 2), { mode: 0o600 })
      } catch { /* leave as-is */ }
    }
  }
  // Sweep the legacy file too so older CLI versions on this machine
  // don't see stale "still logged in" state.
  const legacy = legacyCredentialsPath()
  if (existsSync(legacy)) unlinkSync(legacy)
}

export function getPortalURL(): string {
  try {
    const creds = load()
    return creds.portal || DEFAULT_PORTAL
  } catch {
    return DEFAULT_PORTAL
  }
}
