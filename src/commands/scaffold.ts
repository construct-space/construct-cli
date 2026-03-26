import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import chalk from 'chalk'
import { input } from '@inquirer/prompts'
import { toDisplayName } from '../lib/utils.js'

const nameRegex = /^[a-z][a-z0-9-]*$/

interface TemplateData {
  name: string
  id: string
  idUpper: string
  displayName: string
  displayNameNoSpace: string
}

function render(template: string, data: TemplateData): string {
  return template
    .replace(/\{\{\.Name\}\}/g, data.name)
    .replace(/\{\{\.ID\}\}/g, data.id)
    .replace(/\{\{\.IDUpper\}\}/g, data.idUpper)
    .replace(/\{\{\.DisplayName\}\}/g, data.displayName)
    .replace(/\{\{\.DisplayNameNoSpace\}\}/g, data.displayNameNoSpace)
}

function writeTemplate(templateDir: string, tmplName: string, outPath: string, data: TemplateData): void {
  const tmplPath = join(templateDir, tmplName)
  if (!existsSync(tmplPath)) {
    console.warn(chalk.yellow(`Template not found: ${tmplName}`))
    return
  }
  const content = readFileSync(tmplPath, 'utf-8')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, render(content, data))
}

export async function scaffold(nameArg?: string, options?: { withTests?: boolean }): Promise<void> {
  let name = nameArg

  if (!name) {
    name = await input({
      message: 'Space name',
      validate: (s) => nameRegex.test(s) || 'Must be lowercase alphanumeric with hyphens, starting with a letter',
    })
  }

  if (!nameRegex.test(name)) {
    console.error(chalk.red('Invalid name: must be lowercase alphanumeric with hyphens, starting with a letter'))
    process.exit(1)
  }

  if (existsSync(name)) {
    console.error(chalk.red(`Directory '${name}' already exists`))
    process.exit(1)
  }

  const id = name.replace(/^space-/, '')
  const displayName = toDisplayName(id)
  const data: TemplateData = {
    name,
    id,
    idUpper: id.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
    displayName,
    displayNameNoSpace: displayName.replace(/ /g, ''),
  }

  console.log(chalk.blue(`Creating space: ${displayName}`))

  // Create directories
  const dirs = [
    name,
    join(name, 'src', 'pages'),
    join(name, 'src', 'components'),
    join(name, 'src', 'composables'),
    join(name, 'agent', 'skills'),
    join(name, 'agent', 'hooks'),
    join(name, 'agent', 'tools'),
    join(name, 'widgets', 'summary'),
    join(name, '.github', 'workflows'),
  ]
  for (const d of dirs) mkdirSync(d, { recursive: true })

  // Find templates directory
  const templateDir = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'templates', 'space')

  const files: Record<string, string> = {
    'space.manifest.json.tmpl': join(name, 'space.manifest.json'),
    'package.json.tmpl': join(name, 'package.json'),
    'vite.config.ts.tmpl': join(name, 'vite.config.ts'),
    'index.vue.tmpl': join(name, 'src', 'pages', 'index.vue'),
    'config.md.tmpl': join(name, 'agent', 'config.md'),
    'skill.md.tmpl': join(name, 'agent', 'skills', 'default.md'),
    'safety.json.tmpl': join(name, 'agent', 'hooks', 'safety.json'),
    'build.yml.tmpl': join(name, '.github', 'workflows', 'build.yml'),
    'tsconfig.json.tmpl': join(name, 'tsconfig.json'),
    'gitignore.tmpl': join(name, '.gitignore'),
    'readme.md.tmpl': join(name, 'README.md'),
    'widgets/2x1.vue.tmpl': join(name, 'widgets', 'summary', '2x1.vue'),
    'widgets/4x1.vue.tmpl': join(name, 'widgets', 'summary', '4x1.vue'),
  }

  for (const [tmpl, out] of Object.entries(files)) {
    writeTemplate(templateDir, tmpl, out, data)
  }

  if (options?.withTests) {
    mkdirSync(join(name, 'e2e'), { recursive: true })
    writeTemplate(templateDir, 'e2e/playwright.config.ts.tmpl', join(name, 'playwright.config.ts'), data)
    writeTemplate(templateDir, 'e2e/space.spec.ts.tmpl', join(name, 'e2e', 'space.spec.ts'), data)
    console.log(chalk.blue('E2E testing boilerplate added (Playwright)'))
  }

  console.log(chalk.green(`Space '${name}' created!`))
  console.log()
  console.log(`  cd ${name}`)
  console.log('  bun install')
  console.log('  construct dev')
  console.log()
}
