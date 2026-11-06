import type { Preset } from '../data/preset.ts'

export type ChainNode = {
  id: string
  label: string
  icon?: string
  kind: 'recipe' | 'material' | 'output' | 'raw' | 'choice' | 'unresolved' | 'collapsed' | 'byproduct'
}
export type ChainEdge = { id: string; source: string; target: string }
export type ProductionChain = {
  nodes: ChainNode[]
  edges: ChainEdge[]
  choices: { material: string; recipes: Preset['recipes'] }[]
  branches: { material: string; label: string }[]
  warnings: string[]
}

export function buildProductionChain(
  preset: Preset,
  rootId: string,
  selections: Record<string, string> = {},
  collapsedMaterials: ReadonlySet<string> = new Set(),
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
  const branches = new Map<string, ProductionChain['branches'][number]>()
  const warnings = new Set<string>()
  const expandedRecipes = new Set<string>()
  const expandedMaterials = new Set<string>()
  const requiredMaterials = new Set<string>()
  const producedMaterials = new Set<string>()
  const pending = [rootId]
  function materialNode(id: string) {
    const material = materials.get(id)
    if (!material) throw new Error(`Unknown material ${id}`)
    if (!nodes.has(id)) nodes.set(id, { id, label: material.displayName, icon: material.icon, kind: 'material' })
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
    nodes.set(recipeId, { id: recipeId, label: recipe.displayName, icon: recipe.icon, kind: 'recipe' })
    for (const product of recipe.products) {
      materialNode(product.material)
      connect(recipeId, product.material)
      producedMaterials.add(product.material)
    }
    for (const ingredient of recipe.ingredients) {
      materialNode(ingredient.material)
      connect(ingredient.material, recipeId)
      requiredMaterials.add(ingredient.material)
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
      if (candidates.length) branches.set(ingredient.material, { material: ingredient.material, label: node.label })
      if (collapsedMaterials.has(ingredient.material)) {
        node.kind = 'collapsed'
        continue
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
  for (const material of producedMaterials) {
    if (!requiredMaterials.has(material) && nodes.get(material)?.kind === 'material') {
      nodes.get(material)!.kind = 'byproduct'
    }
  }
  for (const product of recipes.get(rootId)!.products) {
    const node = nodes.get(product.material)!
    node.kind = 'output'
  }
  if (containsCycle([...nodes.keys()], [...edges.values()])) {
    warnings.add('A production cycle is present. The loop is shown, but its production balance is not evaluated.')
  }
  for (const source of preset.sources) {
    if (!source.requiredFluid) continue
    for (const product of source.products) {
      if (raw.has(product.material) && nodes.get(product.material)?.kind === 'raw') {
        const fluid = materials.get(source.requiredFluid)
        warnings.add(`Mining ${materials.get(product.material)?.displayName} may require ${fluid?.displayName ?? source.requiredFluid}; mining-fluid dependencies are not expanded.`)
      }
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    choices: [...choices.values()],
    branches: [...branches.values()],
    warnings: [...warnings],
  }
}

function containsCycle(nodeIds: string[], edges: ChainEdge[]) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  function visit(id: string): boolean {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    visited.add(id)
    active.add(id)
    for (const target of outgoing.get(id) ?? []) {
      if (visit(target)) return true
    }
    active.delete(id)
    return false
  }
  return nodeIds.some(visit)
}
