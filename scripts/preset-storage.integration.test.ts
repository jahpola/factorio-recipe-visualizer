/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { parsePreset } from '../src/data/preset.ts'
import { forgetSavedPreset, readSavedPreset, savePreset } from '../src/data/preset-storage.ts'

afterEach(() => vi.unstubAllGlobals())

test.runIf(process.env.FACTORIO_PRESET)('round-trips a real export through IndexedDB emulation including all embedded icons', async () => {
  const filename = process.env.FACTORIO_PRESET
  if (!filename) throw new Error('Set FACTORIO_PRESET to a real exported preset path.')
  vi.stubGlobal('indexedDB', new IDBFactory())
  const exported = parsePreset(JSON.parse(await readFile(filename, 'utf8')))
  expect(exported.materials.some(material => material.icon)).toBe(true)
  expect(exported.recipes.some(recipe => recipe.id === 'electronic-circuit')).toBe(true)
  await savePreset({ filename, preset: exported })
  expect(await readSavedPreset()).toEqual({ filename, preset: exported })
  await forgetSavedPreset()
  expect(await readSavedPreset()).toBeUndefined()
})
