import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import * as manifest from '../lib/manifest.js'
import { detect, ensureDeps } from '../lib/runtime.js'

export function check(): void {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)

  // 1. Validate manifest
  console.log(chalk.blue('Validating manifest...'))
  const errors = manifest.validate(m)
  if (errors.length > 0) {
    console.log(chalk.red(`✗ Manifest validation failed (${errors.length} errors):`))
    for (const err of errors) console.log(chalk.red(`  • ${err}`))
    process.exit(1)
  }

  // Check pages exist
  let warnings = 0
  for (const page of m.pages) {
    const component = page.component || (page.path === '' ? 'pages/index.vue' : `pages/${page.path}.vue`)
    if (!existsSync(join(root, 'src', component))) {
      console.log(chalk.yellow(`  ⚠ Page not found: src/${component}`))
      warnings++
    }
  }

  // Check agent file
  if (m.agent && !existsSync(join(root, m.agent))) {
    console.log(chalk.yellow(`  ⚠ Agent config not found: ${m.agent}`))
    warnings++
  }

  // Check version match
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    if (pkg.version && pkg.version !== m.version) {
      console.log(chalk.yellow(`  ⚠ Version mismatch: manifest=${m.version} package.json=${pkg.version}`))
      warnings++
    }
  }

  console.log(chalk.green(`✓ Manifest valid${warnings > 0 ? ` (${warnings} warning${warnings > 1 ? 's' : ''})` : ''}`))

  // 2. Type check
  const rt = detect()
  ensureDeps(root, rt)
  const exec = rt.name === 'bun' ? 'bun' : 'npx'

  console.log(chalk.blue('Running type check...'))
  try {
    execSync(`${exec} vue-tsc --noEmit`, { cwd: root, stdio: 'inherit' })
    console.log(chalk.green('✓ Type check passed'))
  } catch {
    console.error(chalk.red('✗ Type check failed'))
    process.exit(1)
  }

  // 3. Lint
  console.log(chalk.blue('Running linter...'))
  try {
    execSync(`${exec} eslint .`, { cwd: root, stdio: 'inherit' })
    console.log(chalk.green('✓ Lint passed'))
  } catch {
    console.error(chalk.red('✗ Lint failed'))
    process.exit(1)
  }

  console.log()
  console.log(chalk.green(`✓ ${m.name} v${m.version} — all checks passed`))
}
