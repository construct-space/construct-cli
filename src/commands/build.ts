import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import ora from 'ora'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, buildCmd, runHook } from '../lib/runtime.js'
import { bundleAgentDir } from '../lib/agent.js'

/**
 * Extract action metadata (description + params) from src/actions.ts.
 * Parses the exported `actions` object statically — does NOT execute the file.
 * Falls back gracefully if the file uses dynamic patterns we can't parse.
 */
function extractActionMetadata(actionsPath: string): Record<string, { description: string; params?: Record<string, { type: string; description?: string; required?: boolean }> }> | null {
  try {
    const source = readFileSync(actionsPath, 'utf-8')

    // Quick regex extraction — looks for action definitions in the exported object.
    // Matches: actionId: { description: '...', params: { ... } }
    const result: Record<string, { description: string; params?: Record<string, { type: string; description?: string; required?: boolean }> }> = {}

    // Find description strings for each action
    const actionPattern = /(\w+)\s*:\s*\{[^}]*description\s*:\s*['"`]([^'"`]+)['"`]/g
    let match
    while ((match = actionPattern.exec(source)) !== null) {
      const actionId = match[1]!
      const description = match[2]!
      result[actionId] = { description }
    }

    // For each found action, try to extract params
    for (const actionId of Object.keys(result)) {
      const paramBlockPattern = new RegExp(
        `${actionId}\\s*:\\s*\\{[\\s\\S]*?params\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*,?\\s*(?:run|\\})`,
      )
      const paramMatch = source.match(paramBlockPattern)
      if (paramMatch?.[1]) {
        const params: Record<string, { type: string; description?: string; required?: boolean }> = {}
        const paramEntryPattern = /(\w+)\s*:\s*\{\s*type\s*:\s*['"`](\w+)['"`](?:\s*,\s*description\s*:\s*['"`]([^'"`]*)['"`])?(?:\s*,\s*required\s*:\s*(true|false))?\s*\}/g
        let pm
        while ((pm = paramEntryPattern.exec(paramMatch[1])) !== null) {
          params[pm[1]!] = {
            type: pm[2]!,
            ...(pm[3] ? { description: pm[3] } : {}),
            ...(pm[4] === 'true' ? { required: true } : {}),
          }
        }
        if (Object.keys(params).length > 0) {
          result[actionId]!.params = params
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}

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

  // Extract action metadata from src/actions.ts and inline into manifest
  const actionsPath = join(root, 'src', 'actions.ts')
  if (existsSync(actionsPath)) {
    const actionMeta = extractActionMetadata(actionsPath)
    if (actionMeta && Object.keys(actionMeta).length > 0) {
      raw.actions = actionMeta
      console.log(chalk.blue(`  Actions: ${Object.keys(actionMeta).join(', ')}`))
    }
  }

  manifest.writeWithBuild(distDir, raw, {
    checksum,
    size: bundleData.length,
    hostApiVersion: '0.2.0',
    builtAt: new Date().toISOString(),
  })

  console.log(chalk.green(`Built ${m.name} v${m.version}`))
}
