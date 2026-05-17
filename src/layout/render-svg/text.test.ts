import { describe, expect, it } from 'vitest'
import type { ResolvedTextStyles } from '../../style/dsl'
import {
  buildStyledLabelLines,
  composeShadowLabel,
  fitFontSizeToBox,
  renderStyledLabelElement,
  toTextStyle
} from './text'

const textStyles: ResolvedTextStyles = {
  nodeName: { color: '#111', fontSize: 14 },
  nodeTitle: { color: '#333', fontSize: 12 }
}

describe('toTextStyle', () => {
  it('keeps only text-related style fields from optional input', () => {
    const result = toTextStyle({ color: '#000', fontSize: 12, fontWeight: '600', lineSpacing: 1.2 })

    expect(result.color).toBe('#000')
    expect(result.fontSize).toBe(12)
    expect(result.lineSpacing).toBe(1.2)
  })
})

describe('buildStyledLabelLines', () => {
  it('splits name and title segments into style-tagged lines', () => {
    const result = buildStyledLabelLines('Alice\nEngineering Manager', 12, 3)

    expect(result.length >= 2).toBe(true)
    expect(result[0]?.kind).toBe('name')
    expect(result[1]?.kind).toBe('title')
  })
})

describe('composeShadowLabel', () => {
  it('uses override title when provided for shadow label text', () => {
    const result = composeShadowLabel('Alice\nManager', 'Interim')

    expect(result).toBe('Alice\nInterim')
  })
})

describe('fitFontSizeToBox', () => {
  it('returns a size bounded by min font and container budgets', () => {
    const result = fitFontSizeToBox({
      lines: ['A very long line of text'],
      baseFontSize: 16,
      boxWidth: 80,
      boxHeight: 40,
      minFontSize: 9
    })

    expect(result >= 9).toBe(true)
    expect(result <= 16).toBe(true)
  })
})

describe('renderStyledLabelElement', () => {
  it('renders a single-line text element for one styled line', () => {
    const result = renderStyledLabelElement({
      tx: 20,
      ty: 30,
      fontFamily: 'Arial',
      styledLines: [{ text: 'Alice', kind: 'name' }],
      textStyles,
      baseTextStyle: {},
      fittedFont: 12,
      fallbackText: ''
    })

    expect(result.includes('<text')).toBe(true)
    expect(result.includes('Alice')).toBe(true)
    expect(result.includes('<tspan')).toBe(false)
  })

  it('renders multiline tspans when multiple style-tagged lines exist', () => {
    const result = renderStyledLabelElement({
      tx: 20,
      ty: 30,
      fontFamily: 'Arial',
      styledLines: [
        { text: 'Alice', kind: 'name' },
        { text: 'Manager', kind: 'title' }
      ],
      textStyles,
      baseTextStyle: {},
      fittedFont: 12,
      fallbackText: ''
    })

    expect(result.includes('<tspan')).toBe(true)
    expect(result.includes('Manager')).toBe(true)
  })
})
