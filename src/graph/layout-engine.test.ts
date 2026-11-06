import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ElkNode } from 'elkjs/lib/elk-api'

type Message = { id: number; cmd: string; graph?: ElkNode }

// Speaks elk-api's worker protocol. Layout requests are held until the test answers them.
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  layouts: Message[] = []
  terminated = false
  readonly url: string
  constructor(url: string) {
    super()
    this.url = url
    FakeWorker.instances.push(this)
  }
  postMessage(message: Message) {
    if (message.cmd === 'layout') this.layouts.push(message)
    else this.reply({ id: message.id, data: null })
  }
  terminate() {
    this.terminated = true
  }
  answer(index = 0) {
    const message = this.layouts[index]
    this.reply({ id: message.id, data: { ...message.graph, children: message.graph?.children?.map(node => ({ ...node, x: 1, y: 2 })) } })
  }
  fail(message: string) {
    const event = new Event('error', { cancelable: true })
    Object.assign(event, { message })
    this.dispatchEvent(event)
  }
  private reply(data: unknown) {
    queueMicrotask(() => this.onmessage?.({ data }))
  }
}

const graph: ElkNode = { id: 'production', children: [{ id: 'item:ore', width: 200, height: 110 }], edges: [] }

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

async function settled(promise: Promise<unknown>) {
  return promise.then(value => ({ value }), (error: unknown) => ({ error }))
}

test('lays out in a worker and reuses it for later jobs', async () => {
  const { layoutGraph } = await import('./layout-engine')
  const job = layoutGraph(graph)
  const worker = FakeWorker.instances[0]
  await vi.waitFor(() => expect(worker.layouts).toHaveLength(1))
  worker.answer()
  expect((await job.promise).children?.[0]).toMatchObject({ id: 'item:ore', x: 1, y: 2 })
  job.cancel()
  expect(worker.terminated).toBe(false)
  layoutGraph(graph)
  expect(FakeWorker.instances).toHaveLength(1)
})

test('cancelling a running job terminates its worker and starts a fresh one next time', async () => {
  const { LayoutCancelled, layoutGraph } = await import('./layout-engine')
  const stale = layoutGraph(graph)
  const first = FakeWorker.instances[0]
  stale.cancel()
  expect(first.terminated).toBe(true)
  expect((await settled(stale.promise) as { error: unknown }).error).toBeInstanceOf(LayoutCancelled)

  const next = layoutGraph(graph)
  const second = FakeWorker.instances[1]
  expect(second).toBeDefined()
  await vi.waitFor(() => expect(second.layouts).toHaveLength(1))
  second.answer()
  await expect(next.promise).resolves.toMatchObject({ id: 'production' })
})

test('a worker that fails to load rejects pending jobs instead of hanging', async () => {
  const { layoutGraph } = await import('./layout-engine')
  const job = layoutGraph(graph)
  FakeWorker.instances[0].fail('Not found')
  await expect(job.promise).rejects.toThrow('Layout worker failed: Not found')
  expect(FakeWorker.instances[0].terminated).toBe(true)
  layoutGraph(graph)
  expect(FakeWorker.instances).toHaveLength(2)
})
