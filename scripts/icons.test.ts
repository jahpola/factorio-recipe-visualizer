import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { embedIcons } from './icons.ts'
import { MAX_ICON_LENGTH, parsePreset } from '../src/data/preset.ts'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const preset = {
  schemaVersion: 1, gameVersion: '2.1.23', language: 'en', mods: [], warnings: [],
  materials: [{ id: 'item:plate', type: 'item', name: 'plate', displayName: 'Plate' }],
  recipes: [{
    id: 'smelt', displayName: 'Smelt', categories: ['smelting'], ingredients: [],
    products: [{ material: 'item:plate', amount: 1 }], hidden: false, enabledAtStart: true,
  }],
  sources: [],
}

test('embeds distinct recipe/material icons and reports missing icons', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factorio-icons-'))
  try {
    await mkdir(path.join(directory, 'item'))
    await writeFile(path.join(directory, 'item/plate.png'), Buffer.from(png.split(',')[1], 'base64'))
    const result = await embedIcons(parsePreset(preset), directory)
    expect(result.materials[0].icon).toBe(png)
    expect(result.recipes[0].icon).toBeUndefined()
    expect(result.warnings).toContain('No exported icon for recipe:smelt; using text only.')
    await mkdir(path.join(directory, 'recipe'))
    await writeFile(path.join(directory, 'recipe/smelt.png'), 'not a PNG')
    await expect(embedIcons(parsePreset(preset), directory)).rejects.toThrow('Invalid PNG icon')
    await writeFile(path.join(directory, 'recipe/smelt.png'), Buffer.from(png.split(',')[1], 'base64'))
    const complete = await embedIcons(parsePreset(preset), directory)
    expect(complete.recipes[0].icon).toBe(png)
    expect(complete.warnings).toEqual([])
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('skips icons with unsafe names instead of failing the export', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factorio-icons-'))
  try {
    const unsafe = parsePreset({
      ...preset,
      materials: [{ id: 'item:a/b', type: 'item', name: 'a/b', displayName: 'A/B' }],
      recipes: [{ ...preset.recipes[0], id: '..', products: [{ material: 'item:a/b', amount: 1 }] }],
    })
    const result = await embedIcons(unsafe, directory)
    expect(result.materials[0].icon).toBeUndefined()
    expect(result.recipes[0].icon).toBeUndefined()
    expect(result.warnings).toEqual([
      'Unsafe icon name for item:a/b; using text only.',
      'Unsafe icon name for recipe:..; using text only.',
    ])
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('preserves embedded icons and rejects external URLs', () => {
  expect(parsePreset({ ...preset, materials: [{ ...preset.materials[0], icon: png }] }).materials[0].icon).toBe(png)
  expect(() => parsePreset({ ...preset, materials: [{ ...preset.materials[0], icon: 'https://example.com/icon.png' }] })).toThrow('Expected an embedded PNG icon')
  expect(parsePreset(preset).materials[0].icon).toBeUndefined()
})

test('rejects oversized icons on import and skips them on export', async () => {
  const oversized = `${png}${'A'.repeat(MAX_ICON_LENGTH)}`
  expect(() => parsePreset({ ...preset, materials: [{ ...preset.materials[0], icon: oversized }] })).toThrow('Embedded icon is too large')
  const directory = await mkdtemp(path.join(tmpdir(), 'factorio-icons-'))
  try {
    await mkdir(path.join(directory, 'item'))
    const bytes = Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.alloc(MAX_ICON_LENGTH)])
    await writeFile(path.join(directory, 'item/plate.png'), bytes)
    const result = await embedIcons(parsePreset(preset), directory)
    expect(result.materials[0].icon).toBeUndefined()
    expect(result.warnings).toContain('Icon for item:plate is too large to embed; using text only.')
  } finally {
    await rm(directory, { recursive: true })
  }
})
