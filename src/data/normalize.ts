import { z } from 'zod'
import { parsePreset } from './preset.ts'
import type { Preset } from './preset.ts'

const entrySchema = z.object({
  type: z.enum(['item', 'fluid']).default('item'),
  name: z.string(),
  amount: z.number().optional(),
  amount_min: z.number().optional(),
  amount_max: z.number().optional(),
  probability: z.number().optional(),
  temperature: z.number().optional(),
  minimum_temperature: z.number().optional(),
  maximum_temperature: z.number().optional(),
})
// Factorio serializes empty Lua tables as {} rather than [].
const entriesSchema = z.union([
  z.array(entrySchema),
  z.object({}).strict().transform(() => []),
])
const prototypeSchema = z.object({
  name: z.string(),
  type: z.string(),
  stack_size: z.number().optional(),
  subgroup: z.string().optional(),
  ingredients: entriesSchema.optional(),
  results: entriesSchema.optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
  enabled: z.boolean().optional(),
  parameter: z.boolean().optional(),
  fluid: z.string().optional(),
  minable: z.object({
    result: z.string().optional(),
    count: z.number().optional(),
    results: entriesSchema.optional(),
    required_fluid: z.string().optional(),
  }).optional(),
})
const rawSchema = z.record(z.string(), z.record(z.string(), prototypeSchema))
const namesSchema = z.object({ names: z.record(z.string(), z.string()) })
const metadataSchema = z.object({
  gameVersion: z.string(),
  language: z.string(),
  mods: z.array(z.object({ name: z.string(), version: z.string() })),
})

function quantity(entry: z.infer<typeof entrySchema>) {
  return {
    material: `${entry.type}:${entry.name}`,
    amount: entry.amount,
    amountMin: entry.amount_min,
    amountMax: entry.amount_max,
    probability: entry.probability,
    temperature: entry.temperature,
    minimumTemperature: entry.minimum_temperature,
    maximumTemperature: entry.maximum_temperature,
  }
}

export function normalizeDump(rawInput: unknown, metadataInput: unknown, locales: {
  items: unknown
  fluids: unknown
  recipes: unknown
}): Preset {
  const raw = rawSchema.parse(rawInput)
  const metadata = metadataSchema.parse(metadataInput)
  if (!metadata.gameVersion.startsWith('2.1.')) throw new Error(`Unsupported Factorio version ${metadata.gameVersion}; this adapter targets 2.1.x.`)
  const names = {
    item: namesSchema.parse(locales.items).names,
    fluid: namesSchema.parse(locales.fluids).names,
    recipe: namesSchema.parse(locales.recipes).names,
  }
  const materials: Preset['materials'] = []
  for (const prototypes of Object.values(raw)) {
    for (const prototype of Object.values(prototypes)) {
      if (prototype.type !== 'fluid' && prototype.stack_size === undefined) continue
      const type = prototype.type === 'fluid' ? 'fluid' : 'item'
      materials.push({
        id: `${type}:${prototype.name}`, name: prototype.name, type,
        displayName: names[type][prototype.name] ?? prototype.name,
        subgroup: prototype.subgroup,
      })
    }
  }
  const warnings: string[] = []
  const recipes: Preset['recipes'] = []
  for (const recipe of Object.values(raw.recipe ?? {})) {
    if (recipe.parameter || recipe.name === 'recipe-unknown') {
      warnings.push(`Excluded non-production recipe placeholder: ${recipe.name}`)
      continue
    }
    if (!recipe.ingredients || !recipe.results) throw new Error(`Recipe ${recipe.name} has no ingredients/results arrays`)
    recipes.push({
      id: recipe.name,
      displayName: names.recipe[recipe.name] ?? recipe.name,
      categories: recipe.categories ?? [recipe.category ?? 'crafting'],
      ingredients: recipe.ingredients.map(quantity),
      products: recipe.results.map(quantity),
      hidden: recipe.hidden ?? false,
      enabledAtStart: recipe.enabled ?? true,
      subgroup: recipe.subgroup,
    })
  }
  const sources: Preset['sources'] = []
  for (const resource of Object.values(raw.resource ?? {})) {
    const minable = resource.minable
    if (!minable) throw new Error(`Resource ${resource.name} has no minable definition`)
    const products = minable.results?.map(quantity) ?? (minable.result ? [{
      material: `item:${minable.result}`, amount: minable.count ?? 1,
    }] : [])
    if (!products.length) throw new Error(`Resource ${resource.name} has no mining products`)
    sources.push({
      id: `resource:${resource.name}`, kind: 'resource', products,
      requiredFluid: minable.required_fluid ? `fluid:${minable.required_fluid}` : undefined,
    })
  }
  for (const tile of Object.values(raw.tile ?? {})) {
    if (tile.fluid) sources.push({
      id: `tile:${tile.name}`, kind: 'tile-fluid',
      products: [{ material: `fluid:${tile.fluid}`, amount: 1 }],
    })
  }
  warnings.push('Resource mining-fluid requirements are recorded but are outside the initial recipe-only dependency boundary.')
  return parsePreset({ schemaVersion: 1, ...metadata, materials, recipes, sources, warnings })
}
