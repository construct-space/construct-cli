import chalk from 'chalk'
import { select } from '@inquirer/prompts'
import * as auth from '../lib/auth.js'

export async function login(_options?: { portal?: string }): Promise<void> {
  if (auth.isAuthenticated()) {
    const creds = auth.load()
    const name = creds.user?.name || 'unknown'
    console.log(chalk.blue(`Already logged in as ${name}`))
    console.log(chalk.dim("  Run 'construct logout' to sign out first."))
    return
  }

  const profiles = auth.listDesktopProfiles()

  if (profiles.length === 0) {
    console.error(chalk.red('No signed-in profiles found.'))
    console.error(chalk.dim('  Sign in with the Construct desktop app, then re-run this command.'))
    process.exit(1)
  }

  let picked = profiles[0]!
  if (profiles.length > 1) {
    picked = await select({
      message: 'Choose a profile to use:',
      choices: profiles.map((p) => ({
        name: formatLabel(p),
        value: p,
      })),
    })
  }

  const user: auth.User = {
    id: picked.user?.id || picked.id,
    name: picked.user?.name || picked.user?.username || picked.id,
    email: picked.user?.email || '',
  }

  auth.store({
    token: picked.token,
    portal: auth.DEFAULT_PORTAL,
    user,
  })

  console.log(chalk.green(`Logged in as ${user.name}`))
  if (user.email) console.log(chalk.dim(`  ${user.email}`))
  console.log(chalk.dim(`  profile: ${picked.id}`))
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
