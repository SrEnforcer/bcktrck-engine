import { intoMap, none } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { renderSvgProjection } from './sections'
import { mkRenderSvgInput } from '../../tests/factories/render-svg-slice'

const requireProjectionOk = (
  result: ReturnType<typeof renderSvgProjection>
): Extract<ReturnType<typeof renderSvgProjection>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected renderSvgProjection to succeed in this test setup')

describe('renderSvgProjection', () => {
  it('assembles all section outputs into final svg and viewBox', () => {
    const input = mkRenderSvgInput()

    const result = requireProjectionOk(renderSvgProjection({
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
    }))

    expect(result.value.svg.includes('<svg')).toBe(true)
    expect(result.value.svg.includes('<rect')).toBe(true)
    expect(result.value.viewBox.width > 0).toBe(true)
  })
})