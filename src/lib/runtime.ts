import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Runtime {
  name: 'bun'
  version: string
  exec: string
}

export function detect(): Runtime {
  try {
    const version = execSync('bun --version', { encoding: 'utf-8' }).trim().replace(/^v/, '')
    return { name: 'bun', version, exec: 'bun' }
  } catch {
    throw new Error('Bun is required. Install it: https://bun.sh')
  }
}

export function ensureDeps(root: string, _rt: Runtime): void {
  const nmDir = join(root, 'node_modules')
  if (existsSync(nmDir)) return
  execSync('bun install', { cwd: root, stdio: 'inherit' })
}

export function buildCmd(root: string, _rt: Runtime): Promise<void> {
  const child = spawn('bun', ['run', 'vite', 'build'], { cwd: root, stdio: 'inherit' })
  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Build failed with exit code ${code}`))
    })
  })
}

export function watchCmd(root: string, _rt: Runtime): ChildProcess {
  return spawn('bun', ['run', 'vite', 'build', '--watch'], { cwd: root, stdio: 'pipe' })
}

export function runHook(hooks: Record<string, string> | undefined, hookName: string, root: string): void {
  if (!hooks || !hooks[hookName]) return
  execSync(hooks[hookName], { cwd: root, stdio: 'inherit' })
}
