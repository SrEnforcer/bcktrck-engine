import { intoMap, none } from '@tsfpp/prelude'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mkCompileAst,
  mkCompileOrgTree,
  mkCompileStyleSheet
} from './tests/factories/compile-slice'

vi.mock('./parse-and-resolve', () => ({
  parseAndResolveBtl: vi.fn()
}))

vi.mock('./subtree', () => ({
  isolateSubtree: vi.fn(),
  isolateSubtrees: vi.fn(),
  listSubtrees: vi.fn()
}))

vi.mock('./layout/index-tree', () => ({
  indexTree: vi.fn()
}))

vi.mock('./layout/buchheim', () => ({
  buchheim: vi.fn()
}))

vi.mock('./layout/apply-layout-hints', () => ({
  applyLayoutHints: vi.fn()
}))

vi.mock('./layout/staff-placement', () => ({
  placeStaff: vi.fn()
}))

vi.mock('./layout/route-edges', () => ({
  routeEdgesWithDiagnostics: vi.fn()
}))

vi.mock('./layout/render-svg', () => ({
  renderSvg: vi.fn(),
  defaultRenderConfig: {
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
}))

vi.mock('./style/dsl', () => ({
  extractDefinitionsBlock: vi.fn(),
  extractStyleSheet: vi.fn(),
  applyDefinitionsToStyleSheet: vi.fn(),
  mergeStyleSheets: vi.fn(),
  resolveStyleSheet: vi.fn()
}))

import { parseAndResolveBtl } from './parse-and-resolve'
import { isolateSubtree, isolateSubtrees } from './subtree'
import { indexTree } from './layout/index-tree'
import { buchheim } from './layout/buchheim'
import { applyLayoutHints } from './layout/apply-layout-hints'
import { placeStaff } from './layout/staff-placement'
import { routeEdgesWithDiagnostics } from './layout/route-edges'
import { renderSvg } from './layout/render-svg'
import { applyDefinitionsToStyleSheet, extractDefinitionsBlock, extractStyleSheet, mergeStyleSheets, resolveStyleSheet } from './style/dsl'
import { compile } from './compile'

const mockedParseAndResolveBtl = vi.mocked(parseAndResolveBtl)
const mockedIsolateSubtree = vi.mocked(isolateSubtree)
const mockedIsolateSubtrees = vi.mocked(isolateSubtrees)
const mockedIndexTree = vi.mocked(indexTree)
const mockedBuchheim = vi.mocked(buchheim)
const mockedApplyLayoutHints = vi.mocked(applyLayoutHints)
const mockedPlaceStaff = vi.mocked(placeStaff)
const mockedRouteEdgesWithDiagnostics = vi.mocked(routeEdgesWithDiagnostics)
const mockedRenderSvg = vi.mocked(renderSvg)
const mockedExtractDefinitionsBlock = vi.mocked(extractDefinitionsBlock)
const mockedExtractStyleSheet = vi.mocked(extractStyleSheet)
const mockedApplyDefinitionsToStyleSheet = vi.mocked(applyDefinitionsToStyleSheet)
const mockedMergeStyleSheets = vi.mocked(mergeStyleSheets)
const mockedResolveStyleSheet = vi.mocked(resolveStyleSheet)

const requireCompileError = (
  result: ReturnType<typeof compile>
): Extract<ReturnType<typeof compile>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected compile to fail in this test setup') : result

beforeEach(() => {
  vi.clearAllMocks()

  const styleSheet = mkCompileStyleSheet()
  mockedExtractDefinitionsBlock.mockReturnValue({ ok: true, strippedSource: 'org "Acme"\n  CEO', definitions: { variables: intoMap<string, string>([]), variableIcons: [] } })
  mockedExtractStyleSheet.mockReturnValue({ ok: true, strippedSource: 'org "Acme"\n  CEO', styleSheet })
  mockedApplyDefinitionsToStyleSheet.mockReturnValue(styleSheet)
  mockedMergeStyleSheets.mockReturnValue(styleSheet)
  mockedResolveStyleSheet.mockReturnValue({ ok: true, styleMap: intoMap<string, { readonly icon?: readonly string[] }>([]), textStyles: { nodeName: {}, nodeTitle: {} } })

  const tree = mkCompileOrgTree()
  mockedParseAndResolveBtl.mockReturnValue({ ok: true, ast: mkCompileAst(), tree })
  mockedIsolateSubtree.mockReturnValue({ _tag: 'Some', value: tree })
  mockedIsolateSubtrees.mockReturnValue({ _tag: 'Some', value: tree })

  mockedIndexTree.mockReturnValue({ rootId: 'ceo', nodes: intoMap([['ceo', { id: 'ceo', kind: 'employee', label: 'CEO', depth: 0, parentId: null, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]]) })
  mockedBuchheim.mockReturnValue({ rootId: 'ceo', positions: intoMap([['ceo', { x: 0, y: 0 }]]) })
  mockedApplyLayoutHints.mockReturnValue({ rootId: 'ceo', positions: intoMap([['ceo', { x: 0, y: 0 }]]) })
  mockedPlaceStaff.mockReturnValue({ staff: [] })
  mockedRouteEdgesWithDiagnostics.mockReturnValue({ routes: [], diagnostics: [] })
  mockedRenderSvg.mockReturnValue({ ok: true, value: { svg: '<svg />', viewBox: { x: 0, y: 0, width: 100, height: 100 } } })
})

describe('compile when source defs extraction fails', () => {
  it('returns parseError', () => {
    mockedExtractDefinitionsBlock.mockReturnValue({ ok: false, error: { ok: false, error: 'bad defs', line: 1, col: 1 } })

    const result = compile('source')

    expect(result).toEqual({ ok: false, parseError: { ok: false, error: 'bad defs', line: 1, col: 1 } })
  })
})

describe('compile when subtreeId does not resolve', () => {
  it('returns unknown_handle resolveErrors', () => {
    mockedIsolateSubtree.mockReturnValue(none)

    const result = requireCompileError(compile('source', undefined, { subtreeId: 'missing' }))

    expect(result.resolveErrors?.[0]?.kind).toBe('unknown_handle')
  })
})

describe('compile when render stage fails', () => {
  it('maps render error to resolveErrors', () => {
    mockedRenderSvg.mockReturnValue({
      ok: false,
      error: { kind: 'missing_layout_position', nodeId: 'ceo', message: 'Missing layout position for ceo' }
    })

    const result = requireCompileError(compile('source'))

    expect(result.resolveErrors?.[0]?.handle).toBe('ceo')
  })
})

describe('compile when all stages succeed', () => {
  it('returns ok with svg and viewBox', () => {
    const result = compile('source')

    expect(result).toEqual({
      ok: true,
      svg: '<svg />',
      viewBox: { x: 0, y: 0, width: 100, height: 100 }
    })
  })
})