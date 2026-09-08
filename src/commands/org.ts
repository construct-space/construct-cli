/**
 * `construct org status` -- print the active org context and publisher.
 *
 * Similar surface to `whoami`, but framed around "what am I publishing AS?".
 * Surfaces the publisher block from auth.json (the local view of which
 * publisher key the CLI will attach as X-API-Key on the next publish),
 * not just the identity. Useful for "am I about to publish to my personal
 * profile or my org's?" sanity checks before a release.
 */

import chalk from 'chalk'
import * as auth from '../lib/auth.js'

const ACCOUNTS_SCOPE_URL = 'https://my.construct.space/api/accounts/me/scope'

interface Scope {
  authenticated?: boolean
  scope?: 'user' | 'org'
  user?: { email?: string; username?: string; uuid?: string }
  org?: { id?: string; name?: string; slug?: string }
  roles?: string[]
  developer?: boolean
}

export async function orgStatus(): Promise<void> {
  let creds: auth.Credentials
  try {
    creds = auth.load()
  } catch {
    console.error(chalk.red('Not signed in.'))
    console.error(chalk.dim("Run 'construct login' first."))
    process.exit(1)
  }

  let s: Scope
  try {
    const res = await fetch(ACCOUNTS_SCOPE_URL, {
      headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      console.error(chalk.red(`Scope lookup failed (${res.status}).`))
      console.error(chalk.dim('Token may be expired. Try: construct login'))
      process.exit(1)
    }
    s = (await res.json()) as Scope
  } catch (err: any) {
    console.error(chalk.red(`Could not reach accounts service: ${err?.message || err}`))
    process.exit(1)
  }

  if (!s.authenticated || !s.user) {
    console.error(chalk.red('Token rejected.'))
    process.exit(1)
  }

  // Scope line first -- the most load-bearing fact for "am I about to do
  // the right thing".
  if (s.scope === 'org' && s.org) {
    console.log(chalk.cyan('Scope: ') + chalk.bold(`org -- ${s.org.name || s.org.slug || s.org.id}`))
    if (s.org.slug) console.log(chalk.dim(`  slug: ${s.org.slug}`))
    if (s.org.id) console.log(chalk.dim(`  id:   ${s.org.id}`))
    if (s.roles && s.roles.length) {
      console.log(chalk.dim(`  roles: ${s.roles.join(', ')}`))
    }
  } else {
    console.log(chalk.cyan('Scope: ') + chalk.bold('personal'))
    console.log(chalk.dim('  (switch to an org at https://my.construct.space)'))
  }

  console.log()
  console.log(chalk.cyan('Signed in as'))
  console.log(`  ${s.user.email || s.user.username || s.user.uuid || '(unknown)'}`)
  if (s.user.uuid) console.log(chalk.dim(`  ${s.user.uuid}`))

  // Publisher block -- the local credential that publish will attach.
  console.log()
  console.log(chalk.cyan('Publisher (from auth.json)'))
  if (creds.publisherKey) {
    const kind = creds.publisherKind || 'user'
    const expected = s.scope === 'org' ? 'org' : 'user'
    const matches = kind === expected
    console.log(`  ${chalk.bold(creds.publisherName || '(unnamed)')}  ${chalk.dim(`[${kind}]`)}`)
    console.log(chalk.dim(`  key: ${creds.publisherKey.slice(0, 14)}...`))
    if (!matches) {
      console.log(chalk.yellow(`  ⚠ publisher kind (${kind}) doesn't match active scope (${expected}).`))
      console.log(chalk.dim('    Restart the desktop app or run \'construct login\' to re-sync.'))
    }
  } else {
    console.log(chalk.dim('  (none -- enroll as a developer to get a publisher key)'))
  }

  // Developer capability flag -- accounts /me/scope's authoritative answer.
  if (s.developer) {
    console.log()
    console.log(chalk.dim('developer capability: ') + chalk.green('enabled'))
  }
}
