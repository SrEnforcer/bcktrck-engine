import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { routeEdges, routeEdgesWithDiagnostics } from './route-edges'
import { mkRouteEdgesPlaced, mkRouteEdgesTree, mkSliceRenderConfig } from '../tests/factories/layout-slice'

const cfg = mkSliceRenderConfig()

describe('routeEdgesWithDiagnostics when all positions exist', () => {
  it('returns one routed edge and no diagnostics', () => {
    const result = routeEdgesWithDiagnostics({
      tree: mkRouteEdgesTree(undefined),
      placed: mkRouteEdgesPlaced({ root: { x: 0, y: 0 }, child: { x: 2, y: 2 } }),
      cfg,
      styleMap: undefined
    })

    expect(result.routes.length).toBe(1)
    expect(result.diagnostics.length).toBe(0)
    expect(result.routes[0]?.points.length).toBe(4)
  })
})

describe('routeEdgesWithDiagnostics when parent layout hint is hanging', () => {
  it('uses hanging route geometry', () => {
    const result = routeEdgesWithDiagnostics({
      tree: mkRouteEdgesTree('hanging'),
      placed: mkRouteEdgesPlaced({ root: { x: 0, y: 0 }, child: { x: 2, y: 2 } }),
      cfg,
      styleMap: undefined
    })

    expect(result.routes.length).toBe(1)
    expect(result.routes[0]?.points.length).toBe(3)
  })
})

describe('routeEdgesWithDiagnostics when child position is missing', () => {
  it('returns a missing_child_position diagnostic', () => {
    const result = routeEdgesWithDiagnostics({
      tree: mkRouteEdgesTree(undefined),
      placed: { rootId: 'root', positions: intoMap([['root', { x: 0, y: 0 }]]) },
      cfg,
      styleMap: undefined
    })

    expect(result.routes.length).toBe(0)
    expect(result.diagnostics.some((diagnostic) => diagnostic.kind === 'missing_child_position')).toBe(true)
  })
})

describe('routeEdgesWithDiagnostics when parent position is missing', () => {
  it('returns a missing_parent_position diagnostic', () => {
    const result = routeEdgesWithDiagnostics({
      tree: mkRouteEdgesTree(undefined),
      placed: { rootId: 'root', positions: intoMap([['child', { x: 2, y: 2 }]]) },
      cfg,
      styleMap: undefined
    })

    expect(result.routes.length).toBe(0)
    expect(result.diagnostics.some((diagnostic) => diagnostic.kind === 'missing_parent_position')).toBe(true)
  })
})

describe('routeEdges when style map contains edge overrides', () => {
  it('applies edgeStyle and edgeWidth to output routes', () => {
    const result = routeEdges({
      tree: mkRouteEdgesTree(undefined),
      placed: mkRouteEdgesPlaced({ root: { x: 0, y: 0 }, child: { x: 2, y: 2 } }),
      cfg,
      styleMap: intoMap([
        ['child', { edgeStyle: 'dashed', edgeWidth: 2 }]
      ])
    })

    expect(result.length).toBe(1)
    expect(result[0]?.edgeStyle).toBe('dashed')
    expect(result[0]?.edgeWidth).toBe(2)
  })
})