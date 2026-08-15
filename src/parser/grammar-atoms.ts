/**
 * @module parser/grammar-atoms
 *
 * Internal token and attribute parsing helpers shared by the BTL grammar.
 *
 * @packageDocumentation
 */

import { fromNullable, getOrElseOption, isNone } from '@tsfpp/prelude'
import { token } from './combinators'
import type { Token } from '../lexer/tokens'
import type { AstAttr, AstAttrValue, AstLayoutHint, AstLayoutHintKind, AstNodeKind, AstVisualDirective } from '../types/ast'
import type { ParseResult } from '../types/results'

const lineOr = (tokenValue: Token | undefined, fallback: number): number =>
  getOrElseOption<number>(() => fallback)(fromNullable(tokenValue?.line))

const colOr = (tokenValue: Token | undefined, fallback: number): number =>
  getOrElseOption<number>(() => fallback)(fromNullable(tokenValue?.col))

/**
 * Resolve a token kind or `eof` when the token is absent.
 *
 * @param tokenValue Current token candidate.
 * @returns Concrete token kind or `eof`.
 */
export const kindOrEof = (tokenValue: Token | undefined): Token['kind'] | 'eof' =>
  getOrElseOption<Token['kind'] | 'eof'>(() => 'eof')(fromNullable(tokenValue?.kind))

/**
 * Resolve a token source position with 1-based fallbacks.
 *
 * @param tokenValue Current token candidate.
 * @returns Line and column for diagnostics.
 */
export const at = (tokenValue: Token | undefined): { readonly line: number; readonly col: number } => ({
  line: lineOr(tokenValue, 1),
  col: colOr(tokenValue, 1)
})

/**
 * Drop one trailing newline token when present.
 *
 * @param tokens Remaining token stream.
 * @returns Stream without a single leading newline.
 */
export const skipOptionalNewline = (tokens: readonly Token[]): readonly Token[] => {
  const current = tokens[0]
  return current?.kind === 'newline' ? tokens.slice(1) : tokens
}

/**
 * Drop all leading newline tokens.
 *
 * @param tokens Remaining token stream.
 * @returns Stream without leading newlines.
 */
export const skipNewlines = (tokens: readonly Token[]): readonly Token[] =>
  tokens[0]?.kind === 'newline' ? skipNewlines(tokens.slice(1)) : tokens

/**
 * Map lexer keywords to AST node kinds.
 *
 * @param kind Token kind following `~`.
 * @returns AST node kind when the keyword is a valid node prefix.
 */
export const nodeKindFromKeyword = (kind: Token['kind']): AstNodeKind | undefined => {
  const map: Partial<Record<Token['kind'], AstNodeKind>> = {
    keyword_dept: 'dept',
    keyword_extern: 'extern',
    keyword_group: 'group',
    keyword_shadow: 'shadow',
    keyword_shared: 'shared',
    keyword_staff: 'staff',
    keyword_vacant: 'vacant'
  }
  return map[kind]
}

const booleanTrueAttrValue = (): AstAttrValue => ({ kind: 'boolean', value: true })

const parseSingleTokenAttrValue = (tokenValue: Token): AstAttrValue | undefined => {
  if (tokenValue.kind === 'number_lit') {
    return { kind: 'number', value: Number(tokenValue.value) }
  }

  if (tokenValue.kind === 'date_lit') {
    return { kind: 'date', value: tokenValue.value }
  }

  if (tokenValue.kind === 'url_lit') {
    return { kind: 'url', value: tokenValue.value }
  }

  if (tokenValue.kind === 'identifier' && (tokenValue.value === 'true' || tokenValue.value === 'false')) {
    return { kind: 'boolean', value: tokenValue.value === 'true' }
  }

  return undefined
}

const parseAtHandleAttrValue = (valueTokens: readonly Token[]): AstAttrValue | undefined =>
  valueTokens.length === 2 && valueTokens[0]?.kind === 'at' && valueTokens[1]?.kind === 'identifier'
    ? { kind: 'string', value: `@${valueTokens[1].value}` }
    : undefined

/**
 * Convert a token sequence into a typed attribute value.
 *
 * @param valueTokens Tokens making up one attribute value.
 * @returns Typed AST attribute value.
 */
