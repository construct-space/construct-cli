import { existsSync, cpSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import * as manifest from '../lib/manifest.js'
import { spaceDir, spacesDir } from '../lib/appdir.js'

/**
 * Install a built space to the Construct spaces directory.
 * This makes it available in the main Construct app (not needed for dev -- use the Space Runner instead).
 */
export function install(): void {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) {
    console.error(chalk.red("No dist/ directory found. Run 'construct build' first."))
    process.exit(1)
  }

  const m = manifest.read(root)
  const bundlePath = join(distDir, `${m.id}.space`)
  if (!existsSync(bundlePath)) {
    console.error(chalk.red(`No dist/${m.id}.space bundle found. Run 'construct build' first.`))
    process.exit(1)
  }

  // Copy .space bundle to spaces dir (profile-scoped if a profile is active).
  // Clear legacy directory installs and current file installs first so stale
  // files from the old unpacked bundle format cannot survive the migration.
  const installPath = spaceDir(m.id)
  rmSync(join(spacesDir(), m.id), { recursive: true, force: true })
  rmSync(installPath, { recursive: true, force: true })
  mkdirSync(spacesDir(), { recursive: true })
  cpSync(bundlePath, installPath, { force: true })

  console.log(chalk.green(`Installed ${m.name} -> ${installPath}`))
  console.log(chalk.dim('  Restart Construct to load the updated space.'))
}
