import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export const MANIFEST_FILE = 'space.manifest.json'

/**
 * Host API version this CLI targets. Stamped into every built manifest's
 * `build.hostApiVersion` so the runtime SpaceLoader can warn on mismatch.
 * Bump when the host API surface (UI components, SDK composables, graph
 * client) changes in a way that affects spaces.
 */
export const HOST_API_VERSION = '0.5.0'

export interface Author {
  name: string
  email?: string
  url?: string
}

export interface Navigation {
  label: string
  icon: string
  to: string
  order: number
}

export interface ToolbarItem {
  id: string
  icon: string
  label: string
  action?: string
  to?: string
}

export interface ContextMenuAction {
  type: string
  spaceId?: string
  page?: string
  mode?: string
  requestType?: string
  params?: Record<string, any>
  query?: Record<string, string>
}

export interface ContextMenuItem {
  id?: string
  label?: string
  icon?: string
  type?: string
  disabled?: boolean
  shortcut?: string
  children?: ContextMenuItem[]
  action?: ContextMenuAction
}

export interface Page {
  path: string
  label: string
  icon?: string
  default?: boolean
  requiresContext?: boolean
  component?: string
  toolbar?: ToolbarItem[]
}

export interface Dependencies {
  spaces?: string[]
  skills?: string[]
}

export interface Permissions {
  canAccessNetwork?: boolean
  canAccessFileSystem?: boolean
  canRunCommands?: boolean
}

export interface Theme {
  color: string
  bg: string
}

export interface Hooks {
  preBuild?: string
  postBuild?: string
  preDev?: string
  postDev?: string
}

export interface Widget {
  id: string
  name: string
  description?: string
  icon?: string
  defaultSize: string
  sizes: Record<string, string>
}

export interface ActionParam {
  type: string
  description?: string
  required?: boolean
}

export interface ActionDef {
  description: string
  params?: Record<string, ActionParam>
}

export interface ImportSpec {
  from: string
  models: string[]
}

/**
 * Data-layer configuration inside space.manifest.json.
 *
 * `bundle_id` attaches the space to a publisher bundle (e.g. kanban-suite).
 * `imports` re-uses models from sibling spaces in the same bundle — validated
 * at publish time; cross-bundle imports are rejected.
 *
 * Both fields pass through verbatim to the graph service on `construct graph
 * push`. Leave unset for standalone spaces.
 */
export interface GraphSpec {
  bundle_id?: string
  imports?: ImportSpec[]
}

export type SpaceScope = 'app' | 'org'

export interface SpaceManifest {
  id: string
  name: string
  version: string
  description: string
  author: Author
  icon: string
  /** Surfaces this space exposes itself on. Allowed: "app" | "org". */
  scopes: SpaceScope[]
  /**
   * True when the space adapts its behaviour to the active project context
   * (scoped queries, project-bound graph models, project page surfaces).
   * Orthogonal to `scopes`.
   */
  projectAware?: boolean
  minConstructVersion?: string
  navigation: Navigation
  pages: Page[]
  toolbar?: ToolbarItem[]
  contextMenus?: Record<string, ContextMenuItem[]>
  agent?: string
  skills?: string[]
  dependencies?: Dependencies
  permissions?: Permissions
  screenshots?: string[]
  keywords?: string[]
  recommended?: boolean
  theme?: Theme
  hooks?: Hooks
  widgets?: Widget[]
  /** Inline action metadata for lazy loading — injected by build from src/actions.ts */
  actions?: string | Record<string, ActionDef>
  /** Optional data-layer config: bundle membership + cross-space imports. */
  graph?: GraphSpec
}

export interface BuildMeta {
  checksum: string
  size: number
  hostApiVersion: string
  builtAt: string
}

const idRegex = /^[a-z][a-z0-9-]*$/
const versionRegex = /^\d+\.\d+\.\d+/

export function validate(m: SpaceManifest): string[] {
  const errors: string[] = []
  if (!m.id || !idRegex.test(m.id)) errors.push('id: must be lowercase alphanumeric with hyphens, starting with a letter')
  if (!m.name) errors.push('name: must be a non-empty string')
  if (!versionRegex.test(m.version)) errors.push('version: must be a valid semver (e.g. 1.0.0)')
  if (!m.description) errors.push('description: must be a string')
  if (!m.author?.name) errors.push('author: must be an object with a name')
  if (!m.icon) errors.push('icon: must be a string')
  const allowedScopes: SpaceScope[] = ['app', 'org']
  if (!Array.isArray(m.scopes) || m.scopes.length === 0 || !m.scopes.every(s => allowedScopes.includes(s))) {
    errors.push('scopes: must be a non-empty array of "app" or "org"')
  }
  if (m.projectAware !== undefined && typeof m.projectAware !== 'boolean') {
    errors.push('projectAware: must be a boolean')
  }
  if (!m.pages?.length) errors.push('pages: must be a non-empty array')
  if (!m.navigation?.label) errors.push('navigation: must be an object')
  return errors
}

export function read(dir: string): SpaceManifest {
  const path = join(dir, MANIFEST_FILE)
  const data = readFileSync(path, 'utf-8')
  return JSON.parse(data) as SpaceManifest
}

export function readRaw(dir: string): Record<string, any> {
  const path = join(dir, MANIFEST_FILE)
  const data = readFileSync(path, 'utf-8')
  return JSON.parse(data)
}

export function write(dir: string, m: SpaceManifest): void {
  const path = join(dir, MANIFEST_FILE)
  writeFileSync(path, JSON.stringify(m, null, 2) + '\n')
}

export function writeWithBuild(dir: string, raw: Record<string, any>, build: BuildMeta): void {
  raw.build = build
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(raw, null, 2) + '\n')
}

export function exists(dir: string): boolean {
  return existsSync(join(dir, MANIFEST_FILE))
}
