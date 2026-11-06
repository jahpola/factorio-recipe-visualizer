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

  test('records minable trees, rocks, and fish as entity sources', () => {
    const raw = {
      ...fixture(),
      item: {
        ...fixture().item,
        wood: { type: 'item', name: 'wood', stack_size: 100 },
        stone: { type: 'item', name: 'stone', stack_size: 50 },
        coal: { type: 'item', name: 'coal', stack_size: 50 },
      },
      tree: { 'tree-01': { type: 'tree', name: 'tree-01', minable: { result: 'wood', count: 4 } } },
      'simple-entity': {
        'huge-rock': {
          type: 'simple-entity', name: 'huge-rock',
          minable: { results: [{ type: 'item', name: 'stone', amount_min: 24, amount_max: 50 }, { type: 'item', name: 'coal', amount: 1 }] },
        },
        decoration: { type: 'simple-entity', name: 'decoration' },
        'empty-rock': { type: 'simple-entity', name: 'empty-rock', minable: { results: {} } },
      },
    }
    const sources = normalizeDump(raw, metadata, locales).sources.filter(source => source.kind === 'entity')
    expect(sources).toEqual([
      { id: 'tree:tree-01', kind: 'entity', products: [{ material: 'item:wood', amount: 4 }] },
      expect.objectContaining({
        id: 'simple-entity:huge-rock',
        products: [
          expect.objectContaining({ material: 'item:stone', amountMin: 24, amountMax: 50 }),
          expect.objectContaining({ material: 'item:coal', amount: 1 }),
        ],
      }),
    ])
  })

  test('rejects entity sources that yield unknown materials', () => {
    const raw = { ...fixture(), tree: { 'tree-01': { type: 'tree', name: 'tree-01', minable: { result: 'wood' } } } }
    expect(() => normalizeDump(raw, metadata, locales)).toThrow('Unknown material item:wood')
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
