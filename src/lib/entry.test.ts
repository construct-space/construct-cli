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

    mkdirSync(join(root, 'src'), { recursive: true })
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
})
