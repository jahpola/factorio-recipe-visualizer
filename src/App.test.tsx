// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { ProductionChain } from './graph/production'
import type { Preset } from './data/preset'
import * as storage from './data/preset-storage'

vi.mock('./graph/ProductionGraph', () => ({
  ProductionGraph: ({ chain }: { chain: ProductionChain }) => (
    <div aria-label="Production chain">{chain.nodes.map(node => <span key={node.id}>{node.label}</span>)}</div>
  ),
}))
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await storage.forgetSavedPreset()
  vi.unstubAllGlobals()
})

const preset: Preset = {
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

async function waitForSaved() {
  await waitFor(() => expect(screen.getByText(/Remembered on this browser/)).toBeDefined())
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

test('provides branch collapse and expand controls for produced ingredients', async () => {
  const branchedPreset = structuredClone(preset)
  branchedPreset.materials.push({ id: 'item:concentrate', name: 'concentrate', type: 'item', displayName: 'Concentrate' })
  branchedPreset.recipes.push({
    id: 'concentrate', displayName: 'Make concentrate', categories: ['crafting'], hidden: false, enabledAtStart: true,
    ingredients: [{ material: 'item:ore', amount: 1 }], products: [{ material: 'item:concentrate', amount: 1 }],
  })
  branchedPreset.recipes[0].ingredients.push({ material: 'item:concentrate', amount: 1 })
  render(<App />)
  upload(JSON.stringify(branchedPreset))
  await screen.findByRole('searchbox', { name: 'Search recipes' })
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))

  expect(screen.getByRole('button', { name: 'Expand Concentrate branch' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Concentrate branch' }))
  expect(screen.getByLabelText('Production chain').textContent).toContain('Make concentrate')
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Concentrate branch' }))
  expect(screen.getByRole('button', { name: 'Expand Concentrate branch' })).toBeDefined()
  expect(screen.getByLabelText('Production chain').textContent).not.toContain('Make concentrate')
})

test('requires a producer choice before expanding an alternative branch', async () => {
  const branchedPreset = structuredClone(preset)
  branchedPreset.materials.push({ id: 'item:concentrate', name: 'concentrate', type: 'item', displayName: 'Concentrate' })
  branchedPreset.recipes[0].ingredients.push({ material: 'item:concentrate', amount: 1 })
  branchedPreset.recipes.push(
    {
      id: 'concentrate', displayName: 'Make concentrate', categories: ['crafting'], hidden: false, enabledAtStart: true,
      ingredients: [{ material: 'item:ore', amount: 1 }], products: [{ material: 'item:concentrate', amount: 1 }],
    },
    {
      id: 'concentrate-alt', displayName: 'Alternate concentrate', categories: ['crafting'], hidden: false, enabledAtStart: true,
      ingredients: [{ material: 'item:ore', amount: 1 }], products: [{ material: 'item:concentrate', amount: 1 }],
    },
  )
  render(<App />)
  upload(JSON.stringify(branchedPreset))
  await screen.findByRole('searchbox', { name: 'Search recipes' })
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))

  const expand = screen.getByRole('button', { name: 'Expand Concentrate branch' }) as HTMLButtonElement
  expect(expand.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Producer for Concentrate'), { target: { value: 'concentrate-alt' } })
  expect(screen.getByLabelText('Production chain').textContent).toContain('Alternate concentrate')
  expect(screen.getByLabelText('Production chain').textContent).not.toContain('Make concentrate')
})

test('identifies variable and probabilistic outputs without presenting production ratios', async () => {
  const probabilisticPreset: Preset = structuredClone(preset)
  probabilisticPreset.recipes[0].products[0] = {
    material: 'item:plate', amountMin: 1, amountMax: 2, probability: 0.5,
  }
  render(<App />)
  upload(JSON.stringify(probabilisticPreset))
  await screen.findByRole('searchbox', { name: 'Search recipes' })
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))

  expect(screen.getByLabelText('Recipe details').textContent).toContain('Plate (variable output, probabilistic output)')
})

test('shows macOS hidden-folder guidance and imports a dropped file', async () => {
  render(<App />)
  expect(screen.getByText('Cmd+Shift+.')).toBeDefined()
  expect(screen.getByText('Cmd+Shift+G')).toBeDefined()
  const text = JSON.stringify(preset)
  const file = new File([text], 'dropped.json')
  Object.defineProperty(file, 'text', { value: async () => text })
  fireEvent.drop(screen.getByLabelText('Preset import'), { dataTransfer: { types: ['Files'], files: [file] } })
  await waitForSaved()
  expect((await storage.readSavedPreset())?.filename).toBe('dropped.json')
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))
  expect(screen.getByLabelText('Production chain').textContent).toContain('Ore')
})

test('rejects multiple-file drops and ignores non-file drags', async () => {
  render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  fireEvent.drop(screen.getByLabelText('Preset import'), { dataTransfer: { types: ['Files'], files: [new File([], 'a.json'), new File([], 'b.json')] } })
  expect(screen.getByRole('alert').textContent).toContain('Drop exactly one')
  expect(screen.getByRole('searchbox')).toBeDefined()
  expect((await storage.readSavedPreset())?.preset).toEqual(preset)
  fireEvent.drop(screen.getByLabelText('Preset import'), { dataTransfer: { types: ['text/plain'], files: [] } })
  expect(screen.getByRole('alert').textContent).toContain('Drop exactly one')
})

