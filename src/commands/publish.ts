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

async function uploadSource(portalURL: string, identityToken: string, publisherKey: string | undefined, tarballPath: string, m: manifest.SpaceManifest, opts: { private?: boolean; public?: boolean }): Promise<PublishResult> {
  const formData = new FormData()
  formData.append('manifest', JSON.stringify(m))

  const fileData = readFileSync(tarballPath)
  const blob = new Blob([fileData])
  formData.append('source', blob, basename(tarballPath))

  if (opts.private) {
    formData.append('private', 'true')
  }
  if (opts.public) {
    formData.append('public', 'true')
  }

  // Bearer = identity (cat_*) -- required for the gateway's auth_request, which
  // validates against accounts. X-API-Key = publisher proof (csk_live_*) --
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

  const result = await resp.json() as PublishResult & {
    owner_user_id?: string
    owner_org_id?: string
    owner_kind?: 'user' | 'org'
    owner_name?: string
  }

  if (resp.status === 401) {
    throw new Error("authentication failed -- run 'construct login' to re-authenticate")
  }

  if (resp.status === 403) {
    let msg = result.error || 'You are not the owner of this space'
    if (result.owner_kind === 'org') {
      const label = result.owner_name
        ? `${result.owner_name} (org${result.owner_org_id ? `: ${result.owner_org_id}` : ''})`
        : result.owner_org_id || 'unknown org'
      msg += `\n  Owned by: ${label}`
    } else if (result.owner_name) {
      msg += `\n  Owned by: ${result.owner_name}${result.owner_user_id ? ` (${result.owner_user_id})` : ''}`
    } else if (result.owner_user_id) {
      msg += `\n  Current owner: ${result.owner_user_id}`
    }
    msg += '\n  Fork to a new space_id to publish your own version.'
    const err = new Error(msg) as Error & { ownerKind?: string; ownerOrgId?: string }
    err.ownerKind = result.owner_kind
    err.ownerOrgId = result.owner_org_id
    throw err
  }

  if (resp.status >= 400) {
    const msg = result.error || result.errors?.join('; ') || `server returned ${resp.status}`
    throw new Error(msg)
  }

  return result
}

/**
 * Hit `/api/publisher/org` with the identity token to recover the org's
 * publisher api_key. Returns the csk_live_* on success, or null if the
 * caller can't manage the org publisher or the endpoint isn't reachable.
 */
async function fetchOrgPublisherKey(portalURL: string, identityToken: string): Promise<string | null> {
  // portalURL is e.g. https://my.construct.space/api/developer; the publisher
  // endpoint lives at the gateway root /api/publisher/org, not under the
  // developer prefix. Strip /api/developer (or any trailing path) and rebuild.
  const root = portalURL.replace(/\/api\/developer\/?$/, '').replace(/\/+$/, '')
  try {
    const resp = await fetch(`${root}/api/publisher/org`, {
      headers: { Authorization: `Bearer ${identityToken}` },
    })
    if (!resp.ok) return null
    const body = await resp.json() as { publisher?: { api_key?: string } }
    return body.publisher?.api_key || null
  } catch {
    return null
  }
}

function setVersionInFiles(root: string, oldVer: string, newVer: string): void {
  const oldStr = `"version": "${oldVer}"`
  const newStr = `"version": "${newVer}"`
  for (const file of ['package.json', 'space.manifest.json']) {
    const path = join(root, file)
    try {
      const data = readFileSync(path, 'utf-8')
      writeFileSync(path, data.replace(oldStr, newStr))
    } catch { /* file missing or unwritable — skip; not all spaces have every file */ }
  }
}

