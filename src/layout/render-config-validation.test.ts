import { describe, expect, it } from 'vitest'
import type { RenderConfig } from './types'
import { validateRenderConfig } from './render-config-validation'

const requireConfigErr = (
  result: ReturnType<typeof validateRenderConfig>
): Extract<ReturnType<typeof validateRenderConfig>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected validateRenderConfig to fail in this test setup') : result

const validConfig = (): RenderConfig => ({
  nodeSize: 1,
  staffSize: 0.6,
  colWidth: 80,
  rowHeight: 120,
  nodeBorder: '#000',
  employeeFill: '#e3f2fd',
  deptFill: '#fff3e0',
  vacancyFill: '#f3e5f5',
  edgeStroke: '#999',
  dottedEdgeStroke: '#aaa',
  shadowOffsetX: 0.75,
  shadowOffsetY: -0.75,
  shadowOpacity: 0.55,
  shadowDashArray: '3 3',
  shadowFontScale: 1,
  fontSize: 12,
  fontFamily: 'Arial',
  showSubordinateCount: false,
  subordinateCountIncludeVacancies: false,
  subordinateCountBadgeFill: '#999',
  subordinateCountBadgeText: '#ffffff',
  subordinateCountBadgeFontScale: 0.75
})

describe('validateRenderConfig when all fields are valid', () => {
  it('returns ok true', () => {
    const result = validateRenderConfig(validConfig())

    expect(result).toEqual({ ok: true })
  })
})

describe('validateRenderConfig when numeric constraints are violated', () => {
  it('returns errors for invalid numeric fields', () => {
    const cfg: RenderConfig = {
      ...validConfig(),
      nodeSize: 0,
      shadowOpacity: 2,
      subordinateCountBadgeFontScale: -1
    }

    const result = requireConfigErr(validateRenderConfig(cfg))

    expect(result.errors.some((error) => error.field === 'nodeSize')).toBe(true)
    expect(result.errors.some((error) => error.field === 'shadowOpacity')).toBe(true)
    expect(result.errors.some((error) => error.field === 'subordinateCountBadgeFontScale')).toBe(true)
  })
})

describe('validateRenderConfig when string and color constraints are violated', () => {
  it('returns errors for invalid colors, empty font family, and invalid dash array', () => {
    const cfg: RenderConfig = {
      ...validConfig(),
      nodeBorder: '123-not-color',
      fontFamily: '   ',
      shadowDashArray: '0,0'
    }

    const result = requireConfigErr(validateRenderConfig(cfg))

    expect(result.errors.some((error) => error.field === 'nodeBorder')).toBe(true)
    expect(result.errors.some((error) => error.field === 'fontFamily')).toBe(true)
    expect(result.errors.some((error) => error.field === 'shadowDashArray')).toBe(true)
  })
})