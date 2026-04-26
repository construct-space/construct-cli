import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractActionMetadata } from './build'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('extractActionMetadata', () => {
  test('ignores commented actions and does not promote params to actions', () => {
    const root = mkdtempSync(join(tmpdir(), 'construct-actions-'))
    tempDirs.push(root)
    const actionsPath = join(root, 'actions.ts')
    writeFileSync(actionsPath, `
      /*
      export const actions = {
        staleAction: {
          description: 'This sample should not be extracted',
          params: { status: { type: 'string', description: 'Not real' } },
          run: async () => null,
        },
      }
      */

      export const actions = {
        listTickets: {
          description: 'List tickets',
          params: {
            status: { type: 'string', description: 'Ticket status', required: false },
            priority: { type: 'string', description: 'Ticket priority' },
            due_date: { type: 'string' },
          },
          run: async ({ status, priority, due_date }) => ({ status, priority, due_date }),
        },
      }
    `)

    const metadata = extractActionMetadata(actionsPath)

    expect(Object.keys(metadata || {})).toEqual(['listTickets'])
    expect(metadata?.listTickets.params).toEqual({
      status: { type: 'string', description: 'Ticket status' },
      priority: { type: 'string', description: 'Ticket priority' },
      due_date: { type: 'string' },
    })
  })
})
