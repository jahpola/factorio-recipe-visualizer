import type { ElkNode } from 'elkjs/lib/elk-api'
import type { ProductionChain } from './production'

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 110

export function toElkGraph(chain: ProductionChain): ElkNode {
  return {
    id: 'production',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '35',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
    },
    children: chain.nodes.map(node => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: chain.edges.map(edge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  }
}

export function nodePositions(chain: ProductionChain, result: ElkNode): Map<string, { x: number; y: number }> {
  const laidOut = new Map(result.children?.map(node => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
  const missing = chain.nodes.filter(node => !laidOut.has(node.id)).map(node => node.id)
  if (missing.length) throw new Error(`Layout result is missing ${missing.length} node(s): ${missing.slice(0, 3).join(', ')}`)
  return laidOut
}
