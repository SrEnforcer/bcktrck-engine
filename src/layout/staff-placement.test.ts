import { fromNullable, getOrElse, intoMap, none, some } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { placeStaff } from './staff-placement'
import type { IndexedTree, PlacedTree } from './types'
import {
  mkPlacedFromEntries,
  mkStaffPlacementPlaced,
  mkStaffPlacementTree
} from '../tests/factories/layout-slice'

const mkMidGapStaffTree = (): IndexedTree => ({
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
      staffLeft: ['left-a'],
      staffRight: ['right-a']
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
    }]
  ]),
  staffLabels: intoMap([
    ['left-a', 'Left A']
  ])
})

const mkMidGapStaffPlaced = (): PlacedTree => mkPlacedFromEntries([
  ['root', { x: 0, y: 0 }],
  ['child', { x: 0, y: 1 }]
])

describe('placeStaff when parent position exists', () => {
  it('places left and right staff midway toward the first child when vertical gap exists', () => {
    const tree = mkMidGapStaffTree()
    const placed = mkMidGapStaffPlaced()

    const result = placeStaff(tree, placed, { staffSize: 0.6, nodeSize: 0.68 })
    const left = result.staff.find((entry) => entry.id === 'left-a')
    const right = result.staff.find((entry) => entry.id === 'right-a')

    expect(left).toBeDefined()
    expect(right).toBeDefined()
    const leftX = getOrElse<number>(() => 1)(fromNullable(left?.x))
    const leftY = getOrElse<number>(() => 0)(fromNullable(left?.y))
    const rightX = getOrElse<number>(() => 0)(fromNullable(right?.x))
    const rightY = getOrElse<number>(() => 0)(fromNullable(right?.y))

    expect(leftX < 0.34).toBe(true)
    expect(rightX > 0.34).toBe(true)
    expect(leftY).toBeCloseTo(0.54)
    expect(rightY).toBeCloseTo(0.54)
  })
})

describe('placeStaff when left side has multiple staff entries', () => {
  it('reverses left order so nearest left staff is the last declared entry', () => {
    const result = placeStaff(mkStaffPlacementTree(), mkStaffPlacementPlaced())
    const leftStaff = result.staff.filter((entry) => entry.side === 'left')

    expect(leftStaff[0]?.id).toBe('left-b')
    expect(leftStaff[1]?.id).toBe('left-a')
  })
})

describe('placeStaff when label is missing from staffLabels map', () => {
  it('falls back to staff id as label', () => {
    const result = placeStaff(mkStaffPlacementTree(), mkStaffPlacementPlaced())
    const fallback = result.staff.find((entry) => entry.id === 'right-a')

    expect(fallback?.label).toBe('right-a')
  })
})

describe('placeStaff when parent node position is missing', () => {
  it('returns no staff positions for that node', () => {
    const tree = mkStaffPlacementTree()
    const placed = mkPlacedFromEntries([])

    const result = placeStaff(tree, placed)

    expect(result.staff.length).toBe(0)
  })
})