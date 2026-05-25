import { intoMap, intoSet, none } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { RenderConfig } from '../types'
import { buildStaffParentLookup, renderNodeBodies, renderStaffBodies } from './nodes'

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

const tree = {
  rootId: 'root',
  nodes: intoMap([
    ['root', {
      id: 'root',
      kind: 'employee' as const,
      label: 'Root',
      depth: 0,
      parentId: none,
      childIndex: 0,
      children: [],
      staffLeft: ['staff-left'],
      staffRight: ['staff-right']
    }]
  ])
}

const placed = {
  rootId: 'root',
  positions: intoMap([
    ['root', { x: 0, y: 0 }]
  ])
}

const staff = {
  staff: [
    { id: 'staff-left', label: 'Assistant L', x: -1, y: 0, side: 'left' as const },
    { id: 'staff-right', label: 'Assistant R', x: 1, y: 0, side: 'right' as const }
  ]
}

describe('buildStaffParentLookup', () => {
  it('maps staff ids to their parent node id', () => {
    const lookup = buildStaffParentLookup(tree)

    expect(lookup['staff-left']).toBe('root')
    expect(lookup['staff-right']).toBe('root')
  })
})

describe('renderNodeBodies', () => {
  it('renders node body elements for non-shadow nodes with positions', () => {
    const result = renderNodeBodies({
      tree,
      placed,
      cfg,
      safeCfg: cfg,
      styleMap: intoMap([]),
      textStyles: { nodeName: {}, nodeTitle: {} },
      iconMap: intoMap([]),
      shadowIds: intoSet([])
    })

    expect(result.elements.length > 0).toBe(true)
    expect(result.elements.join('').includes('class="node"')).toBe(true)
  })
})

describe('renderStaffBodies', () => {
  it('renders staff body elements and uses parent lookup fallback style path', () => {
    const result = renderStaffBodies({
      staff,
      cfg,
      safeCfg: cfg,
      styleMap: intoMap([]),
      textStyles: { nodeName: {}, nodeTitle: {} },
      iconMap: intoMap([]),
      staffParentLookup: buildStaffParentLookup(tree)
    })

    expect(result.elements.length > 0).toBe(true)
    expect(result.elements.join('').includes('class="staff"')).toBe(true)
  })
})