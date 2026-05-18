/**
 * @module tests/factories/compile-slice
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import { intoMap } from '@tsfpp/prelude'
import type { AstOrg } from '../../types/ast'
import { asNodeId } from '../../types/branded'
import type { OrgTree } from '../../types/org-tree'

/** Build mkCompileAst test fixture values. */
export const mkCompileAst = (): AstOrg => ({
  name: 'Acme',
  attrs: [],
  root: {
    kind: 'employee',
    line: 1,
    col: 1,
    displayName: 'CEO',
    handle: 'ceo',
    attrs: [],
    layoutHints: [],
    visualHints: [],
    children: [],
    staffNodes: []
  },
  links: [],
  config: { pairs: [] }
})

/** Build mkCompileOrgTree test fixture values. */
export const mkCompileOrgTree = (): OrgTree => ({
  root: {
    kind: 'employee',
    id: asNodeId('ceo'),
    meta: { title: 'CEO' },
    children: [],
    staff: []
  },
  dottedEdges: [],
  shadowNodes: []
})

/** Build mkCompileStyleSheet test fixture values. */
export const mkCompileStyleSheet = (): {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: readonly []
  readonly rules: readonly []
} => ({
  variables: intoMap<string, string>([]),
  variableIcons: [],
  rules: []
})

/** Build mkParseResolveTree test fixture values. */
export const mkParseResolveTree = (): OrgTree => ({
  root: {
    kind: 'employee',
    id: asNodeId('n1'),
    meta: { title: 'CEO' },
    children: [],
    staff: []
  },
  dottedEdges: [],
  shadowNodes: []
})
