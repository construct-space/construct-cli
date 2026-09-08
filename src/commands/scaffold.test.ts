import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scaffold } from './scaffold.js'

const originalCwd = process.cwd()

function scaffoldIn(tmpRoot: string, name: string, opts?: Parameters<typeof scaffold>[1]) {
  process.chdir(tmpRoot)
  return scaffold(name, { installDeps: async () => {}, ...opts })
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * All externals the host provides -- must match the keys in
 * construct-app/frontend/lib/spaceHost.ts initSpaceHost().
 *
 * When updating this list, also update vite.config.ts.tmpl and confirm
 * the host actually exposes the package -- externalising a non-exposed
 * package gives the space `undefined` at runtime.
 */
const HOST_EXTERNALS = [
  'vue',
  'vue-router',
  'pinia',
  '@vueuse/core',
  '@vueuse/integrations',
  'lucide-vue-next',
  'date-fns',
  'dexie',
  'zod',
  '@construct-space/ui',
  '@construct-space/sdk',
]

/**
 * Packages that look like they should be externalised but explicitly
 * MUST NOT be -- the host doesn't provide them. The scaffold's
 * vite.config.ts.tmpl must omit these so spaces bundle them locally.
 */
const HOST_NON_EXTERNALS = [
  '@construct-space/graph',
]

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'construct-scaffold-'))
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 1. File structure
// ---------------------------------------------------------------------------
describe('scaffold file structure', () => {
  test('produces expected files and directories', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const root = join(tmpRoot, 'my-space')

    const expected = [
      'space.manifest.json',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      '.gitignore',
      'README.md',
      'src/pages/index.vue',
      'src/actions.ts',
      'agent/config.md',
      'SKILL.md',
      'agent/hooks/safety.json',
      'widgets/summary/2x1.vue',
      'widgets/summary/4x1.vue',
    ]

    for (const file of expected) {
      expect(existsSync(join(root, file))).toBe(true)
    }
  })

  test('creates empty directories for components and composables', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const root = join(tmpRoot, 'my-space')

    expect(existsSync(join(root, 'src', 'components'))).toBe(true)
    expect(existsSync(join(root, 'src', 'composables'))).toBe(true)
    expect(existsSync(join(root, 'tools'))).toBe(true)
    expect(existsSync(join(root, 'lib'))).toBe(true)
    expect(existsSync(join(root, 'agent', 'tools'))).toBe(true)
  })

  test('installs dependencies after creating the space', async () => {
    const installs: string[] = []

    await scaffoldIn(tmpRoot, 'space-canvas', {
      installDeps: async (dir) => { installs.push(dir) },
    })

    expect(installs).toEqual(['space-canvas'])
  })
})

// ---------------------------------------------------------------------------
// 2. Manifest
// ---------------------------------------------------------------------------
describe('scaffold manifest', () => {
  test('has all required fields', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(manifest.id).toBe('my-space')
    expect(manifest.name).toBe('My Space')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.description).toBeString()
    expect(manifest.author.name).toBeString()
    expect(manifest.icon).toBeString()
    expect(manifest.scopes).toEqual(['app'])
    expect(manifest.projectAware).toBe(false)
    expect(manifest.navigation).toBeDefined()
    expect(manifest.navigation.label).toBe('My Space')
    expect(manifest.navigation.to).toBe('my-space')
    expect(Array.isArray(manifest.pages)).toBe(true)
    expect(manifest.pages.length).toBeGreaterThanOrEqual(1)
  })

  test('has agent and skills paths', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(manifest.agent).toBe('agent/config.md')
    expect(manifest.skills).toContain('SKILL.md')
  })

  test('creates agentskills.io skill anatomy at space root', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const root = join(tmpRoot, 'my-space')

    expect(existsSync(join(root, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(root, 'scripts'))).toBe(true)
    expect(existsSync(join(root, 'references'))).toBe(true)
    expect(existsSync(join(root, 'assets'))).toBe(true)
  })

  test('documents .space bundle tools and lib contract', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const root = join(tmpRoot, 'my-space')
    const readme = readFileSync(join(root, 'README.md'), 'utf-8')
    const constructGuide = readFileSync(join(root, 'CONSTRUCT.md'), 'utf-8')

    expect(readme).toContain('dist/my-space.space')
    expect(readme).toContain('tools/<platform>/my-space-tools')
    expect(readme).toContain('lib/<platform>/')
    expect(constructGuide).toContain('CONSTRUCT_TOOL_TARGETS=all')
    expect(constructGuide).toContain('SPACE_LIB')
  })

  test('has actions field pointing to src/actions.ts', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(manifest.actions).toBe('src/actions.ts')
  })

  test('has widgets array with size map', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(Array.isArray(manifest.widgets)).toBe(true)
    expect(manifest.widgets.length).toBeGreaterThanOrEqual(1)
    expect(manifest.widgets[0].sizes).toBeDefined()
  })

  test('minConstructVersion is at least 0.7.0', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    const [major, minor] = manifest.minConstructVersion.split('.').map(Number)
    expect(major! * 100 + minor!).toBeGreaterThanOrEqual(7)
  })

  test('strips space- prefix from id', async () => {
    await scaffoldIn(tmpRoot, 'space-canvas')
    const manifest = readJson(join(tmpRoot, 'space-canvas', 'space.manifest.json'))

    expect(manifest.id).toBe('canvas')
  })
})

