import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { forkManifest } from './fork'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'construct-graph-fork-'))
  writeFileSync(join(tmpRoot, 'space.manifest.json'), JSON.stringify({
    id: 'pages',
    name: 'Pages',
    version: '0.1.0',
    description: 'Pages space',
    author: { name: 'Construct' },
    icon: 'i-lucide-file',
    scope: 'org',
    navigation: { label: 'Pages', icon: 'i-lucide-file', to: 'pages', order: 1 },
    pages: [{ path: '', label: 'Pages' }],
  }, null, 2) + '\n')
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('graph fork', () => {
  test('rewrites the local manifest id to a new graph namespace', () => {
    const result = forkManifest(tmpRoot, 'pages-flak')
    const next = JSON.parse(readFileSync(join(tmpRoot, 'space.manifest.json'), 'utf-8'))

    expect(result).toEqual({ oldSpaceID: 'pages', newSpaceID: 'pages-flak' })
    expect(next.id).toBe('pages-flak')
    expect(next.name).toBe('Pages')
  })

  test('rejects invalid space ids before writing', () => {
    expect(() => forkManifest(tmpRoot, 'Pages Flak')).toThrow('space id must be lowercase')
    const current = JSON.parse(readFileSync(join(tmpRoot, 'space.manifest.json'), 'utf-8'))
    expect(current.id).toBe('pages')
  })
})
