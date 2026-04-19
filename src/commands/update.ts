import { execSync } from 'child_process'
import chalk from 'chalk'
import { VERSION } from '../index.js'
import { detect } from '../lib/runtime.js'

const PKG_NAME = '@construct-space/cli'

export function update(): void {
  console.log(chalk.blue(`Current version: ${VERSION}`))

  let latest = VERSION
  try {
    latest = execSync(`npm view ${PKG_NAME} version`, { encoding: 'utf-8' }).trim()
  } catch {}

  if (latest === VERSION) {
    console.log(chalk.green('Already on the latest version.'))
    return
  }

  console.log(chalk.blue(`Updating to v${latest}...`))

  // Pin the exact version instead of @latest. bun's global cache has been
  // observed resolving @latest to a stale metadata entry (installing 1.4.1
  // while npm view reports 1.4.2), so we clear the cache first and ask for
  // the resolved version by number. npm's equivalent is --prefer-online.
  const rt = detect()
  try {
    if (rt.name === 'bun') {
      try { execSync('bun pm cache rm', { stdio: 'inherit' }) } catch {}
      execSync(`bun install -g ${PKG_NAME}@${latest}`, { stdio: 'inherit' })
    } else {
      execSync(`npm install -g --prefer-online ${PKG_NAME}@${latest}`, { stdio: 'inherit' })
    }
  } catch (err: any) {
    console.error(chalk.red(`Update failed: ${err.message}`))
    process.exit(1)
  }

  // Verify the install actually picked up the new version. If the runtime
  // still resolves the old binary (cached bin shim, PATH order, etc.) we
  // want loud feedback rather than a silently-lying success message.
  try {
    const installed = execSync(`${rt.name === 'bun' ? 'bun' : 'npm'} ${rt.name === 'bun' ? 'pm ls -g' : 'ls -g --depth=0'} ${PKG_NAME}`, { encoding: 'utf-8' })
    const match = installed.match(new RegExp(PKG_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '@(\\d[^\\s]*)'))
    const resolved = match ? match[1] : 'unknown'
    if (resolved && resolved !== latest) {
      console.warn(chalk.yellow(`Installed ${resolved} but expected ${latest}.`))
      console.warn(chalk.dim('  Try: bun pm cache rm && bun install -g ' + PKG_NAME + '@' + latest))
      return
    }
    console.log(chalk.green(`Updated to v${latest}`))
  } catch {
    // Verification is best-effort — if listing fails, still report the
    // intent so the user sees which version was targeted.
    console.log(chalk.green(`Updated to v${latest}`))
  }
}
