/**
 * `construct graph spaces` — list spaces published by the caller's org, with
 * the pieces a publisher actually wants to see at a glance: bundle membership,
 * distribution mode, install count.
 */

import chalk from 'chalk'
import { graphRequest, requireOrgId } from '../../lib/graphClient.js'

export interface SpacesOptions {
  org?: string
  json?: boolean
  bundle?: string // filter to a single bundle id
}

interface SpaceSummary {
  id: string
  name: string
  latest_version: string
  bundle_id?: string
  distribution: string
  publisher_org_id?: string
  install_count: number
}

export async function spacesList(opts: SpacesOptions = {}): Promise<void> {
  const orgId = requireOrgId(opts.org)
  try {
    const resp = await graphRequest<{ spaces: SpaceSummary[] }>({
      method: 'GET',
      path: '/api/spaces',
      orgId,
    })
    let spaces = resp.spaces || []
    if (opts.bundle) {
      spaces = spaces.filter((s) => s.bundle_id === opts.bundle)
    }
    if (opts.json) {
      console.log(JSON.stringify(spaces, null, 2))
      return
    }
    if (spaces.length === 0) {
      const hint = opts.bundle
        ? `No spaces in bundle "${opts.bundle}".`
        : 'No spaces published by this org yet. Publish one with: construct space publish'
      console.log(chalk.dim(hint))
      return
    }
    // Fixed-width columns — lines up without pulling a table library.
    const rows = spaces.map((s) => ({
      id: s.id,
      version: s.latest_version || '0.0.0',
      bundle: s.bundle_id || chalk.dim('—'),
      distribution: colorizeDistribution(s.distribution),
      installs: String(s.install_count),
    }))
    const widths = {
      id: Math.max(4, ...rows.map((r) => r.id.length)),
      version: Math.max(7, ...rows.map((r) => r.version.length)),
      bundle: Math.max(6, ...rows.map((r) => plain(r.bundle).length)),
      distribution: Math.max(12, ...rows.map((r) => plain(r.distribution).length)),
    }
    const header = [
      chalk.bold('SPACE'.padEnd(widths.id)),
      chalk.bold('VERSION'.padEnd(widths.version)),
      chalk.bold('BUNDLE'.padEnd(widths.bundle)),
      chalk.bold('DISTRIBUTION'.padEnd(widths.distribution)),
      chalk.bold('INSTALLS'),
    ].join('  ')
    console.log(header)
    for (const r of rows) {
      console.log(
        [
          chalk.cyan(r.id.padEnd(widths.id)),
          r.version.padEnd(widths.version),
          padVisible(r.bundle, widths.bundle),
          padVisible(r.distribution, widths.distribution),
          r.installs,
        ].join('  '),
      )
    }
    console.log(chalk.dim(`\n  ${spaces.length} space${spaces.length === 1 ? '' : 's'}`))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(chalk.red(msg))
    process.exit(1)
  }
}

function colorizeDistribution(mode: string): string {
  switch (mode) {
    case 'public':
      return chalk.green(mode)
    case 'org_allowlist':
      return chalk.yellow(mode)
    case 'private':
      return chalk.magenta(mode)
    default:
      return mode
  }
}

// chalk wraps strings in ANSI escapes; padEnd counts those as visible chars and
// misaligns columns. Strip them for length calculations + pad on the plain text.
function plain(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}

function padVisible(s: string, width: number): string {
  const visible = plain(s)
  if (visible.length >= width) return s
  return s + ' '.repeat(width - visible.length)
}
