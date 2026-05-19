import { isNone, isSome } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { asNodeId } from '../types/branded'
import type { OrgTree } from '../types/org-tree'
import { isolateSubtree, isolateSubtrees, isolateUpstreamSubtree, listSubtrees } from './subtree'
import { mkOrgDepartment, mkOrgEmployee } from '../tests/factories/org'

const sampleTree = (): OrgTree => {
  const engLead = mkOrgEmployee({ id: 'n-eng', title: 'Engineering Lead', children: [] })
  const ceo = mkOrgEmployee({ id: 'n-ceo', title: 'Chief Executive\nOfficer', children: [engLead] })
  const salesHead = mkOrgEmployee({ id: 'n-sales-head', title: 'Head of Sales', children: [] })
  const sales = mkOrgDepartment({ id: 'd-sales', name: 'Sales', head: 'n-sales-head', members: [salesHead] })
  return {
    root: mkOrgDepartment({ id: 'd-root', name: 'Company', head: 'n-ceo', members: [ceo, sales] }),
    dottedEdges: [
      { from: asNodeId('n-ceo'), to: asNodeId('n-eng') },
      { from: asNodeId('n-ceo'), to: asNodeId('n-outside') }
    ],
    shadowNodes: []
  }
}

const siblingDepartmentTree = (): OrgTree => {
  const alphaLead = mkOrgEmployee({ id: 'n-alpha-lead', title: 'Alpha Lead', children: [] })
  const betaLead = mkOrgEmployee({ id: 'n-beta-lead', title: 'Beta Lead', children: [] })
  const alpha = mkOrgDepartment({ id: 'd-alpha', name: 'Unit Alpha', head: 'n-alpha-lead', members: [alphaLead] })
  const beta = mkOrgDepartment({ id: 'd-beta', name: 'Unit Beta', head: 'n-beta-lead', members: [betaLead] })
  const manager = mkOrgEmployee({ id: 'n-manager', title: 'Shared Manager', children: [alpha, beta] })

  return {
    root: mkOrgDepartment({ id: 'd-root', name: 'Operations Cluster', head: 'n-manager', members: [manager] }),
    dottedEdges: [],
    shadowNodes: []
  }
}

describe('listSubtrees when traversing a mixed tree', () => {
  it('returns entries in pre-order with depth and label formatting', () => {
    const result = listSubtrees(sampleTree())

    expect(result).toEqual([
      { kind: 'department', id: 'd-root', label: 'Company', depth: 0 },
      { kind: 'employee', id: 'n-ceo', label: 'Chief Executive — Officer', depth: 1 },
      { kind: 'employee', id: 'n-eng', label: 'Engineering Lead', depth: 2 },
      { kind: 'department', id: 'd-sales', label: 'Sales', depth: 1 },
      { kind: 'employee', id: 'n-sales-head', label: 'Head of Sales', depth: 2 }
    ])
  })
})

describe('isolateSubtree when the id exists', () => {
  it('returns Some with filtered dotted edges', () => {
    const result = isolateSubtree(sampleTree(), 'n-ceo')

    expect(isSome(result)).toBe(true)
    expect(isSome(result) ? result.value.dottedEdges.length : 0).toBe(1)
  })
})

describe('isolateSubtree when the id does not exist', () => {
  it('returns None when the requested subtree id is missing', () => {
    const result = isolateSubtree(sampleTree(), 'missing')

    expect(isNone(result)).toBe(true)
  })
})

describe('isolateSubtrees when every requested id is unknown', () => {
  it('returns None', () => {
    const result = isolateSubtrees(sampleTree(), ['missing-a', 'missing-b'])

    expect(isNone(result)).toBe(true)
  })
})

describe('isolateSubtrees when one id is valid and one is unknown', () => {
  it('returns Some and ignores unknown ids', () => {
    const result = isolateSubtrees(sampleTree(), ['n-ceo', 'missing'])

    expect(isSome(result)).toBe(true)
  })
})

describe('isolateSubtrees when ancestor and descendant ids are both selected', () => {
  it('prunes descendant selections and keeps the ancestor subtree root', () => {
    const result = isolateSubtrees(sampleTree(), ['n-ceo', 'n-eng'])

    expect(isSome(result)).toBe(true)
    expect(isSome(result) ? result.value.root.id : asNodeId('missing')).toBe(asNodeId('n-ceo'))
  })
})

describe('isolateSubtrees when multiple top-level roots are selected under a department root', () => {
  it('returns Some with a department root that keeps selected members', () => {
    const result = isolateSubtrees(sampleTree(), ['n-ceo', 'd-sales'])
    const memberCount = isSome(result) && result.value.root.kind === 'department'
      ? result.value.root.members.length
      : 0

    expect(isSome(result)).toBe(true)
    expect(isSome(result) ? result.value.root.kind : 'employee').toBe('department')
    expect(memberCount).toBe(2)
  })
})

describe('isolateSubtrees when selected nodes share a direct parent', () => {
  it('uses the shared parent as the isolated root', () => {
    const result = isolateSubtrees(siblingDepartmentTree(), ['d-alpha', 'd-beta'])

    expect(isSome(result)).toBe(true)
    expect(isSome(result) ? result.value.root.id : asNodeId('missing')).toBe(asNodeId('n-manager'))
    expect(isSome(result) && result.value.root.kind === 'employee' ? result.value.root.children.length : 0).toBe(2)
  })
})

describe('isolateUpstreamSubtree when the id exists', () => {
  it('returns a root-to-target chain with only upstream managers', () => {
    const result = isolateUpstreamSubtree(sampleTree(), 'n-eng')

    expect(isSome(result)).toBe(true)
    expect(isSome(result) ? result.value.root.id : asNodeId('missing')).toBe(asNodeId('d-root'))
    expect(isSome(result) && result.value.root.kind === 'department' ? result.value.root.members.length : 0).toBe(1)
    expect(
      isSome(result) &&
      result.value.root.kind === 'department' &&
      result.value.root.members[0]?.kind === 'employee'
        ? result.value.root.members[0].id
        : asNodeId('missing')
    ).toBe(asNodeId('n-ceo'))
  })
})

describe('isolateUpstreamSubtree when the id is unknown', () => {
  it('returns None', () => {
    const result = isolateUpstreamSubtree(sampleTree(), 'missing')

    expect(isNone(result)).toBe(true)
  })
})