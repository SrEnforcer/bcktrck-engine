import { fromNullable, getOrElse, intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { IndexedTree } from './types'
import { buchheim } from './buchheim'

const singleNodeTree = (): IndexedTree => ({
  rootId: 'root',
  nodes: intoMap([
    ['root', {
      id: 'root',
      kind: 'employee',
      label: 'Root',
      depth: 0,
      parentId: null,
      childIndex: 0,
      children: [],
      staffLeft: [],
      staffRight: []
    }]
  ])
})

const twoChildrenTree = (): IndexedTree => ({
  rootId: 'root',
  nodes: intoMap([
    ['root', {
      id: 'root',
      kind: 'employee',
      label: 'Root',
      depth: 0,
      parentId: null,
      childIndex: 0,
      children: ['a', 'b'],
      staffLeft: [],
      staffRight: []
    }],
    ['a', {
      id: 'a',
      kind: 'employee',
      label: 'A',
      depth: 1,
      parentId: 'root',
      childIndex: 0,
      children: [],
      staffLeft: [],
      staffRight: []
    }],
    ['b', {
      id: 'b',
      kind: 'employee',
      label: 'B',
      depth: 1,
      parentId: 'root',
      childIndex: 1,
      children: [],
      staffLeft: [],
      staffRight: []
    }]
  ])
})

describe('buchheim when tree has a single node', () => {
  it('places root at x=0 and y=depth', () => {
    const result = buchheim(singleNodeTree())
    const root = result.positions.get('root')

    expect(root?.x).toBe(0)
    expect(root?.y).toBe(0)
  })
})

describe('buchheim when root has two children', () => {
  it('positions siblings with increasing x and depth-preserving y', () => {
    const result = buchheim(twoChildrenTree())
    const left = result.positions.get('a')
    const right = result.positions.get('b')

    expect(left).toBeDefined()
    expect(right).toBeDefined()
    const leftX = getOrElse<number>(() => 0)(fromNullable(left?.x))
    const rightX = getOrElse<number>(() => 0)(fromNullable(right?.x))

    expect(leftX < rightX).toBe(true)
    expect(left?.y).toBe(1)
    expect(right?.y).toBe(1)
  })
})

describe('buchheim when root has two children', () => {
  it('centers root between left and right child prelim positions', () => {
    const result = buchheim(twoChildrenTree())
    const root = result.positions.get('root')
    const left = result.positions.get('a')
    const right = result.positions.get('b')

    expect(root).toBeDefined()
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    const leftX = getOrElse<number>(() => 0)(fromNullable(left?.x))
    const rightX = getOrElse<number>(() => 0)(fromNullable(right?.x))

    expect(root?.x).toBe((leftX + rightX) / 2)
  })
})