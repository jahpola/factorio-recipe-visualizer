import type { Preset } from '../data/preset.ts'

export type ChainNode = {
  id: string
  label: string
  kind: 'recipe' | 'material' | 'output' | 'raw' | 'choice' | 'unresolved'
}
export type ChainEdge = { id: string; source: string; target: string }
export type ProductionChain = {
  nodes: ChainNode[]
  edges: ChainEdge[]
  choices: { material: string; recipes: Preset['recipes'] }[]
  warnings: string[]
}

export function buildProductionChain(
  preset: Preset,
  rootId: string,
  selections: Record<string, string> = {},
): ProductionChain {
  const recipes = new Map(preset.recipes.map(recipe => [recipe.id, recipe]))
  if (!recipes.has(rootId)) throw new Error(`Unknown recipe ${rootId}`)
  const materials = new Map(preset.materials.map(material => [material.id, material]))
  const producers = new Map<string, Preset['recipes']>()
  for (const recipe of preset.recipes) {
    if (recipe.hidden && recipe.id !== rootId) continue
    for (const product of recipe.products) {
      if (product.amount === 0 || product.amountMax === 0 || product.probability === 0) continue
      const candidates = producers.get(product.material) ?? []
      if (!candidates.includes(recipe)) candidates.push(recipe)
      producers.set(product.material, candidates)
    }
  }
  const raw = new Set(preset.sources.flatMap(source => source.products.map(product => product.material)))
  const nodes = new Map<string, ChainNode>()
  const edges = new Map<string, ChainEdge>()
  const choices = new Map<string, ProductionChain['choices'][number]>()
  const warnings = new Set<string>()
  const expandedRecipes = new Set<string>()
  const expandedMaterials = new Set<string>()
  const pending = [rootId]
  function materialNode(id: string) {
    const material = materials.get(id)
    if (!material) throw new Error(`Unknown material ${id}`)
    if (!nodes.has(id)) nodes.set(id, { id, label: material.displayName, kind: 'material' })
  }
  function connect(source: string, target: string) {
    const id = JSON.stringify([source, target])
    edges.set(id, { id, source, target })
  }
  while (pending.length) {
    const id = pending.shift()!
    if (expandedRecipes.has(id)) continue
    expandedRecipes.add(id)
    const recipe = recipes.get(id)
    if (!recipe) throw new Error(`Unknown producer recipe ${id}`)
    const recipeId = `recipe:${id}`
    nodes.set(recipeId, { id: recipeId, label: recipe.displayName, kind: 'recipe' })
    for (const product of recipe.products) {
      materialNode(product.material)
      connect(recipeId, product.material)
    }
    for (const ingredient of recipe.ingredients) {
      materialNode(ingredient.material)
      connect(ingredient.material, recipeId)
      if (ingredient.temperature !== undefined || ingredient.minimumTemperature !== undefined || ingredient.maximumTemperature !== undefined) {
        warnings.add('Fluid temperature compatibility is not evaluated yet; this graph shows dependencies, not a validated production plan.')
      }
      if (expandedMaterials.has(ingredient.material)) continue
      expandedMaterials.add(ingredient.material)
      const node = nodes.get(ingredient.material)!
      if (raw.has(ingredient.material)) {
        node.kind = 'raw'
        continue
      }
      const candidates = producers.get(ingredient.material) ?? []
      const selection = selections[ingredient.material]
      if (selection && !candidates.some(candidate => candidate.id === selection)) {
        throw new Error(`Invalid producer ${selection} for ${ingredient.material}`)
      }
      if (candidates.length > 1) {
        choices.set(ingredient.material, { material: ingredient.material, recipes: candidates })
      }
      const producer = selection ?? (candidates.length === 1 ? candidates[0].id : undefined)
      if (producer) pending.push(producer)
      else if (candidates.length > 1) node.kind = 'choice'
      else {
        node.kind = 'unresolved'
        warnings.add(`No visible producer or raw-resource source for ${node.label} (${node.id}).`)
      }
    }
  }
  for (const product of recipes.get(rootId)!.products) {
    const node = nodes.get(product.material)!
    if (node.kind === 'material') node.kind = 'output'
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], choices: [...choices.values()], warnings: [...warnings] }
}
