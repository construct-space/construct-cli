import { execSync } from 'child_process'
import chalk from 'chalk'
import { VERSION } from '../index.js'
import { detect } from '../lib/runtime.js'

export function update(): void {
  console.log(chalk.blue(`Current version: ${VERSION}`))

  // Check latest version from npm
  let latest = VERSION
  try {
    latest = execSync('npm view construct version', { encoding: 'utf-8' }).trim()
  } catch {}

  if (latest === VERSION) {
    console.log(chalk.green('Already on the latest version.'))
    return
  }

  console.log(chalk.blue(`Updating to v${latest}...`))

  const rt = detect()
  try {
    if (rt.name === 'bun') {
      execSync('bun install -g construct', { stdio: 'inherit' })
    } else {
      execSync('npm install -g construct', { stdio: 'inherit' })
    }
    console.log(chalk.green(`Updated to v${latest}`))
  } catch (err: any) {
    console.error(chalk.red(`Update failed: ${err.message}`))
    process.exit(1)
  }
}
