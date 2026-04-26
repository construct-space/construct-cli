import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SpaceManifest } from './manifest.js'
import { generate } from './entry.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('generate', () => {
  test('includes actions export when src/actions.ts exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-entry-'))
    tempDirs.push(root)

    mkdirSync(join(root, 'src', 'pages'), { recursive: true })
    writeFileSync(join(root, 'src', 'pages', 'index.vue'), '<template><div /></template>\n')
    writeFileSync(join(root, 'src', 'actions.ts'), 'export const actions = {}\n')

    const manifest: SpaceManifest = {
      id: 'canvas',
      name: 'Canvas',
      version: '0.1.0',
      description: 'test',
      author: {
        name: 'Construct Team',
      },
      icon: 'icon',
      scope: 'app',
      navigation: {
        label: 'Canvas',
        icon: 'icon',
        to: 'canvas',
        order: 1,
      },
      pages: [
        { path: '', label: 'Canvas', default: true },
      ],
    }

    const output = generate(root, manifest)

    expect(output).toContain("import { actions } from './actions'")
    expect(output).toContain('  actions,')
  })

  test('produces a valid JS identifier for bracketed dynamic-route pages', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-entry-'))
    tempDirs.push(root)

    mkdirSync(join(root, 'src', 'pages', 'employee'), { recursive: true })
    writeFileSync(join(root, 'src', 'pages', 'index.vue'), '<template><div /></template>\n')
    writeFileSync(join(root, 'src', 'pages', 'employee', '[id].vue'), '<template><div /></template>\n')

    const manifest: SpaceManifest = {
      id: 'people',
      name: 'People',
      version: '0.1.0',
      description: 'test',
      author: { name: 'Construct Team' },
      icon: 'icon',
      scope: 'org',
      navigation: { label: 'People', icon: 'icon', to: 'people', order: 1 },
      pages: [
        { path: '', label: 'People', default: true },
        { path: 'employee/[id]', label: 'Employee' },
      ],
    }

    const output = generate(root, manifest)

    // Brackets must not survive into the import identifier — that's a syntax
    // error in JS. Either filesystem discovery (varNameFromFile) or the
    // legacy fallback path needs to strip them.
    expect(output).not.toMatch(/import\s+\w*\[\w+\]\w*Page/)
    // The page must still be wired up.
    expect(output).toMatch(/'employee\/\[id\]':\s*\w+Page/)
  })
})
