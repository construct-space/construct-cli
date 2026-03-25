import { existsSync, cpSync, mkdirSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import * as manifest from '../lib/manifest.js'
import { bundleAgentDir } from '../lib/agent.js'
import { spaceDir } from '../lib/appdir.js'

export function run(): void {
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

  // Re-bundle agent
  const agentDir = join(root, 'agent')
  if (existsSync(agentDir)) {
    bundleAgentDir(agentDir, distDir)
  }

  // Copy to spaces dir
  const installDir = spaceDir(m.id)
  mkdirSync(installDir, { recursive: true })
  cpSync(distDir, installDir, { recursive: true })

  console.log(chalk.green(`Installed ${m.name} to ${installDir}`))
  console.log(chalk.dim('  Restart Construct to load the updated space.'))
}
