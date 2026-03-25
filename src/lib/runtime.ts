import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Runtime {
  name: string
  version: string
  exec: string
}

export function detect(): Runtime {
  // Try bun first, then node
  for (const rt of ['bun', 'node']) {
    try {
      const version = execSync(`${rt} --version`, { encoding: 'utf-8' }).trim().replace(/^v/, '')
      return { name: rt, version, exec: rt }
    } catch {}
  }
  throw new Error('No JavaScript runtime found. Install bun or node.')
}

export function ensureDeps(root: string, rt: Runtime): void {
  const nmDir = join(root, 'node_modules')
  if (existsSync(nmDir)) return

  const cmd = rt.name === 'bun' ? 'bun install' : 'npm install'
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

export function buildCmd(root: string, rt: Runtime): void {
  const cmd = rt.name === 'bun' ? 'bun' : 'npx'
  const args = rt.name === 'bun' ? ['run', 'vite', 'build'] : ['vite', 'build']
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' })

  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Build failed with exit code ${code}`))
    })
  }) as any
}

export function watchCmd(root: string, rt: Runtime): ChildProcess {
  const cmd = rt.name === 'bun' ? 'bun' : 'npx'
  const args = rt.name === 'bun' ? ['run', 'vite', 'build', '--watch'] : ['vite', 'build', '--watch']
  return spawn(cmd, args, { cwd: root, stdio: 'pipe' })
}

export function runHook(hooks: any, hookName: string, root: string): void {
  if (!hooks || !hooks[hookName]) return
  execSync(hooks[hookName], { cwd: root, stdio: 'inherit' })
}
