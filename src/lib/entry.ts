import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import type { SpaceManifest } from './manifest.js'

function capitalize(s: string): string {
  if (!s) return s
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

interface PageInfo { varName: string; importPath: string; path: string }
interface WidgetImport { varName: string; importPath: string; widgetId: string; sizeKey: string }

function resolvePages(m: SpaceManifest, prefix: string): PageInfo[] {
  return m.pages.map(p => {
    let component = p.component
    if (!component) {
      component = p.path === '' ? 'pages/index.vue' : `pages/${p.path}.vue`
    }
    let varName = 'IndexPage'
    if (p.path) {
      let cleanPath = p.path.replace(/:/g, '')
      if (p.component) {
        let base = basename(p.component)
        base = base.replace(extname(base), '').replace(/[\[\]]/g, '')
        cleanPath = base
      }
      varName = capitalize(cleanPath) + 'Page'
    }
    return { varName, importPath: prefix + component, path: p.path }
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
  const pages = resolvePages(m, pagePrefix)
  const widgets = resolveWidgets(m, '../')
  const hasActions = existsSync(join(root, 'src', 'actions.ts'))

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
