import { createServer } from 'http'
import chalk from 'chalk'
import * as auth from '../lib/auth.js'
import { openBrowser } from '../lib/utils.js'

export async function login(options?: { portal?: string }): Promise<void> {
  const portalURL = options?.portal || auth.DEFAULT_PORTAL

  if (auth.isAuthenticated()) {
    const creds = auth.load()
    const name = creds.user?.name || 'unknown'
    console.log(chalk.blue(`Already logged in as ${name}`))
    console.log(chalk.dim("  Run 'construct logout' to sign out first."))
    return
  }

  // Find free port
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as any).port
  server.close()

  const callbackURL = `http://localhost:${port}/callback`
  const loginURL = `${portalURL}/api/auth/cli-login?callback=${encodeURIComponent(callbackURL)}`

  const tokenPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      srv.close()
      reject(new Error('Login timed out. Try again.'))
    }, 5 * 60 * 1000)

    const srv = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`)
      if (url.pathname !== '/callback') { res.end(); return }

      const error = url.searchParams.get('error')
      const token = url.searchParams.get('token')

      res.setHeader('Content-Type', 'text/html')

      if (error) {
        res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px">
          <h2 style="color:#EF4444">Login Failed</h2><p>${error}</p>
          <p style="color:#6B7280">You can close this window.</p></body></html>`)
        clearTimeout(timeout)
        srv.close()
        reject(new Error(error))
        return
      }

      if (!token) {
        res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px">
          <h2 style="color:#EF4444">Login Failed</h2><p>No token received.</p>
          <p style="color:#6B7280">You can close this window.</p></body></html>`)
        clearTimeout(timeout)
        srv.close()
        reject(new Error('No token received'))
        return
      }

      res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px">
        <h2 style="color:#10B981">Logged In!</h2>
        <p>You can close this window and return to your terminal.</p></body></html>`)
      clearTimeout(timeout)
      srv.close()
      resolve(token)
    })

    srv.listen(port, '127.0.0.1')
  })

  console.log(chalk.blue('Opening browser to log in...'))
  console.log(chalk.dim('  If the browser doesn\'t open, visit:'))
  console.log(chalk.dim(`  ${loginURL}`))
  console.log()

  openBrowser(loginURL)
  console.log(chalk.dim('  Waiting for authentication...'))

  try {
    const token = await tokenPromise

    // Verify token
    const resp = await fetch(`${portalURL}/api/auth/cli-verify`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const { user, publishers } = await resp.json() as {
      user: auth.User
      publishers?: auth.Publisher[]
    }

    auth.store({ token, portal: portalURL, user, publishers })
    console.log()
    console.log(chalk.green(`Logged in as ${user?.name || 'there'}`))

    // Show active publisher identity so users know which one future
    // `construct publish` runs target. Legacy rows predate user/org linking.
    const list = publishers || []
    if (list.length === 0) {
      console.log(chalk.yellow('  No publisher yet. Run developer enrollment to publish spaces.'))
    } else {
      for (const p of list) {
        const label =
          p.kind === 'org' ? chalk.cyan('org') :
          p.kind === 'user' ? chalk.blue('personal') :
          chalk.dim('legacy')
        console.log(chalk.dim(`  Publisher: ${p.name} (${label})`))
      }
    }
  } catch (err: any) {
    console.error(chalk.red(`Login failed: ${err.message}`))
    process.exit(1)
  }
}

export function logout(): void {
  auth.clear()
  console.log(chalk.green('Logged out.'))
}
