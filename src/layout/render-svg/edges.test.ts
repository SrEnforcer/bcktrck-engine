import { intoMap, intoSet, none, some } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { ResolvedStyleMap } from '../../style/dsl'
import type { EdgeRoute, IndexedTree, PlacedTree, PlacedStaff, RenderConfig } from '../types'
import { renderSolidEdges, renderStaffConnectors } from './edges'

const cfg: RenderConfig = {
  nodeSize: 1,
  staffSize: 0.6,
  colWidth: 80,
  rowHeight: 120,
  nodeBorder: '#000',
  employeeFill: '#e3f2fd',
  deptFill: '#fff3e0',
  vacancyFill: '#f3e5f5',
  edgeStroke: '#999',
  dottedEdgeStroke: '#aaa',
  shadowOffsetX: 0.75,
  shadowOffsetY: -0.75,
  shadowOpacity: 0.55,
  shadowDashArray: '3 3',
  shadowFontScale: 1,
  fontSize: 12,
  fontFamily: 'Arial',
  showSubordinateCount: false,
  subordinateCountIncludeVacancies: false,
  subordinateCountBadgeFill: '#999',
  subordinateCountBadgeText: '#ffffff',
  subordinateCountBadgeFontScale: 0.75
}

const tree: IndexedTree = {
  rootId: 'root',
  nodes: intoMap([
    ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: none, childIndex: 0, children: ['child'], staffLeft: ['staff-l'], staffRight: ['staff-r'] }],
    ['child', { id: 'child', kind: 'employee', label: 'Child', depth: 1, parentId: some('root'), childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
  ])
}

const placed: PlacedTree = {
  rootId: 'root',
  positions: intoMap([
    ['root', { x: 0, y: 0 }],
    ['child', { x: 0, y: 1 }]
  ])
}

describe('renderStaffConnectors', () => {
  it('branches from the trunk centerline when a staff node sits below the parent center', () => {
    const branchStaff: PlacedStaff = {
      staff: [
        { id: 'staff-l', label: 'L', x: -1, y: 0.5, side: 'left' },
        { id: 'staff-r', label: 'R', x: 1, y: 0.5, side: 'right' }
      ]
    }

    const result = renderStaffConnectors({ tree, placed, staff: branchStaff, cfg, safeCfg: cfg })
    const all = result.elements.join(' ')

    expect(result.elements.length).toBe(2)
    expect(all.includes('class="staff-edge"')).toBe(true)
    expect(all.includes('x1="40" y1="96"')).toBe(true)
    expect(all.includes('x1="0" y1="96"')).toBe(false)
    expect(all.includes('x1="80" y1="96"')).toBe(false)
  })

  it('chains multiple right-side staff connectors to avoid passing through nearer staff boxes', () => {
    const multiTree: IndexedTree = {
      rootId: 'root',
      nodes: intoMap([
        ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: none, childIndex: 0, children: [], staffLeft: [], staffRight: ['staff-r', 'staff-r2'] }]
      ])
    }
    const multiStaff: PlacedStaff = {
      staff: [
        { id: 'staff-r', label: 'R1', x: 1.05, y: 0.2, side: 'right' },
        { id: 'staff-r2', label: 'R2', x: 2.1, y: 0.2, side: 'right' }
      ]
    }

    const result = renderStaffConnectors({ tree: multiTree, placed, staff: multiStaff, cfg, safeCfg: cfg })
    const all = result.elements.join(' ')

    expect(all.includes('x1="80" y1="60" x2="168" y2="60"')).toBe(false)
    expect(all.includes('x1="132" y1="60" x2="168" y2="60"')).toBe(true)
  })
})

describe('renderSolidEdges', () => {
  it('renders routed polyline edges and skips staff-shadow targets', () => {
    const routed: readonly EdgeRoute[] = [
      { fromId: 'root', toId: 'child', points: [{ x: 0.5, y: 1 }, { x: 0.5, y: 2 }], edgeStyle: 'dashed', edgeWidth: 3 },
      { fromId: 'root', toId: 'shadow-staff', points: [{ x: 1, y: 1 }, { x: 1, y: 2 }], edgeStyle: 'straight', edgeWidth: 2 }
    ]

    const result = renderSolidEdges({
      tree,
      placed,
      cfg,
      edgeRoutes: routed,
      styleMap: intoMap([]),
      safeCfg: cfg,
      staffShadowIds: intoSet(['shadow-staff'])
    })

    expect(result.elements.length).toBe(1)
    expect(result.elements[0]?.includes('class="edge"')).toBe(true)
  })

  it('falls back to tree parent-child edges when no routes are provided', () => {
    const styleMap: ResolvedStyleMap = intoMap([
      ['child', { edgeStyle: 'dotted', edgeWidth: 4 }]
    ])
    const result = renderSolidEdges({
      tree,
      placed,
      cfg,
      edgeRoutes: [],
      styleMap,
      safeCfg: cfg,
      staffShadowIds: intoSet([])
    })

    expect(result.elements.length).toBe(1)
    expect(result.elements[0]?.includes('stroke-dasharray')).toBe(true)
  })
})
