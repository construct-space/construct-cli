import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { platform } from 'process'

export function dataDir(): string {
  if (process.env.CONSTRUCT_DATA_DIR) return process.env.CONSTRUCT_DATA_DIR
  const home = homedir()

  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Construct')
    case 'win32': {
      const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
      return join(appData, 'Construct')
    }
    default: {
      const xdg = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
      return join(xdg, 'construct')
    }
  }
}

export function profilesDir(): string {
  return join(dataDir(), 'profiles')
}

// activeProfileId resolves the profile id to scope per-profile artifacts to.
// Order: CLI credentials (set at login), then desktop's profiles.json
// (active_profile chosen in the app), then "" — caller decides legacy fallback.
export function activeProfileId(): string {
  try {
    const credsPath = join(dataDir(), 'credentials.json')
    if (existsSync(credsPath)) {
      const c = JSON.parse(readFileSync(credsPath, 'utf-8')) as { profileId?: string }
      if (c.profileId) return c.profileId
    }
  } catch {
    // fall through
  }
  try {
    const regPath = join(dataDir(), 'profiles.json')
    if (existsSync(regPath)) {
      const r = JSON.parse(readFileSync(regPath, 'utf-8')) as { active_profile?: string }
      if (r.active_profile) return r.active_profile
    }
  } catch {
    // fall through
  }
  return ''
}

export function spacesDir(): string {
  const profileId = activeProfileId()
  if (profileId) return join(profilesDir(), profileId, 'spaces')
  return join(dataDir(), 'spaces')
}

export function spaceDir(spaceId: string): string {
  return join(spacesDir(), spaceId)
}
