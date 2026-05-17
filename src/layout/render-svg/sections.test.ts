import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it, vi } from 'vitest'
import type { RenderConfig } from '../types'

vi.mock('./dotted', () => ({
  renderDottedEdges: vi.fn()
}))

vi.mock('./edges', () => ({
  renderSolidEdges: vi.fn(),
  renderStaffConnectors: vi.fn()
}))

vi.mock('./shadows', () => ({
  buildShadowBoundsMap: vi.fn(),
  renderShadowBodies: vi.fn()
}))

vi.mock('./nodes', () => ({
  buildStaffParentLookup: vi.fn(),
  renderNodeBodies: vi.fn(),
  renderStaffBodies: vi.fn()
}))

import { renderDottedEdges } from './dotted'
import { renderSolidEdges, renderStaffConnectors } from './edges'
import { buildShadowBoundsMap, renderShadowBodies } from './shadows'
import { buildStaffParentLookup, renderNodeBodies, renderStaffBodies } from './nodes'
import { renderSvgProjection } from './sections'

const requireProjectionOk = (
  result: ReturnType<typeof renderSvgProjection>
): Extract<ReturnType<typeof renderSvgProjection>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected renderSvgProjection to succeed in this test setup')

const mockedRenderDottedEdges = vi.mocked(renderDottedEdges)
const mockedRenderSolidEdges = vi.mocked(renderSolidEdges)
const mockedRenderStaffConnectors = vi.mocked(renderStaffConnectors)
const mockedBuildShadowBoundsMap = vi.mocked(buildShadowBoundsMap)
const mockedRenderShadowBodies = vi.mocked(renderShadowBodies)
const mockedBuildStaffParentLookup = vi.mocked(buildStaffParentLookup)
const mockedRenderNodeBodies = vi.mocked(renderNodeBodies)
const mockedRenderStaffBodies = vi.mocked(renderStaffBodies)

const cfg: RenderConfig = {
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
}

describe('renderSvgProjection', () => {
  it('assembles all section outputs into final svg and viewBox', () => {
    mockedBuildShadowBoundsMap.mockReturnValue(intoMap([]))
    mockedBuildStaffParentLookup.mockReturnValue({})
    mockedRenderDottedEdges.mockReturnValue({ edgeElements: ['<path id="dotted"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })
    mockedRenderSolidEdges.mockReturnValue({ elements: ['<path id="solid"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })
    mockedRenderStaffConnectors.mockReturnValue({ elements: ['<path id="staff-connector"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })
    mockedRenderShadowBodies.mockReturnValue({ bodyElements: ['<g id="shadow-body"/>'], edgeElements: ['<path id="shadow-edge"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })
    mockedRenderNodeBodies.mockReturnValue({ elements: ['<g id="node-body"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })
    mockedRenderStaffBodies.mockReturnValue({ elements: ['<g id="staff-body"/>'], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } })

    const result = requireProjectionOk(renderSvgProjection({
      tree: { rootId: 'root', nodes: intoMap([]) },
      placed: { rootId: 'root', positions: intoMap([]) },
      staff: { staff: [] },
      cfg,
      dottedEdges: [],
      shadowNodes: [],
      edgeRoutes: [],
      styleMap: intoMap([]),
      textStyles: { nodeName: {}, nodeTitle: {} },
      iconMap: intoMap([])
    }))

    expect(result.value.svg.includes('shadow-body')).toBe(true)
    expect(result.value.svg.includes('node-body')).toBe(true)
    expect(result.value.svg.includes('staff-body')).toBe(true)
    expect(result.value.viewBox.width > 0).toBe(true)
  })
})