import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parsePreset } from '../src/data/preset.ts'
import { buildProductionChain } from '../src/graph/production.ts'

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: pnpm verify:mod-preset <path/to/preset.json>')
  const preset = parsePreset(JSON.parse(await readFile(file, 'utf8')))
  assert.ok(preset.mods.some(mod => mod.name === 'nullius'), 'Expected a separate Nullius preset')

  const producerRecipes = new Map<string, string[]>()
  for (const recipe of preset.recipes) {
    if (recipe.hidden) continue
    for (const product of recipe.products) {
      if (product.amount === 0 || product.amountMax === 0 || product.probability === 0) continue
      const candidates = producerRecipes.get(product.material) ?? []
      if (!candidates.includes(recipe.id)) candidates.push(recipe.id)
      producerRecipes.set(product.material, candidates)
    }
  }
  const selections = Object.fromEntries([...producerRecipes].map(([material, recipes]) => [material, recipes[0]]))
  const expandedMaterials = new Set(preset.materials.map(material => material.id))
  const chain = buildProductionChain(preset, 'bulk-inserter', selections, expandedMaterials)
  assert.ok(chain.choices.length > 0, 'Expected alternative producers in the representative Nullius chain')
  assert.ok(chain.warnings.some(warning => warning.startsWith('A production cycle')), 'Expected a cycle in the representative Nullius chain')
  assert.ok(chain.nodes.some(node => node.kind === 'byproduct'), 'Expected multi-output byproducts in the representative Nullius chain')
  assert.ok(preset.recipes.some(recipe => recipe.products.length > 1), 'Expected multi-output recipes in the Nullius catalog')

  console.log(`Validated Nullius ${preset.mods.find(mod => mod.name === 'nullius')?.version}: ${chain.nodes.length} nodes, ${chain.edges.length} connections, alternatives, a cycle, and byproducts.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
