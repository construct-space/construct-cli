import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import * as manifest from '../../lib/manifest.js'
import * as auth from '../../lib/auth.js'

export async function graphPush(): Promise<void> {
  const root = process.cwd()

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  const m = manifest.read(root)
  const modelsDir = join(root, 'src', 'models')

  if (!existsSync(modelsDir)) {
    console.error(chalk.red("No src/models/ directory found. Run 'construct graph init' first."))
    process.exit(1)
  }

  // Collect model files
  const modelFiles = readdirSync(modelsDir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')

  if (modelFiles.length === 0) {
    console.error(chalk.red('No model files found in src/models/'))
    console.log(chalk.dim("  Generate one: construct graph g User name:string email:string"))
    process.exit(1)
  }

  console.log(chalk.blue(`Pushing ${modelFiles.length} model(s) for space: ${m.id}`))

  // We need to extract the model definitions from the TypeScript files
  // Parse them statically to build the manifest
  const models: any[] = []
  for (const file of modelFiles) {
    const content = readFileSync(join(modelsDir, file), 'utf-8')
    const model = parseModelFile(content, basename(file, '.ts'))
    if (model) models.push(model)
  }

  if (models.length === 0) {
    console.error(chalk.red('Could not parse any models from files'))
    process.exit(1)
  }

  // Get credentials
  let creds: auth.Credentials
  try {
    creds = auth.load()
  } catch (err: any) {
    console.error(chalk.red(err.message))
    process.exit(1)
  }

  // Register schema with Graph service
  const graphURL = process.env.GRAPH_URL || 'https://graph.construct.space'
  const spinner = ora('Registering models...').start()

  try {
    const resp = await fetch(`${graphURL}/api/schemas/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.token}`,
        'X-Space-ID': m.id,
      },
      body: JSON.stringify({ models, version: 1 }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      spinner.fail('Registration failed')
      console.error(chalk.red(`  ${resp.status}: ${body}`))
      process.exit(1)
    }

    const result = await resp.json() as any
    spinner.succeed('Models registered')
    console.log()
    for (const model of models) {
      console.log(`  ${chalk.cyan(model.name)} — ${model.fields.length} field(s)`)
    }
    console.log()
    console.log(chalk.dim(`  GraphQL endpoint: ${graphURL}/graphql`))
    console.log(chalk.dim(`  Space ID: ${m.id}`))
  } catch (err: any) {
    spinner.fail('Failed to connect to Graph')
    console.error(chalk.red(`  ${err.message}`))
    process.exit(1)
  }
}

// Simple static parser for model files
// Extracts defineModel('name', { fields }) structure
function parseModelFile(content: string, fileName: string): any | null {
  // Match defineModel('name', { ... })
  const modelMatch = content.match(/defineModel\s*\(\s*['"](\w+)['"]/)
  if (!modelMatch) return null

  const modelName = modelMatch[1]
  const fields: any[] = []

  // Match field definitions: name: field.type().modifier()
  const fieldRegex = /(\w+)\s*:\s*field\.(\w+)\(\s*(?:\[([^\]]*)\])?\s*\)((?:\.\w+\([^)]*\))*)/g
  let match

  while ((match = fieldRegex.exec(content)) !== null) {
    const [, name, type, enumValues, modifiers] = match
    const field: any = { name, type }

    // Parse enum values
    if (type === 'enum' && enumValues) {
      field.values = enumValues.split(',').map(v => v.trim().replace(/['"]/g, ''))
    }

    // Parse modifiers
    if (modifiers) {
      if (modifiers.includes('.required()')) field.required = true
      if (modifiers.includes('.unique()')) field.unique = true
      if (modifiers.includes('.index()')) field.index = true
      if (modifiers.includes('.email()')) field.validation = 'email'
      if (modifiers.includes('.url()')) field.validation = 'url'
      const defaultMatch = modifiers.match(/\.default\((.+?)\)/)
      if (defaultMatch) {
        try { field.default = JSON.parse(defaultMatch[1]!) } catch { field.default = defaultMatch[1] }
      }
    }

    fields.push(field)
  }

  // Match relation definitions: name: relation.type(Target)
  const relRegex = /(\w+)\s*:\s*relation\.(belongsTo|hasMany)\((\w+)/g
  while ((match = relRegex.exec(content)) !== null) {
    const [, name, relationType, target] = match
    fields.push({
      name,
      type: 'relation',
      relation: relationType,
      target: target!.toLowerCase(),
    })
  }

  return { name: modelName, fields }
}
