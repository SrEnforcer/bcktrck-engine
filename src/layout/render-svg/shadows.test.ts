import { intoMap, none } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { asNodeId } from '../../types/branded'
import type { IndexedTree, PlacedStaff, PlacedTree, RenderConfig } from '../types'
import { buildShadowBoundsMap, renderShadowBodies } from './shadows'
import { mkShadowFixtures } from '../../tests/factories/render-svg-slice'
import { mkSliceRenderConfig } from '../../tests/factories/layout-slice'

const cfg: RenderConfig = mkSliceRenderConfig()

const fixtures = mkShadowFixtures()

const mkStaffShadowHostFixture = (): {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
} => ({
  tree: {
    rootId: 'manager',
    nodes: intoMap([
      ['manager', { id: 'manager', kind: 'employee', label: 'Manager', depth: 0, parentId: none, childIndex: 0, children: ['child'], staffLeft: [], staffRight: [] }],
      ['child', { id: 'child', kind: 'employee', label: 'Child', depth: 1, parentId: none, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
    ])
  },
  placed: {
    rootId: 'manager',
    positions: intoMap([
      ['manager', { x: 0, y: 0 }],
      ['child', { x: 0, y: 2 }]
    ])
  },
  staff: {
    staff: [
      { id: 'rob', label: 'Rob', x: 2, y: 2, side: 'left' }
    ]
  }
})

describe('buildShadowBoundsMap', () => {
  it('builds a lookup map with computed bounds for resolvable shadows', () => {
    const result = buildShadowBoundsMap({
      shadowNodes: fixtures.shadowNodes,
      tree: fixtures.tree,
      placed: fixtures.placed,
      staff: fixtures.staff,
      cfg,
      styleMap: intoMap([])
    })

    expect(result.has('shadow-root')).toBe(true)
  })
})

describe('renderShadowBodies when connectors are visible', () => {
  it('renders shadow rect/label and connector when not hidden', () => {
    const result = renderShadowBodies({
      shadowNodes: fixtures.shadowNodes,
      tree: fixtures.tree,
      placed: fixtures.placed,
      staff: fixtures.staff,
      cfg,
      safeCfg: cfg,
      styleMap: intoMap([]),
      textStyles: fixtures.textStyles
    })

    expect(result.bodyElements.join('').includes('class="shadow"')).toBe(true)
    expect(result.edgeElements.join('').includes('class="shadow-edge"')).toBe(true)
  })
})

describe('renderShadowBodies when connector is hidden', () => {
  it('omits connector line when shadow requests hidden connector', () => {
    const result = renderShadowBodies({
      shadowNodes: [{ id: asNodeId('shadow-root'), primary: asNodeId('root'), type: 'employee', hideConnector: true }],
      tree: fixtures.tree,
      placed: fixtures.placed,
      staff: fixtures.staff,
      cfg,
      safeCfg: cfg,
      styleMap: intoMap([]),
      textStyles: fixtures.textStyles
    })

    expect(result.edgeElements.length === 0).toBe(true)
  })
})

describe('renderShadowBodies when shadow type is staff', () => {
  it('places staff shadow next to the host node, not the primary staff position', () => {
    const fixture = mkStaffShadowHostFixture()

    const result = renderShadowBodies({
      shadowNodes: [{
        id: asNodeId('shadow-rob'),
        primary: asNodeId('rob'),
        type: 'staff',
        host: asNodeId('manager'),
        side: 'left'
      }],
      tree: fixture.tree,
      placed: fixture.placed,
      staff: fixture.staff,
      cfg,
      safeCfg: cfg,
      styleMap: intoMap([]),
      textStyles: { nodeName: {}, nodeTitle: {} }
    })

    const all = result.bodyElements.join(' ')
    const rectX = Number((all.match(/id="shadow-rob"[^>]*\sx="([^"]+)"/)?.[1] ?? '0'))
    const rectY = Number((all.match(/id="shadow-rob"[^>]*\sy="([^"]+)"/)?.[1] ?? '0'))

    // Shadow is placed to the LEFT of the host manager (at x=0, centre x=40).
    // A left-side placement must land at x < 0, well clear of the host box.
    expect(all.includes('id="shadow-rob"')).toBe(true)
    expect(Number.isFinite(rectX)).toBe(true)
    expect(Number.isFinite(rectY)).toBe(true)
    expect(rectX).toBeLessThan(0)
    expect(rectY > 80).toBe(true)
  })
})
