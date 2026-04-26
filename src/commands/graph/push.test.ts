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
    `, 'Invoice')

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
})
