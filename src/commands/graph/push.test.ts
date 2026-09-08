import { describe, expect, test } from 'bun:test'
import { parseModelFile } from './push'

describe('graph push model parser', () => {
  test('parses single-quoted string defaults without keeping quote characters', () => {
    const model = parseModelFile(`
      import { defineModel, field } from '@construct-space/graph'

      export const Invoice = defineModel('invoice', {
        currency: field.string().default('USD').required(),
        status: field.string().default("draft"),
        paid: field.boolean().default(true),
        attempts: field.int().default(3),
      })
    `)

    expect(model?.fields).toContainEqual({
      name: 'currency',
      type: 'string',
      default: 'USD',
      required: true,
    })
    expect(model?.fields).toContainEqual({
      name: 'status',
      type: 'string',
      default: 'draft',
    })
    expect(model?.fields).toContainEqual({
      name: 'paid',
      type: 'boolean',
      default: true,
    })
    expect(model?.fields).toContainEqual({
      name: 'attempts',
      type: 'int',
      default: 3,
    })
  })

  test('parses the canonical scopes array form', () => {
    const model = parseModelFile(`
      import { defineModel, field, access } from '@construct-space/graph'

      export const Message = defineModel('message', {
        subject: field.string(),
      }, {
        access: { read: access.authenticated(), delete: access.owner() },
        scopes: ['org'],
      })
    `)

    expect(model?.options?.scopes).toEqual(['org'])
    expect(model?.options?.scope).toBeUndefined()
    expect(model?.options?.access).toEqual({ read: 'authenticated', delete: 'owner' })
  })

  test('parses both app and org from a scopes array', () => {
    const model = parseModelFile(`
      export const Note = defineModel('note', {
        body: field.string(),
      }, { scopes: ['app', 'org'] })
    `)

    expect(model?.options?.scopes).toEqual(['app', 'org'])
  })

  test('falls back to the legacy singular scope field', () => {
    const model = parseModelFile(`
      export const Legacy = defineModel('legacy', {
        body: field.string(),
      }, { scope: 'org' })
    `)

    expect(model?.options?.scope).toEqual('org')
    expect(model?.options?.scopes).toBeUndefined()
  })
})
