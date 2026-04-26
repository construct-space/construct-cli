import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { listDesktopProfiles, load } from './auth.js'

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

  test('credentials.json wins over profile fallback when both exist', () => {
    const root = setupDataDir()
    writeFileSync(
      join(root, 'credentials.json'),
      JSON.stringify({ token: 'cli_token', portal: 'https://p', profileId: 'cli' })
    )
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'desktop' }))
    writeProfile(root, 'desktop', { token: 'desktop_token', authenticated: true })

    const creds = load()
    expect(creds.token).toBe('cli_token')
    expect(creds.profileId).toBe('cli')
  })

  test('falls back when active profile is signed out (authenticated=false)', () => {
    const root = setupDataDir()
    writeFileSync(join(root, 'profiles.json'), JSON.stringify({ active_profile: 'revoked' }))
    writeProfile(root, 'revoked', { token: 't', authenticated: false })
    expect(() => load()).toThrow(/not logged in/)
  })
})
