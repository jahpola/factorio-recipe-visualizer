import { expect, test } from 'vitest'
import type { LocalMod } from './factorio-mods.ts'
import { parseModSelection, resolveModDependencies } from './factorio-mods.ts'

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
