import { describe, expect, it } from 'vitest'
import { asNodeId } from '../../types/branded'
import { intoMap } from '@tsfpp/prelude'
import type { RenderConfig } from '../types'
import { renderDottedEdges } from './dotted'
import { mkDottedInput } from '../../tests/factories/render-svg-slice'
import { mkSliceRenderConfig } from '../../tests/factories/layout-slice'

const cfg: RenderConfig = mkSliceRenderConfig()

describe('renderDottedEdges', () => {
  it('renders dotted polyline and optional escaped label text', () => {
    const result = renderDottedEdges(mkDottedInput({ dottedEdges: [
      { from: asNodeId('a'), to: asNodeId('b'), label: '<peer>' }
    ], cfg }))

    expect(result.edgeElements.length).toBe(2)
    expect(result.edgeElements.join('').includes('class="dotted-edge"')).toBe(true)
    expect(result.edgeElements.join('').includes('&lt;peer&gt;')).toBe(true)
  })

  it('skips edges when source or destination bounds are missing', () => {
    const result = renderDottedEdges(mkDottedInput({ dottedEdges: [
      { from: asNodeId('a'), to: asNodeId('missing') }
    ], cfg }))

    expect(result.edgeElements.length === 0).toBe(true)
  })

  it('anchors dotted links on middle side ports', () => {
    const result = renderDottedEdges(mkDottedInput({ dottedEdges: [
      { from: asNodeId('a'), to: asNodeId('b') }
    ], cfg }))

    const first = result.edgeElements[0] ?? ''
    expect(first.includes('points="80,60 160,60"')).toBe(true)
  })

  it('detours same-row dotted links when an intermediate node blocks the horizontal segment', () => {
    const result = renderDottedEdges({
      ...mkDottedInput({ dottedEdges: [{ from: asNodeId('a'), to: asNodeId('b') }], cfg }),
      placed: {
        rootId: 'a',
        positions: intoMap([
          ['a', { x: 0, y: 0 }],
          ['b', { x: 2, y: 0 }],
          ['blocker', { x: 1, y: 0 }]
        ])
      }
    })

    const first = result.edgeElements[0] ?? ''
    expect(first.includes('points="80,60 80,-12 160,-12 160,60"')).toBe(true)
  })

  it('uses right-side dogleg for near-vertical dotted links', () => {
    const result = renderDottedEdges({
      ...mkDottedInput({ dottedEdges: [{ from: asNodeId('a'), to: asNodeId('b') }], cfg }),
      placed: {
        rootId: 'a',
        positions: intoMap([
          ['a', { x: 0, y: 0 }],
          ['b', { x: 0.05, y: 2 }]
        ])
      }
    })

    const first = result.edgeElements[0] ?? ''
    expect(first.includes('80,60 140,60 140,300 4,300')).toBe(true)
  })

  it('uses dogleg when dotted endpoints share the same x column', () => {
    const result = renderDottedEdges({
      ...mkDottedInput({ dottedEdges: [{ from: asNodeId('a'), to: asNodeId('b') }], cfg }),
      placed: {
        rootId: 'a',
        positions: intoMap([
          ['a', { x: 0, y: 0 }],
          ['b', { x: 1, y: 2 }]
        ])
      }
    })

    const first = result.edgeElements[0] ?? ''
    expect(first.includes('80,60 140,60 140,300 80,300')).toBe(true)
  })
})
