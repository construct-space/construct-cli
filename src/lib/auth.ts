import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { dataDir, profilesDir } from './appdir.js'

const CREDENTIALS_FILE = 'credentials.json'
export const DEFAULT_PORTAL = 'https://my.construct.space/api/developer'

export interface User {
  id: string
  name: string
  email: string
}

export interface Credentials {
  token: string
  portal: string
  user?: User
  profileId?: string
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

function credentialsPath(): string {
  return join(dataDir(), CREDENTIALS_FILE)
}

export function store(creds: Credentials): void {
  const path = credentialsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 })
}

export function load(): Credentials {
  const path = credentialsPath()
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Credentials
    if (data.token) return data
  }
  // Fallback: when no CLI credentials file is present, mirror the desktop
  // app's active profile. This is what makes `construct graph push` work
  // when invoked by the operator (Space Developer agent) without a prior
  // `construct login` — the user is already signed into the desktop app,
  // so we reuse that auth instead of asking them to authenticate twice.
  const fromProfile = loadFromActiveProfile()
  if (fromProfile) return fromProfile
  throw new Error("not logged in — run 'construct login' first")
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
  const path = credentialsPath()
  if (existsSync(path)) unlinkSync(path)
}

export function getPortalURL(): string {
  try {
    const creds = load()
    return creds.portal || DEFAULT_PORTAL
  } catch {
    return DEFAULT_PORTAL
  }
}