// ---------------------------------------------------------------------------
// 3. Vite config -- host externals
// ---------------------------------------------------------------------------
describe('scaffold vite config', () => {
  test('externalizes all host packages', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')

    for (const ext of HOST_EXTERNALS) {
      expect(viteConfig).toContain(`'${ext}'`)
    }
  })

  test('does NOT externalize packages the host fails to expose', async () => {
    // Regression guard: @construct-space/graph used to be listed here,
    // but the host (spaceHost.ts) doesn't put it on window.__CONSTRUCT__.
    // Externalising it gave spaces `undefined` for defineModel at runtime.
    // Keep this assertion green by NEVER adding a package to externals
    // without first adding the matching entry to spaceHost.ts.
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')

    for (const ext of HOST_NON_EXTERNALS) {
      const externalListed = new RegExp(`['"]${ext.replace(/[./]/g, '\\$&')}['"]`).test(viteConfig)
      if (externalListed) {
        throw new Error(
          `vite.config.ts.tmpl externalises "${ext}", but the host doesn't expose it. ` +
          `Either bundle it (remove from hostExternals) or add it to ` +
          `construct-app/frontend/lib/spaceHost.ts initSpaceHost().`,
        )
      }
    }
  })

  test('uses IIFE format', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')

    expect(viteConfig).toContain("formats: ['iife']")
  })

  test('enables Tailwind CSS for release space bundles', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')
    const style = readFileSync(join(tmpRoot, 'my-space', 'src', 'style.css'), 'utf-8')
    const entry = readFileSync(join(tmpRoot, 'my-space', 'src', 'entry.ts'), 'utf-8')

    expect(viteConfig).toContain("import tailwindcss from '@tailwindcss/vite'")
    expect(viteConfig).toContain('plugins: [tailwindcss(), vue()]')
    expect(style).toContain('@import "tailwindcss"')
    expect(entry).toContain("import './style.css'")
  })

  test('sets correct library name from space id', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')

    expect(viteConfig).toContain("name: '__CONSTRUCT_SPACE_MY_SPACE'")
    expect(viteConfig).toContain("fileName: 'space-my-space'")
  })

  test('maps externals to window.__CONSTRUCT__ globals', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const viteConfig = readFileSync(join(tmpRoot, 'my-space', 'vite.config.ts'), 'utf-8')

    expect(viteConfig).toContain('window.__CONSTRUCT__')
  })

  test('does not generate stale @construct/sdk aliases', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const tsconfig = readFileSync(join(tmpRoot, 'my-space', 'tsconfig.json'), 'utf-8')

    expect(tsconfig).not.toContain('@construct/sdk')
    expect(tsconfig).toContain('"@/*"')
  })

  test('documents graph as bundled, not host-external', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const guide = readFileSync(join(tmpRoot, 'my-space', 'CONSTRUCT.md'), 'utf-8')

    expect(guide).toContain('@construct-space/ui` and `@construct-space/sdk` are host-provided externals')
    expect(guide).toContain('@construct-space/graph` is bundled locally')
    expect(guide).not.toContain('All four are **host-provided externals**')
    expect(guide).not.toContain('@construct-space/*` packages always external')
  })
})

// ---------------------------------------------------------------------------
// 4. Agent config
// ---------------------------------------------------------------------------
describe('scaffold agent config', () => {
  test('agent config.md exists and references space id', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const config = readFileSync(join(tmpRoot, 'my-space', 'agent', 'config.md'), 'utf-8')

    expect(config).toContain('my-space')
    expect(config).toContain('My Space')
  })

  test('SKILL.md exists with agentskills.io-compliant frontmatter', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const skill = readFileSync(join(tmpRoot, 'my-space', 'SKILL.md'), 'utf-8')

    // Spec-required fields. name must match the parent dir (the space id).
    expect(skill).toContain('name: my-space')
    expect(skill).toContain('description:')
    // Spec-tolerated extras Construct still uses.
    expect(skill).toContain('allowed-tools:')
    expect(skill).toContain('category: space')
    // Legacy fields removed: id (folder name encodes it), trigger
    // (description-based semantic match), tools as array (allowed-tools).
    expect(skill).not.toContain('\nid:')
    expect(skill).not.toContain('trigger:')
    expect(skill).not.toMatch(/\btools:\s*\[/)
  })

  test('safety.json exists with hooks array', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const safety = readJson(join(tmpRoot, 'my-space', 'agent', 'hooks', 'safety.json'))

    expect(Array.isArray(safety.hooks)).toBe(true)
    expect(safety.hooks.length).toBeGreaterThanOrEqual(1)
    expect(safety.hooks[0].type).toBe('pre_tool')
  })
})

