import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { arch as nodeArch, platform as nodePlatform } from 'process'
import { spawnSync } from 'child_process'

export const SPACE_TOOL_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'windows-arm64',
  'windows-x64',
] as const

export type SpaceToolTarget = typeof SPACE_TOOL_TARGETS[number]

const GO_TARGETS: Record<SpaceToolTarget, { goos: string; goarch: string; ext: string }> = {
  'darwin-arm64': { goos: 'darwin', goarch: 'arm64', ext: '' },
  'darwin-x64': { goos: 'darwin', goarch: 'amd64', ext: '' },
  'linux-arm64': { goos: 'linux', goarch: 'arm64', ext: '' },
  'linux-x64': { goos: 'linux', goarch: 'amd64', ext: '' },
  'windows-arm64': { goos: 'windows', goarch: 'arm64', ext: '.exe' },
  'windows-x64': { goos: 'windows', goarch: 'amd64', ext: '.exe' },
}

export interface SpaceToolBuildInvocation {
  root: string
  target: SpaceToolTarget
  outputPath: string
  args: string[]
  env: Record<string, string | undefined>
}

export interface SpaceToolBuildResult {
  status: number | null
  stdout?: string
  stderr?: string
  error?: Error
}

export interface BuildSpaceToolsOptions {
  targets?: SpaceToolTarget[]
  env?: Record<string, string | undefined>
  runner?: (invocation: SpaceToolBuildInvocation) => SpaceToolBuildResult
}

export function isSpaceToolTarget(value: string): value is SpaceToolTarget {
  return (SPACE_TOOL_TARGETS as readonly string[]).includes(value)
}

export function currentSpaceToolTarget(platform = nodePlatform, arch = nodeArch): SpaceToolTarget | null {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64'
  if (platform === 'win32' && arch === 'x64') return 'windows-x64'
  return null
}

export function parseSpaceToolTargets(value = process.env.CONSTRUCT_TOOL_TARGETS): SpaceToolTarget[] {
  const raw = value?.trim()
  if (!raw) {
    const current = currentSpaceToolTarget()
    if (!current) throw new Error(`Unsupported tool build platform: ${nodePlatform}-${nodeArch}`)
    return [current]
  }

  if (raw === 'all') return [...SPACE_TOOL_TARGETS]

  const targets = raw.split(/[,\s]+/).filter(Boolean)
  const invalid = targets.filter(target => !isSpaceToolTarget(target))
  if (invalid.length > 0) {
    throw new Error(
      `Invalid CONSTRUCT_TOOL_TARGETS value: ${invalid.join(', ')}. ` +
      `Expected one or more of: ${SPACE_TOOL_TARGETS.join(', ')}, or "all".`,
    )
  }

  return Array.from(new Set(targets)) as SpaceToolTarget[]
}

function defaultRunner(invocation: SpaceToolBuildInvocation): SpaceToolBuildResult {
  const result = spawnSync('go', invocation.args, {
    cwd: invocation.root,
    env: invocation.env as NodeJS.ProcessEnv,
    encoding: 'utf-8',
  })

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  }
}

/**
 * Optional first-party tools contract:
 *
 * - Source: root `tools.go`
 * - Output: `dist/tools/<platform>/<space-id>-tools(.exe)`
 * - Runtime: Construct executes that tool from the installed `<id>.space`
 *   directory and puts `lib/<platform>` on PATH.
 */
export function buildSpaceTools(root: string, distDir: string, spaceId: string, options: BuildSpaceToolsOptions = {}): string[] {
  const sourcePath = join(root, 'tools.go')
  if (!existsSync(sourcePath)) return []

  const built: string[] = []
  const targets = options.targets ?? parseSpaceToolTargets(options.env?.CONSTRUCT_TOOL_TARGETS)
  const runner = options.runner ?? defaultRunner

  for (const target of targets) {
    const goTarget = GO_TARGETS[target]
    const outputDir = join(distDir, 'tools', target)
    const outputName = `${spaceId}-tools${goTarget.ext}`
    const outputPath = join(outputDir, outputName)
    mkdirSync(outputDir, { recursive: true })

    const env: Record<string, string | undefined> = {
      ...process.env,
      ...options.env,
      GOOS: goTarget.goos,
      GOARCH: goTarget.goarch,
    }
    if (!env.CGO_ENABLED) env.CGO_ENABLED = '0'

    const args = ['build', '-trimpath', '-o', outputPath, './tools.go']
    const result = runner({ root, target, outputPath, args, env })

    if (result.error) {
      throw new Error(`Failed to build tools.go for ${target}: ${result.error.message}`)
    }
    if (result.status !== 0) {
      const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      throw new Error(`Failed to build tools.go for ${target}${details ? `:\n${details}` : ''}`)
    }

    built.push(`tools/${target}/${outputName}`)
  }

  return built
}
