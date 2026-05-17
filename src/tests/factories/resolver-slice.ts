import { intoMap } from '@tsfpp/prelude'
import type { AstAttr, AstLink, AstNode, AstOrg } from '../../types/ast'
import type { HandleEntry } from '../../resolver/handles'

export const mkResolverStringAttr = (key: string, value: string): AstAttr => ({
  key,
  value: { kind: 'string', value }
})

export const mkResolverNumberAttr = (key: string, value: number): AstAttr => ({
  key,
  value: { kind: 'number', value }
})

export const mkResolverBooleanAttr = (key: string, value: boolean): AstAttr => ({
  key,
  value: { kind: 'boolean', value }
})

export const mkResolverNode = (
  kind: AstNode['kind'],
  overrides: Partial<AstNode> = {}
): AstNode => ({
  kind,
  line: 1,
  col: 1,
  displayName: 'Node',
  handle: undefined,
  attrs: [],
  layoutHints: [],
  visualHints: [],
  children: [],
  staffNodes: [],
  ...overrides
})

export const mkResolverAst = (
  root: AstNode,
  links: readonly AstLink[] = []
): AstOrg => ({
  name: 'Acme',
  attrs: [],
  root,
  links,
  config: { pairs: [] }
})

export const mkResolverHandleMap = (
  entries: ReadonlyArray<readonly [string, AstNode]>
): ReadonlyMap<string, HandleEntry> =>
  intoMap(entries.map(([handle, node]) => [handle, { handle, node }] as const))
