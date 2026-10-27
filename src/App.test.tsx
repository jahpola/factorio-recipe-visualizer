// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { ProductionChain } from './graph/production'

vi.mock('./graph/ProductionGraph', () => ({
  ProductionGraph: ({ chain }: { chain: ProductionChain }) => (
    <div aria-label="Production chain">{chain.nodes.map(node => <span key={node.id}>{node.label}</span>)}</div>
  ),
}))
afterEach(cleanup)

const preset = {
  schemaVersion: 1, gameVersion: '2.1.23', language: 'en', mods: [{ name: 'base', version: '2.1.23' }],
  materials: [
    { id: 'item:ore', name: 'ore', type: 'item', displayName: 'Ore' },
    { id: 'item:plate', name: 'plate', type: 'item', displayName: 'Plate' },
  ],
  recipes: [{
    id: 'plate', displayName: 'Smelt plate', categories: ['smelting'], hidden: false, enabledAtStart: true,
    ingredients: [{ material: 'item:ore', amount: 1 }], products: [{ material: 'item:plate', amount: 1 }],
  }],
  sources: [{ id: 'resource:ore', kind: 'resource', products: [{ material: 'item:ore', amount: 1 }] }],
  warnings: [],
}
function upload(text: string) {
  const file = new File([text], 'preset.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => text })
  fireEvent.change(screen.getByLabelText('Import preset (.json)'), { target: { files: [file] } })
}

test('shows local export instructions before import', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Factorio Recipe Visualizer' })).toBeDefined()
  expect(screen.getByText('Start with your game recipes')).toBeDefined()
})

test('imports, searches and selects a recipe to build its chain', async () => {
  render(<App />)
  upload(JSON.stringify(preset))
  const search = await screen.findByRole('searchbox', { name: 'Search recipes' })
  fireEvent.change(search, { target: { value: 'absent' } })
  expect(screen.getByText('No matching recipes.')).toBeDefined()
  fireEvent.change(search, { target: { value: 'plate' } })
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))
  expect(screen.getByLabelText('Production chain').textContent).toContain('Ore')
  expect(screen.getByLabelText('Recipe details').textContent).toContain('Ingredients: Ore')
})

test('reports invalid imports without discarding the active preset', async () => {
  render(<App />)
  upload(JSON.stringify(preset))
  await screen.findByRole('searchbox')
  upload('{')
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Preset import failed'))
  expect(screen.getByRole('searchbox')).toBeDefined()
})
