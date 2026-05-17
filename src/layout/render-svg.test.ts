import { describe, expect, it, vi } from 'vitest'

vi.mock('./render-svg/shared', () => ({
  validatePlacedNodePositions: vi.fn()
}))

vi.mock('./render-svg/sections', () => ({
  renderSvgProjection: vi.fn()
}))

import { validatePlacedNodePositions } from './render-svg/shared'
import { renderSvgProjection } from './render-svg/sections'
import { defaultRenderConfig, renderSvg } from './render-svg'
import { mkRenderSvgInput } from '../tests/factories/render-svg-slice'

const mockedValidatePlacedNodePositions = vi.mocked(validatePlacedNodePositions)
const mockedRenderSvgProjection = vi.mocked(renderSvgProjection)

describe('defaultRenderConfig', () => {
  it('keeps the expected default node size and font family', () => {
    expect(defaultRenderConfig.nodeSize).toBe(1)
    expect(defaultRenderConfig.fontFamily).toBe('Arial')
  })
})

describe('renderSvg when placement validation fails', () => {
  it('returns validation error and skips projection rendering', () => {
    mockedValidatePlacedNodePositions.mockReturnValue({
      ok: false,
      error: {
        kind: 'missing_layout_position',
        nodeId: 'root',
        message: 'Missing layout position for root'
      }
    })

    const result = renderSvg(mkRenderSvgInput())

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error.kind).toBe('missing_layout_position')
  })
})

describe('renderSvg when placement validation succeeds', () => {
  it('delegates to projection renderer and returns its result', () => {
    mockedValidatePlacedNodePositions.mockReturnValue(undefined)
    mockedRenderSvgProjection.mockReturnValue({
      ok: true,
      value: {
        svg: '<svg />',
        viewBox: { x: 0, y: 0, width: 10, height: 10 }
      }
    })

    const result = renderSvg(mkRenderSvgInput())

    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.svg : '').toBe('<svg />')
  })
})