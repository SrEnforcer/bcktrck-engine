/**
 * @module parser/grammar
 *
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * BTL grammar: defines the structure of valid source documents.
 *
 * Orchestrates parsing of top-level sections (config, links, org) and recursively
 * handles node definitions, attributes, layout hints, and staff assignments.
 * Detailed error messages with line/col positions aid debugging.
 *
 * @packageDocumentation
 */

// DEVIATION(2.4): Grammar remains centralized during migration from engine; decomposition into focused parser modules is planned.
/* eslint-disable max-lines */

import type { AstAttr, AstLayoutHint, AstNode, AstNodeKind, AstOrg, AstVisualDirective } from '../types/ast'
import type { ParseResult } from '../types/results'
import { fromNullable, isNone } from '@tsfpp/prelude'
import { token, type Parser } from './combinators'
import type { Token } from '../lexer/tokens'
import { at, collectNodeNameTokens, kindOrEof, nodeKindFromKeyword, parseAttrBlocks, parseLayoutHints, parseOptionalHandle, parseVisualDirectives, skipNewlines, skipOptionalNewline } from './grammar-atoms'
import { parseOptionalConfig, parseOptionalLinks } from './grammar-blocks'

const parseNodeKindPrefix = (
  tokens: readonly Token[]
): ParseResult<{ readonly kind: AstNodeKind; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'tilde') {
    return {
      ok: true,
      value: {
        kind: 'employee',
        rest: tokens
      },
      rest: tokens
    }
  }

  const keyword = tokens[1]
  const mapped = nodeKindFromKeyword(kindOrEof(keyword))
  const mappedOption = fromNullable(mapped)
  if (isNone(mappedOption)) {
    const pos = at(keyword)
    return {
      ok: false,
      error: `Expected node type keyword after ~, got ${kindOrEof(keyword)}`,
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: {
      kind: mappedOption.value,
      rest: tokens.slice(2)
    },
    rest: tokens.slice(2)
  }
}

type ParsedNodePrefix = {
  readonly named: { readonly nameTokens: readonly Token[]; readonly rest: readonly Token[] }
  readonly attrs: readonly AstAttr[]
  readonly handle: string | undefined
  readonly rest: readonly Token[]
}

const parseNodePrefix = (tokens: readonly Token[]): ParseResult<ParsedNodePrefix> => {
  const named = collectNodeNameTokens(tokens)
  const firstHandleResult = parseOptionalHandle(named.rest)
  if (!firstHandleResult.ok) {
    return firstHandleResult
  }

  const attrsResult = parseAttrBlocks(firstHandleResult.value.rest)
  if (!attrsResult.ok) {
    return attrsResult
  }

  const firstHandleOption = fromNullable(firstHandleResult.value.handle)
  const secondHandleResult = isNone(firstHandleOption)
    ? parseOptionalHandle(attrsResult.value.rest)
    : {
      ok: true as const,
      value: {
        handle: firstHandleOption.value,
        rest: attrsResult.value.rest
      },
      rest: attrsResult.value.rest
    }

  if (!secondHandleResult.ok) {
    return secondHandleResult
  }

  return {
    ok: true,
    value: {
      named,
      attrs: attrsResult.value.attrs,
      handle: secondHandleResult.value.handle,
      rest: secondHandleResult.value.rest
    },
    rest: secondHandleResult.value.rest
  }
}

const parseNodeDecorations = (
  tokens: readonly Token[]
): ParseResult<{ readonly hints: readonly AstLayoutHint[]; readonly directives: readonly AstVisualDirective[]; readonly rest: readonly Token[] }> => {
  const layoutHintsResult = parseLayoutHints(tokens)
  if (!layoutHintsResult.ok) {
    return layoutHintsResult
  }

  const visualHintsResult = parseVisualDirectives(layoutHintsResult.value.rest)
  if (!visualHintsResult.ok) {
    return visualHintsResult
  }

  return {
    ok: true,
    value: {
      hints: layoutHintsResult.value.hints,
      directives: visualHintsResult.value.directives,
      rest: visualHintsResult.value.rest
    },
    rest: visualHintsResult.value.rest
  }
}

