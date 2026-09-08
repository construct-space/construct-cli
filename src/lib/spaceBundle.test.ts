import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createSpaceBundle, stageSpaceResources } from './spaceBundle.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('space bundle packaging', () => {
  function readStoredZip(path: string): Map<string, Buffer> {
    const zip = readFileSync(path)
    const files = new Map<string, Buffer>()
    let offset = 0

    while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
      const method = zip.readUInt16LE(offset + 8)
      const compressedSize = zip.readUInt32LE(offset + 18)
      const nameLength = zip.readUInt16LE(offset + 26)
      const extraLength = zip.readUInt16LE(offset + 28)
      const nameStart = offset + 30
      const dataStart = nameStart + nameLength + extraLength
      const dataEnd = dataStart + compressedSize
      const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8')

      expect(method).toBe(0)
      files.set(name, zip.subarray(dataStart, dataEnd))
      offset = dataEnd
    }

    return files
  }

  test('creates canonical .space zip with resources and checksums', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-space-bundle-'))
    tempDirs.push(root)
    const dist = join(root, 'dist')
    mkdirSync(join(root, 'agent'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, 'assets'), { recursive: true })
    mkdirSync(join(root, 'tools', 'darwin-arm64'), { recursive: true })
    mkdirSync(join(root, 'lib', 'darwin-arm64'), { recursive: true })
    mkdirSync(dist, { recursive: true })

    writeFileSync(join(root, 'agent', 'config.md'), '# Agent\n')
    writeFileSync(join(root, 'SKILL.md'), '---\nname: board\n---\n')
    writeFileSync(join(root, 'scripts', 'probe.ts'), 'export {}\n')
    writeFileSync(join(root, 'assets', 'logo.svg'), '<svg />\n')
    writeFileSync(join(root, 'tools', 'darwin-arm64', 'board-tools'), '#!/bin/sh\n')
    writeFileSync(join(root, 'lib', 'darwin-arm64', 'ffmpeg'), '#!/bin/sh\n')
    writeFileSync(join(dist, 'manifest.json'), JSON.stringify({ id: 'board' }) + '\n')
    writeFileSync(join(dist, 'space-board.iife.js'), 'window.__CONSTRUCT_SPACE_BOARD={pages:{}}\n')
    writeFileSync(join(dist, 'space-board.css'), '.text-xs{font-size:.75rem}\n')

    stageSpaceResources(root, dist)
    const result = createSpaceBundle({
      distDir: dist,
      spaceId: 'board',
      appBundlePath: join(dist, 'space-board.iife.js'),
      cssPath: join(dist, 'space-board.css'),
    })

    const bundle = join(dist, 'board.space')
    expect(result.path).toBe(bundle)
    expect(result.dir).toBe(bundle)
    expect(existsSync(bundle)).toBe(true)
    expect(readFileSync(bundle).subarray(0, 2).toString('utf8')).toBe('PK')

    const files = readStoredZip(bundle)
    expect(files.has('manifest.json')).toBe(true)
    expect(files.has('app.iife.js')).toBe(true)
    expect(files.has('style.css')).toBe(true)
    expect(files.has('agent/config.md')).toBe(true)
    expect(files.has('SKILL.md')).toBe(true)
    expect(files.has('scripts/probe.ts')).toBe(true)
    expect(files.has('assets/logo.svg')).toBe(true)
    expect(files.has('tools/darwin-arm64/board-tools')).toBe(true)
    expect(files.has('lib/darwin-arm64/ffmpeg')).toBe(true)

    const checksums = JSON.parse(files.get('checksums.json')!.toString('utf8'))
    expect(checksums.format).toBe('construct.space/v1')
    expect(checksums.id).toBe('board')
    expect(checksums.files['app.iife.js']).toBeString()
    expect(checksums.files['style.css']).toBeString()
    expect(checksums.files['agent/config.md']).toBeString()
    expect(checksums.files['tools/darwin-arm64/board-tools']).toBeString()
    expect(checksums.files['lib/darwin-arm64/ffmpeg']).toBeString()
  })

  test('staging resources removes stale managed bundle dirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-space-bundle-'))
    tempDirs.push(root)
    const dist = join(root, 'dist')
    mkdirSync(join(root, 'lib', 'darwin-arm64'), { recursive: true })
    mkdirSync(join(dist, 'lib', 'darwin-arm64'), { recursive: true })
    writeFileSync(join(root, 'lib', 'darwin-arm64', 'ffmpeg'), '#!/bin/sh\n')
    writeFileSync(join(dist, 'lib', 'darwin-arm64', 'old-helper'), '#!/bin/sh\n')

    stageSpaceResources(root, dist)

    expect(existsSync(join(dist, 'lib', 'darwin-arm64', 'ffmpeg'))).toBe(true)
    expect(existsSync(join(dist, 'lib', 'darwin-arm64', 'old-helper'))).toBe(false)
  })
})
