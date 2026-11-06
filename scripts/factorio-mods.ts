import { readdir } from 'node:fs/promises'
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

function requiredDependencyName(dependency: string) {
  if (/^(?:\?|~|!\s*|\(\?\))/.test(dependency.trim())) return undefined
  return /^([^\s]+)/.exec(dependency.trim())?.[1]
}

export function resolveModDependencies(requested: string[], available: Map<string, LocalMod>) {
  const ordered: LocalMod[] = []
  const included = new Set<string>()
  const active = new Set<string>()
  function visit(name: string) {
    if (name === 'base' || included.has(name)) return
    if (active.has(name)) throw new Error(`Cyclic required mod dependency involving ${name}.`)
    const mod = available.get(name)
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