test('restores the dataset after remount, but not recipe selection or search', async () => {
  const first = render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plate' } })
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))
  first.unmount()
  render(<App />)
  await waitForSaved()
  expect(screen.getByRole('heading', { name: 'Select a recipe' })).toBeDefined()
  expect(screen.getByRole('searchbox').getAttribute('value')).toBe('')
  expect(screen.queryByLabelText('Production chain')).toBeNull()
})

test('invalid imports retain the remembered dataset; valid imports replace it', async () => {
  render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  upload('{')
  await screen.findByRole('alert')
  expect((await storage.readSavedPreset())?.preset).toEqual(preset)
  upload(JSON.stringify({ ...preset, language: 'fi' }))
  await waitForSaved()
  expect((await storage.readSavedPreset())?.preset.language).toBe('fi')
})

test('forgetting deletes only the saved copy and does not resave the active dataset', async () => {
  const first = render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Forget saved preset' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Forget saved preset' })).toBeNull())
  expect(screen.getByLabelText('Production chain').textContent).toContain('Ore')
  expect(await storage.readSavedPreset()).toBeUndefined()
  first.unmount()
  render(<App />)
  await waitFor(() => expect(screen.queryByText('Restoring saved preset...')).toBeNull())
  expect(screen.getByText('Start with your game recipes')).toBeDefined()
  expect(screen.queryByRole('searchbox')).toBeNull()
})

test('storage write failure leaves a valid import usable and the previous saved copy intact', async () => {
  await storage.savePreset({ filename: 'previous.json', preset })
  vi.spyOn(storage, 'savePreset').mockRejectedValue(new Error('Storage full'))
  render(<App />)
  upload(JSON.stringify({ ...preset, language: 'fi' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Storage full'))
  expect(screen.getByRole('searchbox')).toBeDefined()
  expect(screen.getByText(/Not remembered on this browser/)).toBeDefined()
  expect((await storage.readSavedPreset())?.filename).toBe('previous.json')
})

test('restore and delete failures are explicit and manual import remains available', async () => {
  vi.spyOn(storage, 'readSavedPreset').mockRejectedValue(new Error('Corrupt saved data'))
  vi.spyOn(storage, 'forgetSavedPreset').mockRejectedValue(new Error('Delete blocked'))
  render(<App />)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Corrupt saved data'))
  fireEvent.click(screen.getByRole('button', { name: 'Forget saved preset' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Delete blocked'))
  upload(JSON.stringify(preset))
  await waitForSaved()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a delayed restore cannot replace a manual import', async () => {
  const restore = deferred<storage.SavedPreset | undefined>()
  vi.spyOn(storage, 'readSavedPreset').mockReturnValueOnce(restore.promise)
  render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  await act(async () => { restore.resolve({ filename: 'old.json', preset: { ...preset, language: 'fi' } }) })
  expect(screen.queryByText(/old.json/)).toBeNull()
  expect(screen.getByText(/preset.json \/ Remembered/)).toBeDefined()
})

test('a delayed file read cannot overwrite a newer import', async () => {
  const read = deferred<string>()
  render(<App />)
  const file = new File([], 'old.json')
  Object.defineProperty(file, 'text', { value: () => read.promise })
  fireEvent.change(screen.getByLabelText('Import preset (.json)'), { target: { files: [file] } })
  upload(JSON.stringify({ ...preset, language: 'fi' }))
  await waitForSaved()
  await act(async () => { read.resolve(JSON.stringify(preset)) })
  expect((await storage.readSavedPreset())?.preset.language).toBe('fi')
})

test('a save completing during an invalid newer import still updates the active saved status', async () => {
  const save = deferred<void>()
  const read = deferred<string>()
  vi.spyOn(storage, 'savePreset').mockReturnValueOnce(save.promise)
  render(<App />)
  upload(JSON.stringify(preset))
  await screen.findByRole('searchbox')
  const file = new File([], 'invalid.json')
  Object.defineProperty(file, 'text', { value: () => read.promise })
  fireEvent.change(screen.getByLabelText('Import preset (.json)'), { target: { files: [file] } })
  save.resolve()
  await waitForSaved()
  read.resolve('{')
  await screen.findByRole('alert')
  expect(screen.getByText(/Remembered on this browser/)).toBeDefined()
})

test('restores correctly under StrictMode without resaving on mount', async () => {
  await storage.savePreset({ filename: 'remembered.json', preset })
  const save = vi.spyOn(storage, 'savePreset')
  render(<StrictMode><App /></StrictMode>)
  await waitForSaved()
  expect(screen.getByText(/remembered.json/)).toBeDefined()
  expect(save).not.toHaveBeenCalled()
})

test('invalid dropped files and failed file reads retain the selected graph and saved copy', async () => {
  render(<App />)
  upload(JSON.stringify(preset))
  await waitForSaved()
  fireEvent.click(screen.getByRole('button', { name: /Smelt plate/ }))
  const file = new File([], 'broken.json')
  Object.defineProperty(file, 'text', { value: async () => '{' })
  expect(fireEvent.drop(screen.getByLabelText('Preset import'), {
    dataTransfer: { types: ['Files'], files: [file] },
  })).toBe(false)
  await screen.findByRole('alert')
  const unreadable = new File([], 'unreadable.json')
  Object.defineProperty(unreadable, 'text', { value: async () => { throw new Error('Cannot read file') } })
  fireEvent.change(screen.getByLabelText('Import preset (.json)'), { target: { files: [unreadable] } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cannot read file'))
  expect(screen.getByLabelText('Production chain').textContent).toContain('Ore')
  expect((await storage.readSavedPreset())?.preset).toEqual(preset)
})