export async function publish(options?: { yes?: boolean; bump?: string; private?: boolean; public?: boolean; apiKey?: string; scope?: string }): Promise<void> {
  const root = process.cwd()
  const yes = options?.yes ?? false
  const wantPrivate = options?.private ?? false
  const wantPublic = options?.public ?? false
  const scopeOpt = options?.scope ? options.scope.toLowerCase() : undefined
  if (scopeOpt && scopeOpt !== 'user' && scopeOpt !== 'org') {
    console.error(chalk.red(`--scope must be 'user' or 'org', got '${options?.scope}'.`))
    process.exit(1)
  }
  const wantOrgScope = scopeOpt === 'org'
  const wantUserScope = scopeOpt === 'user'

  if (wantPrivate && wantPublic) {
    console.error(chalk.red('Cannot combine --private and --public. Pick one.'))
    process.exit(1)
  }

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
  // predates the gateway -- it can't pass auth_request. Bail with a clear
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
    console.log(chalk.dim('  (Org Settings -> Developer), then re-run this command.'))
    console.log()
  }

  // Reconcile --scope with the active profile's publisher.
  //   --scope=org: ignore any personal publisher key on disk; fetch the
  //                org's key (or rely on auth.json having the org key).
  //                Errors if no org context can be resolved.
  //   --scope=user: refuse to send an org publisher key; only personal.
  //                Errors if the profile's publisher is org-kind and the
  //                caller didn't pass an explicit --api-key.
  // No flag: keep the current implicit behaviour (use whatever's in
  // auth.json; fall through to org fetch on 403).
  if (wantUserScope && creds.publisherKind === 'org' && !options?.apiKey) {
    console.error(chalk.red('--scope=user, but the active publisher in auth.json is an org publisher.'))
    console.error(chalk.dim('  Switch context to personal in the desktop app, or pass --api-key with a personal key.'))
    process.exit(1)
  }
  if (wantOrgScope && creds.publisherKind === 'user' && !options?.apiKey) {
    // We'll attempt to fetch the org key just-in-time below -- clear the
    // mismatched personal key now so it doesn't accidentally get sent.
    creds = { ...creds, publisherKey: undefined, publisherKind: undefined, publisherName: undefined }
  }

  // --private only makes sense when publishing as an org. Bail early with a
  // clear message instead of letting the server reject after the upload.
  // --scope=org implies org publisher, so we permit --private even if the
  // current auth.json carries a personal kind (the JIT fetch will swap it).
  if (wantPrivate && creds.publisherKind !== 'org' && !wantOrgScope) {
    console.error(chalk.red('--private requires an org publisher key.'))
    console.error(chalk.dim('  Personal publishes are always public.'))
    console.error(chalk.dim('  Pass --scope=org to publish as your active org, or enrol an org'))
    console.error(chalk.dim('  from the desktop app (Org Settings -> Developer) first.'))
    process.exit(1)
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
  if (wantPrivate) {
    console.log(`  Audience: ${chalk.magenta('org-private')} ${chalk.dim('(--private)')}`)
  } else if (wantPublic) {
    console.log(`  Audience: ${chalk.cyan('public')} ${chalk.dim('(--public; flips a previously-private space)')}`)
  } else {
    console.log(`  Audience: ${chalk.dim('preserved (default public on first publish, sticky on update)')}`)
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
    // Explicit --api-key (or CONSTRUCT_PUBLISHER_KEY env) overrides whatever
    // is in the active profile. Useful when the desktop hasn't seeded the
    // publisher block into auth.json yet but the user has the org key in hand.
    const explicitKey = options?.apiKey || process.env.CONSTRUCT_PUBLISHER_KEY
    let initialKey = explicitKey || creds.publisherKey

    // --scope=org without an explicit key: fetch the org publisher up
    // front, not just on 403. Avoids the wasted upload + ownership-check
    // round-trip when the caller has already told us their intent.
    if (wantOrgScope && !explicitKey && !initialKey) {
      uploadSpinner.text = 'Fetching org publisher key...'
      const orgKey = await fetchOrgPublisherKey(creds.portal, creds.token)
      if (!orgKey) {
        uploadSpinner.fail('No org publisher available for --scope=org')
        console.error(chalk.dim('  Switch into an org context in the desktop app, or pass --api-key'))
        console.error(chalk.dim('  with a csk_live_* key the org owns.'))
        unlinkSync(tarballPath)
        process.exit(1)
      }
      initialKey = orgKey
    }

    let result: Awaited<ReturnType<typeof uploadSource>>
    try {
      result = await uploadSource(creds.portal, creds.token, initialKey, tarballPath, m, { private: wantPrivate, public: wantPublic })
    } catch (e: any) {
      // Org-owned space and we sent no publisher key -- try fetching the org
      // publisher's api_key with the identity token. Works if the caller is
      // a manager (owner/admin/developer) of the owning org. The desktop
      // login flow should ideally seed this into auth.json, but until then
      // this just-in-time fetch lets `construct publish` work for org
      // owners who never explicitly wired up a publisher key. Skipped when
      // --scope=user since the user explicitly asked for personal-only.
      if (e?.ownerKind === 'org' && !creds.publisherKey && !wantUserScope) {
        uploadSpinner.text = 'Fetching org publisher key...'
        const orgKey = await fetchOrgPublisherKey(creds.portal, creds.token)
        if (!orgKey) throw e
        uploadSpinner.text = 'Uploading & building (as org)...'
        result = await uploadSource(creds.portal, creds.token, orgKey, tarballPath, m, { private: wantPrivate, public: wantPublic })
      } else {
        throw e
      }
    }
    unlinkSync(tarballPath)

    // Tag locally
    gitSafe(root, 'tag', `v${m.version}`)
    gitSafe(root, 'push', 'origin', `v${m.version}`)

    if (result.status === 'approved' || result.status === 'pending_review') {
      uploadSpinner.succeed(`Published ${m.name} v${m.version}`)
      if (result.status === 'pending_review') {
        console.log(chalk.dim('  Status: pending review -- your space will be available after approval.'))
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
