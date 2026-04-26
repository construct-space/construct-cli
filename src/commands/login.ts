import chalk from 'chalk'
import { input, select } from '@inquirer/prompts'
import * as auth from '../lib/auth.js'

const ACCOUNTS_SCOPE_URL = 'https://my.construct.space/api/accounts/me/scope'

export async function login(options?: { portal?: string; token?: string }): Promise<void> {
  if (auth.isAuthenticated()) {
    const creds = auth.load()
    const name = creds.user?.name || 'unknown'
    console.log(chalk.blue(`Already logged in as ${name}`))
    console.log(chalk.dim("  Run 'construct logout' to sign out first."))
    return
  }

  // 1. --token flag (CI / automation)
  if (options?.token) {
    await loginWithToken(options.token)
    return
  }

  // 2. Desktop profile picker
  const profiles = auth.listDesktopProfiles()
  if (profiles.length > 0) {
    await loginFromProfile(profiles)
    return
  }

  // 3. Paste-a-token fallback
  console.log(chalk.yellow('No signed-in profiles found on this machine.'))
  console.log()
  console.log('  Two options:')
  console.log('    1. Sign in with the Construct desktop app and re-run this command, or')
  console.log(`    2. Paste a token from ${chalk.cyan('https://my.construct.space/settings/tokens')} below.`)
  console.log()

  const token = await input({
    message: 'Token (or press Ctrl+C to cancel):',
    validate: (s) => s.trim().length > 0 || 'Token required',
  })
  await loginWithToken(token.trim())
}

async function loginFromProfile(profiles: auth.DesktopProfile[]): Promise<void> {
  let picked = profiles[0]!
  if (profiles.length > 1) {
    picked = await select({
      message: 'Choose a profile to use:',
      choices: profiles.map((p) => ({ name: formatLabel(p), value: p })),
    })
  }

  const user: auth.User = {
    id: picked.user?.id || picked.id,
    name: picked.user?.name || picked.user?.username || picked.id,
    email: picked.user?.email || '',
  }

  auth.store({ token: picked.token, portal: auth.DEFAULT_PORTAL, user, profileId: picked.id })
  console.log(chalk.green(`Logged in as ${user.name}`))
  if (user.email) console.log(chalk.dim(`  ${user.email}`))
  console.log(chalk.dim(`  profile: ${picked.id}`))
}

async function loginWithToken(token: string): Promise<void> {
  let resp: Response
  try {
    resp = await fetch(ACCOUNTS_SCOPE_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err: any) {
    console.error(chalk.red(`Failed to reach accounts service: ${err.message}`))
    process.exit(1)
  }

  if (resp.status === 401) {
    console.error(chalk.red('Token rejected by accounts service (invalid or expired).'))
    process.exit(1)
  }
  if (!resp.ok) {
    console.error(chalk.red(`Token verification failed (HTTP ${resp.status}).`))
    process.exit(1)
  }

  const body = (await resp.json()) as {
    user?: { id?: string; uuid?: string; name?: string; username?: string; email?: string }
  }
  const u = body.user || {}
  const user: auth.User = {
    id: u.id || u.uuid || '',
    name: u.name || u.username || '',
    email: u.email || '',
  }

  auth.store({ token, portal: auth.DEFAULT_PORTAL, user })
  console.log(chalk.green(`Logged in as ${user.name || 'unknown'}`))
  if (user.email) console.log(chalk.dim(`  ${user.email}`))
}

function formatLabel(p: auth.DesktopProfile): string {
  const name = p.user?.name || p.user?.username || p.id
  const email = p.user?.email
  const kind = p.id.startsWith('org:') ? ' [org]' : ''
  return email ? `${name}${kind}  ${chalk.dim(email)}` : `${name}${kind}  ${chalk.dim(p.id)}`
}

export function logout(): void {
  auth.clear()
  console.log(chalk.green('Logged out.'))
}
