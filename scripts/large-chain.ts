import type { Preset } from '../src/data/preset.ts'
import { buildProductionChain } from '../src/graph/production.ts'
import type { ProductionChain } from '../src/graph/production.ts'

export type ExpandedChain = {
  recipe: string
  chain: ProductionChain
  selections: Record<string, string>
  /** UI rounds needed: each round picks the first producer for open choices and expands visible branches. */
  rounds: number
}

/**
 * Expands a chain the way a user clicking through the UI would: repeatedly choose the first
 * listed producer for every open choice and expand every branch, until nothing changes.
 */
export function expandFully(preset: Preset, recipe: string): ExpandedChain {
  const selections: Record<string, string> = {}
  const expanded = new Set<string>()
  for (let rounds = 0; ; rounds++) {
    const chain = buildProductionChain(preset, recipe, selections, expanded)
    let changed = false
    for (const choice of chain.choices) {
      if (selections[choice.material]) continue
      selections[choice.material] = choice.recipes[0].id
      changed = true
    }
    for (const branch of chain.branches) {
      if (expanded.has(branch.material)) continue
      expanded.add(branch.material)
      changed = true
    }
    if (!changed) return { recipe, chain, selections, rounds }
  }
}

/** Finds the visible recipe whose fully expanded chain has the most nodes. */
export function largestChain(preset: Preset): ExpandedChain {
  let largest: ExpandedChain | undefined
  for (const recipe of preset.recipes) {
    if (recipe.hidden) continue
    const candidate = expandFully(preset, recipe.id)
    if (!largest || candidate.chain.nodes.length > largest.chain.nodes.length) largest = candidate
  }
  if (!largest) throw new Error('The preset has no visible recipes.')
  return largest
}
