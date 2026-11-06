// Native Safari stress check: fully expands a huge production chain (by default the largest
// one in the preset, such as nullius-probe in Nullius) through the real UI and measures how
// long the main thread stalls while ELK lays it out.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { parsePreset } from '../src/data/preset.ts'
import { expandFully, largestChain } from './large-chain.ts'

const driver = 'http://127.0.0.1:4444'
// Main-thread stalls while the layout is pending. Layout in the main thread stalled for the
// whole layout (about 2 s for nullius-probe); in a worker only rendering work remains.
const MAX_ARRANGING_STALL_MS = 250

async function command(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(`${driver}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })
  const result = await response.json() as { value: unknown }
  if (!response.ok) throw new Error(`Safari WebDriver ${method} ${path}: ${JSON.stringify(result.value)}`)
  return result.value
}

async function main() {
  const [address, file, requestedRecipe] = process.argv.slice(2)
  if (!address || !file) throw new Error('Usage: pnpm verify:safari-large <local-page-url> <preset.json> [recipe-id]')
  const url = new URL(address)
  assert.ok(['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local development or preview URL')
  const text = await readFile(file, 'utf8')
  const preset = parsePreset(JSON.parse(text))
  console.log(requestedRecipe ? `Expanding ${requestedRecipe}...` : 'Finding the largest fully expanded chain...')
  const target = requestedRecipe ? expandFully(preset, requestedRecipe) : largestChain(preset)
  const expected = { nodes: target.chain.nodes.length, edges: target.chain.edges.length }
  console.log(`Target: ${target.recipe}, ${expected.nodes} nodes, ${expected.edges} edges, ${target.rounds} expansion rounds.`)

  const session = await command('/session', 'POST', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  }) as { sessionId: string; capabilities: { browserVersion: string } }
  const root = `/session/${session.sessionId}`
  const execute = (script: string, args: unknown[] = []) =>
    command(`${root}/execute/sync`, 'POST', { script, args })
  async function waitFor(script: string, timeout = 20_000) {
    const deadline = Date.now() + timeout
    do {
      if (await execute(script)) return
      await delay(100)
    } while (Date.now() < deadline)
    const state = await execute(`return {
      nodes: document.querySelectorAll(".react-flow__node").length,
      statuses: [...document.querySelectorAll("[role=status]")].map(node => node.textContent),
      alerts: [...document.querySelectorAll("[role=alert]")].map(node => node.textContent),
      errors: window.__safariErrors
    }`)
    throw new Error(`Timed out waiting for: ${script}\nBrowser state: ${JSON.stringify(state)}`)
  }
  const arranging = 'return [...document.querySelectorAll("[role=status]")].some(node => node.textContent === "Arranging production chain...")'

  try {
    console.log(`Native Safari ${session.capabilities.browserVersion}: ${url.href}`)
    await command(`${root}/window/rect`, 'POST', { width: 1280, height: 900 })
    await command(`${root}/url`, 'POST', { url: url.href })
    await waitFor('return document.querySelector("h1")?.textContent === "Factorio Recipe Visualizer"')
    await waitFor(`return ![...document.querySelectorAll('[role="status"]')]
      .some(node => node.textContent === 'Restoring saved preset...')`)
    await execute(`
      window.__safariErrors = [];
      addEventListener('error', event => window.__safariErrors.push(event.message || 'Resource load failed'), true);
      addEventListener('unhandledrejection', event => window.__safariErrors.push(String(event.reason)));
      const original = console.error;
      console.error = (...args) => {
        window.__safariErrors.push(args.map(String).join(' '));
        original.apply(console, args);
      };
      // Heartbeat: records the longest gap between timer ticks while a layout is pending.
      let last = performance.now();
      window.__resetStall = () => {
        last = performance.now();
        window.__stall = { arranging: 0, other: 0 };
      };
      window.__resetStall();
      setInterval(() => {
        const now = performance.now();
        const busy = [...document.querySelectorAll('[role=status]')].some(node => node.textContent === 'Arranging production chain...');
        const key = busy ? 'arranging' : 'other';
        window.__stall[key] = Math.max(window.__stall[key], now - last);
        last = now;
      }, 10);
    `)

    const importStart = Date.now()
    await execute(`
      const input = document.querySelector('input[type="file"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([arguments[0]], 'preset.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    `, [text])
    await waitFor('return !!document.querySelector(".preset-info")', 120_000)
    console.log(`Imported ${(text.length / 1e6).toFixed(1)} MB preset in ${Date.now() - importStart} ms.`)

    await execute(`
      const input = document.querySelector('#recipe-search');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, arguments[0]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const button = [...document.querySelectorAll('.recipe-list button')]
        .find(candidate => candidate.querySelector('small')?.textContent === arguments[0]);
      if (!button) throw new Error('Recipe button not found: ' + arguments[0]);
      button.click();
    `, [target.recipe])
    await waitFor(`return document.querySelector(".chain h2")?.textContent === ${JSON.stringify(preset.recipes.find(recipe => recipe.id === target.recipe)?.displayName)}`)

    // Expand the way a user would: pick the first producer for open choices and expand every
    // branch. Rounds follow each other without waiting for layout, so each round supersedes
    // (and cancels) the previous round's layout.
    let rounds = 0
    for (let idle = 0; idle < 2; rounds++) {
      assert.ok(rounds < target.rounds + 10, `Expansion did not settle after ${rounds} rounds`)
      const actions = await execute(`
        let actions = 0;
        for (const select of document.querySelectorAll('.producer-choice select')) {
          if (select.value || select.options.length < 2) continue;
          select.value = select.options[1].value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          actions++;
        }
        for (const button of document.querySelectorAll('.branch-controls button[aria-pressed="false"]')) {
          if (button.disabled) continue;
          button.click();
          actions++;
        }
        return actions;
      `) as number
      idle = actions ? 0 : idle + 1
      await delay(50)
    }
    console.log(`Expanded through the UI in ${rounds} rounds.`)

    // Re-run the final layout from a known start so the measurement covers one complete layout.
    await waitFor(`return !(${arranging.slice(7)})`, 120_000)
    // The clicks re-render the app synchronously (recipe list, chain, summary). Time them
    // separately and restart the heartbeat afterwards, so the stall measures layout only.
    const clickMs = await execute(`
      const start = performance.now();
      document.querySelector('.branch-controls button[aria-pressed="true"]').click();
      document.querySelector('.branch-controls button[aria-pressed="false"]').click();
      const end = performance.now();
      window.__resetStall();
      window.__layoutStart = end;
      return end - start;
    `) as number
    console.log(`Collapse and re-expand: ${Math.round(clickMs)} ms of synchronous React work (not layout).`)
    await waitFor(arranging, 5_000)

    // While the layout is pending, the page must keep handling input.
    const probeStart = Date.now()
    const filtered = await execute(`
      const input = document.querySelector('#recipe-search');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'probe');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { count: document.querySelectorAll('.recipe-list button').length, arranging: ${arranging.slice(7)} };
    `) as { count: number; arranging: boolean }
    const probeMs = Date.now() - probeStart
    assert.ok(filtered.count > 0, 'Search must filter the recipe list during layout')
    console.log(`Search input handled in ${probeMs} ms round trip ${filtered.arranging ? 'while the layout was still pending' : '(layout had already finished)'}.`)

    await waitFor(`return document.querySelectorAll(".react-flow__node").length === ${expected.nodes} &&
      document.querySelectorAll(".react-flow__edge").length === ${expected.edges}`, 120_000)
    const timing = await execute(`return { total: performance.now() - window.__layoutStart, stall: window.__stall }`) as {
      total: number; stall: { arranging: number; other: number }
    }
    console.log(`Layout and render: ${Math.round(timing.total)} ms. Longest main-thread stall while arranging: ${Math.round(timing.stall.arranging)} ms; otherwise (rendering): ${Math.round(timing.stall.other)} ms.`)
    assert.deepEqual(await execute('return [...document.querySelectorAll("[role=alert]")].map(node => node.textContent)'), [], 'No alerts')
    assert.deepEqual(await execute('return window.__safariErrors'), [], 'Captured browser errors')
    assert.ok(timing.stall.arranging <= MAX_ARRANGING_STALL_MS,
      `Main thread stalled ${Math.round(timing.stall.arranging)} ms while arranging (limit ${MAX_ARRANGING_STALL_MS} ms)`)
    console.log(`PASS: ${target.recipe} fully expanded to ${expected.nodes} nodes and ${expected.edges} edges in native Safari; input stayed responsive during layout.`)
  } finally {
    try {
      const error = await command(`${root}/execute/async`, 'POST', {
        script: `
          const done = arguments[arguments.length - 1];
          const request = indexedDB.deleteDatabase('factorio-recipe-visualizer');
          request.onsuccess = () => done(null);
          request.onerror = () => done(String(request.error));
          request.onblocked = () => done('Test storage cleanup was blocked.');
        `,
        args: [],
      })
      assert.equal(error, null, 'Remove saved test data')
    } finally {
      await command(root, 'DELETE')
    }
  }
}

main().catch((error: unknown) => {
  console.error(error)
  if (error instanceof Error && error.message.includes('session not created')) {
    console.error('Quit Safari normally, wait for it to exit, then retry so WebDriver launches it for automation.')
  }
  process.exitCode = 1
})
