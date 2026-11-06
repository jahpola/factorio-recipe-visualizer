import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { loadLocalMods, parseModSelection, resolveModDependencies } from './factorio-mods.ts'
import { normalizeDump } from '../src/data/normalize.ts'
import { embedIcons } from './icons.ts'
import { finderRevealCommand } from './export-instructions.ts'

async function main() {
  const requestedMods = parseModSelection(process.argv.slice(2))
  const steam = path.join(homedir(), 'Library/Application Support/Steam')
  const explicit = process.env.FACTORIO_APP
  const libraries = explicit ? '' : await readFile(path.join(steam, 'steamapps/libraryfolders.vdf'), 'utf8')
  const roots = [...new Set([steam, ...Array.from(libraries.matchAll(/"path"\s+"([^"]+)"/g), match => match[1])])]
  const app = explicit ?? roots.map(root => path.join(root, 'steamapps/common/Factorio/factorio.app')).find(existsSync)
  if (!app || !existsSync(app)) throw new Error('Factorio not found. Set FACTORIO_APP to the factorio.app directory.')
  const appPath = path.resolve(app)
  const executable = path.join(app, 'Contents/MacOS/factorio')
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' })
  if (version.error) throw version.error
  if (version.status !== 0) throw new Error(version.stderr)
  const gameVersion = /Version: (\d+\.\d+\.\d+)/.exec(version.stdout)?.[1]
  if (!gameVersion) throw new Error(`Cannot identify Factorio version: ${version.stdout}`)
  const localModDirectory = process.env.FACTORIO_MODS ?? path.join(homedir(), 'Library/Application Support/factorio/mods')
  const availableMods = requestedMods.length ? await loadLocalMods(localModDirectory) : new Map()
  const selectedMods = resolveModDependencies(requestedMods, availableMods)
  const output = path.resolve('.factorio-export')
  await mkdir(output, { recursive: true })
  const prefix = requestedMods.length ? `mods-${requestedMods.join('-')}-` : 'base-'
  const run = await mkdtemp(path.join(output, prefix))
  const mods = path.join(run, 'mods')
  const data = path.join(appPath, 'Contents/data')
  await mkdir(mods)
  for (const mod of selectedMods) await copyFile(mod.archive, path.join(mods, path.basename(mod.archive)))
  await writeFile(path.join(mods, 'mod-list.json'), JSON.stringify({
    mods: [
      { name: 'base', enabled: true },
      ...['elevated-rails', 'quality', 'space-age', 'recycler']
        .filter(name => !selectedMods.some(mod => mod.info.name === name))
        .map(name => ({ name, enabled: false })),
      ...selectedMods.map(mod => ({ name: mod.info.name, enabled: true })),
    ],
  }, null, 2))
  const config = path.join(run, 'config.ini')
  await writeFile(config, `[path]\nread-data=${data}\nwrite-data=${run}\n[general]\nlocale=en\n`)
  const expectedVersions = new Map([
    ['base', JSON.parse(await readFile(path.join(data, 'base/info.json'), 'utf8')).version as string],
    ...selectedMods.map(mod => [mod.info.name, mod.info.version] as const),
  ])
  for (const flag of ['--dump-data', '--dump-prototype-locale', '--dump-icon-sprites']) {
    const result = spawnSync(executable, ['--config', config, '--mod-directory', mods, '--disable-audio', flag], {
      stdio: 'inherit',
      timeout: 180_000,
      // Only the graphical icon dump needs Steam initialization.
      env: flag === '--dump-icon-sprites' ? { ...process.env, SteamAppId: '427520', SteamGameId: '427520' } : process.env,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Factorio ${flag} failed (exit ${result.status}, signal ${result.signal}). See ${run}.`)
    // Each run replaces factorio-current.log, so verify the loaded mods and versions per run.
    const log = await readFile(path.join(run, 'factorio-current.log'), 'utf8')
    const loadedNames = new Set(Array.from(log.matchAll(/Checksum (?:of|for) (\S+):/g), match => match[1]))
    const loadedVersions = new Map(Array.from(log.matchAll(/Loading mod (\S+) (\d+(?:\.\d+)+) \(/g), match => [match[1], match[2]]))
    const unexpected = [...loadedNames].filter(name => name !== 'core' && !expectedVersions.has(name))
    const missing = [...expectedVersions.keys()].filter(name => !loadedNames.has(name))
    const mismatched = [...expectedVersions].filter(([name, expected]) =>
      loadedVersions.has(name) && loadedVersions.get(name) !== expected)
    if (unexpected.length || missing.length || mismatched.length) {
      throw new Error(`Factorio ${flag}: mod load mismatch. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}; version mismatch: ${mismatched.map(([name, expected]) => `${name} expected ${expected}, got ${loadedVersions.get(name) ?? 'unknown'}`).join(', ') || 'none'}. See ${run}.`)
    }
  }
  const metadata = {
    gameVersion,
    mods: [...expectedVersions].map(([name, version]) => ({ name, version })),
    language: 'en',
  }
  await writeFile(path.join(run, 'metadata.json'), JSON.stringify(metadata, null, 2))
  const readJson = async (name: string): Promise<unknown> => JSON.parse(await readFile(path.join(run, 'script-output', name), 'utf8'))
  const preset = normalizeDump(await readJson('data-raw-dump.json'), metadata, {
    items: await readJson('item-locale.json'),
    fluids: await readJson('fluid-locale.json'),
    recipes: await readJson('recipe-locale.json'),
  })
  const withIcons = await embedIcons(preset, path.join(run, 'script-output'))
  const filename = path.join(run, 'preset.json')
  await writeFile(filename, JSON.stringify(withIcons, null, 2))
  console.log(`Validated ${preset.materials.length} materials, ${preset.recipes.length} recipes, ${preset.sources.length} sources.`)
  for (const warning of withIcons.warnings) console.warn(warning)
  console.log(`Export complete: ${run}`)
  console.log(`Import this preset: ${filename}`)
  console.log(`Reveal in Finder: ${finderRevealCommand(filename)}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