/**
 * Parse a single org-node line without descending into its indented children.
 *
 * This function owns the left-to-right node shape of the DSL: optional `~kind`,
 * display name, optional `@handle`, zero or more attribute blocks, layout hints,
 * then visual directives.
 */
const parseNodeLine: Parser<AstNode> = (tokens) => {
  const startPos = at(tokens[0])
  const withKind = parseNodeKindPrefix(tokens)

  if (!withKind.ok) {
    return withKind
  }

  const prefix = parseNodePrefix(withKind.value.rest)
  if (!prefix.ok) {
    return prefix
  }

  const decorations = parseNodeDecorations(prefix.value.rest)
  if (!decorations.ok) {
    return decorations
  }

  const finalHandle = prefix.value.handle

  if (prefix.value.named.nameTokens.length === 0 && isNone(fromNullable(finalHandle))) {
    const pos = at(decorations.value.rest[0])
    return {
      ok: false,
      error: 'Node line requires a display name or @handle',
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: buildParsedNodeLine({
      startPos,
      kind: withKind.value.kind,
      prefix: prefix.value,
      decorations: decorations.value,
      finalHandle
    }),
    rest: skipOptionalNewline(decorations.value.rest)
  }
}

type BuildParsedNodeLineInput = {
  readonly startPos: { readonly line: number; readonly col: number }
  readonly kind: AstNodeKind
  readonly prefix: ParsedNodePrefix
  readonly decorations: { readonly hints: readonly AstLayoutHint[]; readonly directives: readonly AstVisualDirective[]; readonly rest: readonly Token[] }
  readonly finalHandle: string | undefined
}

const buildParsedNodeLine = (input: BuildParsedNodeLineInput): AstNode => ({
  kind: input.kind,
  line: input.startPos.line,
  col: input.startPos.col,
  displayName: input.prefix.named.nameTokens.length > 0 ? input.prefix.named.nameTokens.map((part) => part.value).join(' ') : undefined,
  handle: input.finalHandle,
  attrs: input.prefix.attrs,
  layoutHints: input.decorations.hints,
  visualHints: input.decorations.directives,
  children: [],
  staffNodes: []
})

const parseOrgHeader: Parser<{ readonly name: string; readonly attrs: readonly AstAttr[]; readonly line: number; readonly col: number }> = (tokens) => {
  const keywordResult = token('keyword_org')(tokens)
  if (!keywordResult.ok) {
    return keywordResult
  }

  const titleResult = token('string_lit')(keywordResult.rest)
  if (!titleResult.ok) {
    return titleResult
  }

  const attrsResult = parseAttrBlocks(titleResult.rest)
  if (!attrsResult.ok) {
    return attrsResult
  }

  return {
    ok: true,
    value: {
      name: titleResult.value.value,
      attrs: attrsResult.value.attrs,
      line: keywordResult.value.line,
      col: keywordResult.value.col
    },
    rest: skipOptionalNewline(attrsResult.value.rest)
  }
}


const parseNodeWithOptionalChildren = (
  lineResult: ParseResult<AstNode>,
  afterLine: readonly Token[]
): ParseResult<{ readonly node: AstNode; readonly rest: readonly Token[] }> => {
  if (!lineResult.ok) {
    return lineResult
  }

  if (afterLine[0]?.kind !== 'indent') {
    return {
      ok: true,
      value: {
        node: lineResult.value,
        rest: afterLine
      },
      rest: afterLine
    }
  }

  const childResult = parseIndentedRootChildren(afterLine)
  if (!childResult.ok) {
    return childResult
  }

  const separated = separateStaffNodes(childResult.value)
  return {
    ok: true,
    value: {
      node: {
        ...lineResult.value,
        staffNodes: separated.staffNodes,
        children: separated.children
      },
      rest: childResult.rest
    },
    rest: childResult.rest
  }
}

const parseNodesInBlock = (
  rest: readonly Token[],
  nodes: readonly AstNode[] = []
): ParseResult<readonly AstNode[]> => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'dedent' || currentOption.value.kind === 'eof') {
    return {
      ok: true,
      value: nodes,
      rest
    }
  }

  if (currentOption.value.kind === 'newline') {
    return parseNodesInBlock(rest.slice(1), nodes)
  }

  const lineResult = parseNodeLine(rest)
  if (!lineResult.ok) {
    return lineResult
  }

  const withChildren = parseNodeWithOptionalChildren(lineResult, skipNewlines(lineResult.rest))
  if (!withChildren.ok) {
    return withChildren
  }

  return parseNodesInBlock(withChildren.value.rest, [...nodes, withChildren.value.node])
}

