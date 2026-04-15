import { existsSync, readFileSync, cpSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import { watch } from 'chokidar'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, watchCmd } from '../lib/runtime.js'
import { spaceDir } from '../lib/appdir.js'

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

  // Start Vite watch — rebuilds to dist/ on source changes
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

  // Watch the IIFE bundle → update dist/manifest.json with build metadata.
  // The Space Runner polls dist/manifest.json builtAt for HMR.
  const distDir = join(root, 'dist')
  const bundleFile = join(distDir, `space-${m.id}.iife.js`)
  let lastChecksum = ''

  const distWatcher = watch(bundleFile, { ignoreInitial: false })
  distWatcher.on('all', () => {
    if (!existsSync(bundleFile)) return

    const bundleData = readFileSync(bundleFile)
    const checksum = createHash('sha256').update(bundleData).digest('hex')

    if (checksum === lastChecksum) return
    lastChecksum = checksum

    // Update dist/manifest.json — runner detects builtAt change and reloads
    const raw = manifest.readRaw(root)
    manifest.writeWithBuild(distDir, raw, {
      checksum,
      size: bundleData.length,
      hostApiVersion: '0.2.0',
      builtAt: new Date().toISOString(),
    })

    // Install to profile spaces dir so the running app picks up the change
    try {
      const installDir = spaceDir(m.id)
      mkdirSync(installDir, { recursive: true })
      cpSync(distDir, installDir, { recursive: true })
      console.log(chalk.green(`Built + installed → ${installDir} (${(bundleData.length / 1024).toFixed(1)} KB)`))
    } catch (err: any) {
      console.log(chalk.green(`Built → dist/ (${(bundleData.length / 1024).toFixed(1)} KB)`))
      console.log(chalk.yellow(`  Install failed: ${err.message}`))
    }
  })

  console.log(chalk.green('Watching for changes... (Ctrl+C to stop)'))
  console.log(chalk.dim('Use the Preview button in Construct to open the Space Runner'))

  // Keep process alive
  await new Promise(() => {})
}
