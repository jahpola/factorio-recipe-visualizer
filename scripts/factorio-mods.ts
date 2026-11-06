import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export type ModInfo = {
  name: string
  version: string
  dependencies?: string[]
}

export type LocalMod = {
  info: ModInfo
  archive: string
}

// A resolved mod either comes from a local archive or ships with the game (archive omitted).
export type ResolvedMod = {
  info: ModInfo
  archive?: string
}

// Official expansion mods ship in the game data directory, not as archives in the mods directory.
export const BUILT_IN_MODS = ['elevated-rails', 'quality', 'space-age'] as const

export function parseModSelection(args: string[]) {
  if (!args.length) return []
  if (args.length !== 2 || args[0] !== '--mods') {
    throw new Error('Usage: pnpm export:factorio [--mods <comma-separated mod names>]')
  }
  const names = args[1].split(',').map(name => name.trim())
  if (names.some(name => !/^[A-Za-z0-9_-]+$/.test(name) || name === 'base')) {
    throw new Error('Mod names must be non-empty IDs; base is included automatically.')
  }
  if (new Set(names).size !== names.length) throw new Error('Mod selection contains duplicate names.')
  return names
}

function parseModInfo(input: string, archive: string): ModInfo {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (error) {
    throw new Error(`Cannot parse info.json in ${archive}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!value || typeof value !== 'object') throw new Error(`Invalid info.json in ${archive}.`)
  const info = value as Partial<ModInfo>
  if (typeof info.name !== 'string' || typeof info.version !== 'string' ||
    (info.dependencies !== undefined && (!Array.isArray(info.dependencies) || info.dependencies.some(item => typeof item !== 'string')))) {
    throw new Error(`Invalid name, version, or dependencies in ${archive}.`)
  }
  return { name: info.name, version: info.version, dependencies: info.dependencies }
}

export async function loadLocalMods(directory: string): Promise<Map<string, LocalMod>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const mods = new Map<string, LocalMod>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.zip')) continue
    const archive = path.join(directory, entry.name)
    const stem = entry.name.slice(0, -4)
    const name = /^(.+)_\d[^/]*$/.exec(stem)?.[1]
    if (!name) continue
    let infoJson: string | undefined
    for (const candidate of [`${name}/info.json`, `${stem}/info.json`]) {
      const result = spawnSync('unzip', ['-p', archive, candidate], {
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      })
      if (result.error) throw result.error
      if (result.status === 0) {
        infoJson = result.stdout
        break
      }
    }
    if (infoJson === undefined) throw new Error(`Cannot locate ${name}/info.json in ${archive}.`)
    const info = parseModInfo(infoJson, archive)
    if (info.name !== name) throw new Error(`Mod archive ${entry.name} contains ${info.name}, not ${name}.`)
    if (mods.has(info.name)) throw new Error(`Multiple installed versions of ${info.name} were found in ${directory}.`)
    mods.set(info.name, { info, archive })
  }
  return mods
}

export async function loadBuiltInMods(dataDirectory: string): Promise<Map<string, ModInfo>> {
  const mods = new Map<string, ModInfo>()
  for (const name of BUILT_IN_MODS) {
    const file = path.join(dataDirectory, name, 'info.json')
    let input: string
    try {
      input = await readFile(file, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    const info = parseModInfo(input, file)
    if (info.name !== name) throw new Error(`${file} contains ${info.name}, not ${name}.`)
    mods.set(name, info)
  }
  return mods
}

// Factorio dependency format: [prefix] name [operator version]. Names may contain spaces.
// `!` is incompatible, `?` and `(?)` are optional, and `~` is required without affecting load order.
export function requiredDependencyName(dependency: string) {
  const match = /^(?:(!|\?|\(\?\)|~)\s*)?(.+?)(?:\s*(?:<=|>=|=|<|>)\s*\S+)?$/.exec(dependency.trim())
  if (!match) return undefined
  const [, prefix, name] = match
  return prefix === undefined || prefix === '~' ? name : undefined
}

export function resolveModDependencies(
  requested: string[],
  available: ReadonlyMap<string, LocalMod>,
  builtIn: ReadonlyMap<string, ModInfo> = new Map(),
): ResolvedMod[] {
  const ordered: ResolvedMod[] = []
  const included = new Set<string>()
  const active = new Set<string>()
  function visit(name: string) {
    if (name === 'base' || included.has(name)) return
    if (active.has(name)) throw new Error(`Cyclic required mod dependency involving ${name}.`)
    const builtInInfo = builtIn.get(name)
    const mod: ResolvedMod | undefined = builtInInfo ? { info: builtInInfo } : available.get(name)
    if (!mod && (BUILT_IN_MODS as readonly string[]).includes(name)) {
      throw new Error(`Required built-in mod ${name} is not installed with this Factorio.`)
    }
    if (!mod) throw new Error(`Required mod ${name} is not available locally.`)
    active.add(name)
    for (const dependency of mod.info.dependencies ?? []) {
      const required = requiredDependencyName(dependency)
      if (required) visit(required)
    }
    active.delete(name)
    included.add(name)
    ordered.push(mod)
  }
  for (const name of requested) visit(name)
  return ordered
}
