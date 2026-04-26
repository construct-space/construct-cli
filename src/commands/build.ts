import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import ora from 'ora'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, buildCmd, runHook } from '../lib/runtime.js'
import { bundleAgentDir } from '../lib/agent.js'

type ActionMetadata = {
  description: string
  params?: Record<string, { type: string; description?: string; required?: boolean }>
}

function stripComments(source: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  let escaped = false

  while (i < source.length) {
    const ch = source[i]!
    const next = source[i + 1]

    if (quote) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      i++
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }

    if (ch === '/' && next === '*') {
      out += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        out += '  '
        i += 2
      }
      continue
    }

    out += ch
    i++
  }

  return out
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i]!
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

function objectLiteralAfter(source: string, start: number): string | null {
  const open = source.indexOf('{', start)
  if (open < 0) return null
  const close = findMatchingBrace(source, open)
  if (close < 0) return null
  return source.slice(open + 1, close)
}

function actionsObject(source: string): string | null {
  const stripped = stripComments(source)
  const match = /export\s+const\s+actions\s*=/.exec(stripped)
  if (!match) return null
  return objectLiteralAfter(stripped, match.index + match[0].length)
}

function objectEntries(body: string): Array<{ name: string; body: string }> {
  const entries: Array<{ name: string; body: string }> = []
  let i = 0
  while (i < body.length) {
    const match = /\s*,?\s*([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i))
    if (!match) break
    const name = match[1]!
    const valueStart = i + match.index + match[0].length
    const open = body.indexOf('{', valueStart)
    if (open < 0) break
    if (body.slice(valueStart, open).trim()) {
      i = valueStart
      continue
    }
    const close = findMatchingBrace(body, open)
    if (close < 0) break
    entries.push({ name, body: body.slice(open + 1, close) })
    i = close + 1
  }
  return entries
}

function stringProperty(body: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`).exec(body)
  return match?.[1]
}

function booleanProperty(body: string, name: string): boolean | undefined {
  const match = new RegExp(`${name}\\s*:\\s*(true|false)`).exec(body)
  if (!match) return undefined
  return match[1] === 'true'
}

function propertyObject(body: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*:`).exec(body)
  if (!match) return null
  return objectLiteralAfter(body, match.index + match[0].length)
}

/**
 * Extract action metadata (description + params) from src/actions.ts.
 * Parses the exported `actions` object statically and does not execute code.
 * Falls back gracefully if the file uses dynamic patterns we can't parse.
 */
export function extractActionMetadata(actionsPath: string): Record<string, ActionMetadata> | null {
  try {
    const actionsBody = actionsObject(readFileSync(actionsPath, 'utf-8'))
    if (!actionsBody) return null

    const result: Record<string, ActionMetadata> = {}
    for (const action of objectEntries(actionsBody)) {
      const description = stringProperty(action.body, 'description')
      if (!description) continue

      const metadata: ActionMetadata = { description }
      const paramsBody = propertyObject(action.body, 'params')
      if (paramsBody) {
        const params: NonNullable<ActionMetadata['params']> = {}
        for (const param of objectEntries(paramsBody)) {
          const type = stringProperty(param.body, 'type')
          if (!type) continue
          const required = booleanProperty(param.body, 'required')
          params[param.name] = {
            type,
            ...(stringProperty(param.body, 'description') ? { description: stringProperty(param.body, 'description') } : {}),
            ...(required === true ? { required: true } : {}),
          }
        }
        if (Object.keys(params).length > 0) metadata.params = params
      }
      result[action.name] = metadata
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
    hostApiVersion: manifest.HOST_API_VERSION,
    builtAt: new Date().toISOString(),
  })

  console.log(chalk.green(`Built ${m.name} v${m.version}`))
}
