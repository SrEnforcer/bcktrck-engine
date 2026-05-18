import { fromNullable, getOrElse } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { placeStaff } from './staff-placement'
import {
  mkPlacedFromEntries,
  mkStaffPlacementPlaced,
  mkStaffPlacementTree
} from '../tests/factories/layout-slice'

describe('placeStaff when parent position exists', () => {
  it('places left and right staff around parent center', () => {
    const result = placeStaff(mkStaffPlacementTree(), mkStaffPlacementPlaced(), { staffSize: 0.6, nodeSize: 1 })
    const left = result.staff.find((entry) => entry.id === 'left-a')
    const right = result.staff.find((entry) => entry.id === 'right-a')

    expect(left).toBeDefined()
    expect(right).toBeDefined()
    const leftX = getOrElse<number>(() => 1)(fromNullable(left?.x))
    const rightX = getOrElse<number>(() => 0)(fromNullable(right?.x))

    expect(leftX < 0.5).toBe(true)
    expect(rightX > 0.5).toBe(true)
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