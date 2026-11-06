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
  const preset = fixture()
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(preset.materials.map(material => material.id)))
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
  const chain = buildProductionChain(
    preset, 'electronic-circuit', { 'item:iron-plate': 'alternative-iron' }, new Set(['item:iron-plate']),
  )
  expect(chain.nodes.some(node => node.id === 'recipe:alternative-iron')).toBe(true)
  expect(chain.nodes.some(node => node.id === 'recipe:iron-plate')).toBe(false)
  expect(() => buildProductionChain(preset, 'electronic-circuit', { 'item:iron-plate': 'missing' })).toThrow('Invalid producer')
})

test('treats entity-gathered materials without producers as raw', () => {
  const preset = fixture()
  preset.materials.push({ id: 'item:wood', name: 'wood', displayName: 'Wood', type: 'item' })
  preset.recipes.push({ ...preset.recipes[0], id: 'small-pole', ingredients: [{ material: 'item:wood', amount: 1 }], products: [{ material: 'item:byproduct', amount: 1 }] })
  preset.sources.push({ id: 'tree:tree-01', kind: 'entity', products: [{ material: 'item:wood', amount: 4 }] })
  const chain = buildProductionChain(preset, 'small-pole', {}, new Set(['item:wood']))
  expect(chain.nodes.find(node => node.id === 'item:wood')?.kind).toBe('raw')
  expect(chain.warnings).toEqual([])
})

test('keeps recipe producers for materials that entities also yield', () => {
  const preset = fixture()
  preset.sources.push({ id: 'simple-entity:rock', kind: 'entity', products: [{ material: 'item:iron-plate', amount: 1 }] })
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(['item:iron-plate']))
  expect(chain.nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('material')
  expect(chain.nodes.some(node => node.id === 'recipe:iron-plate')).toBe(true)
})

test('keeps missing producers unresolved, not raw resources', () => {
  const preset = fixture()
  preset.recipes = preset.recipes.filter(recipe => recipe.id !== 'iron-plate')
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(['item:iron-plate']))
  expect(chain.nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('unresolved')
  expect(chain.warnings[0]).toContain('No visible producer')
})

test('terminates cycles and preserves byproducts and shared nodes', () => {
  const preset = fixture()
  preset.recipes[1].ingredients = [{ material: 'item:electronic-circuit', amount: 1 }]
  preset.recipes[1].products.push({ material: 'item:byproduct', amount: 1 })
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(preset.materials.map(material => material.id)))
  expect(chain.nodes.some(node => node.id === 'item:byproduct')).toBe(true)
  expect(chain.nodes.find(node => node.id === 'item:byproduct')?.kind).toBe('byproduct')
  expect(new Set(chain.nodes.map(node => node.id)).size).toBe(chain.nodes.length)
  expect(chain.edges.some(edge => edge.source === 'item:electronic-circuit' && edge.target === 'recipe:iron-plate')).toBe(true)
  expect(chain.warnings).toContain('A production cycle is present. The loop is shown, but its production balance is not evaluated.')
})

test('expands branches progressively and retains each expanded dependency', () => {
  const preset = fixture()
  const initial = buildProductionChain(preset, 'electronic-circuit')

  expect(initial.nodes.find(node => node.id === 'item:iron-plate')?.kind).toBe('collapsed')
  expect(initial.nodes.some(node => node.id === 'recipe:iron-plate')).toBe(false)
  expect(initial.nodes).toHaveLength(4)
  expect(initial.branches).toContainEqual({ material: 'item:iron-plate', label: 'iron-plate' })

  const expanded = buildProductionChain(preset, 'electronic-circuit', {}, new Set(['item:iron-plate']))
  expect(expanded.nodes.some(node => node.id === 'recipe:iron-plate')).toBe(true)
  expect(expanded.nodes.find(node => node.id === 'item:iron-ore')?.kind).toBe('raw')
  expect(expanded.nodes.find(node => node.id === 'item:copper-cable')?.kind).toBe('collapsed')
})

test('handles a deep cyclic chain without recursive traversal', () => {
  const preset = fixture()
  const depth = 1200
  for (let index = 0; index < depth; index++) {
    const material = `item:chain-${index}`
    preset.materials.push({ id: material, name: material, type: 'item', displayName: material })
    preset.recipes.push({
      id: `chain-${index}`, displayName: `Chain ${index}`, categories: ['crafting'],
      hidden: false, enabledAtStart: true,
      ingredients: [{ material: index === 0 ? `item:chain-${depth - 1}` : `item:chain-${index - 1}`, amount: 1 }],
      products: [{ material, amount: 1 }],
    })
  }
  const chain = buildProductionChain(
    preset, `chain-${depth - 1}`, {}, new Set(preset.materials.map(material => material.id)),
  )

  expect(chain.nodes).toHaveLength(depth * 2)
  expect(chain.warnings).toContain('A production cycle is present. The loop is shown, but its production balance is not evaluated.')
})

test('rejects unknown roots', () => {
  expect(() => buildProductionChain(fixture(), 'missing')).toThrow('Unknown recipe')
})

test('uses recipe icons for recipe nodes and material icons for material nodes', () => {
  const preset = fixture()
  preset.recipes[0].icon = 'recipe-icon'
  preset.materials.find(material => material.id === 'item:electronic-circuit')!.icon = 'material-icon'
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(['item:iron-plate']))
  expect(chain.nodes.find(node => node.id === 'recipe:electronic-circuit')?.icon).toBe('recipe-icon')
  expect(chain.nodes.find(node => node.id === 'item:electronic-circuit')?.icon).toBe('material-icon')
})

test('preserves fluid dependencies and warns about unevaluated temperature constraints', () => {
  const preset = fixture()
  preset.materials.push({ id: 'fluid:water', name: 'water', type: 'fluid', displayName: 'Water' })
  preset.sources.push({ id: 'tile:water', kind: 'tile-fluid', products: [{ material: 'fluid:water', amount: 1 }] })
  preset.sources[0].requiredFluid = 'fluid:water'
  preset.recipes[1].ingredients.push({ material: 'fluid:water', amount: 1, minimumTemperature: 50 })
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, new Set(['item:iron-plate']))
  expect(chain.nodes.find(node => node.id === 'fluid:water')?.kind).toBe('raw')
  expect(chain.edges.some(edge => edge.source === 'fluid:water' && edge.target === 'recipe:iron-plate')).toBe(true)
  expect(chain.warnings).toContain('Fluid temperature compatibility is not evaluated yet; this graph shows dependencies, not a validated production plan.')
  expect(chain.warnings).toContain('Mining iron-ore may require Water; mining-fluid dependencies are not expanded.')
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
