import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import { select, confirm } from '@inquirer/prompts'
import * as manifest from '../../lib/manifest.js'
import * as auth from '../../lib/auth.js'

export async function graphMigrate(options?: { apply?: boolean }): Promise<void> {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)
  const modelsDir = join(root, 'src', 'models')

  if (!existsSync(modelsDir)) {
    console.error(chalk.red("No src/models/ directory. Run 'construct graph init' first."))
    process.exit(1)
  }

  let creds: auth.Credentials
  try {
    creds = auth.load()
  } catch (err: any) {
    console.error(chalk.red(err.message))
    process.exit(1)
  }

  const graphURL = process.env.GRAPH_URL || 'https://graph.construct.space'

  // Get current schema from server
  const spinner = ora('Fetching current schema...').start()
  let serverModels: any[] = []
  try {
    const resp = await fetch(`${graphURL}/api/schemas/${m.id}`, {
      headers: { 'Authorization': `Bearer ${creds.token}` },
    })
    if (resp.ok) {
      const data = await resp.json() as any
      serverModels = data.models || []
    }
    spinner.succeed('Schema fetched')
  } catch {
    spinner.fail('Could not fetch schema')
    process.exit(1)
  }

  // Parse local models
  const modelFiles = readdirSync(modelsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts')
  const localModels: any[] = []
  for (const file of modelFiles) {
    const content = readFileSync(join(modelsDir, file), 'utf-8')
    const model = parseModelFields(content, basename(file, '.ts'))
    if (model) localModels.push(model)
  }

  // Compare
  console.log()
  let hasChanges = false

  for (const server of serverModels) {
    const local = localModels.find(m => m.name === server.name)
    const serverFields = (server.fields || []).map((f: any) => f.name)

    if (!local) {
      console.log(chalk.yellow(`  Model "${server.name}" exists on server but not locally`))
      hasChanges = true
      continue
    }

    const localFields = local.fields.map((f: any) => f.name)

    // Fields on server but not local (can be dropped)
    for (const sf of serverFields) {
      if (!localFields.includes(sf)) {
        console.log(chalk.red(`  - ${server.name}.${sf}`), chalk.dim('(on server, not in local model — can drop)'))
        hasChanges = true
      }
    }

    // Fields local but not on server (will be added on push)
    for (const lf of localFields) {
      if (!serverFields.includes(lf)) {
        console.log(chalk.green(`  + ${server.name}.${lf}`), chalk.dim('(new — will be added on push)'))
        hasChanges = true
      }
    }
  }

  for (const local of localModels) {
    if (!serverModels.find(m => m.name === local.name)) {
      console.log(chalk.green(`  + Model "${local.name}"`), chalk.dim('(new — will be created on push)'))
      hasChanges = true
    }
  }

  if (!hasChanges) {
    console.log(chalk.green('  Schema is in sync — no changes needed'))
    return
  }

  console.log()

  if (!options?.apply) {
    console.log(chalk.dim('  Run with --apply to apply destructive changes'))
    console.log(chalk.dim('  Or run "construct graph push" to add new fields/models'))
    return
  }

  // Apply destructive changes
  const proceed = await confirm({ message: 'Apply destructive schema changes? This cannot be undone.' })
  if (!proceed) { console.log('Cancelled.'); return }

  const migrateSpinner = ora('Applying migrations...').start()
  try {
    const resp = await fetch(`${graphURL}/api/schemas/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.token}`,
        'X-Space-ID': m.id,
      },
      body: JSON.stringify({
        space_id: m.id,
        project_id: 'default',
        local_models: localModels,
      }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      migrateSpinner.fail('Migration failed')
      console.error(chalk.red(`  ${resp.status}: ${body}`))
      process.exit(1)
    }

    const result = await resp.json() as any
    migrateSpinner.succeed('Migrations applied')
    if (result.dropped?.length) {
      for (const col of result.dropped) {
        console.log(chalk.red(`  Dropped: ${col}`))
      }
    }
    if (result.altered?.length) {
      for (const col of result.altered) {
        console.log(chalk.yellow(`  Altered: ${col}`))
      }
    }
  } catch (err: any) {
    migrateSpinner.fail('Migration failed')
    console.error(chalk.red(`  ${err.message}`))
    process.exit(1)
  }
}

function parseModelFields(content: string, fileName: string): any | null {
  const modelMatch = content.match(/defineModel\s*\(\s*['"](\w+)['"]/)
  if (!modelMatch) return null

  const fields: any[] = []
  const fieldRegex = /(\w+)\s*:\s*field\.(\w+)\(\s*(?:\[([^\]]*)\])?\s*\)((?:\.\w+\([^)]*\))*)/g
  let match
  while ((match = fieldRegex.exec(content)) !== null) {
    const [, name, type] = match
    fields.push({ name, type })
  }

  return { name: modelMatch[1], fields }
}
