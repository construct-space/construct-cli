/**
 * Distribution + allowlist commands — publisher controls who may install a
 * space. See graph-sdk README §Distribution + Installs.
 */

import chalk from 'chalk'
import { graphRequest, requireOrgId } from '../../lib/graphClient.js'

export interface DistOptions {
  org?: string
  json?: boolean
}

const VALID_MODES = ['public', 'org_allowlist', 'private'] as const
type DistMode = (typeof VALID_MODES)[number]

export async function setDistribution(spaceId: string, mode: string, opts: DistOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId || !mode) {
    console.error(chalk.red('Usage: construct graph distribution <space-id> <public|org_allowlist|private>'))
    process.exit(1)
  }
  if (!VALID_MODES.includes(mode as DistMode)) {
    console.error(chalk.red(`Invalid mode "${mode}". Expected one of: ${VALID_MODES.join(', ')}`))
    process.exit(1)
  }
  try {
    const resp = await graphRequest<{ ok: boolean; distribution: string }>({
      method: 'PUT',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/distribution`,
      body: { distribution: mode },
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }
    console.log(chalk.green(`✓ ${chalk.cyan(spaceId)} distribution set to ${chalk.bold(resp.distribution)}`))
    if (mode === 'org_allowlist') {
      console.log(chalk.dim('  Next: add allowed orgs with: construct graph allowlist add <space-id> <org-id>'))
    }
  } catch (err) {
    fail(err)
  }
}

export async function allowlistAdd(spaceId: string, targetOrgId: string, opts: DistOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId || !targetOrgId) {
    console.error(chalk.red('Usage: construct graph allowlist add <space-id> <org-id>'))
    process.exit(1)
  }
  try {
    await graphRequest<{ ok: boolean }>({
      method: 'POST',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/allowlist`,
      body: { org_id: targetOrgId },
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, space_id: spaceId, org_id: targetOrgId }, null, 2))
      return
    }
    console.log(chalk.green(`✓ Added ${chalk.cyan(targetOrgId)} to ${spaceId} allowlist`))
  } catch (err) {
    fail(err)
  }
}

export async function allowlistRemove(spaceId: string, targetOrgId: string, opts: DistOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  if (!spaceId || !targetOrgId) {
    console.error(chalk.red('Usage: construct graph allowlist rm <space-id> <org-id>'))
    process.exit(1)
  }
  try {
    await graphRequest<{ ok: boolean }>({
      method: 'DELETE',
      path: `/api/spaces/${encodeURIComponent(spaceId)}/allowlist`,
      body: { org_id: targetOrgId },
      orgId,
    })
    if (opts.json) {
      console.log(JSON.stringify({ ok: true }, null, 2))
      return
    }
    console.log(chalk.green(`✓ Removed ${chalk.cyan(targetOrgId)} from ${spaceId} allowlist`))
    console.log(chalk.dim('  Existing installs by this org are preserved — uninstall separately if needed.'))
  } catch (err) {
    fail(err)
  }
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(chalk.red(msg))
  process.exit(1)
}
