/**
 * Install commands — tenant-side install/uninstall + publisher-side listing
 * of which orgs have installed a given space.
 */

import chalk from 'chalk'
import { graphRequest, requireOrgId } from '../../lib/graphClient.js'

export interface InstallOptions {
  org?: string
  json?: boolean
}

export async function installSpace(spaceId: string, opts: InstallOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId) {
    console.error(chalk.red('Usage: construct graph install <space-id>'))
    process.exit(1)
  }
  try {
    const resp = await graphRequest<{ ok: boolean }>({
      method: 'POST',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/install`,
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }
    console.log(chalk.green(`✓ Installed ${chalk.cyan(spaceId)} for org ${orgId}`))
  } catch (err) {
    fail(err)
  }
}

export async function uninstallSpace(spaceId: string, opts: InstallOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId) {
    console.error(chalk.red('Usage: construct graph uninstall <space-id>'))
    process.exit(1)
  }
  try {
    const resp = await graphRequest<{ ok: boolean }>({
      method: 'DELETE',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/install`,
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }
    console.log(chalk.green(`✓ Uninstalled ${chalk.cyan(spaceId)} for org ${orgId}`))
    console.log(chalk.dim('  Note: tenant data is preserved; reinstall to reconnect.'))
  } catch (err) {
    fail(err)
  }
}

export async function installsList(spaceId: string, opts: InstallOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId) {
    console.error(chalk.red('Usage: construct graph installs <space-id>'))
    process.exit(1)
  }
  try {
    const resp = await graphRequest<{ space_id: string; orgs: string[] }>({
      method: 'GET',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/installs`,
      orgId,
    })
    const orgs = resp.orgs || []
    if (opts.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }
    if (orgs.length === 0) {
      console.log(chalk.dim(`No orgs have installed ${spaceId} yet.`))
      return
    }
    console.log(chalk.bold(`Installs for ${spaceId}:`))
    for (const o of orgs) console.log(`  ${o}`)
    console.log(chalk.dim(`\n  Total: ${orgs.length}`))
  } catch (err) {
    fail(err)
  }
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(chalk.red(msg))
  process.exit(1)
}
