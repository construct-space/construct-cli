import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { getEntryWatchPaths } from './dev.js'

describe('getEntryWatchPaths', () => {
  test('watches manifest and actions source', () => {
    const root = '/tmp/canvas-space'

    expect(getEntryWatchPaths(root)).toEqual([
      join(root, 'space.manifest.json'),
      join(root, 'src', 'actions.ts'),
    ])
  })
})
