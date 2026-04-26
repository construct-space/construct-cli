import chalk from 'chalk'
import * as manifest from '../../lib/manifest.js'

const spaceIDRegex = /^[a-z][a-z0-9-]*$/

export function forkManifest(root: string, newSpaceID: string): { oldSpaceID: string; newSpaceID: string } {
  const id = newSpaceID.trim()
  if (!spaceIDRegex.test(id)) {
    throw new Error('space id must be lowercase alphanumeric with hyphens, starting with a letter')
  }

  if (!manifest.exists(root)) {
    throw new Error('No space.manifest.json found in current directory')
  }

  const m = manifest.read(root)
  if (m.id === id) {
    throw new Error(`space.manifest.json already uses id "${id}"`)
  }

  const oldSpaceID = m.id
  m.id = id
  manifest.write(root, m)
  return { oldSpaceID, newSpaceID: id }
}

export function graphFork(newSpaceID: string): void {
  try {
    const result = forkManifest(process.cwd(), newSpaceID)
    console.log(chalk.green(`Forked graph space id: ${result.oldSpaceID} -> ${result.newSpaceID}`))
    console.log(chalk.dim('Run `construct graph push` to register the forked schema.'))
  } catch (err: any) {
    console.error(chalk.red(err.message))
    process.exit(1)
  }
}
