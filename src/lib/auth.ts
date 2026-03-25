import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { dataDir } from './appdir.js'

const CREDENTIALS_FILE = 'credentials.json'
export const DEFAULT_PORTAL = 'https://developer.construct.space'

export interface User {
  id: string
  name: string
  email: string
}

export interface Credentials {
  token: string
  portal: string
  user?: User
}

function credentialsPath(): string {
  return join(dataDir(), CREDENTIALS_FILE)
}

export function store(creds: Credentials): void {
  const path = credentialsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 })
}

export function load(): Credentials {
  const path = credentialsPath()
  if (!existsSync(path)) {
    throw new Error("not logged in — run 'construct login' first")
  }
  const data = JSON.parse(readFileSync(path, 'utf-8')) as Credentials
  if (!data.token) {
    throw new Error("not logged in — run 'construct login' first")
  }
  return data
}

export function isAuthenticated(): boolean {
  try {
    load()
    return true
  } catch {
    return false
  }
}

export function clear(): void {
  const path = credentialsPath()
  if (existsSync(path)) unlinkSync(path)
}

export function getPortalURL(): string {
  try {
    const creds = load()
    return creds.portal || DEFAULT_PORTAL
  } catch {
    return DEFAULT_PORTAL
  }
}
