import { useEffect, useState } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider, Position } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import type { ProductionChain } from './production'
import { NODE_HEIGHT, NODE_WIDTH, nodePositions, toElkGraph } from './layout'
import { LayoutCancelled, layoutGraph } from './layout-engine'
import { ItemIcon } from '../ItemIcon'
import '@xyflow/react/dist/style.css'

export function ProductionGraph({ chain, onInspect }: {
  chain: ProductionChain
  onInspect: (id: string) => void
}) {
  const [layout, setLayout] = useState<{ chain: ProductionChain; version: number; nodes: Node[]; edges: Edge[] }>()
  const [error, setError] = useState<{ chain: ProductionChain; message: string }>()

  useEffect(() => {
    let active = true
    // Layout runs in a worker. When the chain changes first, the stale job is cancelled
    // so a long layout does not delay the next one.
    const job = layoutGraph(toElkGraph(chain))
    job.promise.then(result => {
      if (!active) return
      const positions = nodePositions(chain, result)
      setLayout(previous => ({
        chain,
        version: (previous?.version ?? 0) + 1,
        nodes: chain.nodes.map(node => ({
          id: node.id,
          data: { label: <><ItemIcon src={node.icon} /><span>{node.label}<small>{{
            recipe: 'Recipe', material: 'Material', output: 'Selected output', raw: 'Raw resource',
            choice: 'Choose a producer', unresolved: 'Unresolved input', collapsed: 'Expand branch',
            byproduct: 'Additional output',
          }[node.kind]}</small></span></> },
          position: positions.get(node.id)!,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: `chain-node ${node.kind}`,
          style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        })),
        edges: chain.edges.map(edge => ({
          ...edge,
          markerEnd: { type: 'arrowclosed' as const },
        })),
      }))
    }).catch((failure: unknown) => {
      if (active && !(failure instanceof LayoutCancelled)) setError({ chain, message: `Graph layout failed: ${failure instanceof Error ? failure.message : String(failure)}` })
    })
    return () => {
      active = false
      job.cancel()
    }
  }, [chain])

  if (error?.chain === chain) return <p role="alert">{error.message}</p>
  if (layout?.chain !== chain) return <p role="status">Arranging production chain...</p>
  return (
    <div className="graph" aria-label="Production chain">
      <ReactFlowProvider>
        <ReactFlow
          key={layout.version}
          defaultNodes={layout.nodes}
          defaultEdges={layout.edges}
          fitView
          minZoom={0.1}
          maxZoom={2}
          nodesConnectable={false}
          onNodeClick={(_event, node) => onInspect(node.id)}
          colorMode="dark"
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
