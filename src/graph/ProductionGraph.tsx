import { useEffect, useState } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider, Position } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ProductionChain } from './production'
import { ItemIcon } from '../ItemIcon'
import '@xyflow/react/dist/style.css'

const elk = new ELK()

export function ProductionGraph({ chain, onInspect }: {
  chain: ProductionChain
  onInspect: (id: string) => void
}) {
  const [layout, setLayout] = useState<{ chain: ProductionChain; version: number; nodes: Node[]; edges: Edge[] }>()
  const [error, setError] = useState<{ chain: ProductionChain; message: string }>()

  useEffect(() => {
    let active = true
    elk.layout({
      id: 'production',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '35',
        'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      },
      children: chain.nodes.map(node => ({ id: node.id, width: 200, height: 110 })),
      edges: chain.edges.map(edge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    }).then(result => {
      if (!active) return
      const positions = new Map(result.children?.map(node => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
      setLayout(previous => ({
        chain,
        version: (previous?.version ?? 0) + 1,
        nodes: chain.nodes.map(node => ({
          id: node.id,
          data: { label: <><ItemIcon src={node.icon} /><span>{node.label}<small>{{
            recipe: 'Recipe', material: 'Material', output: 'Selected output', raw: 'Raw resource',
            choice: 'Choose a producer', unresolved: 'Unresolved input',
          }[node.kind]}</small></span></> },
          position: positions.get(node.id)!,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: `chain-node ${node.kind}`,
          style: { width: 200, height: 110 },
        })),
        edges: chain.edges.map(edge => ({
          ...edge,
          markerEnd: { type: 'arrowclosed' as const },
        })),
      }))
    }).catch((failure: unknown) => {
      if (active) setError({ chain, message: `Graph layout failed: ${failure instanceof Error ? failure.message : String(failure)}` })
    })
    return () => { active = false }
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
