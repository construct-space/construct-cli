/**
 * Space bundle commands — create / list / show the publisher-side grouping
 * that links related spaces (kanban + kanban-admin) under one ownership
 * umbrella. See graph-sdk README §Space Bundles.
 */

import chalk from 'chalk'
import { graphRequest, requireOrgId } from '../../lib/graphClient.js'

export interface BundlesOptions {
  org?: string
  json?: boolean
}

interface Bundle {
  id: string
  name: string
  owner_org_id: string
  created_at?: string
}

export async function bundlesList(opts: BundlesOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  try {
    const resp = await graphRequest<{ bundles: Bundle[] }>({
      method: 'GET',
      path: '/api/space-bundles',
      orgId,
    })
    const bundles = resp.bundles || []
    if (opts.json) {
      console.log(JSON.stringify(bundles, null, 2))
      return
    }
    if (bundles.length === 0) {
      console.log(chalk.dim('No bundles yet. Create one with: construct graph bundles create <id> <name>'))
      return
    }
    console.log(chalk.bold(`Bundles for org ${orgId}:`))
    for (const b of bundles) {
      console.log(`  ${chalk.cyan(b.id)} — ${b.name}`)
    }
  } catch (err) {
    fail(err)
  }
}

export async function bundleCreate(id: string, name: string, opts: BundlesOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!id || !name) {
    console.error(chalk.red('Usage: construct graph bundles create <id> <name>'))
    process.exit(1)
  }
  try {
    const resp = await graphRequest<{ id: string; name: string }>({
      method: 'POST',
      path: '/api/space-bundles',
      body: { id, name },
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }
    console.log(chalk.green(`✓ Bundle created: ${chalk.cyan(resp.id)} — ${resp.name}`))
    console.log(chalk.dim(`  Next: add bundle_id: "${resp.id}" to your data.manifest.json and publish.`))
  } catch (err) {
    fail(err)
  }
}

export async function bundleShow(id: string, opts: BundlesOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!id) {
    console.error(chalk.red('Usage: construct graph bundles show <id>'))
    process.exit(1)
  }
  try {
    const bundle = await graphRequest<Bundle>({
      method: 'GET',
      path: `/api/space-bundles/${encodeURIComponent(id)}`,
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify(bundle, null, 2))
      return
    }
    console.log(chalk.bold(bundle.id))
    console.log(`  Name:         ${bundle.name}`)
    console.log(`  Owner org:    ${bundle.owner_org_id}`)
    if (bundle.created_at) console.log(`  Created:      ${bundle.created_at}`)
  } catch (err) {
    fail(err)
  }
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(chalk.red(msg))
  process.exit(1)
}
