import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const allowedDirs = [
  'pages', 'components', 'composables', 'engine', 'agent', 'utils',
  'types', 'views', 'stores', 'spaces', 'data', 'src', 'public',
  'tests', 'widgets', 'tv', 'models',
  // Bundle resource dirs copied into the .space package. `tools/` is for
  // first-party space command binaries; `lib/` is for third-party helpers
  // such as ffmpeg that those tools may call.
  'icons', 'assets', 'media', 'tools', 'lib', 'go-tools',
]

const allowedRootFiles = [
  'space.manifest.json', 'package.json', 'tsconfig.json',
  'vite.config.ts', 'vite.config.js', 'space.config.ts',
  'types.ts', 'index.ts', 'SKILL.md',
  // Optional first-party native tool source. `construct build` compiles
  // this into tools/<platform>/<space-id>-tools inside the .space bundle.
  'tools.go', 'go.mod', 'go.sum',
]

const allowedRootPatterns = [/.*\.config\.ts$/, /.*\.config\.js$/]

const blockedExtensions = ['.env', '.log', '.lock', '.lockb']

const MAX_SIZE = 50 * 1024 * 1024

export async function packSource(root: string): Promise<string> {
  const tarballPath = join(tmpdir(), `space-source-${Date.now()}.tar.gz`)

  const entries: string[] = []

  // Collect allowed root files
  for (const name of allowedRootFiles) {
    if (existsSync(join(root, name))) entries.push(name)
  }

  // Collect root files matching patterns
  for (const entry of readdirSync(root)) {
    if (statSync(join(root, entry)).isDirectory()) continue
    if (allowedRootFiles.includes(entry)) continue
    if (blockedExtensions.some(ext => entry.endsWith(ext))) continue
    if (allowedRootPatterns.some(p => p.test(entry))) entries.push(entry)
  }

  // Collect allowed directories
  for (const dir of allowedDirs) {
    if (existsSync(join(root, dir))) entries.push(dir)
  }

  const validEntries = entries.filter(e => existsSync(join(root, e)))

  if (validEntries.length === 0) {
    throw new Error('No files to pack')
  }

  // Use system tar (available on macOS/Linux). execFileSync -- args go in
  // an array so a filename like `foo; rm -rf /.config.ts` (which would pass
  // the allowedRootPatterns regex) can't inject shell commands.
  const excludes = [
    '--exclude=node_modules',
    '--exclude=dist',
    '--exclude=.git',
    '--exclude=go-tools/spaceprobe',
    '--exclude=go-tools/spaceprobe.exe',
    '--exclude=*.env',
    '--exclude=*.log',
    '--exclude=*.lock',
    '--exclude=*.lockb',
  ]
  execFileSync('tar', ['czf', tarballPath, ...excludes, ...validEntries], { cwd: root })

  const size = statSync(tarballPath).size
  if (size > MAX_SIZE) {
    throw new Error(`Source exceeds maximum size of ${MAX_SIZE / 1024 / 1024}MB`)
  }

  return tarballPath
}
