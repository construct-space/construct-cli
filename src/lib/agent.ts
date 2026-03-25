import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

const AGENT_KEY = 'construct-agent-obfuscate-v1'

interface BundledAgent {
  config: string
  tools: Record<string, string>
  skills: Record<string, string>
  hooks: Record<string, string>
}

function encode(content: string): string {
  const key = Buffer.from(AGENT_KEY)
  const data = Buffer.from(content)
  const xored = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    xored[i] = data[i]! ^ key[i % key.length]!
  }
  return xored.toString('base64')
}

function readMdFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!existsSync(dir)) return result
  for (const f of readdirSync(dir)) {
    if (extname(f) !== '.md') continue
    result[basename(f, '.md')] = readFileSync(join(dir, f), 'utf-8')
  }
  return result
}

function readJsonFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!existsSync(dir)) return result
  for (const f of readdirSync(dir)) {
    if (extname(f) !== '.json') continue
    result[basename(f, '.json')] = readFileSync(join(dir, f), 'utf-8')
  }
  return result
}

export function bundleAgentDir(srcDir: string, distDir: string): void {
  const bundle: BundledAgent = {
    config: '',
    tools: readMdFiles(join(srcDir, 'tools')),
    skills: readMdFiles(join(srcDir, 'skills')),
    hooks: readJsonFiles(join(srcDir, 'hooks')),
  }

  // Read config (config.md or agent.md)
  for (const name of ['config.md', 'agent.md']) {
    const path = join(srcDir, name)
    if (existsSync(path)) {
      bundle.config = readFileSync(path, 'utf-8')
      break
    }
  }

  if (!bundle.config) return

  const encoded = encode(JSON.stringify(bundle))
  writeFileSync(join(distDir, 'config.agent'), encoded)
}
