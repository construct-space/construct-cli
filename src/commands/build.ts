import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import chalk from 'chalk'
import ora from 'ora'
import * as manifest from '../lib/manifest.js'
import { writeEntry } from '../lib/entry.js'
import { detect, ensureDeps, buildCmd, runHook } from '../lib/runtime.js'
import { createSpaceBundle, stageSpaceResources } from '../lib/spaceBundle.js'
import { buildSpaceTools } from '../lib/spaceTools.js'

/**
 * Extract action metadata (description + params) from src/actions.ts.
 * Parses the exported `actions` object statically -- does NOT execute the file.
 * Falls back gracefully if the file uses dynamic patterns we can't parse.
 */
function stripTsComments(source: string): string {
  let out = ''
  let i = 0
  let quote: '"' | "'" | '`' | null = null
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
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out += '\n'
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i += 1
      }
      i += 2
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  let quote: '"' | "'" | '`' | null = null
  let escaped = false

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]!

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }

  return -1
}

function readObjectEntries(source: string): Array<{ key: string; body: string }> {
  const entries: Array<{ key: string; body: string }> = []
  let i = 0

  while (i < source.length) {
    while (i < source.length && /[\s,]/.test(source[i]!)) i += 1
    if (i >= source.length) break

    let key: string
    const quote = source[i]
    if (quote === '"' || quote === "'" || quote === '`') {
      i += 1
      const start = i
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i += 1
        i += 1
      }
      key = source.slice(start, i)
      i += 1
    } else {
      const match = /^[A-Za-z_$][\w$-]*/.exec(source.slice(i))
      if (!match) {
        i += 1
        continue
      }
      key = match[0]
      i += key.length
    }

    while (i < source.length && /\s/.test(source[i]!)) i += 1
    if (source[i] !== ':') continue
    i += 1
    while (i < source.length && /\s/.test(source[i]!)) i += 1
    if (source[i] !== '{') continue

    const close = findMatchingBrace(source, i)
    if (close === -1) break
    entries.push({ key, body: source.slice(i + 1, close) })
    i = close + 1
  }

  return entries
}

function getNamedObjectBody(source: string, name: string): string | null {
  return readObjectEntries(source).find(entry => entry.key === name)?.body ?? null
}

export function extractActionMetadata(actionsPath: string): Record<string, { description: string; params?: Record<string, { type: string; description?: string; required?: boolean }> }> | null {
  try {
    const source = stripTsComments(readFileSync(actionsPath, 'utf-8'))
    const actionsMatch = /export\s+const\s+actions\s*=\s*\{/.exec(source)
    if (!actionsMatch) return null

    const actionsOpen = source.indexOf('{', actionsMatch.index)
    const actionsClose = findMatchingBrace(source, actionsOpen)
    if (actionsClose === -1) return null
    const actionsBody = source.slice(actionsOpen + 1, actionsClose)

    const result: Record<string, { description: string; params?: Record<string, { type: string; description?: string; required?: boolean }> }> = {}

    for (const entry of readObjectEntries(actionsBody)) {
      const descriptionMatch = /\bdescription\s*:\s*['"`]([^'"`]+)['"`]/.exec(entry.body)
      if (!descriptionMatch) continue
      const actionId = entry.key
      const description = descriptionMatch[1]!
      result[actionId] = { description }

      const paramsBody = getNamedObjectBody(entry.body, 'params')
      if (paramsBody) {
        const params: Record<string, { type: string; description?: string; required?: boolean }> = {}
        for (const paramEntry of readObjectEntries(paramsBody)) {
          const typeMatch = /\btype\s*:\s*['"`](\w+)['"`]/.exec(paramEntry.body)
          if (!typeMatch) continue
          const paramDescriptionMatch = /\bdescription\s*:\s*['"`]([^'"`]*)['"`]/.exec(paramEntry.body)
          const requiredMatch = /\brequired\s*:\s*(true|false)/.exec(paramEntry.body)
          params[paramEntry.key] = {
            type: typeMatch[1]!,
            ...(paramDescriptionMatch?.[1] ? { description: paramDescriptionMatch[1] } : {}),
            ...(requiredMatch?.[1] === 'true' ? { required: true } : {}),
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

  // Copy resources into dist before packaging the .space bundle.
  const copiedResources = stageSpaceResources(root, join(root, 'dist'))
  if (copiedResources.length > 0) {
    console.log(chalk.blue(`  Resources: ${copiedResources.join(', ')}`))
  }

  try {
    const builtTools = buildSpaceTools(root, join(root, 'dist'), m.id)
    if (builtTools.length > 0) {
      console.log(chalk.blue(`  Tools: ${builtTools.join(', ')}`))
    }
  } catch (err: any) {
    console.error(chalk.red(err?.message || String(err)))
    process.exit(1)
  }

  // Write dist/manifest.json with build metadata, then package dist/<id>.space.
  const distDir = join(root, 'dist')
  const expectedBundle = `space-${m.id}.iife.js`
  const bundlePath = join(distDir, expectedBundle)

  if (!existsSync(bundlePath)) {
    const matches = readdirSync(distDir).filter(f => f.startsWith('space-') && f.endsWith('.iife.js'))
    if (matches.length === 1) {
      renameSync(join(distDir, matches[0]!), bundlePath)
      const oldCSS = join(distDir, matches[0]!.replace('.iife.js', '.css'))
      const newCSS = join(distDir, `space-${m.id}.css`)
      if (existsSync(oldCSS)) renameSync(oldCSS, newCSS)
    }
  }
  if (!existsSync(bundlePath)) {
    console.error(chalk.red(`Build did not emit ${expectedBundle}`))
    process.exit(1)
  }

  // Vite library builds normally emit `space-{id}.css`, but custom
  // configs and older Vite versions can emit `style.css` / entry-name
  // CSS while still producing the expected JS bundle. Normalize one CSS
  // artifact before copying it into the <id>.space ZIP as style.css.
  const expectedCSS = join(distDir, `space-${m.id}.css`)
  if (!existsSync(expectedCSS)) {
    const cssMatches = readdirSync(distDir).filter(f => f.endsWith('.css'))
    const renamedCSS = cssMatches.find(f => f.startsWith('space-')) || (cssMatches.length === 1 ? cssMatches[0] : undefined)
    if (renamedCSS) renameSync(join(distDir, renamedCSS), expectedCSS)
  }
  if (!existsSync(expectedCSS)) {
    console.error(chalk.red(`Build did not emit CSS. Spaces must import src/style.css so pages and widgets are self-contained.`))
    process.exit(1)
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

  const spaceBundle = createSpaceBundle({
    distDir,
    spaceId: m.id,
    appBundlePath: bundlePath,
    cssPath: expectedCSS,
  })

  for (const entry of readdirSync(distDir)) {
    if (entry === `${m.id}.space`) continue
    rmSync(join(distDir, entry), { recursive: true, force: true })
  }

  console.log(chalk.green(`Built ${m.name} v${m.version} -> dist/${m.id}.space`))
  console.log(chalk.dim(`  ${spaceBundle.files.length} files, ${spaceBundle.hasStyle ? 'style.css included' : 'no style.css'}`))
}
