import { execSync } from 'child_process'
import { platform } from 'os'

export function openBrowser(url: string): void {
  try {
    switch (platform()) {
      case 'darwin': execSync(`open "${url}"`); break
      case 'linux': execSync(`xdg-open "${url}"`); break
      case 'win32': execSync(`rundll32 url.dll,FileProtocolHandler "${url}"`); break
    }
  } catch {}
}

export function git(dir: string, ...args: string[]): string {
  return execSync(`git ${args.join(' ')}`, { cwd: dir, encoding: 'utf-8' }).trim()
}

export function gitSafe(dir: string, ...args: string[]): string | null {
  try {
    return git(dir, ...args)
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function bumpPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${patch! + 1}`
}

export function bumpMinor(version: string): string {
  const [major, minor] = version.split('.').map(Number)
  return `${major}.${minor! + 1}.0`
}

export function bumpMajor(version: string): string {
  const [major] = version.split('.').map(Number)
  return `${major! + 1}.0.0`
}

export function toDisplayName(name: string): string {
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
