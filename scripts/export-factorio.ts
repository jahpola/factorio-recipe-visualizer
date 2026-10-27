import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { normalizeDump } from '../src/data/normalize.ts'

async function main() {
  const steam = path.join(homedir(), 'Library/Application Support/Steam')
  const explicit = process.env.FACTORIO_APP
  const libraries = explicit ? '' : await readFile(path.join(steam, 'steamapps/libraryfolders.vdf'), 'utf8')
  const roots = [...new Set([steam, ...Array.from(libraries.matchAll(/"path"\s+"([^"]+)"/g), match => match[1])])]
  const app = explicit ?? roots.map(root => path.join(root, 'steamapps/common/Factorio/factorio.app')).find(existsSync)
  if (!app || !existsSync(app)) throw new Error('Factorio not found. Set FACTORIO_APP to the factorio.app directory.')
  const executable = path.join(app, 'Contents/MacOS/factorio')
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' })
  if (version.error) throw version.error
  if (version.status !== 0) throw new Error(version.stderr)
  const gameVersion = /Version: (\d+\.\d+\.\d+)/.exec(version.stdout)?.[1]
  if (!gameVersion) throw new Error(`Cannot identify Factorio version: ${version.stdout}`)
  const output = path.resolve('.factorio-export')
  await mkdir(output, { recursive: true })
  const run = await mkdtemp(path.join(output, 'base-'))
  const mods = path.join(run, 'mods')
  const data = path.join(app, 'Contents/data')
  await mkdir(mods)
  await writeFile(path.join(mods, 'mod-list.json'), JSON.stringify({
    mods: [{ name: 'base', enabled: true }, ...['elevated-rails', 'quality', 'space-age', 'recycler'].map(name => ({ name, enabled: false }))],
  }, null, 2))
  const config = path.join(run, 'config.ini')
  await writeFile(config, `[path]\nread-data=${data}\nwrite-data=${run}\n[general]\nlocale=en\n`)
  for (const flag of ['--dump-data', '--dump-prototype-locale']) {
    const result = spawnSync(executable, ['--config', config, '--mod-directory', mods, '--disable-audio', flag], {
      stdio: 'inherit',
      timeout: 180_000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Factorio ${flag} failed (exit ${result.status}, signal ${result.signal}). See ${run}.`)
  }
  const base = JSON.parse(await readFile(path.join(data, 'base/info.json'), 'utf8')) as { version: string }
  const log = await readFile(path.join(run, 'factorio-current.log'), 'utf8')
  const loadedMods = [...new Set(Array.from(log.matchAll(/Loading mod (\S+) [^\n]+/g), match => match[1]))]
  if (!loadedMods.includes('base') || loadedMods.some(name => name !== 'base' && name !== 'core')) {
    throw new Error(`Expected base/core only, but loaded: ${loadedMods.join(', ')}`)
  }
  const metadata = {
    gameVersion,
    mods: [{ name: 'base', version: base.version }],
    language: 'en',
  }
  await writeFile(path.join(run, 'metadata.json'), JSON.stringify(metadata, null, 2))
  const readJson = async (name: string): Promise<unknown> => JSON.parse(await readFile(path.join(run, 'script-output', name), 'utf8'))
  const preset = normalizeDump(await readJson('data-raw-dump.json'), metadata, {
    items: await readJson('item-locale.json'),
    fluids: await readJson('fluid-locale.json'),
    recipes: await readJson('recipe-locale.json'),
  })
  await writeFile(path.join(run, 'preset.json'), JSON.stringify(preset, null, 2))
  console.log(`Validated ${preset.materials.length} materials, ${preset.recipes.length} recipes, ${preset.sources.length} sources.`)
  for (const warning of preset.warnings) console.warn(warning)
  console.log(`Export complete: ${run}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
