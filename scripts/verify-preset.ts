import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parsePreset } from '../src/data/preset.ts'
import { buildProductionChain } from '../src/graph/production.ts'

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: pnpm verify:preset <path/to/preset.json>')
  const preset = parsePreset(JSON.parse(await readFile(file, 'utf8')))
  const expected: Record<string, string[]> = {
    'electronic-circuit': ['item:iron-plate', 'item:copper-cable'],
    'copper-cable': ['item:copper-plate'],
    'iron-plate': ['item:iron-ore'],
    'copper-plate': ['item:copper-ore'],
  }
  for (const [id, ingredients] of Object.entries(expected)) {
    const recipe = preset.recipes.find(recipe => recipe.id === id)
    assert.ok(recipe, `Missing recipe ${id}`)
    assert.deepEqual(recipe.ingredients.map(entry => entry.material).sort(), [...ingredients].sort(), `Unexpected ingredients for ${id}`)
    assert.ok(recipe.products.some(product => product.material === `item:${id}`), `Missing product for ${id}`)
  }
  for (const material of ['item:iron-ore', 'item:copper-ore']) {
    assert.ok(preset.sources.some(source => source.kind === 'resource' && source.products.some(product => product.material === material)), `Missing ore source ${material}`)
  }
  const chain = buildProductionChain(preset, 'electronic-circuit')
  assert.equal(chain.nodes.length, 10, 'Expected exactly 10 green circuit graph nodes')
  assert.equal(chain.edges.length, 9, 'Expected exactly 9 material-flow connections')
  assert.deepEqual(chain.warnings, [], 'Green circuit chain should resolve without warnings')
  assert.deepEqual(chain.nodes.filter(node => node.kind === 'raw').map(node => node.id).sort(), ['item:copper-ore', 'item:iron-ore'])
  console.log(`Validated schema and complete green circuit dependencies for Factorio ${preset.gameVersion}.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
