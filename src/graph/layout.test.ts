import { expect, test } from 'vitest'
import { NODE_HEIGHT, NODE_WIDTH, nodePositions, toElkGraph } from './layout'
import type { ProductionChain } from './production'

const chain: ProductionChain = {
  nodes: [
    { id: 'item:ore', label: 'Ore', kind: 'raw' },
    { id: 'recipe:plate', label: 'Plate', kind: 'recipe' },
    { id: 'item:plate', label: 'Plate', kind: 'output' },
  ],
  edges: [
    { id: 'a', source: 'item:ore', target: 'recipe:plate' },
    { id: 'b', source: 'recipe:plate', target: 'item:plate' },
  ],
  choices: [], branches: [], warnings: [],
}

test('builds a left-to-right layered ELK graph with fixed node sizes', () => {
  const graph = toElkGraph(chain)
  expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered')
  expect(graph.layoutOptions?.['elk.direction']).toBe('RIGHT')
  expect(graph.children).toEqual(chain.nodes.map(node => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })))
  expect(graph.edges).toEqual([
    { id: 'a', sources: ['item:ore'], targets: ['recipe:plate'] },
    { id: 'b', sources: ['recipe:plate'], targets: ['item:plate'] },
  ])
})

test('maps laid-out positions and defaults missing coordinates to zero', () => {
  const positions = nodePositions(chain, {
    id: 'production',
    children: [{ id: 'item:ore', x: 0, y: 10 }, { id: 'recipe:plate', x: 290, y: 10 }, { id: 'item:plate' }],
  })
  expect(Object.fromEntries(positions)).toEqual({
    'item:ore': { x: 0, y: 10 }, 'recipe:plate': { x: 290, y: 10 }, 'item:plate': { x: 0, y: 0 },
  })
})

test('rejects a layout result that omits chain nodes', () => {
  expect(() => nodePositions(chain, { id: 'production', children: [{ id: 'item:ore', x: 0, y: 0 }] }))
    .toThrow('Layout result is missing 2 node(s): recipe:plate, item:plate')
})
