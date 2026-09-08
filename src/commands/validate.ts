import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import * as manifest from '../lib/manifest.js'
import { pageComponentFromPath } from '../lib/pagePaths.js'

export function validate(): void {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)
  const errors = manifest.validate(m)

  if (errors.length > 0) {
    console.log(chalk.red(`Validation failed (${errors.length} errors):`))
    for (const err of errors) console.log(chalk.red(`  • ${err}`))
    process.exit(1)
  }

  // Check pages exist
  let warnings = 0
  for (const page of m.pages) {
    const component = page.component || pageComponentFromPath(page.path)
    const fullPath = join(root, 'src', component)
    if (!existsSync(fullPath)) {
      console.log(chalk.yellow(`  ⚠ Page component not found: src/${component}`))
      warnings++
    }
  }

  // Check agent file
  if (m.agent) {
    const agentPath = join(root, m.agent)
    if (!existsSync(agentPath)) {
      console.log(chalk.yellow(`  ⚠ Agent config not found: ${m.agent}`))
      warnings++
    }
  }

  // Check version match with package.json
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    if (pkg.version && pkg.version !== m.version) {
      console.log(chalk.yellow(`  ⚠ Version mismatch: manifest=${m.version} package.json=${pkg.version}`))
      warnings++
    }
  }

  if (warnings === 0) {
    console.log(chalk.green(`✓ ${m.name} v${m.version} is valid`))
  } else {
    console.log(chalk.green(`✓ Valid with ${warnings} warning(s)`))
  }
}