const parseNodeBlock = (tokens: readonly Token[]): ParseResult<readonly AstNode[]> => {
  return parseNodesInBlock(tokens)
}

const separateStaffNodes = (
  nodes: readonly AstNode[]
): { readonly staffNodes: readonly AstNode[]; readonly children: readonly AstNode[] } => ({
  staffNodes: nodes.filter((node) => node.kind === 'staff'),
  children: nodes.filter((node) => node.kind !== 'staff')
})

const parseIndentedRootChildren: Parser<readonly AstNode[]> = (tokens) => {
  const indentResult = token('indent')(tokens)
  if (!indentResult.ok) {
    const pos = at(tokens[0])
    return {
      ok: false,
      error: 'Expected indented org block',
      line: pos.line,
      col: pos.col
    }
  }

  const childrenResult = parseNodeBlock(indentResult.rest)
  if (!childrenResult.ok) {
    return childrenResult
  }

  const dedentResult = token('dedent')(childrenResult.rest)
  if (!dedentResult.ok) {
    return dedentResult
  }

  return {
    ok: true,
    value: childrenResult.value,
    rest: dedentResult.rest
  }
}

/**
 * Parse a token stream into the top-level BTL AST.
 *
 * The grammar currently accepts `config`, then `org`, then optional `links`.
 * The `style` block is extracted earlier by the style DSL pass and therefore
 * does not participate in this grammar directly.
 *
 * @param tokens Token stream produced by the lexer.
 * @returns Parsed AST on success, or the first syntax error with source coordinates.
 */
export const parse = (tokens: readonly Token[]): ParseResult<AstOrg> => {
  const configResult = parseOptionalConfig(tokens)
  if (!configResult.ok) {
    return configResult
  }

  const headerResult = parseOrgHeader(configResult.rest)
  if (!headerResult.ok) {
    return headerResult
  }

  const childrenResult = parseIndentedRootChildren(headerResult.rest)
  if (!childrenResult.ok) {
    return childrenResult
  }

  const linksResult = parseOptionalLinks(childrenResult.rest)
  if (!linksResult.ok) {
    return linksResult
  }

  const eofResult = token('eof')(skipNewlines(linksResult.rest))
  if (!eofResult.ok) {
    return eofResult
  }

  const root = buildRootNode(headerResult.value, childrenResult.value)

  return {
    ok: true,
    value: {
      name: headerResult.value.name,
      attrs: headerResult.value.attrs,
      root,
      links: linksResult.value,
      config: configResult.value
    },
    rest: []
  }
}

const buildRootNode = (
  header: { readonly name: string; readonly attrs: readonly AstAttr[]; readonly line: number; readonly col: number },
  children: readonly AstNode[]
): AstNode => {
  const { staffNodes: rootStaffNodes, children: rootChildren } = separateStaffNodes(children)

  return {
    kind: 'employee',
    line: header.line,
    col: header.col,
    displayName: header.name,
    handle: undefined,
    attrs: [],
    layoutHints: [],
    visualHints: [],
    children: rootChildren,
    staffNodes: rootStaffNodes
  }
}
