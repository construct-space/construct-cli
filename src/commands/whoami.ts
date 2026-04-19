/**
 * `construct whoami` — print who the CLI is authenticated as + current scope.
 *
 * Hits accounts `/me/scope` through my.construct.space so it reflects exactly
 * what the server sees when CLI commands run. Shows user (email + id), scope
 * (user / org), and org details when applicable. Non-zero exit when not
 * authenticated so scripts can branch on it.
 */

import chalk from 'chalk'
import * as auth from '../lib/auth.js'

const ACCOUNTS_SCOPE_URL = 'https://my.construct.space/api/accounts/me/scope'

interface Scope {
  authenticated?: boolean
  scope?: 'user' | 'org'
  user?: { email?: string; username?: string; uuid?: string; first_name?: string; last_name?: string }
  org?: { id?: string; name?: string; slug?: string }
  roles?: string[]
  developer?: boolean
}

export async function whoami(): Promise<void> {
  let creds: auth.Credentials
  try {
    creds = auth.load()
  } catch {
    console.error(chalk.red('Not signed in.'))
    console.error(chalk.dim("Run 'construct login' first."))
    process.exit(1)
  }

  const res = await fetch(ACCOUNTS_SCOPE_URL, {
    headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    console.error(chalk.red(`Scope lookup failed (${res.status}).`))
    console.error(chalk.dim('Token may be expired. Try: construct login'))
    process.exit(1)
  }
  const s = (await res.json()) as Scope

  if (!s.authenticated || !s.user) {
    console.error(chalk.red('Token rejected.'))
    process.exit(1)
  }

  const name = [s.user.first_name, s.user.last_name].filter(Boolean).join(' ') || s.user.username || ''
  console.log(chalk.bold(s.user.email || name))
  if (name && name !== s.user.email) console.log(chalk.dim('  ' + name))
  if (s.user.uuid) console.log(chalk.dim('  user ' + s.user.uuid))

  if (s.scope === 'org' && s.org) {
    console.log()
    console.log(chalk.cyan('Organization'))
    console.log(`  ${s.org.name || s.org.slug || s.org.id}`)
    if (s.org.id) console.log(chalk.dim('  ' + s.org.id))
    if (s.roles && s.roles.length) console.log(chalk.dim('  roles: ' + s.roles.join(', ')))
  } else {
    console.log()
    console.log(chalk.cyan('Scope'))
    console.log('  Personal (no organization)')
    console.log(chalk.dim("  Switch to an org at https://my.construct.space"))
  }

  if (s.developer) console.log(chalk.dim('\n  developer capability: enabled'))
}
