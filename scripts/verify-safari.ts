import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { parsePreset } from '../src/data/preset.ts'

const driver = 'http://127.0.0.1:4444'

async function command(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(`${driver}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })
  const result = await response.json() as { value: unknown }
  if (!response.ok) throw new Error(`Safari WebDriver ${method} ${path}: ${JSON.stringify(result.value)}`)
  return result.value
}

async function main() {
  const [address, file] = process.argv.slice(2)
  if (!address || !file) throw new Error('Usage: pnpm verify:safari <local-page-url> <preset.json>')
  const url = new URL(address)
  assert.ok(['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local development or preview URL')
  const text = await readFile(file, 'utf8')
  const preset = parsePreset(JSON.parse(text))
  assert.ok(preset.recipes.some(recipe => recipe.id === 'electronic-circuit'), 'Preset must include Electronic circuit')

  const session = await command('/session', 'POST', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  }) as { sessionId: string; capabilities: { browserVersion: string } }
  const root = `/session/${session.sessionId}`
  const execute = (script: string, args: unknown[] = []) =>
    command(`${root}/execute/sync`, 'POST', { script, args })
  async function waitFor(script: string) {
    const deadline = Date.now() + 20_000
    do {
      if (await execute(script)) return
      await delay(100)
    } while (Date.now() < deadline)
    const state = await execute(`return {
      heading: document.querySelector(".chain h2")?.textContent,
      nodes: document.querySelectorAll(".react-flow__node").length,
      edges: document.querySelectorAll(".react-flow__edge").length,
      alerts: [...document.querySelectorAll("[role=alert]")].map(node => node.textContent),
      errors: window.__safariErrors
    }`)
    throw new Error(`Timed out waiting for: ${script}\nBrowser state: ${JSON.stringify(state)}`)
  }
  async function click(selector: string) {
    const element = await command(`${root}/element`, 'POST', { using: 'css selector', value: selector }) as Record<string, string>
    const id = element['element-6066-11e4-a52e-4f735466cecf']
    assert.ok(id, `Missing element: ${selector}`)
    await command(`${root}/element/${id}/click`, 'POST', {})
  }
  async function importFile(contents: string) {
    await execute(`
      const input = document.querySelector('input[type="file"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([arguments[0]], 'preset.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    `, [contents])
  }
  async function greenCircuit() {
    await waitFor('return document.querySelectorAll(".react-flow__node").length === 10 && document.querySelectorAll(".react-flow__edge").length === 9')
    assert.deepEqual(await execute(`
      return [...document.querySelectorAll(".react-flow__node.raw")].map(node => node.dataset.id).sort()
    `), ['item:copper-ore', 'item:iron-ore'])
    await waitFor(`return [...document.querySelectorAll("img")].every(image => image.complete)`)
    assert.equal(await execute('return [...document.images].filter(image => !image.naturalWidth).length'), 0, 'Images must decode')
    assert.equal(await execute('return document.querySelectorAll(".icon-unavailable").length'), 0, 'No icon decode fallbacks')
  }
  async function selectRecipe(id: string) {
    await execute(`
      const input = document.querySelector('#recipe-search');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, arguments[0]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `, [id])
    await waitFor(`return [...document.querySelectorAll(".recipe-list small")]
      .some(node => node.textContent === ${JSON.stringify(id)})`)
    const index = await execute(`return [...document.querySelectorAll(".recipe-list small")]
      .findIndex(node => node.textContent === arguments[0])`, [id]) as number
    await click(`.recipe-list li:nth-child(${index + 1}) button`)
  }
  async function branch(action: 'Collapse' | 'Expand', material: string) {
    const name = preset.materials.find(entry => entry.id === material)?.displayName
    assert.ok(name, `Missing branch material ${material}`)
    const index = await execute(`
      return [...document.querySelectorAll(".branch-controls button")]
        .findIndex(button => button.textContent.trim() === arguments[0])
    `, [`${action} ${name} branch`]) as number
    assert.ok(index >= 0, `Missing ${action} control for ${material}`)
    await click(`.branch-controls button:nth-of-type(${index + 1})`)
  }
  async function checkLayout(stage: string) {
    for (const width of [1280, 375, 320]) {
      await command(`${root}/window/rect`, 'POST', { width, height: 900 })
      await delay(200)
      const layout = await execute(`return {
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        graph: document.querySelector(".graph")?.getBoundingClientRect().width ?? null
      }`) as { width: number; content: number; graph: number | null }
      if (layout.width !== width) {
        console.warn(`Safari constrained the requested ${width}px viewport to ${layout.width}px; ${width}px is NOT verified.`)
      }
      assert.ok(layout.content <= layout.width, `${stage}: horizontal overflow at ${layout.width}px`)
      if (layout.graph !== null) assert.ok(layout.graph > 0, 'Graph must have a visible layout')
      console.log(`${stage}: no horizontal overflow at actual viewport ${layout.width}px`)
    }
  }
  try {
    console.log(`Native Safari ${session.capabilities.browserVersion}: ${url.href}`)
    await command(`${root}/url`, 'POST', { url: url.href })
    await waitFor('return document.querySelector("h1")?.textContent === "Factorio Recipe Visualizer"')
    // Classic Safari WebDriver has no console-log endpoint. Capture errors from here onward.
    await execute(`
      window.__safariErrors = [];
      addEventListener('error', event => window.__safariErrors.push(event.message || 'Resource load failed'), true);
      addEventListener('unhandledrejection', event => window.__safariErrors.push(String(event.reason)));
      const original = console.error;
      console.error = (...args) => {
        window.__safariErrors.push(args.map(String).join(' '));
        original.apply(console, args);
      };
    `)
    await checkLayout('Empty page')
    await importFile(text)
    await waitFor('return !!document.querySelector(".preset-info")')
    await execute(`
      const input = document.querySelector('#recipe-search');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'electronic-circuit');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `)
    await waitFor('return document.querySelectorAll(".recipe-list button").length === 1')
    await click('.recipe-list button')
    await greenCircuit()
    await checkLayout('Green circuit')

    const transform = () => execute('return document.querySelector(".react-flow__viewport").style.transform')
    const beforeZoom = await transform()
    await click('.react-flow__controls-zoomin')
    await waitFor(`return document.querySelector(".react-flow__viewport").style.transform !== ${JSON.stringify(beforeZoom)}`)
    await delay(400)
    const beforeFit = await transform()
    await click('.react-flow__controls-fitview')
    await waitFor(`return document.querySelector(".react-flow__viewport").style.transform !== ${JSON.stringify(beforeFit)}`)
    await click('.react-flow__node[data-id="recipe:copper-cable"]')
    await waitFor('return document.querySelector(".recipe-details h3")?.textContent === "Copper cable"')

    for (const width of [1280, 375]) {
      await command(`${root}/window/rect`, 'POST', { width, height: 900 })
      await branch('Collapse', 'item:iron-plate')
      await waitFor(`return document.querySelectorAll(".react-flow__node").length === 8 &&
        document.querySelectorAll(".react-flow__edge").length === 7 &&
        !!document.querySelector('.react-flow__node.collapsed[data-id="item:iron-plate"]') &&
        !document.querySelector('.react-flow__node[data-id="recipe:iron-plate"]')`)
      await branch('Expand', 'item:iron-plate')
      await greenCircuit()
    }

    await selectRecipe('lubricant')
    await waitFor('return !!document.querySelector(".producer-choice select")')
    await execute(`
      const select = document.querySelector('.producer-choice select');
      select.value = 'advanced-oil-processing';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `)
    await waitFor(`return document.querySelectorAll(".react-flow__node").length === 8 &&
      document.querySelectorAll(".react-flow__edge").length === 7 &&
      document.querySelectorAll(".react-flow__node.byproduct").length === 2`)
    for (const material of ['fluid:water', 'fluid:crude-oil']) {
      assert.equal(await execute(`return !!document.querySelector(${JSON.stringify(`.react-flow__node.raw[data-id="${material}"]`)})`), true)
    }
    await branch('Collapse', 'fluid:heavy-oil')
    await waitFor('return document.querySelectorAll(".react-flow__node").length === 3 && !document.querySelector(".producer-choice select")')
    await branch('Expand', 'fluid:heavy-oil')
    await waitFor(`return document.querySelectorAll(".react-flow__node").length === 8 &&
      document.querySelector(".producer-choice select")?.value === "advanced-oil-processing"`)
    await command(`${root}/window/rect`, 'POST', { width: 1280, height: 900 })
    await click('.react-flow__controls-fitview')
    await delay(400)
    await click('.react-flow__node[data-id="recipe:advanced-oil-processing"]')
    await waitFor('return document.querySelector(".recipe-details")?.textContent.includes("(byproduct)")')
    const oilDetails = await execute('return document.querySelector(".recipe-details").textContent') as string
    for (const id of ['fluid:light-oil', 'fluid:petroleum-gas']) {
      const material = preset.materials.find(entry => entry.id === id)
      assert.ok(material, `Missing ${id}`)
      assert.ok(oilDetails.includes(`${material.displayName} (byproduct)`), `Missing byproduct annotation for ${id}`)
    }
    await checkLayout('Lubricant and byproduct details')

    // Supplemental UI fixture: the real base export has no temperature or variable/probabilistic fields.
    const annotated = structuredClone(preset)
    const lubricant = annotated.recipes.find(recipe => recipe.id === 'lubricant')
    assert.ok(lubricant, 'Missing lubricant recipe')
    Object.assign(lubricant.ingredients[0], { temperature: 75, minimumTemperature: 50, maximumTemperature: 100 })
    const product = lubricant.products[0]
    delete product.amount
    Object.assign(product, { amountMin: 1, amountMax: 2, probability: 0.5 })
    await importFile(JSON.stringify(annotated))
    await waitFor('return document.querySelector(".chain h2")?.textContent === "Select a recipe"')
    await selectRecipe('lubricant')
    await waitFor('return !!document.querySelector(".react-flow__node")')
    const annotations = await execute('return document.querySelector(".recipe-details").textContent') as string
    assert.ok(annotations.includes('(at 75°C, minimum 50°C, maximum 100°C)'), 'Fluid constraint annotations')
    assert.ok(annotations.includes('(variable output, probabilistic output)'), 'Output annotations')
    assert.equal(await execute(`return [...document.querySelectorAll('[role="status"]')]
      .some(node => node.textContent.includes('Fluid temperature compatibility is not evaluated yet'))`), true)
    await checkLayout('Supplemental detail annotations')
    console.log('Supplemental UI fixture passed: fluid temperature, variable/probabilistic annotations, and unsupported-temperature warning (not real-export feature evidence).')

    await importFile(text)
    await waitFor('return document.querySelector(".chain h2")?.textContent === "Select a recipe"')
    await selectRecipe('copper-cable')
    await waitFor('return document.querySelectorAll(".react-flow__node").length === 5 && document.querySelectorAll(".react-flow__edge").length === 4')
    await importFile('{ invalid json')
    await waitFor('return document.querySelector("[role=alert]")?.textContent.includes("Preset import failed")')
    assert.equal(await execute('return document.querySelectorAll(".react-flow__node").length'), 5, 'Invalid import must retain the graph')
    assert.deepEqual(await execute('return window.__safariErrors'), [], 'Captured browser errors')
    console.log('PASS: import, 10 nodes/9 edges, ore boundaries, image decoding, zoom/fit, inspection, branch collapse/reopen, retained producer selection, real oil byproduct details, supplemental detail annotations, recipe switching, invalid-import retention, and post-load error capture.')
    console.log('Not covered: startup console errors, OS file picker, manual pan/drag, or viewports Safari refuses to create.')
  } finally {
    await command(root, 'DELETE')
  }
}

main().catch((error: unknown) => {
  console.error(error)
  if (error instanceof Error && error.message.includes('session not created')) {
    console.error('Quit Safari normally, wait for it to exit, then retry so WebDriver launches it for automation.')
  }
  process.exitCode = 1
})
