// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ElkNode } from 'elkjs/lib/elk-api'
import type { ProductionChain } from './production'

const jobs: { graph: ElkNode; resolve: (result: ElkNode) => void; reject: (error: Error) => void; cancel: ReturnType<typeof vi.fn> }[] = []

vi.mock('./layout-engine', () => {
  class LayoutCancelled extends Error {
    constructor() {
      super('cancelled')
    }
  }
  return {
    LayoutCancelled,
    layoutGraph: (graph: ElkNode) => {
      let resolve!: (result: ElkNode) => void
      let reject!: (error: Error) => void
      const promise = new Promise<ElkNode>((onResolve, onReject) => {
        resolve = onResolve
        reject = onReject
      })
      const cancel = vi.fn(() => reject(new LayoutCancelled()))
      jobs.push({ graph, resolve, reject, cancel })
      return { promise, cancel }
    },
  }
})

const { ProductionGraph } = await import('./ProductionGraph')
const { LayoutCancelled } = await import('./layout-engine')

function chain(...ids: string[]): ProductionChain {
  return {
    nodes: ids.map(id => ({ id, label: id, kind: 'material' })),
    edges: [], choices: [], branches: [], warnings: [],
  }
}
function laidOut(job: (typeof jobs)[number]): ElkNode {
  return { ...job.graph, children: job.graph.children?.map((node, index) => ({ ...node, x: index * 300, y: 0 })) }
}

beforeEach(() => {
  jobs.length = 0
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('shows a status while arranging, then renders the laid-out graph', async () => {
  render(<ProductionGraph chain={chain('item:ore', 'item:plate')} onInspect={() => {}} />)
  expect(screen.getByRole('status').textContent).toContain('Arranging')
  await act(async () => jobs[0].resolve(laidOut(jobs[0])))
  expect(screen.getByLabelText('Production chain')).toBeDefined()
  expect(screen.queryByRole('status')).toBeNull()
})

test('cancels a stale layout when the chain changes and ignores its late result', async () => {
  const { rerender } = render(<ProductionGraph chain={chain('item:ore')} onInspect={() => {}} />)
  rerender(<ProductionGraph chain={chain('item:ore', 'item:plate')} onInspect={() => {}} />)
  expect(jobs).toHaveLength(2)
  expect(jobs[0].cancel).toHaveBeenCalledOnce()
  await act(async () => jobs[0].resolve(laidOut(jobs[0])))
  expect(screen.getByRole('status').textContent).toContain('Arranging')
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => jobs[1].resolve(laidOut(jobs[1])))
  expect(screen.getByLabelText('Production chain')).toBeDefined()
})

test('cancels the running layout on unmount', () => {
  const { unmount } = render(<ProductionGraph chain={chain('item:ore')} onInspect={() => {}} />)
  unmount()
  expect(jobs[0].cancel).toHaveBeenCalledOnce()
})

test('reports layout failures but not cancellations', async () => {
  render(<ProductionGraph chain={chain('item:ore')} onInspect={() => {}} />)
  await act(async () => jobs[0].reject(new LayoutCancelled()))
  expect(screen.queryByRole('alert')).toBeNull()
  cleanup()
  render(<ProductionGraph chain={chain('item:ore')} onInspect={() => {}} />)
  await act(async () => jobs[1].reject(new Error('Layout worker failed: Not found')))
  expect(screen.getByRole('alert').textContent).toBe('Graph layout failed: Layout worker failed: Not found')
})

test('reports a layout result that is missing nodes', async () => {
  render(<ProductionGraph chain={chain('item:ore', 'item:plate')} onInspect={() => {}} />)
  await act(async () => jobs[0].resolve({ id: 'production', children: [{ id: 'item:ore', x: 0, y: 0 }] }))
  expect(screen.getByRole('alert').textContent).toContain('Layout result is missing 1 node(s): item:plate')
})
