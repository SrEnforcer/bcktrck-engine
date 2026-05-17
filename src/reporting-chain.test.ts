import { describe, expect, it } from 'vitest'
import { asDeptId, asNodeId } from './types/branded'
import type { OrgTree } from './types/org-tree'
import { computeAltChain, computeReportingChain, computeVerticalPath } from './reporting-chain'

const nCeo = asNodeId('ceo')
const nMgr = asNodeId('mgr')
const nWorker = asNodeId('worker')
const nAlt = asNodeId('alt')
const dOps = asDeptId('ops')

const tree: OrgTree = {
  root: {
    kind: 'employee',
    id: nCeo,
    meta: { title: 'CEO' },
    children: [
      {
        kind: 'department',
        id: dOps,
        name: 'Operations',
        head: nMgr,
        members: [
          {
            kind: 'employee',
            id: nMgr,
            meta: { title: 'Manager' },
            children: [
              {
                kind: 'employee',
                id: nWorker,
                meta: { title: 'Analyst' },
                children: [],
                staff: []
              }
            ],
            staff: []
          }
        ]
      },
      {
        kind: 'employee',
        id: nAlt,
        meta: { title: 'Alt lead' },
        children: [],
        staff: []
      }
    ],
    staff: []
  },
  dottedEdges: [
    { from: nWorker, to: nAlt, kind: 'ovj' },
    { from: nAlt, to: nCeo, kind: 'ovj' },
    { from: nWorker, to: nMgr, kind: 'cycle' },
    { from: nMgr, to: nWorker, kind: 'cycle' }
  ],
  shadowNodes: []
}

describe('computeVerticalPath', () => {
  it('returns person and department ids from target to root', () => {
    const result = computeVerticalPath(tree, nWorker)

    expect(result).toEqual([nWorker, nMgr, dOps, nCeo])
  })
})

describe('computeReportingChain', () => {
  it('returns direct managerial chain for a person target', () => {
    const result = computeReportingChain(tree, nWorker)

    expect(result).toEqual([nWorker, nMgr, nCeo])
  })

  it('resolves department targets to their head before traversal', () => {
    const result = computeReportingChain(tree, dOps)

    expect(result).toEqual([nMgr, nCeo])
  })
})

describe('computeAltChain', () => {
  it('follows kind-filtered dotted edges as an alternate chain', () => {
    const result = computeAltChain(tree, nWorker, 'ovj')

    expect(result).toEqual([nWorker, nAlt, nCeo])
  })

  it('stops traversal when a visited-node cycle is detected', () => {
    const result = computeAltChain(tree, nWorker, 'cycle')

    expect(result).toEqual([nWorker, nMgr])
  })
})
