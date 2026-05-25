import { intoMap, none } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { defaultRenderConfig, renderSvg } from './render-svg'
import { mkRenderSvgInput } from '../tests/factories/render-svg-slice'

describe('defaultRenderConfig', () => {
  it('keeps the expected default node size and font family', () => {
    expect(defaultRenderConfig.nodeSize).toBe(1)
    expect(defaultRenderConfig.fontFamily).toBe('Arial')
  })
})

describe('renderSvg when placement validation fails', () => {
  it('returns validation error and skips projection rendering', () => {
    const input = mkRenderSvgInput()
    const result = renderSvg({
      ...input,
      tree: {
        rootId: 'root',
        nodes: intoMap([
          ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: none, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
        ])
      }
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error.kind).toBe('missing_layout_position')
  })
})

describe('renderSvg when placement validation succeeds', () => {
  it('delegates to projection renderer and returns its result', () => {
    const input = mkRenderSvgInput()
    const result = renderSvg({
      ...input,
      tree: {
        rootId: 'root',
        nodes: intoMap([
          ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: none, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
        ])
      },
      placed: {
        rootId: 'root',
        positions: intoMap([
          ['root', { x: 0, y: 0 }]
        ])
      }
    })

    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.svg.includes('<svg') : false).toBe(true)
  })
})