import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, cpSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import { watch } from 'chokidar'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, watchCmd } from '../lib/runtime.js'
import { spaceDir, devSpaceDir } from '../lib/appdir.js'

export function getEntryWatchPaths(root: string): string[] {
  return [
    join(root, manifest.MANIFEST_FILE),
    join(root, 'src', 'actions.ts'),
  ]
}

export async function dev(): Promise<void> {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)
  const rt = detect()
  console.log(chalk.blue(`Dev mode — ${m.id} (${rt.name} ${rt.version})`))

  ensureDeps(root, rt)
  writeEntry(root, m)

  // Install to spaces dir + write .dev marker
  const installDir = spaceDir(m.id)
  mkdirSync(installDir, { recursive: true })
  const devMarker = join(installDir, '.dev')
  writeFileSync(devMarker, 'dev')

  const cleanup = () => {
    try { unlinkSync(devMarker) } catch {}
  }
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  // Start Vite watch
  const vite = watchCmd(root, rt)
  vite.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(chalk.dim(data.toString()))
  })
  vite.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(chalk.dim(data.toString()))
  })

  const regenerateEntry = () => {
    try {
      const newM = manifest.read(root)
      writeEntry(root, newM)
      console.log(chalk.blue('Entry regenerated'))
    } catch (err: any) {
      console.error(chalk.red(`Manifest error: ${err.message}`))
    }
  }

  // Watch entry inputs so src/entry.ts stays aligned with manifest + actions export
  const entryWatcher = watch(getEntryWatchPaths(root), { ignoreInitial: true })
  entryWatcher.on('all', (_, changedPath) => {
    regenerateEntry()
    if (changedPath.endsWith(manifest.MANIFEST_FILE)) {
      console.log(chalk.blue('Manifest changed — entry regenerated'))
      return
    }
    console.log(chalk.blue('Actions changed — entry regenerated'))
  })

  // Watch the IIFE bundle file only (not the whole dist dir — avoids loops)
  const distDir = join(root, 'dist')
  const bundleFile = join(distDir, `space-${m.id}.iife.js`)
  let lastChecksum = ''

  const distWatcher = watch(bundleFile, { ignoreInitial: false })
  distWatcher.on('all', () => {
    if (!existsSync(bundleFile)) return

    const bundleData = readFileSync(bundleFile)
    const checksum = createHash('sha256').update(bundleData).digest('hex')

    // Skip if unchanged
    if (checksum === lastChecksum) return
    lastChecksum = checksum

    // Write dist/manifest.json with checksum
    const raw = manifest.readRaw(root)
    manifest.writeWithBuild(distDir, raw, {
      checksum,
      size: bundleData.length,
      hostApiVersion: '0.2.0',
      builtAt: new Date().toISOString(),
    })

    // Copy to spaces dir
    mkdirSync(installDir, { recursive: true })
    cpSync(distDir, installDir, { recursive: true })
    writeFileSync(join(installDir, '.dev'), 'dev')

    // Copy config.agent if it exists (agent config bundle)
    const configAgent = join(root, 'config.agent')
    if (existsSync(configAgent)) {
      cpSync(configAgent, join(installDir, 'config.agent'))
    }

    // Also install to DEV instance if exists
    const devInstall = devSpaceDir(m.id)
    const devParent = join(devInstall, '..')
    if (existsSync(devParent)) {
      mkdirSync(devInstall, { recursive: true })
      cpSync(distDir, devInstall, { recursive: true })
      if (existsSync(configAgent)) {
        cpSync(configAgent, join(devInstall, 'config.agent'))
      }
    }

    console.log(chalk.green(`Installed → ${m.id}`))
  })

  console.log(chalk.green('Watching for changes... (Ctrl+C to stop)'))

  // Keep process alive
  await new Promise(() => {})
}
