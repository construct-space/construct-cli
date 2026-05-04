import { execFileSync } from 'child_process'
import { platform } from 'os'

// All shell-outs in this module use execFileSync with an args array — never
// a shell string — so a URL or arg containing quotes / `$()` / `;` cannot
// inject extra commands. Preserves callers' "best-effort" semantics by
// swallowing exec errors where the original behaviour did.
export function openBrowser(url: string): void {
  try {
    switch (platform()) {
      case 'darwin': execFileSync('open', [url]); break
      case 'linux': execFileSync('xdg-open', [url]); break
      // rundll32 needs the entry point and URL as separate argv entries.
      case 'win32': execFileSync('rundll32', ['url.dll,FileProtocolHandler', url]); break
    }
  } catch {}
}

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' }).trim()
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
