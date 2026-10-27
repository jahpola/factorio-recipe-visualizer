import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parsePreset } from '../src/data/preset.ts'
import type { Preset } from '../src/data/preset.ts'

export async function embedIcons(preset: Preset, output: string): Promise<Preset> {
  const warnings = [...preset.warnings]
  async function load(type: string, name: string): Promise<string | undefined> {
    if (path.basename(name) !== name || name === '.' || name === '..') {
      throw new Error(`Unsafe icon name ${name}`)
    }
    const file = path.join(output, type, `${name}.png`)
    let bytes: Buffer
    try {
      bytes = await readFile(file)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        warnings.push(`No exported icon for ${type}:${name}; using text only.`)
        return undefined
      }
      throw error
    }
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error(`Invalid PNG icon: ${file}`)
    }
    return `data:image/png;base64,${bytes.toString('base64')}`
  }
  const materials = await Promise.all(preset.materials.map(async material => ({
    ...material, icon: await load(material.type, material.name),
  })))
  const recipes = await Promise.all(preset.recipes.map(async recipe => ({
    ...recipe, icon: await load('recipe', recipe.id),
  })))
  return parsePreset({ ...preset, materials, recipes, warnings })
}
