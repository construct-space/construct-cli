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

export function devDataDir(): string {
  if (process.env.CONSTRUCT_DATA_DIR) return process.env.CONSTRUCT_DATA_DIR
  const home = homedir()

  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Construct Dev')
    case 'win32': {
      const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
      return join(appData, 'Construct Dev')
    }
    default: {
      const xdg = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
      return join(xdg, 'construct-dev')
    }
  }
}

export function spacesDir(): string {
  return join(dataDir(), 'spaces')
}

export function devSpacesDir(): string {
  return join(devDataDir(), 'spaces')
}

export function spaceDir(spaceId: string): string {
  return join(spacesDir(), spaceId)
}

export function devSpaceDir(spaceId: string): string {
  return join(devSpacesDir(), spaceId)
}
