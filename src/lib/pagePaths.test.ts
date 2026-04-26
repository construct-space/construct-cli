import { describe, expect, test } from 'bun:test'
import { pageComponentFromPath } from './pagePaths'

describe('pageComponentFromPath', () => {
  test('normalizes colon params to bracket-route component paths', () => {
    expect(pageComponentFromPath('employee/:id')).toBe('pages/employee/[id].vue')
    expect(pageComponentFromPath('companies/:companyId/employees/:id')).toBe('pages/companies/[companyId]/employees/[id].vue')
  })

  test('preserves existing bracket-route paths', () => {
    expect(pageComponentFromPath('employee/[id]')).toBe('pages/employee/[id].vue')
  })
})
