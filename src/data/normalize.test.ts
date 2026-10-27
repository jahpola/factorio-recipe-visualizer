import { describe, expect, test } from 'vitest'
import { normalizeDump } from './normalize'
import { parsePreset } from './preset'

function fixture() {
  return {
    item: {
      ore: { type: 'item', name: 'ore', stack_size: 50 },
      plate: { type: 'item', name: 'plate', stack_size: 100 },
    },
    fluid: { water: { type: 'fluid', name: 'water' } },
    recipe: {
      plate: {
        type: 'recipe', name: 'plate', categories: ['smelting'], enabled: false,
        ingredients: [{ type: 'item', name: 'ore', amount: 1 }],
        results: [{ type: 'item', name: 'plate', amount_min: 1, amount_max: 2, probability: 0.5 }],
      },
    },
    resource: { ore: { type: 'resource', name: 'ore', minable: { result: 'ore' } } },
    tile: { lake: { type: 'tile', name: 'lake', fluid: 'water' } },
  }
}
const metadata = { gameVersion: '2.1.23', language: 'en', mods: [{ name: 'base', version: '2.1.23' }] }
const locales = { items: { names: { plate: 'Metal plate' } }, fluids: { names: {} }, recipes: { names: { plate: 'Smelt plate' } } }

describe('Factorio 2.1 normalization', () => {
  test('preserves localization, quantities, categories, probability and sources', () => {
    const preset = normalizeDump(fixture(), metadata, locales)
    expect(preset.materials.find(material => material.id === 'item:plate')?.displayName).toBe('Metal plate')
    expect(preset.recipes[0]).toMatchObject({
      displayName: 'Smelt plate', categories: ['smelting'], enabledAtStart: false,
      products: [{ material: 'item:plate', amountMin: 1, amountMax: 2, probability: 0.5 }],
    })
    expect(preset.sources.map(source => source.products[0].material)).toEqual(['item:ore', 'fluid:water'])
  })

  test('accepts empty Lua tables and preserves fluid temperature constraints', () => {
    const raw = fixture()
    const expanded = {
      ...raw,
      recipe: {
        ...raw.recipe,
        water: {
          type: 'recipe', name: 'water', ingredients: {},
          results: [{ type: 'fluid', name: 'water', amount: 1, temperature: 100 }],
        },
        heated: {
          type: 'recipe', name: 'heated',
          ingredients: [{ type: 'fluid', name: 'water', amount: 1, minimum_temperature: 50, maximum_temperature: 100 }],
          results: [{ type: 'item', name: 'plate', amount: 1 }],
        },
      },
    }
    const preset = normalizeDump(expanded, metadata, locales)
    expect(preset.recipes.find(recipe => recipe.id === 'water')?.ingredients).toEqual([])
    expect(preset.recipes.find(recipe => recipe.id === 'water')?.products[0].temperature).toBe(100)
    expect(preset.recipes.find(recipe => recipe.id === 'heated')?.ingredients[0]).toMatchObject({
      minimumTemperature: 50, maximumTemperature: 100,
    })
  })

  test('reports missing material references', () => {
    const raw = fixture()
    raw.recipe.plate.ingredients[0].name = 'missing'
    expect(() => normalizeDump(raw, metadata, locales)).toThrow('Unknown material item:missing')
  })

  test('rejects malformed quantities and unsupported versions', () => {
    const raw = fixture()
    raw.recipe.plate.ingredients[0].amount = -1
    expect(() => normalizeDump(raw, metadata, locales)).toThrow()
    expect(() => normalizeDump(fixture(), { ...metadata, gameVersion: '1.1.0' }, locales)).toThrow('Unsupported Factorio version')
  })

  test('rejects duplicate materials and invalid schema versions', () => {
    const preset = normalizeDump(fixture(), metadata, locales)
    expect(() => parsePreset({ ...preset, materials: [...preset.materials, preset.materials[0]] })).toThrow('duplicate material ID')
    expect(() => parsePreset({ ...preset, schemaVersion: 2 })).toThrow()
  })
})
