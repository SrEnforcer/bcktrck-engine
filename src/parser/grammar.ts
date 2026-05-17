/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * BTL grammar: defines the structure of valid source documents.
 *
 * Orchestrates parsing of top-level sections (config, links, org) and recursively
 * handles node definitions, attributes, layout hints, and staff assignments.
 * Detailed error messages with line/col positions aid debugging.
 */

// DEVIATION(2.4): Grammar remains centralized during migration from engine; decomposition into focused parser modules is planned.
/* eslint-disable max-lines */

import type { AstAttr, AstAttrValue, AstConfig, AstLayoutHint, AstLayoutHintKind, AstLink, AstNode, AstNodeKind, AstOrg, AstVisualDirective } from '../types/ast'
import type { ParseResult } from '../types/results'
import { fromNullable, getOrElse, isNone } from '@tsfpp/prelude'
import { token, type Parser } from './combinators'
import type { Token } from '../lexer/tokens'

const lineOr = (tokenValue: Token | undefined, fallback: number): number =>
  getOrElse<number>(() => fallback)(fromNullable(tokenValue?.line))

const colOr = (tokenValue: Token | undefined, fallback: number): number =>
  getOrElse<number>(() => fallback)(fromNullable(tokenValue?.col))

const kindOrEof = (tokenValue: Token | undefined): Token['kind'] | 'eof' =>
  getOrElse<Token['kind'] | 'eof'>(() => 'eof')(fromNullable(tokenValue?.kind))

const at = (tokenValue: Token | undefined): { readonly line: number; readonly col: number } => ({
  line: lineOr(tokenValue, 1),
  col: colOr(tokenValue, 1)
})

const skipOptionalNewline = (tokens: readonly Token[]): readonly Token[] => {
  const current = tokens[0]
  return current?.kind === 'newline' ? tokens.slice(1) : tokens
}

const skipNewlines = (tokens: readonly Token[]): readonly Token[] => {
  return tokens[0]?.kind === 'newline' ? skipNewlines(tokens.slice(1)) : tokens
}

const nodeKindFromKeyword = (kind: Token['kind']): AstNodeKind | undefined => {
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

const attrValueFromTokens = (valueTokens: readonly Token[]): AstAttrValue => {
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

const isRoleAttrKey = (key: string): boolean => key === 'role' || key === 'roles'

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

const parseAttrBlocks = (
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

const collectNodeNameTokens = (
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

const parseOptionalHandle = (tokens: readonly Token[]): ParseResult<{ readonly handle: string | undefined; readonly rest: readonly Token[] }> => {
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

const parseLayoutHints = (
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

const parseVisualDirectives = (
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
 * Parse a [key: value, key: value] attribute block.
 * Values can be typed (numbers, booleans, dates, URLs) or strings depending on their format.
 */
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

const parseOptionalConfig = (tokens: readonly Token[]): ParseResult<AstConfig> => {
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

const parseOptionalLinks = (tokens: readonly Token[]): ParseResult<readonly AstLink[]> => {
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
