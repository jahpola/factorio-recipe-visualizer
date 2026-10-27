import { z } from 'zod'

const materialId = z.string().regex(/^(item|fluid):.+$/)
const fluidId = z.string().regex(/^fluid:.+$/, 'Expected a fluid identifier (fluid:<name>)')
// Base-game icons embed at about 16 KB; the limit leaves room for high-resolution mod icons.
export const MAX_ICON_LENGTH = 256 * 1024
const icon = z.string().max(MAX_ICON_LENGTH, 'Embedded icon is too large').regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/, 'Expected an embedded PNG icon')
const quantity = z.object({
  material: materialId,
  amount: z.number().nonnegative().optional(),
  amountMin: z.number().nonnegative().optional(),
  amountMax: z.number().nonnegative().optional(),
  probability: z.number().min(0).max(1).optional(),
  temperature: z.number().optional(),
  minimumTemperature: z.number().optional(),
  maximumTemperature: z.number().optional(),
}).refine(value => value.amount !== undefined || (value.amountMin !== undefined && value.amountMax !== undefined), {
  message: 'Expected amount or both amountMin and amountMax',
}).refine(value => value.amountMin === undefined || value.amountMax === undefined || value.amountMin <= value.amountMax, {
  message: 'amountMin must not exceed amountMax',
})

export const presetSchema = z.object({
  schemaVersion: z.literal(1),
  gameVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  language: z.string().min(1),
  mods: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) })),
  materials: z.array(z.object({
    id: materialId,
    type: z.enum(['item', 'fluid']),
    name: z.string().min(1),
    displayName: z.string().min(1),
    icon: icon.optional(),
    subgroup: z.string().optional(),
  })),
  recipes: z.array(z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    icon: icon.optional(),
    categories: z.array(z.string()).min(1),
    ingredients: z.array(quantity),
    products: z.array(quantity).min(1),
    hidden: z.boolean(),
    enabledAtStart: z.boolean(),
    subgroup: z.string().optional(),
  })),
  sources: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(['resource', 'tile-fluid']),
    products: z.array(quantity).min(1),
    requiredFluid: fluidId.optional(),
  })),
  warnings: z.array(z.string()),
}).superRefine((preset, context) => {
  const materials = new Set<string>()
  for (const [index, material] of preset.materials.entries()) {
    if (material.id !== `${material.type}:${material.name}` || materials.has(material.id)) {
      context.addIssue({ code: 'custom', path: ['materials', index, 'id'], message: 'Inconsistent or duplicate material ID' })
    }
    materials.add(material.id)
  }
  const recipes = new Set<string>()
  for (const [index, recipe] of preset.recipes.entries()) {
    if (recipes.has(recipe.id)) context.addIssue({ code: 'custom', path: ['recipes', index, 'id'], message: 'Duplicate recipe ID' })
    recipes.add(recipe.id)
    for (const section of ['ingredients', 'products'] as const) {
      for (const [position, entry] of recipe[section].entries()) {
        if (!materials.has(entry.material)) context.addIssue({
          code: 'custom', path: ['recipes', index, section, position, 'material'],
          message: `Unknown material ${entry.material}`,
        })
      }
    }
  }
  const sources = new Set<string>()
  for (const [index, source] of preset.sources.entries()) {
    if (sources.has(source.id)) context.addIssue({
      code: 'custom', path: ['sources', index, 'id'], message: 'Duplicate source ID',
    })
    sources.add(source.id)
    for (const material of [...source.products.map(product => product.material), ...(source.requiredFluid ? [source.requiredFluid] : [])]) {
      if (!materials.has(material)) context.addIssue({
        code: 'custom', path: ['sources', index], message: `Unknown material ${material}`,
      })
    }
  }
})

export type Preset = z.infer<typeof presetSchema>

export function parsePreset(input: unknown): Preset {
  return presetSchema.parse(input)
}