// ---------------------------------------------------------------------------
// 5. Package.json
// ---------------------------------------------------------------------------
describe('scaffold package.json', () => {
  test('has peer dependencies for host-provided packages', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const pkg = readJson(join(tmpRoot, 'my-space', 'package.json'))

    expect(pkg.peerDependencies.vue).toBeDefined()
    expect(pkg.peerDependencies.pinia).toBeDefined()
    expect(pkg.peerDependencies['@vueuse/core']).toBeDefined()
  })

  test('has devDependencies for build tooling', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const pkg = readJson(join(tmpRoot, 'my-space', 'package.json'))

    expect(pkg.devDependencies.vite).toBeDefined()
    expect(pkg.devDependencies.tailwindcss).toBeDefined()
    expect(pkg.devDependencies['@tailwindcss/vite']).toBeDefined()
    expect(pkg.devDependencies['@vitejs/plugin-vue']).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
    expect(pkg.devDependencies['@construct-space/cli']).toBeDefined()
    expect(pkg.devDependencies['@construct-space/sdk']).toBeDefined()
  })

  test('has correct scripts', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const pkg = readJson(join(tmpRoot, 'my-space', 'package.json'))

    expect(pkg.scripts.build).toBeDefined()
    expect(pkg.scripts.dev).toBeDefined()
    expect(pkg.scripts.validate).toBeDefined()
  })

  test('version matches manifest version', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const pkg = readJson(join(tmpRoot, 'my-space', 'package.json'))
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(pkg.version).toBe(manifest.version)
  })
})

// ---------------------------------------------------------------------------
// 6. Full preset
// ---------------------------------------------------------------------------
describe('scaffold --full', () => {
  test('creates settings page', async () => {
    await scaffoldIn(tmpRoot, 'my-space', { full: true })
    const root = join(tmpRoot, 'my-space')

    expect(existsSync(join(root, 'src', 'pages', 'settings.vue'))).toBe(true)
  })

  test('manifest includes settings page', async () => {
    await scaffoldIn(tmpRoot, 'my-space', { full: true })
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    const paths = manifest.pages.map((p: any) => p.path)
    expect(paths).toContain('')
    expect(paths).toContain('settings')
  })

  test('creates reference docs the SKILL.md links to', async () => {
    await scaffoldIn(tmpRoot, 'my-space', { full: true })
    const root = join(tmpRoot, 'my-space')

    expect(existsSync(join(root, 'references', 'data.md'))).toBe(true)
    // ui.md is intentionally no longer scaffolded (see "Stop scaffolding the
    // generic ui.md reference in new spaces") -- data.md is the only seeded doc.
  })

  test('manifest points at the single space-root SKILL.md', async () => {
    await scaffoldIn(tmpRoot, 'my-space', { full: true })
    const manifest = readJson(join(tmpRoot, 'my-space', 'space.manifest.json'))

    expect(manifest.skills).toEqual(['SKILL.md'])
  })

  test('still has all base files', async () => {
    await scaffoldIn(tmpRoot, 'my-space', { full: true })
    const root = join(tmpRoot, 'my-space')

    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'src', 'actions.ts'))).toBe(true)
    expect(existsSync(join(root, 'agent', 'config.md'))).toBe(true)
    expect(existsSync(join(root, 'agent', 'hooks', 'safety.json'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Graph path
// ---------------------------------------------------------------------------
describe('scaffold graph path', () => {
  test('actions.ts references graph SDK and exports a starter action', async () => {
    await scaffoldIn(tmpRoot, 'my-space')
    const actions = readFileSync(join(tmpRoot, 'my-space', 'src', 'actions.ts'), 'utf-8')

    expect(actions).toContain('@construct-space/graph')
    expect(actions).toContain('export const actions')
    expect(actions).toContain('ping:')
  })
})

// ---------------------------------------------------------------------------
// 8. Template rendering
// ---------------------------------------------------------------------------
describe('template rendering', () => {
  test('replaces all template variables', async () => {
    await scaffoldIn(tmpRoot, 'my-cool-tool')
    const root = join(tmpRoot, 'my-cool-tool')

    const manifest = readFileSync(join(root, 'space.manifest.json'), 'utf-8')
    const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf-8')
    const config = readFileSync(join(root, 'agent', 'config.md'), 'utf-8')

    // Should not contain any unreplaced template variables
    for (const content of [manifest, viteConfig, config]) {
      expect(content).not.toContain('{{.Name}}')
      expect(content).not.toContain('{{.ID}}')
      expect(content).not.toContain('{{.IDUpper}}')
      expect(content).not.toContain('{{.DisplayName}}')
      expect(content).not.toContain('{{.DisplayNameNoSpace}}')
    }
  })
})
