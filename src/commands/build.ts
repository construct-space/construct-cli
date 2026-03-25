import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import ora from 'ora'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, buildCmd, runHook } from '../lib/runtime.js'
import { bundleAgentDir } from '../lib/agent.js'

export async function build(options?: { entryOnly?: boolean }): Promise<void> {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)
  writeEntry(root, m)

  if (options?.entryOnly) {
    console.log(chalk.green('Done (entry only).'))
    return
  }

  const rt = detect()
  console.log(chalk.blue(`Using ${rt.name} ${rt.version}`))

  ensureDeps(root, rt)
  runHook(m.hooks, 'preBuild', root)

  const spinner = ora('Building space...').start()
  try {
    await buildCmd(root, rt)
    spinner.succeed('Build complete')
  } catch (err: any) {
    spinner.fail('Build failed')
    console.error(chalk.red(err.message))
    process.exit(1)
  }

  runHook(m.hooks, 'postBuild', root)

  // Bundle agent
  const agentDir = join(root, 'agent')
  if (existsSync(agentDir) && statSync(agentDir).isDirectory()) {
    const distDir = join(root, 'dist')
    bundleAgentDir(agentDir, distDir)
    bundleAgentDir(agentDir, root)
  }

  // Write dist/manifest.json with build metadata
  const distDir = join(root, 'dist')
  const expectedBundle = `space-${m.id}.iife.js`
  let bundlePath = join(distDir, expectedBundle)

  if (!existsSync(bundlePath)) {
    const matches = readdirSync(distDir).filter(f => f.startsWith('space-') && f.endsWith('.iife.js'))
    if (matches.length === 1) {
      renameSync(join(distDir, matches[0]!), bundlePath)
      const oldCSS = join(distDir, matches[0]!.replace('.iife.js', '.css'))
      const newCSS = join(distDir, `space-${m.id}.css`)
      if (existsSync(oldCSS)) renameSync(oldCSS, newCSS)
    }
  }

  const bundleData = readFileSync(bundlePath)
  const checksum = createHash('sha256').update(bundleData).digest('hex')
  const raw = manifest.readRaw(root)

  manifest.writeWithBuild(distDir, raw, {
    checksum,
    size: bundleData.length,
    hostApiVersion: '0.2.0',
    builtAt: new Date().toISOString(),
  })

  console.log(chalk.green(`Built ${m.name} v${m.version}`))
}
