import { describe, expect, it } from 'vitest'
import { asNodeId } from '../../types/branded'
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
})
