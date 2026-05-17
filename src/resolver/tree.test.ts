import { describe, expect, it } from 'vitest'
import { collectNodes } from './tree'
import { mkResolverNode } from '../tests/factories/resolver-slice'

describe('collectNodes when the node has nested children and staff nodes', () => {
  it('returns a pre-order flattened list including staff branches', () => {
    const grandchild = mkResolverNode('employee', { displayName: 'Grandchild' })
    const child = mkResolverNode('employee', { displayName: 'Child', children: [grandchild] })
    const staff = mkResolverNode('employee', { displayName: 'Staff' })
    const root = mkResolverNode('employee', { displayName: 'Root', children: [child], staffNodes: [staff] })

    const result = collectNodes(root)

    expect(result.map((node) => node.displayName)).toEqual(['Root', 'Child', 'Grandchild', 'Staff'])
  })
})

describe('collectNodes when the node has no descendants', () => {
  it('returns an array containing only the root node', () => {
    const root = mkResolverNode('employee', { displayName: 'Solo' })

    const result = collectNodes(root)

    expect(result).toEqual([root])
  })
})