/**
 * @module tests/factories/style
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import { intoMap } from '@tsfpp/prelude'
import type { AstOrg } from '../../types/ast'
import { asNodeId } from '../../types/branded'
import type { IndexedTree } from '../../layout/types'

/** Build a minimal AST for style DSL resolution tests. */
export const mkStyleDslAst = (): AstOrg => ({
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

/** Build minimal indexed tree input for style DSL resolution tests. */
export const mkStyleDslIndexed = (): IndexedTree => ({
  rootId: 'ceo',
  nodes: intoMap([
    ['ceo', { id: asNodeId('ceo'), kind: 'employee', label: 'CEO', depth: 0, parentId: null, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
  ])
})
