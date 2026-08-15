import { describe, expect, it } from 'vitest'
import { fromNullable, getOrElseOption, intoMap, none, some } from '@tsfpp/prelude'
import { applyLayoutHints } from './apply-layout-hints'
import type { IndexedTree, PlacedTree } from './types'
import { mkApplyHintTree, mkPlacedFromEntries } from '../tests/factories/layout-slice'

const mkStaffBranchTree = (): IndexedTree => ({
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
      staffRight: ['staff-a']
    }],
    ['child', {
      id: 'child',
      kind: 'employee',
      label: 'Child',
      depth: 1,
      parentId: some('root'),
      childIndex: 0,
      children: ['grandchild'],
      staffLeft: [],
      staffRight: []
    }],
    ['grandchild', {
      id: 'grandchild',
      kind: 'employee',
      label: 'Grandchild',
      depth: 2,
      parentId: some('child'),
      childIndex: 0,
      children: [],
      staffLeft: [],
      staffRight: []
    }]
  ])
})

const mkStaffBranchPlaced = (): PlacedTree => mkPlacedFromEntries([
  ['root', { x: 0, y: 0 }],
  ['child', { x: 0, y: 1 }],
  ['grandchild', { x: 0, y: 2 }]
])

describe('applyLayoutHints when no hanging hint exists', () => {
  it('returns unchanged positions', () => {
    const tree = mkApplyHintTree({ layoutHint: undefined, children: ['child'] })
    const placed = mkPlacedFromEntries([
      ['root', { x: 0, y: 0 }],
      ['child', { x: 0, y: 1 }]
    ])

    const result = applyLayoutHints(tree, placed)

    expect(result).toEqual(placed)
  })
})

describe('applyLayoutHints when root has hanging-right hint', () => {
  it('moves the child to the parent right lane', () => {
    const tree = mkApplyHintTree({ layoutHint: 'hanging-right', children: ['child'] })
    const placed = mkPlacedFromEntries([
      ['root', { x: 0, y: 0 }],
      ['child', { x: 0, y: 1 }]
    ])

    const result = applyLayoutHints(tree, placed)
    const child = result.positions.get('child')

    expect(child?.x).toBe(1)
    expect(child?.y).toBe(1)
  })
})

describe('applyLayoutHints when root has hanging-both hint with two children', () => {
  it('splits children to opposite sides of the parent', () => {
    const tree = mkApplyHintTree({ layoutHint: 'hanging-both', children: ['child-a', 'child-b'] })
    const placed = mkPlacedFromEntries([
      ['root', { x: 0, y: 0 }],
      ['child-a', { x: 0, y: 1 }],
      ['child-b', { x: 1, y: 1 }]
    ])

    const result = applyLayoutHints(tree, placed)
    const a = result.positions.get('child-a')
    const b = result.positions.get('child-b')

    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(getOrElseOption(() => 0)(fromNullable(a?.x)) > 0).toBe(true)
    expect(getOrElseOption(() => 0)(fromNullable(b?.x)) < 0).toBe(true)
  })
})

describe('applyLayoutHints when a parent has side staff and regular children', () => {
  it('shifts the entire child subtree down by one row', () => {
    const tree = mkStaffBranchTree()
    const placed = mkStaffBranchPlaced()

    const result = applyLayoutHints(tree, placed)

    expect(result.positions.get('child')?.y).toBe(2)
    expect(result.positions.get('grandchild')?.y).toBe(3)
  })
})

describe('applyLayoutHints when a parent hosts a staff shadow and regular children', () => {
  it('shifts the entire child subtree down by one row', () => {
    const tree = mkApplyHintTree({ layoutHint: undefined, children: ['child'] })
    const placed = mkPlacedFromEntries([
      ['root', { x: 0, y: 0 }],
      ['child', { x: 0, y: 1 }]
    ])

    const result = applyLayoutHints(tree, placed, { staffRowHostIds: ['root'] })

    expect(result.positions.get('child')?.y).toBe(2)
  })
})