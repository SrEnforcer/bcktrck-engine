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

const staff: PlacedStaff = {
  staff: [
    { id: 'staff-l', label: 'L', x: -1, y: 0, side: 'left' },
    { id: 'staff-r', label: 'R', x: 1, y: 0, side: 'right' }
  ]
}

describe('renderStaffConnectors', () => {
  it('renders connector lines for left and right staff nodes', () => {
    const result = renderStaffConnectors({ tree, placed, staff, cfg, safeCfg: cfg })

    expect(result.elements.length).toBe(2)
    expect(result.elements.join('').includes('class="staff-edge"')).toBe(true)
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
