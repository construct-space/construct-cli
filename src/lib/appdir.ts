import { join } from 'path'
import { homedir } from 'os'
import { platform } from 'process'
import { existsSync, readFileSync } from 'fs'

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

/**
 * Returns the active profile ID from the app's profiles.json, or null if
 * no profile is active or the file doesn't exist.
 */
function activeProfileId(): string | null {
  try {
    const profilesPath = join(dataDir(), 'profiles.json')
    if (!existsSync(profilesPath)) return null
    const data = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    return data?.active_profile || null
  } catch {
    return null
  }
}

/**
 * Returns the spaces directory for the active profile.
 * Falls back to the top-level spaces dir if no profile is found.
 */
export function spacesDir(): string {
  const profileId = activeProfileId()
  if (profileId) {
    return join(dataDir(), 'profiles', profileId, 'spaces')
  }
  return join(dataDir(), 'spaces')
}

export function spaceDir(spaceId: string): string {
  return join(spacesDir(), spaceId)
}
