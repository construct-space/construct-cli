import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

export function clean(options?: { all?: boolean }): void {
  const root = process.cwd()
  const dirs = ['dist', '.vite']
  if (options?.all) {
    dirs.push('node_modules')
  }

  const lockfiles = ['bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']

  for (const dir of dirs) {
    const path = join(root, dir)
    if (existsSync(path)) {
      rmSync(path, { recursive: true })
      console.log(chalk.dim(`  Removed ${dir}/`))
    }
  }

  if (options?.all) {
    for (const file of lockfiles) {
      const path = join(root, file)
      if (existsSync(path)) {
        rmSync(path)
        console.log(chalk.dim(`  Removed ${file}`))
      }
    }
  }

  console.log(chalk.green('Clean.'))
}
