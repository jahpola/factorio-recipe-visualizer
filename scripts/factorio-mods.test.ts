import { expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { LocalMod } from './factorio-mods.ts'
import { loadBuiltInMods, parseModSelection, requiredDependencyName, resolveModDependencies } from './factorio-mods.ts'

function mod(name: string, dependencies: string[] = []): LocalMod {
  return { info: { name, version: '1.0.0', dependencies }, archive: `${name}_1.0.0.zip` }
}

test('parses an explicit mod list and rejects invalid selections', () => {
  expect(parseModSelection([])).toEqual([])
  expect(parseModSelection(['--mods', 'nullius, alien-biomes'])).toEqual(['nullius', 'alien-biomes'])
  expect(() => parseModSelection(['--mods', 'nullius,nullius'])).toThrow('duplicate')
  expect(() => parseModSelection(['--mods', 'base'])).toThrow('base is included automatically')
  expect(() => parseModSelection(['--other'])).toThrow('Usage:')
})

test('resolves required dependencies once and ignores optional and incompatible mods', () => {
  const available = new Map([
    ['nullius', mod('nullius', [
      'base >= 2.1.22',
      'alien-biomes >= 0.8.0',
      '? optional-addon >= 1.0',
      '(?) another-addon',
      '! incompatible-mod',
    ])],
    ['alien-biomes', mod('alien-biomes')],
    ['extra-mod', mod('extra-mod', ['alien-biomes >= 0.8.0'])],
  ])
  expect(resolveModDependencies(['nullius', 'extra-mod'], available).map(item => item.info.name))
    .toEqual(['alien-biomes', 'nullius', 'extra-mod'])
})

test('reports missing and cyclic required dependencies', () => {
  expect(() => resolveModDependencies(['nullius'], new Map([['nullius', mod('nullius', ['missing'])]])))
    .toThrow('Required mod missing is not available locally')
  expect(() => resolveModDependencies(['first'], new Map([
    ['first', mod('first', ['second'])],
    ['second', mod('second', ['first'])],
  ]))).toThrow('Cyclic required mod dependency')
})

test('parses dependency prefixes, versions, and names with spaces', () => {
  expect(requiredDependencyName('base >= 2.1.22')).toBe('base')
  expect(requiredDependencyName('alien-biomes')).toBe('alien-biomes')
  expect(requiredDependencyName('~ load-order-free >= 1.0.0')).toBe('load-order-free')
  expect(requiredDependencyName('~load-order-free')).toBe('load-order-free')
  expect(requiredDependencyName('Inventory Sensor >= 2.0.6')).toBe('Inventory Sensor')
  expect(requiredDependencyName('? optional >= 1.0')).toBeUndefined()
  expect(requiredDependencyName('(?) hidden-optional')).toBeUndefined()
  expect(requiredDependencyName('! space-age')).toBeUndefined()
  expect(requiredDependencyName('!quality')).toBeUndefined()
})

test('resolves ~ dependencies as required', () => {
  const available = new Map([
    ['main', mod('main', ['~ helper >= 1.0.0'])],
    ['helper', mod('helper')],
  ])
  expect(resolveModDependencies(['main'], available).map(item => item.info.name)).toEqual(['helper', 'main'])
  expect(() => resolveModDependencies(['main'], new Map([['main', available.get('main')!]])))
    .toThrow('Required mod helper is not available locally')
})

test('resolves built-in expansion mods from game data without archives', () => {
  const available = new Map([['needs-dlc', mod('needs-dlc', ['space-age >= 2.1.0'])]])
  const builtIn = new Map([
    ['space-age', { name: 'space-age', version: '2.1.24', dependencies: ['base', 'quality', 'elevated-rails'] }],
    ['quality', { name: 'quality', version: '2.1.24', dependencies: ['base'] }],
    ['elevated-rails', { name: 'elevated-rails', version: '2.1.24', dependencies: ['base'] }],
  ])
  const resolved = resolveModDependencies(['needs-dlc'], available, builtIn)
  expect(resolved.map(item => [item.info.name, item.archive])).toEqual([
    ['quality', undefined],
    ['elevated-rails', undefined],
    ['space-age', undefined],
    ['needs-dlc', 'needs-dlc_1.0.0.zip'],
  ])
  expect(() => resolveModDependencies(['needs-dlc'], available))
    .toThrow('Required built-in mod space-age is not installed with this Factorio')
})

test('loads installed built-in expansion mod metadata from the game data directory', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'factorio-data-'))
  try {
    await mkdir(path.join(data, 'quality'))
    await writeFile(path.join(data, 'quality', 'info.json'), JSON.stringify({ name: 'quality', version: '2.1.24', dependencies: ['base'] }))
    const builtIn = await loadBuiltInMods(data)
    expect([...builtIn.keys()]).toEqual(['quality'])
    expect(builtIn.get('quality')?.version).toBe('2.1.24')
  } finally {
    await rm(data, { recursive: true, force: true })
  }
})
