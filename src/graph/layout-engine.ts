import ELK from 'elkjs/lib/elk-api.js'
import type { ELK as ElkApi, ElkNode } from 'elkjs/lib/elk-api'
// ELK's GWT worker build is a classic worker script; Vite emits it unchanged as an asset.
import workerUrl from 'elkjs/lib/elk-worker.min.js?url'

export class LayoutCancelled extends Error {
  constructor() {
    super('Layout was cancelled.')
    this.name = 'LayoutCancelled'
  }
}

export type LayoutJob = {
  promise: Promise<ElkNode>
  /** Stops the job. A running layout cannot be interrupted, so its worker is terminated. */
  cancel: () => void
}

type Engine = {
  elk: ElkApi
  pending: Set<(error: Error) => void>
}

let current: Engine | undefined

function dispose(engine: Engine, error: Error) {
  if (current === engine) current = undefined
  engine.elk.terminateWorker()
  for (const reject of engine.pending) reject(error)
  engine.pending.clear()
}

function createEngine(): Engine {
  const engine = { pending: new Set() } as Engine
  engine.elk = new ELK({
    workerFactory: () => {
      const worker = new Worker(workerUrl)
      // elk-api only listens for messages, so a worker that fails to load or crashes
      // would leave its layouts pending forever. Reject them instead.
      worker.addEventListener('error', event => {
        event.preventDefault()
        dispose(engine, new Error(`Layout worker failed: ${event.message || 'the worker script could not be loaded'}`))
      })
      worker.addEventListener('messageerror', () => dispose(engine, new Error('Layout worker sent an unreadable message.')))
      return worker
    },
  })
  return engine
}

export function layoutGraph(graph: ElkNode): LayoutJob {
  const engine = current ??= createEngine()
  let settled = false
  const promise = new Promise<ElkNode>((resolve, reject) => {
    // Mark the job settled in the same callback that settles it, so a cancel() issued
    // right after the result arrives never terminates a healthy worker.
    const finish = () => {
      settled = true
      engine.pending.delete(fail)
    }
    const fail = (error: Error) => {
      finish()
      reject(error)
    }
    engine.pending.add(fail)
    engine.elk.layout(graph).then(result => {
      finish()
      resolve(result)
    }, fail)
  })
  return {
    promise,
    cancel() {
      if (!settled) dispose(engine, new LayoutCancelled())
    },
  }
}
