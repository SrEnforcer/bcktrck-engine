import { some } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { OrgNode, OrgTree } from '../types/org-tree'
import { indexTree } from './index-tree'
import {
  mkIndexTreeDepartment,
  mkIndexTreeEmployee,
  mkSimpleOrgTree
} from '../tests/factories/layout-slice'
import { asNodeId } from '../types/branded'

describe('indexTree when tree contains employees with staff', () => {
  it('indexes children, staff sides, and staff labels', () => {
    const child = mkIndexTreeEmployee({ id: 'eng', title: 'Engineer' })
    const root = mkIndexTreeEmployee({ id: 'ceo', title: 'Chief Executive', children: [child], staff: [
      { id: 'advisor-l', side: 'left', label: 'Advisor Left' },
      { id: 'advisor-r', side: 'right', label: 'Advisor Right' }
    ] })
    const tree: OrgTree = mkSimpleOrgTree(root)

    const result = indexTree(tree)
    const indexedRoot = result.nodes.get('ceo')

    expect(result.rootId).toBe('ceo')
    expect(indexedRoot?.children[0]).toBe('eng')
    expect(indexedRoot?.staffLeft[0]).toBe('advisor-l')
    expect(indexedRoot?.staffRight[0]).toBe('advisor-r')
    expect(result.staffLabels?.get('advisor-l')).toBe('Advisor Left')
  })
})

describe('indexTree when root is a department with nested vacancy member', () => {
  it('indexes department and vacancy node kinds with parent/depth metadata', () => {
    const vacancy: OrgNode = {
      kind: 'vacancy',
      id: asNodeId('vac-open'),
      meta: { title: 'Open Role' },
      children: []
    }
    const dept = mkIndexTreeDepartment('dept-1', 'Platform', [vacancy])
    const tree: OrgTree = mkSimpleOrgTree(dept)

    const result = indexTree(tree)
    const root = result.nodes.get('dept-1')
    const indexedVacancy = result.nodes.get('vac-open')

    expect(root?.kind).toBe('department')
    expect(indexedVacancy?.kind).toBe('vacancy')
    expect(indexedVacancy?.parentId).toEqual(some('dept-1'))
    expect(indexedVacancy?.depth).toBe(1)
  })
})

describe('indexTree when node has layout and triangle hints', () => {
  it('preserves layoutHint, hangingSide, and triangleEffect in indexed node', () => {
    const root: OrgNode = {
      kind: 'employee',
      id: asNodeId('ceo'),
      meta: { title: 'Chief Executive' },
      layoutHint: 'hanging',
      hangingSide: 'left',
      triangleEffect: { color: '#ff0000' },
      children: [],
      staff: []
    }
    const tree: OrgTree = mkSimpleOrgTree(root)

    const result = indexTree(tree)
    const indexedRoot = result.nodes.get('ceo')

    expect(indexedRoot?.layoutHint).toBe('hanging')
    expect(indexedRoot?.hangingSide).toBe('left')
    expect(indexedRoot?.triangleEffect?.color).toBe('#ff0000')
  })
})