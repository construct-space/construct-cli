import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

// Supported field types and their mapping to @construct-space/graph builders
const FIELD_TYPES: Record<string, string> = {
  string: 'field.string()',
  int: 'field.int()',
  number: 'field.number()',
  boolean: 'field.boolean()',
  bool: 'field.boolean()',
  date: 'field.date()',
  json: 'field.json()',
}

// Field modifiers that can be chained
const MODIFIERS: Record<string, string> = {
  required: '.required()',
  unique: '.unique()',
  index: '.index()',
  email: '.email()',
  url: '.url()',
}

interface FieldSpec {
  name: string
  type: string
  modifiers: string[]
  enumValues?: string[]
  relationTarget?: string
  relationType?: string
}

function parseField(spec: string): FieldSpec {
  // Format: name:type or name:type:modifier1:modifier2
  // Relation: name:belongsTo:ModelName or name:hasMany:ModelName
  // Enum: name:enum:val1,val2,val3
  const parts = spec.split(':')
  if (parts.length < 2) {
    console.error(chalk.red(`Invalid field spec: ${spec}`))
    console.log(chalk.dim('  Expected format: name:type[:modifier1:modifier2]'))
    console.log(chalk.dim('  Example: email:string:required:unique'))
    process.exit(1)
  }

  const [name, type, ...rest] = parts

  // Relations
  if (type === 'belongsTo' || type === 'hasMany') {
    if (!rest[0]) {
      console.error(chalk.red(`Relation ${name}:${type} requires a target model`))
      process.exit(1)
    }
    return { name: name!, type: 'relation', modifiers: [], relationTarget: rest[0], relationType: type }
  }

  // Enum
  if (type === 'enum') {
    const values = rest[0]?.split(',') || []
    if (values.length === 0) {
      console.error(chalk.red(`Enum ${name} requires values: ${name}:enum:val1,val2,val3`))
      process.exit(1)
    }
    return { name: name!, type: 'enum', modifiers: rest.slice(1), enumValues: values }
  }

  if (!FIELD_TYPES[type!]) {
    console.error(chalk.red(`Unknown field type: ${type}`))
    console.log(chalk.dim(`  Available types: ${Object.keys(FIELD_TYPES).join(', ')}, enum, belongsTo, hasMany`))
    process.exit(1)
  }

  return { name: name!, type: type!, modifiers: rest }
}

function generateFieldCode(field: FieldSpec): string {
  if (field.type === 'relation') {
    return `relation.${field.relationType}(${field.relationTarget})`
  }

  if (field.type === 'enum') {
    const values = field.enumValues!.map(v => `'${v}'`).join(', ')
    let code = `field.enum([${values}])`
    for (const mod of field.modifiers) {
      if (MODIFIERS[mod]) code += MODIFIERS[mod]
    }
    return code
  }

  let code = FIELD_TYPES[field.type]!
  for (const mod of field.modifiers) {
    if (MODIFIERS[mod]) {
      code += MODIFIERS[mod]
    } else {
      console.log(chalk.yellow(`  ⚠ Unknown modifier '${mod}' — skipped`))
    }
  }
  return code
}

export function generate(modelName: string, fieldSpecs: string[]): void {
  const root = process.cwd()

  if (!modelName) {
    console.error(chalk.red('Model name is required'))
    console.log()
    console.log('Usage:')
    console.log(chalk.cyan('  construct graph g <ModelName> <field:type> [field:type ...]'))
    console.log()
    console.log('Examples:')
    console.log(chalk.dim('  construct graph g User name:string email:string:required:unique'))
    console.log(chalk.dim('  construct graph g Post title:string body:string published:boolean'))
    console.log(chalk.dim('  construct graph g Comment body:string post:belongsTo:Post'))
    console.log(chalk.dim('  construct graph g Task status:enum:todo,doing,done priority:int'))
    process.exit(1)
  }

  // Ensure PascalCase
  const name = modelName.charAt(0).toUpperCase() + modelName.slice(1)

  // Parse fields
  const fields = fieldSpecs.map(parseField)

  if (fields.length === 0) {
    console.error(chalk.red('At least one field is required'))
    console.log(chalk.dim('  Example: construct graph g User name:string email:string'))
    process.exit(1)
  }

  // Collect relation imports
  const relationTargets = fields
    .filter(f => f.type === 'relation')
    .map(f => f.relationTarget!)

  // Generate file content
  const imports: string[] = ['defineModel', 'field']
  if (relationTargets.length > 0) imports.push('relation')

  const lines: string[] = [
    `import { ${imports.join(', ')} } from '@construct-space/graph'`,
  ]

  // Add relation imports
  for (const target of relationTargets) {
    lines.push(`import { ${target} } from './${target}'`)
  }

  lines.push('')
  lines.push(`export const ${name} = defineModel('${name.toLowerCase()}', {`)

  for (const field of fields) {
    const code = generateFieldCode(field)
    lines.push(`  ${field.name}: ${code},`)
  }

  lines.push('})')
  lines.push('')

  const content = lines.join('\n')

  // Write file
  const modelsDir = join(root, 'src', 'models')
  mkdirSync(modelsDir, { recursive: true })

  const filePath = join(modelsDir, `${name}.ts`)
  if (existsSync(filePath)) {
    console.log(chalk.yellow(`  Model file already exists: src/models/${name}.ts`))
    console.log(chalk.dim('  Overwriting...'))
  }

  writeFileSync(filePath, content)
  console.log(chalk.green(`  Created src/models/${name}.ts`))

  // Update barrel index
  updateBarrel(modelsDir, name)

  // Show generated code
  console.log()
  console.log(chalk.dim('  Generated:'))
  console.log(chalk.dim('  ─────────'))
  for (const line of content.split('\n')) {
    console.log(chalk.dim(`  ${line}`))
  }
  console.log()
}

function updateBarrel(modelsDir: string, modelName: string): void {
  const indexPath = join(modelsDir, 'index.ts')
  const exportLine = `export { ${modelName} } from './${modelName}'`

  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8')
    if (content.includes(exportLine)) return
    // Append export
    writeFileSync(indexPath, content.trimEnd() + '\n' + exportLine + '\n')
  } else {
    writeFileSync(indexPath, exportLine + '\n')
  }
  console.log(chalk.dim(`  Updated src/models/index.ts`))
}
