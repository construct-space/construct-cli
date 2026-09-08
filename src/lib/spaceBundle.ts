import { createHash } from 'crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'

export interface SpaceBundleResult {
  /** Final .space artifact path. A .space file is a ZIP container. */
  path: string
  /** @deprecated Kept as an alias for older callers; use path. */
  dir: string
  hasStyle: boolean
  files: string[]
}

export interface CreateSpaceBundleOptions {
  distDir: string
  spaceId: string
  appBundlePath: string
  cssPath?: string
}

const BUNDLE_DIRS = ['agent', 'scripts', 'references', 'assets', 'icons', 'media', 'public', 'tools', 'lib'] as const
const BUNDLE_FILES = ['SKILL.md'] as const

export function stageSpaceResources(root: string, distDir: string): string[] {
  const copied: string[] = []
  for (const name of BUNDLE_DIRS) {
    rmSync(join(distDir, name), { recursive: true, force: true })
    const src = join(root, name)
    if (!existsSync(src) || !lstatSync(src).isDirectory()) continue
    cpSync(src, join(distDir, name), { recursive: true, verbatimSymlinks: true })
    copied.push(name)
  }
  for (const name of BUNDLE_FILES) {
    rmSync(join(distDir, name), { recursive: true, force: true })
    const src = join(root, name)
    if (!existsSync(src) || !lstatSync(src).isFile()) continue
    cpSync(src, join(distDir, name), { verbatimSymlinks: true })
    copied.push(name)
  }
  return copied
}

function slashPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function copyFileIntoBundle(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true })
  cpSync(src, dst, { verbatimSymlinks: true })
}

function collectFiles(root: string): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        walk(path)
      } else if (stat.isFile()) {
        files.push(slashPath(relative(root, path)))
      }
    }
  }

  walk(root)
  return files
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function writeChecksums(spaceDir: string, spaceId: string): string[] {
  const files = collectFiles(spaceDir).filter(file => file !== 'checksums.json')
  const checksums: Record<string, string> = {}
  for (const file of files) {
    checksums[file] = sha256(join(spaceDir, file))
  }

  writeFileSync(
    join(spaceDir, 'checksums.json'),
    JSON.stringify({
      format: 'construct.space/v1',
      id: spaceId,
      files: checksums,
    }, null, 2) + '\n',
  )

  return collectFiles(spaceDir)
}

let crcTable: number[] | null = null

function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      }
      crcTable[n] = c >>> 0
    }
  }

  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number): Buffer {
  const out = Buffer.allocUnsafe(2)
  out.writeUInt16LE(value & 0xffff, 0)
  return out
}

function u32(value: number): Buffer {
  const out = Buffer.allocUnsafe(4)
  out.writeUInt32LE(value >>> 0, 0)
  return out
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function writeZipFile(outputPath: string, root: string, files: string[]): void {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const abs = join(root, file)
    const stat = statSync(abs)
    const data = readFileSync(abs)
    const name = Buffer.from(file, 'utf8')
    const checksum = crc32(data)
    const modified = dosDateTime(stat.mtime)
    const mode = (stat.mode & 0xffff) << 16

    const localHeader = Buffer.concat([
      u32(0x04034b50), // local file header
      u16(20), // version needed
      u16(0x0800), // UTF-8 file names
      u16(0), // store, no compression
      u16(modified.time),
      u16(modified.date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ])

    chunks.push(localHeader, data)

    central.push(Buffer.concat([
      u32(0x02014b50), // central directory header
      u16((3 << 8) | 20), // made by Unix, ZIP 2.0
      u16(20),
      u16(0x0800),
      u16(0),
      u16(modified.time),
      u16(modified.date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(mode),
      u32(offset),
      name,
    ]))

    offset += localHeader.length + data.length
  }

  const centralStart = offset
  const centralDir = Buffer.concat(central)
  const end = Buffer.concat([
    u32(0x06054b50), // end of central directory
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(centralStart),
    u16(0),
  ])

  writeFileSync(outputPath, Buffer.concat([...chunks, centralDir, end]))
}

/**
 * Build an opaque Construct space bundle inside dist/.
 *
 * The .space file is a ZIP container: canonical app JS, style CSS, manifest,
 * assets, agent files, first-party tools, optional bundled libs, and integrity
 * metadata in one artifact.
 */
export function createSpaceBundle(options: CreateSpaceBundleOptions): SpaceBundleResult {
  const spacePath = join(options.distDir, `${options.spaceId}.space`)
  const stageDir = join(options.distDir, `.${options.spaceId}.space-stage`)
  const appName = basename(options.appBundlePath)
  const cssName = options.cssPath ? basename(options.cssPath) : ''

  rmSync(spacePath, { recursive: true, force: true })
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })

  copyFileIntoBundle(join(options.distDir, 'manifest.json'), join(stageDir, 'manifest.json'))
  copyFileIntoBundle(options.appBundlePath, join(stageDir, 'app.iife.js'))

  const hasStyle = Boolean(options.cssPath && existsSync(options.cssPath))
  if (hasStyle && options.cssPath) {
    copyFileIntoBundle(options.cssPath, join(stageDir, 'style.css'))
  }

  for (const entry of readdirSync(options.distDir)) {
    if (entry === `${options.spaceId}.space`) continue
    if (entry === `.${options.spaceId}.space-stage`) continue
    if (entry.endsWith('.space')) continue
    if (entry === 'manifest.json') continue
    if (entry === appName || entry === cssName) continue
    if (entry.endsWith('.iife.js') || entry.endsWith('.css')) continue

    cpSync(join(options.distDir, entry), join(stageDir, entry), {
      recursive: true,
      verbatimSymlinks: true,
    })
  }

  const files = writeChecksums(stageDir, options.spaceId)
  writeZipFile(spacePath, stageDir, files)
  rmSync(stageDir, { recursive: true, force: true })

  return {
    path: spacePath,
    dir: spacePath,
    hasStyle,
    files,
  }
}
