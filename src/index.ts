#!/usr/bin/env node

import { Command } from 'commander'
import { scaffold } from './commands/scaffold.js'
import { build } from './commands/build.js'
import { dev } from './commands/dev.js'
import { run } from './commands/run.js'
import { publish } from './commands/publish.js'
import { validate } from './commands/validate.js'
import { check } from './commands/check.js'
import { clean } from './commands/clean.js'
import { login, logout } from './commands/login.js'
import { update } from './commands/update.js'
import { graphInit } from './commands/graph/init.js'
import { generate } from './commands/graph/generate.js'
import { graphPush } from './commands/graph/push.js'

export const VERSION = '1.0.0'

const program = new Command()

program
  .name('construct')
  .description('Construct CLI — scaffold, build, develop, and publish spaces')
  .version(VERSION)

// Space commands (top-level for convenience)
program
  .command('scaffold [name]')
  .alias('new')
  .alias('create')
  .description('Create a new Construct space project')
  .option('--with-tests', 'Include E2E testing boilerplate')
  .action(async (name, opts) => scaffold(name, opts))

program
  .command('build')
  .description('Build the space (generate entry + run Vite)')
  .option('--entry-only', 'Only generate src/entry.ts')
  .action(async (opts) => build(opts))

program
  .command('dev')
  .description('Start dev mode with file watching and live reload')
  .action(async () => dev())

program
  .command('run')
  .description('Install built space to Construct spaces directory')
  .action(() => run())

program
  .command('publish')
  .description('Publish a space to the Construct registry')
  .option('-y, --yes', 'Skip all confirmation prompts')
  .option('--bump <type>', 'Auto-bump version (patch, minor, major)')
  .action(async (opts) => publish(opts))

program
  .command('validate')
  .description('Validate space.manifest.json')
  .action(() => validate())

program
  .command('check')
  .description('Run type-check (vue-tsc) and linter (eslint)')
  .action(() => check())

program
  .command('clean')
  .description('Remove build artifacts')
  .option('--all', 'Also remove node_modules and lockfiles')
  .action((opts) => clean(opts))

program
  .command('login')
  .description('Authenticate with Construct')
  .option('--portal <url>', 'Portal URL')
  .action(async (opts) => login(opts))

program
  .command('logout')
  .description('Sign out')
  .action(() => logout())

program
  .command('update')
  .description('Update the CLI to the latest version')
  .action(() => update())

// Graph commands
const graph = program
  .command('graph')
  .description('Construct Graph — data models and GraphQL')

graph
  .command('init')
  .description('Initialize Graph in a space project')
  .action(() => graphInit())

graph
  .command('generate <model> [fields...]')
  .alias('g')
  .description('Generate a data model')
  .action((model, fields) => generate(model, fields))

graph
  .command('push')
  .description('Register models with the Graph service')
  .action(async () => graphPush())

// Space subcommand group (alternative namespace)
const space = program
  .command('space')
  .description('Space development commands')

space.command('scaffold [name]').alias('new').alias('create')
  .option('--with-tests', 'Include E2E testing boilerplate')
  .action(async (name, opts) => scaffold(name, opts))
space.command('build').option('--entry-only').action(async (opts) => build(opts))
space.command('dev').action(async () => dev())
space.command('run').action(() => run())
space.command('publish').option('-y, --yes').option('--bump <type>')
  .action(async (opts) => publish(opts))
space.command('validate').action(() => validate())
space.command('check').action(() => check())
space.command('clean').option('--all').action((opts) => clean(opts))

program.parse()
