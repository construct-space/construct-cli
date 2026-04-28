import { readFileSync, writeFileSync, statSync, unlinkSync } from 'fs'
import { join, basename } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import { select, input, confirm } from '@inquirer/prompts'
import * as manifest from '../lib/manifest.js'
import * as auth from '../lib/auth.js'
import { writeEntry } from '../lib/entry.js'
import { packSource } from '../lib/pack.js'
import { git, gitSafe, bumpPatch, bumpMinor, bumpMajor, formatBytes } from '../lib/utils.js'

interface PublishResult {
  status: string
  space?: { id: string; version: string; status: string }
  build?: { checksum: string; size: number; duration: string }
  error?: string
  errors?: string[]
  log?: string
}

async function uploadSource(portalURL: string, identityToken: string, publisherKey: string | undefined, tarballPath: string, m: manifest.SpaceManifest): Promise<PublishResult> {
  const formData = new FormData()
  formData.append('manifest', JSON.stringify(m))

  const fileData = readFileSync(tarballPath)
  const blob = new Blob([fileData])
  formData.append('source', blob, basename(tarballPath))

  // Bearer = identity (cat_*) — required for the gateway's auth_request, which
  // validates against accounts. X-API-Key = publisher proof (csk_live_*) —
  // forwarded untouched by accounts; the developer service reads it to
  // attribute the resulting space to the org publisher. Sending the
  // publisher key as Bearer would 401 at the gateway.
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${identityToken}`,
  }
  if (publisherKey) {
    headers['X-API-Key'] = publisherKey
  }

  const resp = await fetch(`${portalURL}/publish`, {
    method: 'POST',
    headers,
    body: formData,
  })

  const result = await resp.json() as PublishResult & { owner_user_id?: string }

  if (resp.status === 401) {
    throw new Error("authentication failed — run 'construct login' to re-authenticate")
  }

  if (resp.status === 403) {
    let msg = result.error || 'You are not the owner of this space'
    if (result.owner_user_id) {
      msg += `\n  Current owner: ${result.owner_user_id}`
    }
    msg += '\n  Fork to a new space_id to publish your own version.'
    throw new Error(msg)
  }

  if (resp.status >= 400) {
    const msg = result.error || result.errors?.join('; ') || `server returned ${resp.status}`
    throw new Error(msg)
  }

  return result
}

function setVersionInFiles(root: string, oldVer: string, newVer: string): void {
  const oldStr = `"version": "${oldVer}"`
  const newStr = `"version": "${newVer}"`
  for (const file of ['package.json', 'space.manifest.json']) {
    const path = join(root, file)
    try {
      const data = readFileSync(path, 'utf-8')
      writeFileSync(path, data.replace(oldStr, newStr))
    } catch {}
  }
}

export async function publish(options?: { yes?: boolean; bump?: string }): Promise<void> {
  const root = process.cwd()
  const yes = options?.yes ?? false

  if (!manifest.exists(root)) {
    console.error(chalk.red('No space.manifest.json found in current directory'))
    process.exit(1)
  }

  let m = manifest.read(root)
  writeEntry(root, m)

  let creds: auth.Credentials
  try {
    creds = auth.load()
  } catch (err: any) {
    console.error(chalk.red(err.message))
    console.log(chalk.dim("  Run 'construct login' to authenticate."))
    process.exit(1)
  }

  // Check uncommitted changes
  const status = gitSafe(root, 'status', '--porcelain')
  if (status) {
    console.log(chalk.yellow('You have uncommitted changes.'))
    if (!yes) {
      const proceed = await confirm({ message: 'Publish anyway?' })
      if (!proceed) { console.log('Cancelled.'); return }
    } else {
      console.log(chalk.dim('  Continuing (--yes)'))
    }
  }

  // Version management
  const currentVersion = m.version
  const tag = `v${currentVersion}`
  const tagExists = gitSafe(root, 'rev-parse', tag) !== null

  if (tagExists) {
    console.log(chalk.yellow(`Version ${currentVersion} already tagged.`))

    let bumpChoice = options?.bump || ''
    let newVersion = ''

    if (!bumpChoice) {
      if (yes) {
        bumpChoice = 'patch'
      } else {
        bumpChoice = await select({
          message: `Version ${currentVersion} exists. What do you want to do?`,
          choices: [
            { name: `Bump patch  (${bumpPatch(currentVersion)})`, value: 'patch' },
            { name: `Bump minor  (${bumpMinor(currentVersion)})`, value: 'minor' },
            { name: `Bump major  (${bumpMajor(currentVersion)})`, value: 'major' },
            { name: 'Enter custom version', value: 'custom' },
            { name: 'Cancel', value: 'cancel' },
          ],
        })
      }
    }

    switch (bumpChoice) {
      case 'patch': newVersion = bumpPatch(currentVersion); break
      case 'minor': newVersion = bumpMinor(currentVersion); break
      case 'major': newVersion = bumpMajor(currentVersion); break
      case 'custom':
        newVersion = await input({
          message: 'Enter version',
          validate: (s) => /^\d+\.\d+\.\d+$/.test(s) || 'Must be semver (x.y.z)',
        })
        break
      case 'cancel': console.log('Cancelled.'); return
    }

    // Bump version in files
    setVersionInFiles(root, currentVersion, newVersion)

    git(root, 'add', 'package.json', 'space.manifest.json')
    git(root, 'commit', '-m', `release: v${newVersion}`)
    git(root, 'push')

    m = manifest.read(root)
    console.log(chalk.green(`Version bumped to ${m.version}`))
  }

  // The gateway only validates identity tokens (cat_*) on Authorization.
  // A bare publisher key as `token` is a legacy `--api-key` login that
  // predates the gateway — it can't pass auth_request. Bail with a clear
  // message instead of letting the upload 401 with no context.
  if (creds.token.startsWith('csk_live_')) {
    console.error(chalk.red('Stored credential is a publisher key, not an identity token.'))
    console.error(chalk.dim("  Run 'construct login' or sign in via the desktop app to refresh."))
    process.exit(1)
  }

  if (!creds.publisherKey) {
    console.log(chalk.yellow('No publisher key in active profile.'))
    console.log(chalk.dim('  Spaces will be attributed to your personal user identity.'))
    console.log(chalk.dim('  To publish as an org: enroll the org from the desktop app'))
    console.log(chalk.dim('  (Org Settings → Developer), then re-run this command.'))
    console.log()
  }

  // Summary
  console.log()
  console.log(`  Space:   ${chalk.cyan(m.name)}`)
  console.log(`  Version: ${chalk.cyan('v' + m.version)}`)
  console.log(`  Server:  ${chalk.dim(creds.portal)}`)
  if (creds.publisherKey) {
    const kind = creds.publisherKind === 'org' ? 'org' : 'personal'
    const label = creds.publisherName || creds.user?.name || ''
    console.log(`  As:      ${chalk.cyan(label)} ${chalk.dim(`(${kind} publisher)`)}`)
  } else if (creds.user) {
    console.log(`  Author:  ${chalk.dim(creds.user.name)}`)
  }
  console.log()

  if (!yes) {
    const proceed = await confirm({
      message: 'Publish this space?',
    })
    if (!proceed) { console.log('Cancelled.'); return }
  }

  // Pack source
  const spinner = ora('Packing source...').start()
  let tarballPath: string
  try {
    tarballPath = await packSource(root)
    const size = statSync(tarballPath).size
    spinner.succeed(`Source packed (${formatBytes(size)})`)
  } catch (err: any) {
    spinner.fail('Pack failed')
    console.error(chalk.red(err.message))
    process.exit(1)
  }

  // Upload
  const uploadSpinner = ora('Uploading & building...').start()
  try {
    const result = await uploadSource(creds.portal, creds.token, creds.publisherKey, tarballPath, m)
    unlinkSync(tarballPath)

    // Tag locally
    gitSafe(root, 'tag', `v${m.version}`)
    gitSafe(root, 'push', 'origin', `v${m.version}`)

    if (result.status === 'approved' || result.status === 'pending_review') {
      uploadSpinner.succeed(`Published ${m.name} v${m.version}`)
      if (result.status === 'pending_review') {
        console.log(chalk.dim('  Status: pending review — your space will be available after approval.'))
      }
    } else if (result.status === 'build_failed') {
      uploadSpinner.fail('Build failed on server')
      if (result.log) console.log(result.log)
    } else {
      uploadSpinner.info(`Status: ${result.status}`)
    }

    if (result.build) {
      console.log(`  Checksum: ${chalk.dim(result.build.checksum)}`)
      console.log(`  Size:     ${chalk.dim(formatBytes(result.build.size))}`)
      console.log(`  Duration: ${chalk.dim(result.build.duration)}`)
    }
  } catch (err: any) {
    uploadSpinner.fail('Upload failed')
    unlinkSync(tarballPath)
    console.error(chalk.red(err.message))
    process.exit(1)
  }
}