export const attrValueFromTokens = (valueTokens: readonly Token[]): AstAttrValue => {
  if (valueTokens.length === 0) {
    return booleanTrueAttrValue()
  }

  const atHandleValue = parseAtHandleAttrValue(valueTokens)
  const atHandleValueOption = fromNullable(atHandleValue)
  if (!isNone(atHandleValueOption)) {
    return atHandleValueOption.value
  }

  const [first] = valueTokens
  const firstOption = fromNullable(first)
  if (valueTokens.length === 1 && !isNone(firstOption)) {
    const singleTokenValue = parseSingleTokenAttrValue(firstOption.value)
    const singleTokenValueOption = fromNullable(singleTokenValue)
    if (!isNone(singleTokenValueOption)) {
      return singleTokenValueOption.value
    }
  }

  return {
    kind: 'string',
    value: valueTokens.map((tokenValue) => tokenValue.value).join(' ')
  }
}

/**
 * Identify role/tag attribute keys that require tag-list parsing.
 *
 * @param key Attribute key text.
 * @returns Whether the key uses role-tag parsing rules.
 */
export const isRoleAttrKey = (key: string): boolean => key === 'role' || key === 'roles'

const toRoleTagText = (tokens: readonly Token[]): string => {
  if (tokens.length === 2 && tokens[0]?.kind === 'at' && tokens[1]?.kind === 'identifier') {
    return `@${tokens[1].value}`
  }
  return tokens.map((tokenValue) => tokenValue.value).join(' ').trim()
}

const flushRoleTag = (tokens: readonly Token[], tags: readonly string[]): readonly string[] => {
  const tag = toRoleTagText(tokens)
  return tag.length > 0 ? [...tags, tag] : tags
}

const parseRoleTokens = (
  rest: readonly Token[],
  currentTagTokens: readonly Token[] = [],
  tags: readonly string[] = []
): { readonly tags: readonly string[]; readonly rest: readonly Token[] } => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'rbracket') {
    return { tags: flushRoleTag(currentTagTokens, tags), rest }
  }

  if (currentOption.value.kind === 'comma') {
    const nextTags = flushRoleTag(currentTagTokens, tags)
    return parseRoleComma(rest, nextTags)
  }

  return parseRoleTokens(rest.slice(1), [...currentTagTokens, currentOption.value], tags)
}

const parseRoleComma = (
  rest: readonly Token[],
  nextTags: readonly string[]
): { readonly tags: readonly string[]; readonly rest: readonly Token[] } => {
  const next = rest[1]
  const nextNext = rest[2]
  const startsNextAttr =
    (next?.kind === 'identifier' || next?.kind === 'display_text') &&
    nextNext?.kind === 'colon'

  return startsNextAttr
    ? { tags: nextTags, rest }
    : parseRoleTokens(rest.slice(1), [], nextTags)
}

const consumeUntilAttrDelimiter = (
  rest: readonly Token[],
  valueTokens: readonly Token[] = []
): { readonly valueTokens: readonly Token[]; readonly rest: readonly Token[] } => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'comma' || currentOption.value.kind === 'rbracket') {
    return { valueTokens, rest }
  }

  return consumeUntilAttrDelimiter(rest.slice(1), [...valueTokens, currentOption.value])
}

const parseRoleAttrValue = (tokens: readonly Token[]): { readonly value: AstAttrValue; readonly rest: readonly Token[] } => {
  const parsed = parseRoleTokens(tokens)

  if (parsed.tags.length === 0) {
    return {
      value: { kind: 'boolean', value: true },
      rest: parsed.rest
    }
  }

  return {
    value: { kind: 'tags', value: parsed.tags },
    rest: parsed.rest
  }
}

/**
 * Parse zero or more attribute blocks from the current token stream.
 *
 * @param tokens Remaining token stream.
 * @param attrs Attributes collected so far.
 * @returns Parsed attributes and the remaining token stream.
 */
