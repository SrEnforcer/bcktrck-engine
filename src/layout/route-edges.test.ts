import { intoMap, none, some } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { routeEdges, routeEdgesWithDiagnostics } from './route-edges'
import type { IndexedTree, PlacedStaff, PlacedTree } from './types'
import { asNodeId } from '../types/branded'
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

  it('keeps blocked default channels inside parent-child vertical span', () => {
    const tree: IndexedTree = {
      rootId: 'root',
      nodes: intoMap([
        ['root', {
          id: 'root',
          kind: 'employee',
          label: 'Root',
          depth: 0,
          parentId: none,
          childIndex: 0,
          children: ['child'],
          staffLeft: [],
          staffRight: []
        }],
        ['child', {
          id: 'child',
          kind: 'employee',
          label: 'Child',
          depth: 1,
          parentId: some('root'),
          childIndex: 0,
          children: [],
          staffLeft: [],
          staffRight: []
        }],
        ['blocker', {
          id: 'blocker',
          kind: 'employee',
          label: 'Blocker',
          depth: 1,
          parentId: none,
          childIndex: 0,
          children: [],
          staffLeft: [],
          staffRight: []
        }]
      ])
    }

    const placed: PlacedTree = {
      rootId: 'root',
      positions: intoMap([
        ['root', { x: 0, y: 0 }],
        ['child', { x: 2, y: 2 }],
        ['blocker', { x: 1, y: 1 }]
      ])
    }

    const result = routeEdgesWithDiagnostics({
      tree,
      placed,
      cfg,
      styleMap: undefined
    })

    const channelY = result.routes[0]?.points[1]?.y ?? 0
    expect(channelY > 1).toBe(true)
    expect(channelY < 2).toBe(true)
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

describe('routeEdgesWithDiagnostics when a staff box blocks the default channel', () => {
  it('selects a clear horizontal channel instead of crossing through staff', () => {
    const staff: PlacedStaff = {
      staff: [{ id: 'staff-blocker', label: 'Staff blocker', x: 1.1, y: 1.2, side: 'right' }]
    }

    const result = routeEdgesWithDiagnostics({
      tree: mkRouteEdgesTree(undefined),
      placed: mkRouteEdgesPlaced({ root: { x: 0, y: 0 }, child: { x: 2, y: 2 } }),
      staff,
      cfg,
      styleMap: undefined
    })

    const channelY = result.routes[0]?.points[1]?.y ?? 0
    // With staff blocking y=[1.2,1.8], mid=1.5 and near-parent candidates are
    // all blocked.  The router now prefers the near-child boundary (maxInterior
    // ≈ 1.95) over the near-parent boundary (minInterior ≈ 1.05), so the
    // horizontal trunk bar sits just above the children, not just below the parent.
    expect(channelY).toBeCloseTo(1.95)
  })

  it('uses one shared lowered channel for sibling edges when parent has staff', () => {
    const tree: IndexedTree = {
      rootId: 'root',
      nodes: intoMap([
        ['root', {
          id: 'root',
          kind: 'employee',
          label: 'Root',
          depth: 0,
          parentId: none,
          childIndex: 0,
          children: ['left-child', 'right-child'],
          staffLeft: [],
          staffRight: ['staff-blocker']
        }],
        ['left-child', {
          id: 'left-child',
          kind: 'employee',
          label: 'Left',
          depth: 1,
          parentId: some('root'),
          childIndex: 0,
          children: [],
          staffLeft: [],
          staffRight: []
        }],
        ['right-child', {
          id: 'right-child',
          kind: 'employee',
          label: 'Right',
          depth: 1,
          parentId: some('root'),
          childIndex: 1,
          children: [],
          staffLeft: [],
          staffRight: []
        }]
      ])
    }

    const placed: PlacedTree = {
      rootId: 'root',
      positions: intoMap([
        ['root', { x: 0, y: 0 }],
        ['left-child', { x: -2, y: 2 }],
        ['right-child', { x: 2, y: 2 }]
      ])
    }

    const staff: PlacedStaff = {
      staff: [{ id: 'staff-blocker', label: 'Staff blocker', x: 1.1, y: 1.2, side: 'right' }]
    }

    const result = routeEdgesWithDiagnostics({
      tree,
      placed,
      staff,
      cfg,
      styleMap: undefined
    })

    const leftRoute = result.routes.find((route) => route.toId === 'left-child')
    const rightRoute = result.routes.find((route) => route.toId === 'right-child')
    const leftChannelY = leftRoute?.points[1]?.y ?? 0
    const rightChannelY = rightRoute?.points[1]?.y ?? 0

    expect(result.diagnostics.length).toBe(0)
    expect(leftChannelY).toBeCloseTo(1.95)
    expect(rightChannelY).toBeCloseTo(1.95)
  })

  it('treats hosted staff shadows as routing obstacles', () => {
    const tree: IndexedTree = {
      rootId: 'root',
      nodes: intoMap([
        ['root', {
          id: 'root',
          kind: 'employee',
          label: 'Root',
          depth: 0,
          parentId: none,
          childIndex: 0,
          children: ['left-child', 'right-child'],
          staffLeft: [],
          staffRight: []
        }],
        ['left-child', {
          id: 'left-child',
          kind: 'employee',
          label: 'Left',
          depth: 1,
          parentId: some('root'),
          childIndex: 0,
          children: [],
          staffLeft: [],
          staffRight: []
        }],
        ['right-child', {
          id: 'right-child',
          kind: 'employee',
          label: 'Right',
          depth: 1,
          parentId: some('root'),
          childIndex: 1,
          children: [],
          staffLeft: [],
          staffRight: []
        }]
      ])
    }

    const placed: PlacedTree = {
      rootId: 'root',
      positions: intoMap([
        ['root', { x: 0, y: 0 }],
        ['left-child', { x: -2, y: 2 }],
        ['right-child', { x: 2, y: 2 }]
      ])
    }

    const result = routeEdgesWithDiagnostics({
      tree,
      placed,
      cfg,
      styleMap: undefined,
      shadowNodes: [{
        id: asNodeId('shadow-rob'),
        primary: asNodeId('primary-rob'),
        type: 'staff',
        host: asNodeId('root'),
        side: 'left'
      }]
    })

    const leftRoute = result.routes.find((route) => route.toId === 'left-child')
    const rightRoute = result.routes.find((route) => route.toId === 'right-child')
    const leftChannelY = leftRoute?.points[1]?.y ?? 0
    const rightChannelY = rightRoute?.points[1]?.y ?? 0

    expect(result.diagnostics.length).toBe(0)
    expect(leftChannelY).toBeCloseTo(1.95)
    expect(rightChannelY).toBeCloseTo(1.95)
  })

  it('keeps shared staff channel biased to deeper children in mixed-height siblings', () => {
    const tree: IndexedTree = {
      rootId: 'root',
      nodes: intoMap([
        ['root', {
          id: 'root',
          kind: 'employee',
          label: 'Root',
          depth: 0,
          parentId: none,
          childIndex: 0,
          children: ['left-child', 'right-child'],
          staffLeft: [],
          staffRight: []
        }],
        ['left-child', {
          id: 'left-child',
          kind: 'employee',
          label: 'Left',
          depth: 1,
          parentId: some('root'),
          childIndex: 0,
          children: [],
          staffLeft: [],
          staffRight: []
        }],
        ['right-child', {
          id: 'right-child',
          kind: 'employee',
          label: 'Right',
          depth: 1,
          parentId: some('root'),
          childIndex: 1,
          children: [],
          staffLeft: [],
          staffRight: []
        }]
      ])
    }

    const placed: PlacedTree = {
      rootId: 'root',
      positions: intoMap([
        ['root', { x: 0, y: 0 }],
        ['left-child', { x: -2, y: 2 }],
        ['right-child', { x: 2, y: 1 }]
      ])
    }

    const result = routeEdgesWithDiagnostics({
      tree,
      placed,
      cfg,
      styleMap: undefined,
      shadowNodes: [{
        id: asNodeId('shadow-rob'),
        primary: asNodeId('primary-rob'),
        type: 'staff',
        host: asNodeId('root'),
        side: 'left'
      }]
    })

    const leftRoute = result.routes.find((route) => route.toId === 'left-child')
    const rightRoute = result.routes.find((route) => route.toId === 'right-child')
    const leftChannelY = leftRoute?.points[1]?.y ?? 0
    const rightChannelY = rightRoute?.points[1]?.y ?? 0

    expect(result.diagnostics.length).toBe(0)
    expect(leftChannelY > 1.5).toBe(true)
    expect(rightChannelY > 1.5).toBe(true)
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