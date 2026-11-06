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
  const expanded = new Set(preset.materials.map(material => material.id))
  const chain = buildProductionChain(preset, 'electronic-circuit', {}, expanded)
  assert.equal(chain.nodes.length, 10, 'Expected exactly 10 green circuit graph nodes')
  assert.equal(chain.edges.length, 9, 'Expected exactly 9 material-flow connections')
  assert.deepEqual(chain.warnings, [], 'Green circuit chain should resolve without warnings')
  assert.deepEqual(chain.nodes.filter(node => node.kind === 'raw').map(node => node.id).sort(), ['item:copper-ore', 'item:iron-ore'])

  const pole = buildProductionChain(preset, 'small-electric-pole', {}, expanded)
  assert.equal(pole.nodes.find(node => node.id === 'item:wood')?.kind, 'raw', 'Wood should be gathered from trees, not unresolved')
  assert.ok(!pole.warnings.some(warning => warning.startsWith('No visible producer')), 'Small electric pole chain should have no unresolved inputs')

  const chemicalScience = buildProductionChain(preset, 'chemical-science-pack', {}, expanded)
  assert.ok(chemicalScience.nodes.some(node => node.id.startsWith('fluid:')), 'Chemical science chain should include fluid dependencies')
  assert.ok(chemicalScience.choices.some(choice => choice.material === 'fluid:petroleum-gas'), 'Chemical science chain should expose alternative petroleum gas producers')

  const lubricant = buildProductionChain(preset, 'lubricant', { 'fluid:heavy-oil': 'advanced-oil-processing' }, expanded)
  assert.ok(lubricant.nodes.some(node => node.id === 'recipe:advanced-oil-processing'), 'Lubricant chain should expand the selected heavy-oil producer')
  assert.ok(lubricant.nodes.some(node => node.kind === 'byproduct'), 'Oil processing should preserve its byproducts')
  console.log(`Validated schema, green circuit, fluid, alternative producer, and byproduct chains for Factorio ${preset.gameVersion}.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
