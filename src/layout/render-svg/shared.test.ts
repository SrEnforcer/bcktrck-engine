import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { RenderConfig } from '../types'
import {
  boundsFromRect,
  edgeStrokeStyleAttrs,
  emptyRenderBounds,
  escapeXml,
  expandBoundsWithPoint,
  expandBoundsWithPoints,
  getFillColor,
  getNodeBounds,
  getNodePosition,
  gridToPixels,
  mergeAllBounds,
  mergeRenderBounds,
  mergeSectionRender,
  mergeShadowBodyRender,
  mergeTextStyle,
  rectStrokeStyleAttrs,
  renderNodeIcons,
  sanitizeRenderConfig,
  strokeWidthAttr,
  textAttrs,
  validatePlacedNodePositions
} from './shared'
import { mkSharedGeometryFixtures } from '../../tests/factories/render-svg-slice'
import { mkSliceRenderConfig } from '../../tests/factories/layout-slice'

const cfg: RenderConfig = mkSliceRenderConfig()

describe('shared svg helpers: xml and grid', () => {
  it('escapes xml characters and converts grid to pixels', () => {
    expect(escapeXml(`<a&"'b>`)).toBe('&lt;a&amp;&quot;&#39;b&gt;')
    expect(gridToPixels(2, 3, cfg)).toEqual({ x: 160, y: 360 })
  })
})

describe('shared svg helpers: bounds', () => {
  it('builds and merges bounds correctly', () => {
    const empty = emptyRenderBounds()
    const one = expandBoundsWithPoint(empty, { x: 10, y: 20 })
    const two = expandBoundsWithPoints(one, [{ x: 5, y: 30 }, { x: 15, y: 10 }])
    const merged = mergeRenderBounds(two, boundsFromRect({ x: 0, y: 0, w: 4, h: 8 }))

    expect(merged).toEqual({ minX: 0, minY: 0, maxX: 15, maxY: 30 })
  })

  it('merges aggregate bounds, section renders, and shadow renders', () => {
    const all = mergeAllBounds([
      boundsFromRect({ x: 0, y: 0, w: 1, h: 1 }),
      boundsFromRect({ x: 10, y: 10, w: 2, h: 2 })
    ])
    const section = mergeSectionRender(
      { elements: ['a'], bounds: boundsFromRect({ x: 0, y: 0, w: 1, h: 1 }) },
      { elements: ['b'], bounds: boundsFromRect({ x: 1, y: 1, w: 1, h: 1 }) }
    )
    const shadow = mergeShadowBodyRender(
      { bodyElements: ['b1'], edgeElements: ['e1'], bounds: boundsFromRect({ x: 0, y: 0, w: 1, h: 1 }) },
      { bodyElements: ['b2'], edgeElements: ['e2'], bounds: boundsFromRect({ x: 2, y: 2, w: 1, h: 1 }) }
    )

    expect(all.maxX).toBe(12)
    expect(section.elements.length).toBe(2)
    expect(shadow.edgeElements.length).toBe(2)
  })
})

describe('shared svg helpers: node geometry', () => {
  it('resolves node bounds and positions from placed and staff inputs', () => {
    const fixtures = mkSharedGeometryFixtures()

    const rootBounds = getNodeBounds({ id: 'root', placed: fixtures.placed, staff: fixtures.staff, cfg, shadowBoundsMap: undefined })
    const staffBounds = getNodeBounds({ id: 's1', placed: fixtures.placed, staff: fixtures.staff, cfg, shadowBoundsMap: undefined })
    const rootPos = getNodePosition({ id: 'root', placed: fixtures.placed, staff: fixtures.staff, cfg })

    expect(rootBounds).toBeDefined()
    expect(staffBounds).toBeDefined()
    expect(rootPos?.cx).toBe(40)
  })
})

describe('shared svg helpers: styles', () => {
  it('returns fill colors, text style attrs, and stroke attrs', () => {
    const fill = getFillColor('department', cfg)
    const mergedText = mergeTextStyle({ color: '#111' }, { fontSize: 10 })
    const attrs = textAttrs(mergedText)

    expect(fill).toBe(cfg.deptFill)
    expect(attrs.includes('fill="')).toBe(true)
    expect(rectStrokeStyleAttrs({ borderStyle: 'dashed' }).includes('stroke-dasharray')).toBe(true)
    expect(edgeStrokeStyleAttrs('dotted').includes('stroke-linecap')).toBe(true)
    expect(strokeWidthAttr(2).includes('2')).toBe(true)
  })
})

describe('shared svg helpers: icon rendering', () => {
  it('renders single and stacked node icons', () => {
    const single = renderNodeIcons({
      specs: [{ name: 'user', pos: 'upper-left', size: 14, opacity: 0.5 }],
      bounds: { x: 0, y: 0, width: 80, height: 120 },
      color: '#000'
    })
    const stacked = renderNodeIcons({
      specs: [
        { name: 'user', pos: 'upper-left', size: 14, opacity: 0.5 },
        { name: 'users', pos: 'upper-left', size: 14, opacity: 0.5 }
      ],
      bounds: { x: 0, y: 0, width: 80, height: 120 },
      color: '#000'
    })

    expect(single.length > 0).toBe(true)
    expect(stacked.length > 0).toBe(true)
    expect(stacked).not.toBe(single)
  })
})

describe('shared svg helpers: config and validation', () => {
  it('sanitizes render config and validates missing node positions', () => {
    const sanitized = sanitizeRenderConfig({ ...cfg, nodeBorder: '<bad>' })
    const valid = validatePlacedNodePositions(
      {
        rootId: 'root',
        nodes: intoMap([
          ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: null, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
        ])
      },
      { rootId: 'root', positions: intoMap([['root', { x: 0, y: 0 }]]) }
    )
    const invalid = validatePlacedNodePositions(
      {
        rootId: 'root',
        nodes: intoMap([
          ['root', { id: 'root', kind: 'employee', label: 'Root', depth: 0, parentId: null, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
        ])
      },
      { rootId: 'root', positions: intoMap([]) }
    )

    expect(sanitized.nodeBorder.includes('&lt;')).toBe(true)
    expect(valid).toBeUndefined()
    expect(invalid?.ok).toBe(false)
  })
})