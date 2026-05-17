import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { asNodeId } from '../../types/branded'
import type { RenderConfig } from '../types'
import { buildShadowBoundsMap, renderShadowBodies } from './shadows'
import { mkShadowFixtures } from '../../tests/factories/render-svg-slice'
import { mkSliceRenderConfig } from '../../tests/factories/layout-slice'

const cfg: RenderConfig = mkSliceRenderConfig()

const fixtures = mkShadowFixtures()

describe('buildShadowBoundsMap', () => {
  it('builds a lookup map with computed bounds for resolvable shadows', () => {
    const result = buildShadowBoundsMap({
      shadowNodes: fixtures.shadowNodes,
      placed: fixtures.placed,
      staff: fixtures.staff,
      cfg,
      styleMap: intoMap([])
    })

    expect(result.has('shadow-root')).toBe(true)
  })
})

describe('renderShadowBodies', () => {
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
