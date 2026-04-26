import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join, basename, extname, relative } from 'path'
import type { SpaceManifest } from './manifest.js'

function capitalize(s: string): string {
  if (!s) return s
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

interface PageInfo { varName: string; importPath: string; path: string }
interface WidgetImport { varName: string; importPath: string; widgetId: string; sizeKey: string }

/**
 * Filesystem entry discovered under src/pages/.
 * `filePath` is relative to src/ (e.g. "pages/members/[id].vue").
 * `routePath` is the route it maps to (e.g. "members/:id").
 */
interface FsPage {
  filePath: string
  routePath: string
}

/**
 * Recursively scan a directory for .vue files and map them to route paths.
 * Convention: [param] in filenames/dirs → :param in routes; index.vue → empty segment.
 */
function scanPagesDir(pagesDir: string): FsPage[] {
  const results: FsPage[] = []

  function walk(dir: string, routeSegments: string[]): void {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir).sort()
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        // Convert [param] dir to :param segment
        const segment = entry.replace(/^\[(.+)\]$/, ':$1')
        walk(fullPath, [...routeSegments, segment])
      } else if (stat.isFile() && entry.endsWith('.vue')) {
        const nameWithoutExt = entry.replace(/\.vue$/, '')
        const relFile = relative(join(pagesDir, '..'), fullPath).replace(/\\/g, '/')

        let routePath: string
        if (nameWithoutExt === 'index') {
          // index.vue maps to the current route segment (no additional segment)
          routePath = routeSegments.join('/')
        } else {
          // Convert [param] in filename to :param
          const segment = nameWithoutExt.replace(/^\[(.+)\]$/, ':$1')
          routePath = [...routeSegments, segment].join('/')
        }

        results.push({ filePath: relFile, routePath })
      }
    }
  }

  walk(pagesDir, [])
  return results
}

/**
 * Generate a safe JS variable name from a file path relative to src/.
 * Includes parent dir segments for nested files to avoid collisions.
 * e.g. "pages/members/[id].vue" → "MembersIdPage"
 *      "pages/index.vue" → "IndexPage"
 *      "pages/departments/[id].vue" → "DepartmentsIdPage"
 */
function varNameFromFile(filePath: string): string {
  // Strip leading "pages/" and trailing ".vue"
  let cleaned = filePath
    .replace(/^pages\//, '')
    .replace(/\.vue$/, '')

  // Strip bracket syntax: [param] → param
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, '$1')

  // Split on / and - to get segments, capitalize each
  const segments = cleaned.split(/[\/-]/).filter(Boolean)
  const name = segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')

  return (name || 'Index') + 'Page'
}

function resolvePages(m: SpaceManifest, root: string, prefix: string): PageInfo[] {
  const pagesDir = join(root, 'src', 'pages')
  const fsPages = scanPagesDir(pagesDir)

  // Build a map from route path → FsPage for quick lookup
  const fsMap = new Map<string, FsPage>()
  for (const fp of fsPages) {
    fsMap.set(fp.routePath, fp)
  }

  return m.pages.map(p => {
    // 1. Explicit component override from manifest
    if (p.component) {
      const base = basename(p.component)
      const nameWithoutExt = base.replace(extname(base), '').replace(/[\[\]]/g, '')
      // Include parent directory in var name for explicit components too
      const dir = p.component.replace(/^pages\//, '').replace(/\/[^/]+$/, '')
      let varName: string
      if (dir && dir !== p.component.replace(/^pages\//, '')) {
        varName = capitalize(dir.split('/').map(s => s.replace(/[\[\]]/g, '')).join('-')) + capitalize(nameWithoutExt) + 'Page'
      } else {
        varName = capitalize(nameWithoutExt) + 'Page'
      }
      return { varName, importPath: prefix + p.component, path: p.path }
    }

    // 2. Filesystem discovery
    const fsPage = fsMap.get(p.path)
    if (fsPage) {
      const varName = varNameFromFile(fsPage.filePath)
      return { varName, importPath: prefix + fsPage.filePath, path: p.path }
    }

    // 3. Legacy fallback: pages/{path}.vue
    const legacyComponent = p.path === '' ? 'pages/index.vue' : `pages/${p.path}.vue`
    const legacyFullPath = join(root, 'src', legacyComponent)
    if (existsSync(legacyFullPath)) {
      let varName = 'IndexPage'
      if (p.path) {
        // Strip route-param brackets ([id]) and colons (:id) so the resulting
        // identifier is a valid JS name. Without this, "employee/[id]" became
        // "Employee[id]Page" and crashed the bundler.
        varName = capitalize(
          p.path
            .replace(/\[([^\]]+)\]/g, '$1')
            .replace(/[\/:]/g, '-')
            .replace(/-+/g, '-'),
        ) + 'Page'
      }
      return { varName, importPath: prefix + legacyComponent, path: p.path }
    }

    // 4. Nothing found — error
    throw new Error(
      `[entry] Could not resolve component for page "${p.path}". ` +
      `Checked: manifest component field, filesystem scan of src/pages/, ` +
      `and legacy fallback at ${legacyComponent}. ` +
      `Ensure a .vue file exists for this route.`
    )
  })
}

function resolveWidgets(m: SpaceManifest, prefix: string): WidgetImport[] {
  const imports: WidgetImport[] = []
  for (const w of m.widgets || []) {
    for (const sizeKey of Object.keys(w.sizes).sort()) {
      imports.push({
        varName: capitalize(w.id) + 'Widget' + sizeKey,
        importPath: prefix + w.sizes[sizeKey],
        widgetId: w.id,
        sizeKey,
      })
    }
  }
  return imports
}

export function generate(root: string, m: SpaceManifest): string {
  const pagePrefix = existsSync(join(root, 'src', 'pages')) ? './' : '../'
  const pages = resolvePages(m, root, pagePrefix)
  const widgets = resolveWidgets(m, '../')
  const actionsPath = join(root, 'src', 'actions.ts')
  const hasActions = existsSync(actionsPath)
  console.log(`[entry] root=${root} actionsPath=${actionsPath} hasActions=${hasActions}`)

  const lines: string[] = [
    '// Auto-generated entry — do not edit manually',
    '// Generated from space.manifest.json',
  ]

  for (const p of pages) lines.push(`import ${p.varName} from '${p.importPath}'`)
  for (const w of widgets) lines.push(`import ${w.varName} from '${w.importPath}'`)
  if (hasActions) lines.push("import { actions } from './actions'")

  lines.push('')
  lines.push('const spaceExport = {')
  lines.push('  pages: {')
  for (const p of pages) lines.push(`    '${p.path}': ${p.varName},`)
  lines.push('  },')

  if (widgets.length > 0) {
    lines.push('  widgets: {')
    const byId = new Map<string, WidgetImport[]>()
    const order: string[] = []
    for (const w of widgets) {
      if (!byId.has(w.widgetId)) { order.push(w.widgetId); byId.set(w.widgetId, []) }
      byId.get(w.widgetId)!.push(w)
    }
    for (const wid of order) {
      lines.push(`    '${wid}': {`)
      for (const w of byId.get(wid)!) lines.push(`      '${w.sizeKey}': ${w.varName},`)
      lines.push('    },')
    }
    lines.push('  },')
  }

  if (hasActions) lines.push('  actions,')

  lines.push('}')
  lines.push('')
  lines.push('export default spaceExport')

  return lines.join('\n') + '\n'
}

export function writeEntry(root: string, m: SpaceManifest): void {
  const srcDir = join(root, 'src')
  mkdirSync(srcDir, { recursive: true })
  writeFileSync(join(srcDir, 'entry.ts'), generate(root, m))
}
