/**
 * @module parser/grammar-blocks
 *
 * Internal config and link block parsers shared by the top-level grammar.
 *
 * @packageDocumentation
 */

import { fromNullable, isNone } from '@tsfpp/prelude'
import { token } from './combinators'
import type { Token } from '../lexer/tokens'
import type { AstAttr, AstConfig, AstLink } from '../types/ast'
import type { ParseResult } from '../types/results'
import { at, attrValueFromTokens, kindOrEof, parseAttrBlocks, skipNewlines, skipOptionalNewline } from './grammar-atoms'

const collectConfigValueTokens = (
  rest: readonly Token[],
  acc: readonly Token[] = []
): { readonly valueTokens: readonly Token[]; readonly rest: readonly Token[] } => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'newline' || currentOption.value.kind === 'dedent' || currentOption.value.kind === 'eof') {
    return { valueTokens: acc, rest }
  }

  return collectConfigValueTokens(rest.slice(1), [...acc, currentOption.value])
}

const parseConfigKeyAndColon = (
  tokens: readonly Token[]
): ParseResult<{ readonly keyToken: Token; readonly valueTokensStart: readonly Token[] }> => {
  const keyToken = tokens[0]
  const keyKind = kindOrEof(keyToken)
  if (!isConfigKeyToken(keyToken)) {
    const pos = at(keyToken)
    return {
      ok: false,
      error: `Expected config key, got ${keyKind}`,
      line: pos.line,
      col: pos.col
    }
  }

  const colonToken = tokens[1]
  const colonKind = kindOrEof(colonToken)
  if (!isColonToken(colonToken)) {
    const pos = at(colonToken)
    return {
      ok: false,
      error: `Expected colon, got ${colonKind}`,
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: {
      keyToken,
      valueTokensStart: tokens.slice(2)
    },
    rest: tokens.slice(2)
  }
}

const isConfigKeyToken = (tokenValue: Token | undefined): tokenValue is Token =>
  tokenValue?.kind === 'identifier' || tokenValue?.kind === 'display_text'

const isColonToken = (tokenValue: Token | undefined): tokenValue is Token =>
  tokenValue?.kind === 'colon'

const parseConfigLine = (tokens: readonly Token[]): ParseResult<AstAttr> => {
  const keyAndColon = parseConfigKeyAndColon(tokens)
  if (!keyAndColon.ok) {
    return keyAndColon
  }

  const consumed = collectConfigValueTokens(keyAndColon.value.valueTokensStart)

  return {
    ok: true,
    value: {
      key: keyAndColon.value.keyToken.value,
      value: attrValueFromTokens(consumed.valueTokens)
    },
    rest: skipOptionalNewline(consumed.rest)
  }
}

const parseConfigPairs = (
  rest: readonly Token[],
  pairs: readonly AstAttr[] = []
): ParseResult<{ readonly pairs: readonly AstAttr[]; readonly rest: readonly Token[] }> => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'dedent' || currentOption.value.kind === 'eof') {
    return {
      ok: true,
      value: { pairs, rest },
      rest
    }
  }

  if (currentOption.value.kind === 'newline') {
    return parseConfigPairs(rest.slice(1), pairs)
  }

  const pairResult = parseConfigLine(rest)
  if (!pairResult.ok) {
    return pairResult
  }

  return parseConfigPairs(pairResult.rest, [...pairs, pairResult.value])
}

/**
 * Parse the optional top-level `config` block.
 *
 * @param tokens Remaining token stream.
 * @returns Parsed config or an empty config when the block is absent.
 */
export const parseOptionalConfig = (tokens: readonly Token[]): ParseResult<AstConfig> => {
  const start = skipNewlines(tokens)
  if (start[0]?.kind !== 'keyword_config') {
    return {
      ok: true,
      value: { pairs: [] },
      rest: start
    }
  }

  const restAfterHeader = skipOptionalNewline(start.slice(1))
  const indent = token('indent')(restAfterHeader)
  if (!indent.ok) {
    return indent
  }

  const pairsResult = parseConfigPairs(indent.rest)
  if (!pairsResult.ok) {
    return pairsResult
  }

  const dedent = token('dedent')(pairsResult.value.rest)
  if (!dedent.ok) {
    return dedent
  }

  return {
    ok: true,
    value: { pairs: pairsResult.value.pairs },
    rest: skipNewlines(dedent.rest)
  }
}

const parseLinkLine = (tokens: readonly Token[]): ParseResult<AstLink> => {
  const atFrom = token('at')(tokens)
  if (!atFrom.ok) {
    return atFrom
  }

  const fromToken = token('identifier')(atFrom.rest)
  if (!fromToken.ok) {
    return fromToken
  }

  const arrowToken = token('arrow')(fromToken.rest)
  if (!arrowToken.ok) {
    return arrowToken
  }

  const atTo = token('at')(arrowToken.rest)
  if (!atTo.ok) {
    return atTo
  }

  const toToken = token('identifier')(atTo.rest)
  if (!toToken.ok) {
    return toToken
  }

  const attrsResult = parseAttrBlocks(toToken.rest)
  if (!attrsResult.ok) {
    return attrsResult
  }

  return {
    ok: true,
    value: {
      line: atFrom.value.line,
      col: atFrom.value.col,
      from: fromToken.value.value,
      to: toToken.value.value,
      attrs: attrsResult.value.attrs
    },
    rest: skipOptionalNewline(attrsResult.value.rest)
  }
}

const parseLinksInBlock = (
  rest: readonly Token[],
  links: readonly AstLink[] = []
): ParseResult<{ readonly links: readonly AstLink[]; readonly rest: readonly Token[] }> => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'dedent' || currentOption.value.kind === 'eof') {
    return {
      ok: true,
      value: { links, rest },
      rest
    }
  }

  if (currentOption.value.kind === 'newline') {
    return parseLinksInBlock(rest.slice(1), links)
  }

  const linkResult = parseLinkLine(rest)
  if (!linkResult.ok) {
    return linkResult
  }

  return parseLinksInBlock(linkResult.rest, [...links, linkResult.value])
}

/**
 * Parse the optional top-level `links` block.
 *
 * @param tokens Remaining token stream.
 * @returns Parsed links or an empty list when the block is absent.
 */
export const parseOptionalLinks = (tokens: readonly Token[]): ParseResult<readonly AstLink[]> => {
  const start = skipNewlines(tokens)
  if (start[0]?.kind !== 'keyword_links') {
    return {
      ok: true,
      value: [],
      rest: start
    }
  }

  const restAfterHeader = skipOptionalNewline(start.slice(1))
  const indent = token('indent')(restAfterHeader)
  if (!indent.ok) {
    return indent
  }

  const linksResult = parseLinksInBlock(indent.rest)
  if (!linksResult.ok) {
    return linksResult
  }

  const dedent = token('dedent')(linksResult.value.rest)
  if (!dedent.ok) {
    return dedent
  }

  return {
    ok: true,
    value: linksResult.value.links,
    rest: skipNewlines(dedent.rest)
  }
}