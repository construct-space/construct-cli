import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { dataDir } from './appdir.js'

const CREDENTIALS_FILE = 'credentials.json'
const APP_PROFILES_FILE = 'profiles.json'
export const DEFAULT_PORTAL = 'https://developer.construct.space'
export const DEFAULT_ACCOUNTS = 'https://accounts.construct.space'

export interface User {
  id: string
  name: string
  email: string
}

export interface Publisher {
  name: string
  email: string
  kind: 'user' | 'org' | 'legacy'
  userId?: string
  orgId?: string
  verified: boolean
}

export interface Credentials {
  token: string
  portal: string
  user?: User
  publishers?: Publisher[]
}

function credentialsPath(): string {
  return join(dataDir(), CREDENTIALS_FILE)
}

// App profiles.json + profiles/<id>/auth.json are written by the Construct
// desktop app. When both CLI and app run on the same machine, the CLI reads
// the app's active-profile auth so users don't have to log in twice.
function appProfilesPath(): string {
  return join(dataDir(), APP_PROFILES_FILE)
}

function appProfileAuthPath(profileId: string): string {
  return join(dataDir(), 'profiles', profileId, 'auth.json')
}

interface AppProfile {
  id: string
  name: string
  email: string
}
interface AppProfilesFile {
  version: number
  active_profile: string
  profiles: AppProfile[]
}
interface AppAuthFile {
  user: {
    id: string
    email: string
    name?: string
    first_name?: string
    last_name?: string
  }
  token: string
  oauth_token?: string
  authenticated: boolean
}

/**
 * Reads the Construct desktop app's active-profile credentials. Returns null
 * if the app has no active profile, the files are missing/malformed, or the
 * session isn't authenticated. Tokens from this source are accounts OAuth
 * tokens (cat_…) — the developer portal's /api/publish now accepts these
 * alongside the legacy cst_live_… CLI tokens.
 */
export function loadFromApp(): Credentials | null {
  try {
    const profilesPath = appProfilesPath()
    if (!existsSync(profilesPath)) return null
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf-8')) as AppProfilesFile
    if (!profiles?.active_profile) return null

    const authPath = appProfileAuthPath(profiles.active_profile)
    if (!existsSync(authPath)) return null
    const auth = JSON.parse(readFileSync(authPath, 'utf-8')) as AppAuthFile
    if (!auth?.authenticated || !auth?.token) return null

    return {
      token: auth.token,
      portal: DEFAULT_PORTAL,
      user: {
        id: auth.user.id,
        name: auth.user.name || [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ') || auth.user.email,
        email: auth.user.email,
      },
    }
  } catch {
    return null
  }
}

export function store(creds: Credentials): void {
  const path = credentialsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 })
}

export function load(): Credentials {
  // Prefer the desktop app's active profile — single sign-on when both
  // are installed. Falls back to the CLI's own credentials file.
  const fromApp = loadFromApp()
  if (fromApp) return fromApp

  const path = credentialsPath()
  if (!existsSync(path)) {
    throw new Error("not logged in — run 'construct login' first (or sign in to the Construct app)")
  }
  const data = JSON.parse(readFileSync(path, 'utf-8')) as Credentials
  if (!data.token) {
    throw new Error("not logged in — run 'construct login' first")
  }
  return data
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
