import { describe, expect, it } from 'vitest'
import { iconPosition, renderIcon, renderIconSpec } from './render'
import { mkIconBounds } from '../tests/factories/icons'

describe('iconPosition', () => {
  it('computes upper-left and bottom-right anchor coordinates', () => {
    const bounds = mkIconBounds({ x: 10, y: 20, width: 80, height: 120 })
    const upperLeft = iconPosition('upper-left', bounds, 14)
    const bottomRight = iconPosition('bottom-right', bounds, 14)

    expect(upperLeft.x).toBe(14)
    expect(upperLeft.y).toBe(24)
    expect(bottomRight.x).toBe(72)
    expect(bottomRight.y).toBe(122)
  })
})

describe('renderIcon', () => {
  it('renders svg group markup for known icons with escaped color', () => {
    const result = renderIcon({ name: 'user', x: 4, y: 8, size: 12, color: 'red"<', opacity: 0.6 })

    expect(result.includes('<g ')).toBe(true)
    expect(result.includes('stroke="red&quot;&lt;"')).toBe(true)
    expect(result.includes('opacity="0.6"')).toBe(true)
  })

  it('returns empty output for unknown icon name', () => {
    expect(renderIcon({ name: 'unknown', x: 0, y: 0 }) === '').toBe(true)
  })
})

describe('renderIconSpec', () => {
  it('resolves icon placement and renders icon spec output', () => {
    const result = renderIconSpec({
      spec: { name: 'users', pos: 'upper-right', size: 14, opacity: 0.5 },
      bounds: mkIconBounds({ x: 0, y: 0, width: 80, height: 120 }),
      color: '#000'
    })

    expect(result.includes('translate(62,4)')).toBe(true)
    expect(result.includes('opacity="0.5"')).toBe(true)
  })
})
