import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildSpaceTools,
  currentSpaceToolTarget,
  parseSpaceToolTargets,
  SPACE_TOOL_TARGETS,
} from './spaceTools.js'

describe('space tool build contract', () => {
  test('maps node platform/arch to Construct platform dirs', () => {
    expect(currentSpaceToolTarget('darwin', 'arm64')).toBe('darwin-arm64')
    expect(currentSpaceToolTarget('darwin', 'x64')).toBe('darwin-x64')
    expect(currentSpaceToolTarget('linux', 'arm64')).toBe('linux-arm64')
    expect(currentSpaceToolTarget('linux', 'x64')).toBe('linux-x64')
    expect(currentSpaceToolTarget('win32', 'arm64')).toBe('windows-arm64')
    expect(currentSpaceToolTarget('win32', 'x64')).toBe('windows-x64')
    expect(currentSpaceToolTarget('freebsd', 'x64')).toBeNull()
  })

  test('parses explicit target lists', () => {
    expect(parseSpaceToolTargets('darwin-arm64, linux-x64 darwin-arm64')).toEqual(['darwin-arm64', 'linux-x64'])
    expect(parseSpaceToolTargets('all')).toEqual([...SPACE_TOOL_TARGETS])
    expect(() => parseSpaceToolTargets('mac')).toThrow('Invalid CONSTRUCT_TOOL_TARGETS')
  })

  test('skips builds when tools.go is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-tools-'))
    try {
      const dist = join(root, 'dist')
      const built = buildSpaceTools(root, dist, 'mail', {
        targets: ['darwin-arm64'],
        runner: () => {
          throw new Error('runner should not be called')
        },
      })
      expect(built).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('builds root tools.go into tools/<platform>/<space>-tools', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-tools-'))
    try {
      const dist = join(root, 'dist')
      writeFileSync(join(root, 'tools.go'), 'package main\nfunc main() {}\n')

      const invocations: string[] = []
      const built = buildSpaceTools(root, dist, 'mail', {
        targets: ['darwin-arm64', 'windows-x64'],
        runner: ({ target, outputPath, args, env }) => {
          invocations.push(`${target}:${outputPath}:${args.join(' ')}:${env.GOOS}/${env.GOARCH}/${env.CGO_ENABLED}`)
          writeFileSync(outputPath, 'binary')
          return { status: 0 }
        },
      })

      expect(built).toEqual([
        'tools/darwin-arm64/mail-tools',
        'tools/windows-x64/mail-tools.exe',
      ])
      expect(existsSync(join(dist, 'tools', 'darwin-arm64', 'mail-tools'))).toBe(true)
      expect(existsSync(join(dist, 'tools', 'windows-x64', 'mail-tools.exe'))).toBe(true)
      expect(invocations[0]).toContain('darwin-arm64')
      expect(invocations[0]).toContain('darwin/arm64/0')
      expect(invocations[1]).toContain('windows/amd64/0')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
