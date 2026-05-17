import { describe, expect, it } from 'vitest'
import { applyLayoutHints } from './apply-layout-hints'
import { mkApplyHintTree, mkPlacedFromEntries } from '../tests/factories/layout-slice'

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
    expect((a?.x ?? 0) > 0).toBe(true)
    expect((b?.x ?? 0) < 0).toBe(true)
  })
})