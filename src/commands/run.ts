import { existsSync, cpSync, mkdirSync, readdirSync, chmodSync, lstatSync, rmSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import * as manifest from '../lib/manifest.js'
import { bundleAgentDir } from '../lib/agent.js'
import { spaceDir } from '../lib/appdir.js'

/**
 * Walk <installDir>/bin and ensure every regular file is executable.
 * cpSync preserves mode bits, but tarball extractors and FAT filesystems can
 * drop them — chmod here is a belt-and-suspenders fix so `useSpaceBinary`
 * works on first launch without relying on the chmod fallback in the host.
 */
function ensureBinExecutable(installDir: string): void {
  if (process.platform === 'win32') return
  const binRoot = join(installDir, 'bin')
  if (!existsSync(binRoot)) return
  // Use lstat (not stat) so we never follow a symlink: a malicious build
  // that sticks a symlink in bin/ pointing at /etc/passwd would otherwise
  // get its target chmodded +x. We just skip symlinks entirely — host
  // sandbox should reject them at load time anyway.
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const st = lstatSync(path)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        walk(path)
      } else if (st.isFile()) {
        // Add user/group/other exec bits without disturbing read/write.
        chmodSync(path, st.mode | 0o111)
      }
    }
  }
  walk(binRoot)
}

/**
 * Install a built space to the Construct spaces directory.
 * This makes it available in the main Construct app (not needed for dev — use the Space Runner instead).
 */
export function install(): void {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) {
    console.error(chalk.red("No dist/ directory found. Run 'construct build' first."))
    process.exit(1)
  }

  const m = manifest.read(root)

  // Re-bundle agent
  const agentDir = join(root, 'agent')
  if (existsSync(agentDir)) {
    bundleAgentDir(agentDir, distDir)
  }

  // Copy to spaces dir (profile-scoped if a profile is active).
  // Clear the install dir first — Bun's `fs.cpSync` silently no-ops on
  // existing files in some cases, so a second `construct install` would
  // leave stale `space-*.iife.js` / `manifest.json` in place and the
  // host would either show old code or fail the bundle integrity check
  // (manifest checksum vs file SHA).
  const installDir = spaceDir(m.id)
  rmSync(installDir, { recursive: true, force: true })
  mkdirSync(installDir, { recursive: true })
  // verbatimSymlinks: true prevents Node from following symlinks into the
  // copy — a malicious dist/ that ships `dist/x → /etc/passwd` (or
  // `../../../something` outside installDir) would otherwise overwrite
  // arbitrary files. We copy the link itself; the host loader can decide
  // whether to honour it.
  cpSync(distDir, installDir, { recursive: true, verbatimSymlinks: true, force: true })
  ensureBinExecutable(installDir)

  console.log(chalk.green(`Installed ${m.name} → ${installDir}`))
  console.log(chalk.dim('  Restart Construct to load the updated space.'))
}
