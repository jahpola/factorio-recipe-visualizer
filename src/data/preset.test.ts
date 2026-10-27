import { describe, expect, test } from 'vitest'
import { parsePreset, presetSchema } from './preset'
import type { Preset } from './preset'

function fixture(): Preset {
  return {
    schemaVersion: 1,
    gameVersion: '2.1.23',
    language: 'en',
    mods: [{ name: 'base', version: '2.1.23' }],
    materials: [
      { id: 'item:ore', type: 'item', name: 'ore', displayName: 'Ore' },
      { id: 'fluid:water', type: 'fluid', name: 'water', displayName: 'Water' },
    ],
    recipes: [],
    sources: [{
      id: 'resource:ore',
      kind: 'resource',
      products: [{ material: 'item:ore', amount: 1 }],
    }],
    warnings: [],
  }
}

describe('preset source validation', () => {
  test('rejects empty source IDs at the ID field', () => {
    const preset = fixture()
    preset.sources[0].id = ''

    const result = presetSchema.safeParse(preset)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['sources', 0, 'id'],
      }))
    }
  })

  test('rejects duplicate source IDs at the duplicate ID field', () => {
    const preset = fixture()
    preset.sources.push({ ...preset.sources[0] })

    const result = presetSchema.safeParse(preset)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['sources', 1, 'id'],
        message: 'Duplicate source ID',
      }))
    }
  })

  test('accepts distinct IDs even when sources produce the same material', () => {
    const preset = fixture()
    preset.sources.push({ ...preset.sources[0], id: 'resource:another-ore' })

    expect(parsePreset(preset).sources).toHaveLength(2)
  })

  test('rejects an existing item as requiredFluid', () => {
    const preset = fixture()
    preset.sources[0].requiredFluid = 'item:ore'

    const result = presetSchema.safeParse(preset)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['sources', 0, 'requiredFluid'],
        message: 'Expected a fluid identifier (fluid:<name>)',
      }))
    }
  })

  test('rejects an unknown fluid reference', () => {
    const preset = fixture()
    preset.sources[0].requiredFluid = 'fluid:missing'

    expect(() => parsePreset(preset)).toThrow('Unknown material fluid:missing')
  })

  test('accepts an existing required fluid', () => {
    const preset = fixture()
    preset.sources[0].requiredFluid = 'fluid:water'

    expect(parsePreset(preset).sources[0].requiredFluid).toBe('fluid:water')
  })

  test('accepts sources without a required fluid', () => {
    expect(parsePreset(fixture()).sources[0].requiredFluid).toBeUndefined()
  })
})
