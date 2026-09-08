import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync, existsSync } from 'fs'
import { listDesktopProfiles, load, store, clear } from './auth.js'

const tmpDirs: string[] = []

function setupDataDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'construct-cli-auth-'))
  tmpDirs.push(d)
  process.env.CONSTRUCT_DATA_DIR = d
  return d
}

function writeProfile(root: string, id: string, body: Record<string, unknown>): void {
  const dir = join(root, 'profiles', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'auth.json'), JSON.stringify(body))
}

beforeEach(() => {
  delete process.env.CONSTRUCT_DATA_DIR
})

afterEach(() => {
  delete process.env.CONSTRUCT_DATA_DIR
  while (tmpDirs.length) {
    const d = tmpDirs.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})

describe('listDesktopProfiles', () => {
  test('returns [] when profiles dir is missing', () => {
    setupDataDir()
    expect(listDesktopProfiles()).toEqual([])
  })

  test('returns authenticated profiles with token + user info', () => {
    const root = setupDataDir()
    writeProfile(root, 'uuid-1', {
      user: { id: 'u1', name: 'Alice', email: 'a@x.test' },
      token: 'cat_alice',
      authenticated: true,
      updated_at: '2026-04-18T00:00:00Z',
    })
    writeProfile(root, 'org:uuid-2', {
      user: { id: 'u2', name: 'Bob', email: 'b@x.test' },
      token: 'cat_bob',
      authenticated: true,
    })

    const profiles = listDesktopProfiles()
    expect(profiles.length).toBe(2)

    const ids = profiles.map((p) => p.id).sort()
    expect(ids).toEqual(['org:uuid-2', 'uuid-1'])

    const alice = profiles.find((p) => p.id === 'uuid-1')
    expect(alice?.token).toBe('cat_alice')
    expect(alice?.user?.email).toBe('a@x.test')
  })

  test('skips profiles with missing token or authenticated=false', () => {
    const root = setupDataDir()
    writeProfile(root, 'no-token', { user: { name: 'NoT' } })
    writeProfile(root, 'revoked', {
      user: { name: 'R' },
      token: 'cat_r',
      authenticated: false,
    })
    writeProfile(root, 'good', {
      user: { name: 'G' },
      token: 'cat_g',
      authenticated: true,
    })

    const profiles = listDesktopProfiles()
    expect(profiles.map((p) => p.id)).toEqual(['good'])
  })

  test('ignores malformed auth.json without throwing', () => {
    const root = setupDataDir()
    const badDir = join(root, 'profiles', 'broken')
    mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, 'auth.json'), '{ not valid json')
    writeProfile(root, 'good', { token: 'cat_g', authenticated: true })

    const profiles = listDesktopProfiles()
    expect(profiles.map((p) => p.id)).toEqual(['good'])
  })
})

describe('load (active-profile fallback)', () => {
  test('throws when neither credentials.json nor profile registry exists', () => {
    setupDataDir()
    expect(() => load()).toThrow(/not logged in/)
  })

  test('mirrors active profile when credentials.json is missing', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'uuid-1' }))
    writeProfile(root, 'uuid-1', {
      user: { id: 'u1', name: 'Alice', email: 'a@x.test' },
      token: 'cat_alice',
      authenticated: true,
    })

    const creds = load()
    expect(creds.token).toBe('cat_alice')
    expect(creds.profileId).toBe('uuid-1')
    expect(creds.user?.email).toBe('a@x.test')
  })

  test('mirrors org profile id (org:<uuid>) when active', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'org:uuid-2' }))
    writeProfile(root, 'org:uuid-2', {
      user: { id: 'u2', name: 'Bob' },
      token: 'cat_bob',
      authenticated: true,
    })

    const creds = load()
    expect(creds.profileId).toBe('org:uuid-2')
    expect(creds.token).toBe('cat_bob')
  })

  test('migrates legacy credentials.json into a profile and switches active to it', () => {
    const root = setupDataDir()
    writeFileSync(
      join(root, 'credentials.json'),
      JSON.stringify({
        token: 'cli_token',
        portal: 'https://p',
        profileId: 'cli',
        user: { id: 'cli', name: 'CLI User', email: 'cli@x.test' },
      })
    )
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'desktop' }))
    writeProfile(root, 'desktop', { token: 'desktop_token', authenticated: true })

    const creds = load()
    expect(creds.token).toBe('cli_token')
    expect(creds.profileId).toBe('cli')

    // Migration materialized profiles/cli/auth.json and the registry now
    // points at it -- desktop will see the same profile next time it opens.
    const migratedPath = join(root, 'profiles', 'cli', 'auth.json')
    expect(existsSync(migratedPath)).toBe(true)
    const reg = JSON.parse(readFileSync(join(root, 'profiles.json'), 'utf-8'))
    expect(reg.active_profile).toBe('cli')
  })

  test('falls back when active profile is signed out (authenticated=false)', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'revoked' }))
    writeProfile(root, 'revoked', { token: 't', authenticated: false })
    expect(() => load()).toThrow(/not logged in/)
  })
})

describe('store', () => {
  test('writes profile auth.json and registers in profiles.json', () => {
    const root = setupDataDir()
    store({
      token: 'cat_new',
      portal: 'https://p',
      user: { id: 'u-new', name: 'New', email: 'n@x.test' },
    })

    const profilePath = join(root, 'profiles', 'u-new', 'auth.json')
    expect(existsSync(profilePath)).toBe(true)
    const data = JSON.parse(readFileSync(profilePath, 'utf-8'))
    expect(data.token).toBe('cat_new')
    expect(data.authenticated).toBe(true)
    expect(data.user.email).toBe('n@x.test')

    const reg = JSON.parse(readFileSync(join(root, 'profiles.json'), 'utf-8'))
    expect(reg.active_profile).toBe('u-new')
    expect(reg.profiles.find((p: { id: string }) => p.id === 'u-new')?.email).toBe('n@x.test')
  })

  test('preserves existing desktop-owned fields when CLI re-stores over a profile', () => {
    const root = setupDataDir()
    writeProfile(root, 'u-existing', {
      user: { id: 'u-existing', name: 'Old', email: 'o@x.test' },
      token: 'cat_old',
      oauth_token: 'cat_old',
      publisher: { name: 'pub', kind: 'user', api_key: 'csk_live_xyz' },
      authenticated: true,
    })
    store({
      token: 'cat_refreshed',
      portal: 'https://p',
      user: { id: 'u-existing', name: 'Old', email: 'o@x.test' },
    })
    const data = JSON.parse(readFileSync(join(root, 'profiles', 'u-existing', 'auth.json'), 'utf-8'))
    expect(data.token).toBe('cat_refreshed')
    expect(data.oauth_token).toBe('cat_old')     // preserved
    expect(data.publisher.api_key).toBe('csk_live_xyz') // preserved
  })
})

describe('clear', () => {
  test('marks active profile authenticated=false, leaves the file in place', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'u1' }))
    writeProfile(root, 'u1', { token: 't', authenticated: true, user: { id: 'u1' } })
    clear()
    const data = JSON.parse(readFileSync(join(root, 'profiles', 'u1', 'auth.json'), 'utf-8'))
    expect(data.authenticated).toBe(false)
    expect(data.token).toBe('t') // preserved -- desktop owns the token metadata
  })

  test('sweeps legacy credentials.json so old CLIs can\'t reuse it', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'credentials.json'), JSON.stringify({ token: 'old' }))
    clear()
    expect(existsSync(join(root, 'credentials.json'))).toBe(false)
  })
})