export const parseAttrBlocks = (
  tokens: readonly Token[],
  attrs: readonly AstAttr[] = []
): ParseResult<{ readonly attrs: readonly AstAttr[]; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'lbracket') {
    return {
      ok: true,
      value: { attrs, rest: tokens },
      rest: tokens
    }
  }

  const block = parseAttrBlock(tokens)
  if (!block.ok) {
    return block
  }

  return parseAttrBlocks(block.rest, [...attrs, ...block.value])
}

/**
 * Collect the display-name token run that appears before handles and decorations.
 *
 * @param tokens Remaining token stream.
 * @param acc Accumulated display-name tokens.
 * @returns Name tokens plus the remaining undecoded stream.
 */
export const collectNodeNameTokens = (
  tokens: readonly Token[],
  acc: readonly Token[] = []
): { readonly nameTokens: readonly Token[]; readonly rest: readonly Token[] } => {
  const current = tokens[0]
  const stops: readonly Token['kind'][] = ['at', 'lbracket', 'percent', 'bang', 'newline', 'indent', 'dedent', 'eof']
  const isNameToken = current?.kind === 'identifier' || current?.kind === 'display_text' || current?.kind === 'string_lit'

  const currentOption = fromNullable(current)
  if (isNone(currentOption) || stops.includes(currentOption.value.kind) || !isNameToken) {
    return { nameTokens: acc, rest: tokens }
  }

  return collectNodeNameTokens(tokens.slice(1), [...acc, currentOption.value])
}

/**
 * Parse an optional `@handle` suffix from the current token stream.
 *
 * @param tokens Remaining token stream.
 * @returns Parsed handle plus the remaining stream.
 */
export const parseOptionalHandle = (tokens: readonly Token[]): ParseResult<{ readonly handle: string | undefined; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'at') {
    return {
      ok: true,
      value: { handle: undefined, rest: tokens },
      rest: tokens
    }
  }

  const handleToken = tokens[1]
  if (handleToken?.kind !== 'identifier') {
    const pos = at(handleToken)
    return {
      ok: false,
      error: `Expected handle identifier, got ${kindOrEof(handleToken)}`,
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: { handle: handleToken.value, rest: tokens.slice(2) },
    rest: tokens.slice(2)
  }
}

/**
 * Parse zero or more `%layout-hint` decorations.
 *
 * @param tokens Remaining token stream.
 * @param hints Hints collected so far.
 * @returns Parsed hints plus the remaining stream.
 */
export const parseLayoutHints = (
  tokens: readonly Token[],
  hints: readonly AstLayoutHint[] = []
): ParseResult<{ readonly hints: readonly AstLayoutHint[]; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'percent') {
    return {
      ok: true,
      value: { hints, rest: tokens },
      rest: tokens
    }
  }

  const hint = parseLayoutHint(tokens)
  if (!hint.ok) {
    return hint
  }

  return parseLayoutHints(hint.rest, [...hints, hint.value])
}

const parseDirectiveParams = (
  tokens: readonly Token[],
  params: readonly string[] = []
): ParseResult<{ readonly params: readonly string[]; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'colon') {
    return {
      ok: true,
      value: { params, rest: tokens },
      rest: tokens
    }
  }

  const param = tokens[1]
  const paramOption = fromNullable(param)
  if (
    isNone(paramOption) ||
    paramOption.value.kind === 'newline' ||
    paramOption.value.kind === 'dedent' ||
    paramOption.value.kind === 'indent' ||
    paramOption.value.kind === 'eof'
  ) {
    const pos = at(tokens[0])
    return {
      ok: false,
      error: 'Expected directive parameter',
      line: pos.line,
      col: pos.col
    }
  }

  return parseDirectiveParams(tokens.slice(2), [...params, paramOption.value.value])
}

/**
 * Parse zero or more `!directive` decorations.
 *
 * @param tokens Remaining token stream.
 * @param directives Directives collected so far.
 * @returns Parsed directives plus the remaining stream.
 */
export const parseVisualDirectives = (
  tokens: readonly Token[],
  directives: readonly AstVisualDirective[] = []
): ParseResult<{ readonly directives: readonly AstVisualDirective[]; readonly rest: readonly Token[] }> => {
  if (tokens[0]?.kind !== 'bang') {
    return {
      ok: true,
      value: { directives, rest: tokens },
      rest: tokens
    }
  }

  const directive = parseVisualDirective(tokens)
  if (!directive.ok) {
    return directive
  }

  return parseVisualDirectives(directive.rest, [...directives, directive.value])
}

