#!/usr/bin/env bun

import { Command } from 'commander'
import { scaffold } from './commands/scaffold.js'
import { build } from './commands/build.js'
import { dev } from './commands/dev.js'
import { install } from './commands/run.js'
import { publish } from './commands/publish.js'
import { validate } from './commands/validate.js'
import { check } from './commands/check.js'
import { clean } from './commands/clean.js'
import { login, logout } from './commands/login.js'
import { update } from './commands/update.js'
import { graphInit } from './commands/graph/init.js'
import { generate } from './commands/graph/generate.js'
import { graphPush } from './commands/graph/push.js'
import { graphMigrate } from './commands/graph/migrate.js'

export const VERSION = '1.3.1'

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
  .option('--full', 'Full preset: multiple pages, extra skills, widget templates')
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
  .command('install')
  .alias('run')
  .description('Install built space to Construct spaces directory')
  .action(() => install())

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
  .option('--token <token>', 'Authenticate with a token directly (skip desktop profile picker)')
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
  .option('--access <rules>', 'Access rules (e.g. read:member,create:member,update:owner,delete:admin)')
  .action((model, fields, opts) => generate(model, fields, opts))

graph
  .command('push')
  .description('Register models with the Graph service')
  .action(async () => graphPush())

graph
  .command('migrate')
  .description('Compare local models with server schema and apply changes')
  .option('--apply', 'Apply destructive changes (drop columns, alter constraints)')
  .action(async (opts) => graphMigrate(opts))

// Spaces — list spaces this org has published, with bundle + distribution info.
graph
  .command('spaces')
  .alias('list')
  .alias('ls')
  .description('List spaces published by your org')
  .option('--org <id>', 'Override org id')
  .option('--bundle <id>', 'Filter to a single bundle')
  .option('--json', 'Output JSON')
  .action(async (opts) => (await import('./commands/graph/spaces.js')).spacesList(opts))

// Space bundles — group related spaces (kanban + kanban-admin) under one publisher.
const bundles = graph.command('bundles').description('Manage space bundles (publisher grouping)')
bundles
  .command('list')
  .description('List bundles owned by your org')
  .option('--org <id>', 'Override org id (default: $CONSTRUCT_ORG_ID)')
  .option('--json', 'Output JSON')
  .action(async (opts) => (await import('./commands/graph/bundles.js')).bundlesList(opts))
bundles
  .command('create <id> <name>')
  .description('Create a new bundle owned by your org')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (id, name, opts) => (await import('./commands/graph/bundles.js')).bundleCreate(id, name, opts))
bundles
  .command('show <id>')
  .description('Show a bundle by id')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (id, opts) => (await import('./commands/graph/bundles.js')).bundleShow(id, opts))

// Installs — tenant installs/uninstalls a space; publisher lists installers.
graph
  .command('install <space-id>')
  .description('Install a space for your org')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, opts) => (await import('./commands/graph/install.js')).installSpace(spaceId, opts))
graph
  .command('uninstall <space-id>')
  .description('Uninstall a space for your org (data preserved)')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, opts) => (await import('./commands/graph/install.js')).uninstallSpace(spaceId, opts))
graph
  .command('installs <space-id>')
  .description('List orgs that installed a space (publisher only)')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, opts) => (await import('./commands/graph/install.js')).installsList(spaceId, opts))

// Distribution — publisher controls who may install a space.
graph
  .command('distribution <space-id> <mode>')
  .description('Set distribution: public | org_allowlist | private')
  .option('--org <id>', 'Override org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, mode, opts) => (await import('./commands/graph/distribution.js')).setDistribution(spaceId, mode, opts))

// Allowlist — for distribution=org_allowlist spaces.
const allow = graph.command('allowlist').description('Manage which orgs may install org_allowlist-mode spaces')
allow
  .command('add <space-id> <org-id>')
  .description('Grant an org permission to install the space')
  .option('--org <id>', 'Override caller org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, orgId, opts) => (await import('./commands/graph/distribution.js')).allowlistAdd(spaceId, orgId, opts))
allow
  .command('rm <space-id> <org-id>')
  .alias('remove')
  .description('Revoke an org from the install allowlist')
  .option('--org <id>', 'Override caller org id')
  .option('--json', 'Output JSON')
  .action(async (spaceId, orgId, opts) => (await import('./commands/graph/distribution.js')).allowlistRemove(spaceId, orgId, opts))

// Space subcommand group (alternative namespace)
const space = program
  .command('space')
  .description('Space development commands')

space.command('scaffold [name]').alias('new').alias('create')
  .option('--with-tests', 'Include E2E testing boilerplate')
  .option('--full', 'Full preset: multiple pages, extra skills, widget templates')
  .action(async (name, opts) => scaffold(name, opts))
space.command('build').option('--entry-only').action(async (opts) => build(opts))
space.command('dev').action(async () => dev())
space.command('install').alias('run').action(() => install())
space.command('publish').option('-y, --yes').option('--bump <type>')
  .action(async (opts) => publish(opts))
space.command('validate').action(() => validate())
space.command('check').action(() => check())
space.command('clean').option('--all').action((opts) => clean(opts))

program.parse()
