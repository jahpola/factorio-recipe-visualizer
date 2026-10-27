import { expect, test } from 'vitest'
import type { Preset } from '../data/preset'
import { buildProductionChain } from './production'

function fixture(): Preset {
  const recipe = (id: string, ingredients: string[], products = [id]): Preset['recipes'][number] => ({
    id, displayName: id, categories: ['crafting'], hidden: false, enabledAtStart: true,
    ingredients: ingredients.map(material => ({ material: `item:${material}`, amount: 1 })),
    products: products.map(material => ({ material: `item:${material}`, amount: 1 })),
  })
  return {
    schemaVersion: 1, gameVersion: '2.1.23', language: 'en', mods: [], warnings: [],
    materials: ['iron-ore', 'copper-ore', 'iron-plate', 'copper-plate', 'copper-cable', 'electronic-circuit', 'byproduct'].map(name => ({
      id: `item:${name}`, name, displayName: name, type: 'item',
    })),
    recipes: [
      recipe('electronic-circuit', ['iron-plate', 'copper-cable']),
      recipe('iron-plate', ['iron-ore']),
      recipe('copper-plate', ['copper-ore']),
      recipe('copper-cable', ['copper-plate']),
    ],
    sources: ['iron-ore', 'copper-ore'].map(name => ({
      id: `resource:${name}`, kind: 'resource', products: [{ material: `item:${name}`, amount: 1 }],
    })),
  }
}

test('builds the exact complete green circuit chain with input-to-output edges', () => {
  const chain = buildProductionChain(fixture(), 'electronic-circuit')
  expect(chain.nodes).toHaveLength(10)
  expect(chain.edges.map(edge => `${edge.source}->${edge.target}`).sort()).toEqual([
    'recipe:electronic-circuit->item:electronic-circuit',
    'item:iron-plate->recipe:electronic-circuit',
    'item:copper-cable->recipe:electronic-circuit',
    'recipe:iron-plate->item:iron-plate',
    'item:iron-ore->recipe:iron-plate',
    'recipe:copper-cable->item:copper-cable',
    'item:copper-plate->recipe:copper-cable',
    'recipe:copper-plate->item:copper-plate',
    'item:copper-ore->recipe:copper-plate',
  ].sort())
  expect(chain.nodes.filter(node => node.kind === 'raw').map(node => node.id).sort()).toEqual(['item:copper-ore', 'item:iron-ore'])
  expect(chain.nodes.find(node => node.id === 'item:electronic-circuit')?.kind).toBe('output')
  expect(chain.warnings).toEqual([])
})

test('requires a producer choice and expands only the selected alternative', () => {
  const preset = fixture()
  preset.recipes.push({ ...preset.recipes[1], id: 'alternative-iron' })
  expect(buildProductionChain(preset, 'electronic-circuit').nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('choice')
  const chain = buildProductionChain(preset, 'electronic-circuit', { 'item:iron-plate': 'alternative-iron' })
  expect(chain.nodes.some(node => node.id === 'recipe:alternative-iron')).toBe(true)
  expect(chain.nodes.some(node => node.id === 'recipe:iron-plate')).toBe(false)
  expect(() => buildProductionChain(preset, 'electronic-circuit', { 'item:iron-plate': 'missing' })).toThrow('Invalid producer')
})

test('keeps missing producers unresolved, not raw resources', () => {
  const preset = fixture()
  preset.recipes = preset.recipes.filter(recipe => recipe.id !== 'iron-plate')
  const chain = buildProductionChain(preset, 'electronic-circuit')
  expect(chain.nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('unresolved')
  expect(chain.warnings[0]).toContain('No visible producer')
})

test('terminates cycles and preserves byproducts and shared nodes', () => {
  const preset = fixture()
  preset.recipes[1].ingredients = [{ material: 'item:electronic-circuit', amount: 1 }]
  preset.recipes[1].products.push({ material: 'item:byproduct', amount: 1 })
  const chain = buildProductionChain(preset, 'electronic-circuit')
  expect(chain.nodes.some(node => node.id === 'item:byproduct')).toBe(true)
  expect(new Set(chain.nodes.map(node => node.id)).size).toBe(chain.nodes.length)
  expect(chain.edges.some(edge => edge.source === 'item:electronic-circuit' && edge.target === 'recipe:iron-plate')).toBe(true)
})

test('rejects unknown roots', () => {
  expect(() => buildProductionChain(fixture(), 'missing')).toThrow('Unknown recipe')
})

test('preserves fluid dependencies and warns about unevaluated temperature constraints', () => {
  const preset = fixture()
  preset.materials.push({ id: 'fluid:water', name: 'water', type: 'fluid', displayName: 'Water' })
  preset.sources.push({ id: 'tile:water', kind: 'tile-fluid', products: [{ material: 'fluid:water', amount: 1 }] })
  preset.recipes[1].ingredients.push({ material: 'fluid:water', amount: 1, minimumTemperature: 50 })
  const chain = buildProductionChain(preset, 'electronic-circuit')
  expect(chain.nodes.find(node => node.id === 'fluid:water')?.kind).toBe('raw')
  expect(chain.edges.some(edge => edge.source === 'fluid:water' && edge.target === 'recipe:iron-plate')).toBe(true)
  expect(chain.warnings).toContain('Fluid temperature compatibility is not evaluated yet; this graph shows dependencies, not a validated production plan.')
})

test('does not silently select hidden or impossible producers', () => {
  const preset = fixture()
  preset.recipes[1].hidden = true
  preset.recipes.push({
    ...preset.recipes[1], id: 'impossible-iron', hidden: false,
    products: [{ material: 'item:iron-plate', amount: 1, probability: 0 }],
  })
  const chain = buildProductionChain(preset, 'electronic-circuit')
  expect(chain.nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('unresolved')
})