const parseAttrKeyToken = (tokenValue: Token | undefined): ParseResult<Token> => {
  const tokenOption = fromNullable(tokenValue)
  if (isNone(tokenOption)) {
    const pos = at(tokenValue)
    return {
      ok: false,
      error: 'Expected attribute key, got eof',
      line: pos.line,
      col: pos.col
    }
  }
  const safeToken = tokenOption.value

  const isBooleanKeyword = safeToken.kind === 'keyword_vacant' || safeToken.kind === 'keyword_shared'
  const isKnownKey = safeToken.kind === 'identifier' || safeToken.kind === 'display_text' || isBooleanKeyword
  if (!isKnownKey) {
    const pos = at(safeToken)
    return {
      ok: false,
      error: `Expected attribute key, got ${safeToken.kind}`,
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: safeToken,
    rest: []
  }
}

const parseAttrValueByKey = (
  keyToken: Token,
  valueStart: readonly Token[]
): { readonly attr: AstAttr; readonly restAfterValue: readonly Token[] } => {
  const isBooleanKeyword = keyToken.kind === 'keyword_vacant' || keyToken.kind === 'keyword_shared'
  const colon = valueStart[0]

  if (isBooleanKeyword && colon?.kind !== 'colon') {
    return {
      attr: { key: keyToken.value, value: booleanTrueAttrValue() },
      restAfterValue: valueStart
    }
  }

  if (colon?.kind !== 'colon') {
    return {
      attr: { key: keyToken.value, value: booleanTrueAttrValue() },
      restAfterValue: valueStart
    }
  }

  const restAfterColon = valueStart.slice(1)
  if (isRoleAttrKey(keyToken.value)) {
    const parsedRoleValue = parseRoleAttrValue(restAfterColon)
    return {
      attr: { key: keyToken.value, value: parsedRoleValue.value },
      restAfterValue: parsedRoleValue.rest
    }
  }

  const consumed = consumeUntilAttrDelimiter(restAfterColon)
  return {
    attr: { key: keyToken.value, value: attrValueFromTokens(consumed.valueTokens) },
    restAfterValue: consumed.rest
  }
}

const parseSingleAttrEntry = (
  rest: readonly Token[]
): ParseResult<{ readonly attr: AstAttr; readonly rest: readonly Token[] }> => {
  const current = rest[0]
  const currentOption = fromNullable(current)
  if (isNone(currentOption) || currentOption.value.kind === 'newline' || currentOption.value.kind === 'dedent' || currentOption.value.kind === 'eof') {
    const pos = at(current)
    return {
      ok: false,
      error: 'Expected rbracket, got eof',
      line: pos.line,
      col: pos.col
    }
  }

  const keyResult = parseAttrKeyToken(rest[0])
  if (!keyResult.ok) {
    return keyResult
  }

  const parsedAttr = parseAttrValueByKey(keyResult.value, rest.slice(1))
  const nextRest = parsedAttr.restAfterValue[0]?.kind === 'comma'
    ? parsedAttr.restAfterValue.slice(1)
    : parsedAttr.restAfterValue

  return {
    ok: true,
    value: {
      attr: parsedAttr.attr,
      rest: nextRest
    },
    rest: nextRest
  }
}

const parseAttrBlock = (tokens: readonly Token[]): ParseResult<readonly AstAttr[]> => {
  const lbracket = token('lbracket')(tokens)
  if (!lbracket.ok) {
    return lbracket
  }

  const parseAttrs = (rest: readonly Token[], attrs: readonly AstAttr[]): ParseResult<readonly AstAttr[]> => {
    if (rest[0]?.kind === 'rbracket') {
      return { ok: true, value: attrs, rest }
    }

    const nextAttr = parseSingleAttrEntry(rest)
    if (!nextAttr.ok) {
      return nextAttr
    }

    return parseAttrs(nextAttr.value.rest, [...attrs, nextAttr.value.attr])
  }

  const parsedAttrs = parseAttrs(lbracket.rest, [])
  if (!parsedAttrs.ok) {
    return parsedAttrs
  }

  const close = token('rbracket')(parsedAttrs.rest)
  if (!close.ok) {
    return close
  }

  return { ok: true, value: parsedAttrs.value, rest: close.rest }
}

const parseLayoutHint = (tokens: readonly Token[]): ParseResult<AstLayoutHint> => {
  const percent = token('percent')(tokens)
  if (!percent.ok) {
    return percent
  }

  const hintNameResult = parseLayoutHintName(percent.rest[0])
  if (!hintNameResult.ok) {
    return hintNameResult
  }

  const layoutHintKind = parseLayoutHintKind(hintNameResult.value.value)
  const layoutHintKindOption = fromNullable(layoutHintKind)
  if (isNone(layoutHintKindOption)) {
    const pos = at(hintNameResult.value)
    return {
      ok: false,
      error: `Unknown layout hint kind: ${hintNameResult.value.value}`,
      line: pos.line,
      col: pos.col
    }
  }

  const paramResult = parseLayoutHintParam(percent.rest.slice(1))
  if (!paramResult.ok) {
    return paramResult
  }

  return {
    ok: true,
    value: { kind: layoutHintKindOption.value, param: paramResult.value.param },
    rest: paramResult.value.rest
  }
}

const parseLayoutHintName = (hintToken: Token | undefined): ParseResult<Token> => {
  if (hintToken?.kind !== 'identifier') {
    const pos = at(hintToken)
    return {
      ok: false,
      error: `Expected layout hint name, got ${kindOrEof(hintToken)}`,
      line: pos.line,
      col: pos.col
    }
  }

  return {
    ok: true,
    value: hintToken,
    rest: []
  }
}

const parseLayoutHintParam = (
  restAfterName: readonly Token[]
): ParseResult<{ readonly param: number | string | undefined; readonly rest: readonly Token[] }> => {
  const colon = restAfterName[0]
  const valueToken = restAfterName[1]
  const rest = colon?.kind === 'colon' ? restAfterName.slice(2) : restAfterName

  if (colon?.kind !== 'colon') {
    return {
      ok: true,
      value: { param: undefined, rest },
      rest
    }
  }

  const valueTokenOption = fromNullable(valueToken)
  if (isNone(valueTokenOption)) {
    return parseLayoutHintMissingParam(colon)
  }
  const safeValueToken = valueTokenOption.value

  const parsedParam = safeValueToken.kind === 'number_lit'
    ? Number(safeValueToken.value)
    : safeValueToken.value

  return {
    ok: true,
    value: { param: parsedParam, rest },
    rest
  }
}

const parseLayoutHintMissingParam = (
  colon: Token
): ParseResult<{ readonly param: number | string | undefined; readonly rest: readonly Token[] }> => {
  const pos = at(colon)
  return {
    ok: false,
    error: 'Expected layout hint parameter',
    line: pos.line,
    col: pos.col
  }
}

const parseLayoutHintKind = (value: string): AstLayoutHintKind | undefined => {
  switch (value) {
    case 'hanging': return 'hanging'
    case 'hanging-left': return 'hanging-left'
    case 'hanging-right': return 'hanging-right'
    case 'hanging-both': return 'hanging-both'
    case 'multirow': return 'multirow'
    case 'compact': return 'compact'
    case 'wide': return 'wide'
    case 'flat': return 'flat'
    case 'expand': return 'expand'
    default: return undefined
  }
}

const parseVisualDirective = (tokens: readonly Token[]): ParseResult<AstVisualDirective> => {
  const bang = token('bang')(tokens)
  if (!bang.ok) {
    return bang
  }

  const nameToken = bang.rest[0]
  if (nameToken?.kind !== 'identifier') {
    const pos = at(nameToken)
    return {
      ok: false,
      error: `Expected directive name, got ${kindOrEof(nameToken)}`,
      line: pos.line,
      col: pos.col
    }
  }

  const paramsResult = parseDirectiveParams(bang.rest.slice(1))
  if (!paramsResult.ok) {
    return paramsResult
  }

  return {
    ok: true,
    value: { name: nameToken.value, params: paramsResult.value.params },
    rest: paramsResult.value.rest
  }
}