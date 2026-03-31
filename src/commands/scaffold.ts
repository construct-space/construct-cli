import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import chalk from 'chalk'
import { input } from '@inquirer/prompts'
import { toDisplayName } from '../lib/utils.js'
import { detect, ensureDeps } from '../lib/runtime.js'

const nameRegex = /^[a-z][a-z0-9-]*$/

interface TemplateData {
  name: string
  id: string
  idUpper: string
  displayName: string
  displayNameNoSpace: string
}

export interface ScaffoldOptions {
  withTests?: boolean
  full?: boolean
  installDeps?: (root: string) => void | Promise<void>
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

async function installScaffoldDeps(root: string): Promise<void> {
  const rt = detect()
  console.log(chalk.blue(`Installing dependencies with ${rt.name}...`))
  ensureDeps(root, rt)
}

export async function scaffold(nameArg?: string, options?: ScaffoldOptions): Promise<void> {
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

  const isFull = options?.full ?? false

  console.log(chalk.blue(`Creating space: ${displayName}${isFull ? ' (full preset)' : ''}`))

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

  // Find templates directory — check dist/ (bundled) then dev paths
  const scriptDir = dirname(new URL(import.meta.url).pathname)
  let templateDir = join(scriptDir, 'templates', 'space')
  if (!existsSync(templateDir)) {
    templateDir = join(scriptDir, '..', 'templates', 'space')
  }
  if (!existsSync(templateDir)) {
    // Running from src/commands/ in dev mode — go up two levels
    templateDir = join(scriptDir, '..', '..', 'templates', 'space')
  }

  // Base files — always written
  const files: Record<string, string> = {
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
    'actions.ts.tmpl': join(name, 'src', 'actions.ts'),
  }

  // Full preset uses its own manifest and entry; default uses the base ones
  if (isFull) {
    files['full/space.manifest.json.tmpl'] = join(name, 'space.manifest.json')
    files['full/entry.ts.tmpl'] = join(name, 'src', 'entry.ts')
  } else {
    files['space.manifest.json.tmpl'] = join(name, 'space.manifest.json')
    files['entry.ts.tmpl'] = join(name, 'src', 'entry.ts')
  }

  for (const [tmpl, out] of Object.entries(files)) {
    writeTemplate(templateDir, tmpl, out, data)
  }

  // Full preset — extra pages, skills
  if (isFull) {
    writeTemplate(templateDir, 'full/settings.vue.tmpl', join(name, 'src', 'pages', 'settings.vue'), data)
    writeTemplate(templateDir, 'full/skill-data.md.tmpl', join(name, 'agent', 'skills', 'data.md'), data)
    writeTemplate(templateDir, 'full/skill-ui.md.tmpl', join(name, 'agent', 'skills', 'ui.md'), data)
    console.log(chalk.blue('Full preset: settings page + extra skills added'))
  }

  if (options?.withTests) {
    mkdirSync(join(name, 'e2e'), { recursive: true })
    writeTemplate(templateDir, 'e2e/playwright.config.ts.tmpl', join(name, 'playwright.config.ts'), data)
    writeTemplate(templateDir, 'e2e/space.spec.ts.tmpl', join(name, 'e2e', 'space.spec.ts'), data)
    console.log(chalk.blue('E2E testing boilerplate added (Playwright)'))
  }

  await (options?.installDeps ?? installScaffoldDeps)(name)

  console.log(chalk.green(`Space '${name}' created!`))
  console.log()
  console.log(`  cd ${name}`)
  console.log('  construct dev')
  console.log()
}
