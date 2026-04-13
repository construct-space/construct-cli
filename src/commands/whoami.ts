import chalk from 'chalk'
import * as auth from '../lib/auth.js'

// `construct whoami` — shows which identity the CLI is operating under,
// where that identity came from (Construct app profile vs. CLI's own login),
// and which publisher(s) the token is linked to. Mirrors the information
// `publish` surfaces just before uploading.
export async function whoami(): Promise<void> {
  const fromApp = auth.loadFromApp()
  let creds: auth.Credentials | null = null
  let source: 'app' | 'cli' | 'none' = 'none'

  if (fromApp) {
    creds = fromApp
    source = 'app'
  } else {
    try {
      creds = auth.load()
      source = 'cli'
    } catch {
      source = 'none'
    }
  }

  if (source === 'none' || !creds) {
    console.log(chalk.yellow('Not signed in.'))
    console.log(chalk.dim('  Run ') + chalk.white('construct login') + chalk.dim(' or sign in to the Construct app.'))
    return
  }

  const user = creds.user
  const sourceLabel = source === 'app'
    ? chalk.cyan('Construct app profile')
    : chalk.blue('CLI login')

  console.log()
  console.log(chalk.bold(user?.name || 'Signed in'))
  console.log(chalk.dim('  ' + (user?.email || '')))
  console.log(chalk.dim('  id: ') + chalk.dim(user?.id || '—'))
  console.log(chalk.dim('  source: ') + sourceLabel)
  console.log(chalk.dim('  portal: ') + (creds.portal || auth.DEFAULT_PORTAL))

  // Refresh publisher list live — stored value may be stale after enrollment
  // on another machine.
  try {
    const resp = await fetch(`${creds.portal || auth.DEFAULT_PORTAL}/api/auth/cli-verify`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    })
    if (!resp.ok) {
      console.log(chalk.dim('  publishers: ') + chalk.red(`error (${resp.status})`))
      return
    }
    const body = await resp.json() as { publishers?: auth.Publisher[] }
    const list = body.publishers || []
    if (list.length === 0) {
      console.log(chalk.dim('  publishers: ') + chalk.yellow('none yet — enroll at developer.construct.space'))
      return
    }
    console.log()
    console.log(chalk.bold('Publishers'))
    for (const p of list) {
      const kindLabel =
        p.kind === 'org' ? chalk.cyan('org') :
        p.kind === 'user' ? chalk.blue('personal') :
        chalk.dim('legacy')
      const verified = p.verified ? chalk.green(' ✓') : ''
      console.log(`  ${chalk.white(p.name)} (${kindLabel})${verified}`)
      if (p.orgId) console.log(chalk.dim(`    org: ${p.orgId}`))
    }
  } catch (err) {
    console.log(chalk.dim('  publishers: ') + chalk.red('could not reach portal'))
  }

  console.log()
  if (source === 'app') {
    console.log(chalk.dim('To switch identities, change the active profile in the Construct app.'))
  } else {
    console.log(chalk.dim("To switch identities, run 'construct logout' then 'construct login'."))
  }
}
