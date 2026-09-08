import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import { watch } from 'chokidar'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, watchCmd } from '../lib/runtime.js'
import { createSpaceBundle, stageSpaceResources } from '../lib/spaceBundle.js'
import { buildSpaceTools } from '../lib/spaceTools.js'

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
  console.log(chalk.blue(`Dev mode -- ${m.id} (${rt.name} ${rt.version})`))

  ensureDeps(root, rt)
  writeEntry(root, m)

  // Start Vite watch -- rebuilds to dist/ on source changes
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
      console.log(chalk.blue('Manifest changed -- entry regenerated'))
      return
    }
    console.log(chalk.blue('Actions changed -- entry regenerated'))
  })

  // Watch the Vite outputs -> rebuild dist/<id>.space with fresh manifest
  // metadata. The Space Runner resolves that bundle and polls builtAt for HMR.
  const distDir = join(root, 'dist')
  const bundleFile = join(distDir, `space-${m.id}.iife.js`)
  const cssFile = join(distDir, `space-${m.id}.css`)
  let lastChecksum = ''

  const packageSpace = (force = false) => {
    if (!existsSync(bundleFile) || !existsSync(cssFile)) return

    const bundleData = readFileSync(bundleFile)
    const checksum = createHash('sha256').update(bundleData).digest('hex')

    if (!force && checksum === lastChecksum) return
    lastChecksum = checksum

    // Update dist/manifest.json, then package it into the .space bundle.
    const raw = manifest.readRaw(root)
    manifest.writeWithBuild(distDir, raw, {
      checksum,
      size: bundleData.length,
      hostApiVersion: manifest.HOST_API_VERSION,
      builtAt: new Date().toISOString(),
    })
    stageSpaceResources(root, distDir)
    buildSpaceTools(root, distDir, m.id)
    createSpaceBundle({
      distDir,
      spaceId: m.id,
      appBundlePath: bundleFile,
      cssPath: cssFile,
    })

    console.log(chalk.green(`Built -> dist/${m.id}.space (${(bundleData.length / 1024).toFixed(1)} KB)`))
  }

  const distWatcher = watch([bundleFile, cssFile], { ignoreInitial: false })
  distWatcher.on('all', () => {
    try {
      packageSpace()
    } catch (err: any) {
      console.error(chalk.red(err?.message || String(err)))
    }
  })

  const resourceWatcher = watch([
    join(root, 'tools.go'),
    join(root, 'tools'),
    join(root, 'lib'),
    join(root, 'agent'),
    join(root, 'scripts'),
    join(root, 'references'),
    join(root, 'assets'),
    join(root, 'SKILL.md'),
  ], { ignoreInitial: true })
  resourceWatcher.on('all', () => {
    try {
      packageSpace(true)
    } catch (err: any) {
      console.error(chalk.red(err?.message || String(err)))
    }
  })

  console.log(chalk.green('Watching for changes... (Ctrl+C to stop)'))
  console.log(chalk.dim('Use the Preview button in Construct to open the Space Runner'))

  // Keep process alive
  await new Promise(() => {})
}
