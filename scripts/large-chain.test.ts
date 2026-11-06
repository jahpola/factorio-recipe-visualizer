import { expect, test } from 'vitest'
import type { Preset } from '../src/data/preset.ts'
import { expandFully, largestChain } from './large-chain.ts'

function preset(): Preset {
  const recipe = (id: string, ingredients: string[], product: string): Preset['recipes'][number] => ({
    id, displayName: id, categories: ['crafting'], hidden: false, enabledAtStart: true,
    ingredients: ingredients.map(material => ({ material: `item:${material}`, amount: 1 })),
    products: [{ material: `item:${product}`, amount: 1 }],
  })
  return {
    schemaVersion: 1, gameVersion: '2.1.23', language: 'en', mods: [], warnings: [],
    materials: ['ore', 'plate', 'gear', 'machine'].map(name => ({ id: `item:${name}`, name, displayName: name, type: 'item' })),
    recipes: [
      recipe('machine', ['gear', 'plate'], 'machine'),
      recipe('gear', ['plate'], 'gear'),
      recipe('plate', ['ore'], 'plate'),
      recipe('plate-alternative', ['gear'], 'plate'),
    ],
    sources: [{ id: 'resource:ore', kind: 'resource', products: [{ material: 'item:ore', amount: 1 }] }],
  }
}

test('expands every branch, choosing the first listed producer, until stable', () => {
  const result = expandFully(preset(), 'machine')
  expect(result.selections).toEqual({ 'item:plate': 'plate' })
  expect(result.chain.nodes.some(node => node.id === 'recipe:plate')).toBe(true)
  expect(result.chain.nodes.some(node => node.id === 'recipe:plate-alternative')).toBe(false)
  expect(result.chain.nodes.filter(node => ['choice', 'collapsed'].includes(node.kind))).toEqual([])
  expect(result.rounds).toBeGreaterThan(0)
})

test('picks the visible recipe with the largest fully expanded chain', () => {
  expect(largestChain(preset()).recipe).toBe('machine')
})
