import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { resolveAst } from './resolve'
import type { OrgNode } from '../types/org-tree'
import {
  mkResolverAst,
  mkResolverNode,
  mkResolverStringAttr
} from '../tests/factories/resolver-slice'

const requireResolveError = (
  result: ReturnType<typeof resolveAst>
): Extract<ReturnType<typeof resolveAst>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected resolveAst to fail in this test setup') : result

const requireResolveOk = (
  result: ReturnType<typeof resolveAst>
): Extract<ReturnType<typeof resolveAst>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected resolveAst to succeed in this test setup')

const requireEmployeeRoot = (node: OrgNode): Extract<OrgNode, { readonly kind: 'employee' | 'vacancy' }> =>
  node.kind === 'employee' || node.kind === 'vacancy'
    ? node
    : expect.fail('Expected resolved root node to be employee-or-vacancy in this test setup')

describe('resolveAst when validation fails', () => {
  it('returns unknown_handle errors', () => {
    const root = mkResolverNode('employee', { handle: 'ceo', displayName: 'CEO' })
    const ast = mkResolverAst(root, [{ line: 2, col: 1, from: 'ceo', to: 'missing', attrs: [] }])

    const result = requireResolveError(resolveAst(ast))

    expect(result.errors.some((error) => error.kind === 'unknown_handle')).toBe(true)
  })
})

describe('resolveAst when input is valid', () => {
  it('returns an OrgTree with resolved children and dotted edges', () => {
    const child = mkResolverNode('employee', { handle: 'eng', displayName: 'Engineer' })
    const root = mkResolverNode('employee', {
      handle: 'ceo',
      displayName: 'Chief Executive',
      children: [child]
    })
    const ast = mkResolverAst(root, [{ line: 2, col: 1, from: 'ceo', to: 'eng', attrs: [mkResolverStringAttr('kind', 'dt')] }])

    const result = requireResolveOk(resolveAst(ast))
    const resolvedRoot = requireEmployeeRoot(result.tree.root)

    expect(resolvedRoot.kind).toBe('employee')
    expect(resolvedRoot.children.length).toBe(1)
    expect(result.tree.dottedEdges.length).toBe(1)
    expect(result.tree.dottedEdges[0]?.kind).toBe('dt')
  })
})

describe('resolveAst when dotted edge style is suppressed', () => {
  it('omits dotted edges whose style is none', () => {
    const child = mkResolverNode('employee', { handle: 'eng', displayName: 'Engineer' })
    const root = mkResolverNode('employee', {
      handle: 'ceo',
      displayName: 'Chief Executive',
      children: [child]
    })
    const ast = mkResolverAst(root, [{ line: 3, col: 1, from: 'ceo', to: 'eng', attrs: [mkResolverStringAttr('style', 'none')] }])

    const result = requireResolveOk(resolveAst(ast))

    expect(result.tree.dottedEdges.length).toBe(0)
  })
})

describe('resolveAst when a shadow node references a valid primary', () => {
  it('creates a shadow node with staff host and hidden connector flag', () => {
    const primary = mkResolverNode('employee', { handle: 'primary', displayName: 'Primary' })
    const shadow = mkResolverNode('shadow', {
      handle: 'shadow-1',
      displayName: 'Shadow',
      attrs: [
        mkResolverStringAttr('primary', '@primary'),
        mkResolverStringAttr('type', 'staff'),
        mkResolverStringAttr('side', 'left'),
        mkResolverStringAttr('style', 'hidden')
      ]
    })
    const root = mkResolverNode('employee', {
      handle: 'ceo',
      displayName: 'Chief Executive',
      children: [primary, shadow]
    })

    const result = requireResolveOk(resolveAst(mkResolverAst(root)))

    expect(result.tree.shadowNodes.length).toBe(1)
    expect(result.tree.shadowNodes[0]?.type).toBe('staff')
    expect(result.tree.shadowNodes[0]?.host).toBe('ceo')
    expect(result.tree.shadowNodes[0]?.hideConnector).toBe(true)
  })
})

describe('resolveAst when variable substitutions are provided', () => {
  it('uses variable values in node title composition', () => {
    const root = mkResolverNode('employee', {
      handle: 'ceo',
      displayName: 'Chief Executive',
      attrs: [mkResolverStringAttr('title', '$role')]
    })

    const result = requireResolveOk(resolveAst(
      mkResolverAst(root),
      intoMap<string, string>([['role', '"Platform Lead"']])
    ))
    const resolvedRoot = requireEmployeeRoot(result.tree.root)

    expect(resolvedRoot.kind).toBe('employee')
    expect(resolvedRoot.meta.title).toBe('Chief Executive\nPlatform Lead')
  })
})