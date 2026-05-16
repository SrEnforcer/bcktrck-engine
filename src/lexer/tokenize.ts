/**
 * Lexical analyzer: converts BTL source text into a stream of tokens.
 *
 * Recognizes keywords, identifiers, literals (dates, numbers, URLs), operators,
 * and indentation-sensitive markers (indent/dedent). Supports single-line comments (// …).
 * Records line and column positions for all tokens to enable precise error reporting.
 */

// DEVIATION(2.4): Tokenization remains consolidated while parser/lexer boundary extraction is staged.

import type { Token, TokenKind } from './tokens'

type IndentStyle = 'spaces' | 'tabs'
const BASE_INDENT_LEVEL = 0

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]*$/
const DATE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/
const NUMBER_PATTERN = /^\d+(\.\d+)?$/

const topLevelKeywords: Readonly<Record<string, TokenKind>> = {
  config: 'keyword_config',
  links: 'keyword_links',
  org: 'keyword_org'
}

const nodeKeywords: Readonly<Record<string, TokenKind>> = {
  dept: 'keyword_dept',
  extern: 'keyword_extern',
  group: 'keyword_group',
  shadow: 'keyword_shadow',
  shared: 'keyword_shared',
  staff: 'keyword_staff',
  vacant: 'keyword_vacant'
}

const appendToken = (
  tokens: readonly Token[],
  token: Token
): readonly Token[] => [...tokens, token]

const classifyWord = (word: string): TokenKind => {
  const topLevelKeyword = topLevelKeywords[word]
  if (topLevelKeyword !== undefined) {
    return topLevelKeyword
  }

  const nodeKeyword = nodeKeywords[word]
  if (nodeKeyword !== undefined) {
    return nodeKeyword
  }

  if (IDENTIFIER_PATTERN.test(word)) {
    return 'identifier'
  }

  if (DATE_PATTERN.test(word)) {
    return 'date_lit'
  }

  if (NUMBER_PATTERN.test(word)) {
    return 'number_lit'
  }

  if (word.includes('://')) {
    return 'url_lit'
  }

  return 'display_text'
}

const readIndent = (lineText: string): { readonly indentRaw: string; readonly content: string } => {
  const indentMatch = lineText.match(/^[ \t]*/)
  const indentRaw = indentMatch?.[0] ?? ''
  const content = lineText.slice(indentRaw.length)
  return { indentRaw, content }
}

const hasOnlyCommentOrWhitespace = (content: string): boolean => {
  const trimmed = content.trim()
  return trimmed.length === 0 || trimmed.startsWith('//')
}

const isMixedIndent = (indentRaw: string): boolean => indentRaw.includes(' ') && indentRaw.includes('\t')

const toIndentWidth = (indentRaw: string): number => indentRaw.length

const singleCharTokens: Readonly<Record<string, TokenKind>> = {
  '!': 'bang',
  '%': 'percent',
  ',': 'comma',
  ':': 'colon',
  '@': 'at',
  '[': 'lbracket',
  ']': 'rbracket',
  '~': 'tilde'
}

const tryParseArrow = (lineText: string, index: number): boolean =>
  lineText[index] === '-' && lineText[index + 1] === '-' && lineText[index + 2] === '>'

const parseString = (
  lineText: string,
  line: number,
  index: number
): { readonly nextIndex: number; readonly tokens: readonly Token[] } => {
  const endQuote = lineText.indexOf('"', index + 1)
  if (endQuote === -1) {
    return {
      nextIndex: lineText.length,
      tokens: [{ kind: 'error', value: 'Unclosed string literal', line, col: index + 1 }]
    }
  }

  const value = lineText.slice(index + 1, endQuote)
  return {
    nextIndex: endQuote + 1,
    tokens: [{ kind: 'string_lit', value, line, col: index + 1 }]
  }
}

const parseWord = (
  lineText: string,
  line: number,
  index: number
): { readonly nextIndex: number; readonly tokens: readonly Token[] } => {
  const specialIndex = lineText.slice(index).search(/\s|~|@|%|!|\[|\]|:|,/)
  const end = specialIndex === -1 ? lineText.length : index + specialIndex
  const raw = lineText.slice(index, end)
  const value = raw.trim()

  const tokens = value.length > 0
    ? [{ kind: classifyWord(value), value, line, col: index + 1 }]
    : []

  return {
    nextIndex: end,
    tokens
  }
}

type TokenizeLineInput = {
  readonly lineText: string
  readonly line: number
  readonly index: number
  readonly tokens: readonly Token[]
}

// DEVIATION(4.4): A single recursive scanner keeps token priority and stopping rules deterministic.
// eslint-disable-next-line max-lines-per-function -- recursive token scanner keeps all token-class branches colocated for deterministic left-to-right lexing.
const tokenizeLine = (input: TokenizeLineInput): readonly Token[] => {
  if (input.index >= input.lineText.length) {
    return input.tokens
  }

  const ch = input.lineText[input.index] ?? ''
  if (ch === ' ' || ch === '\t') {
    return tokenizeLine({ ...input, index: input.index + 1 })
  }

  if (input.lineText[input.index] === '/' && input.lineText[input.index + 1] === '/') {
    return input.tokens
  }

  if (tryParseArrow(input.lineText, input.index)) {
    return tokenizeLine({
      ...input,
      index: input.index + 3,
      tokens: appendToken(input.tokens, { kind: 'arrow', value: '-->', line: input.line, col: input.index + 1 })
    })
  }

  const singleCharToken = singleCharTokens[ch]
  if (singleCharToken !== undefined) {
    return tokenizeLine({
      ...input,
      index: input.index + 1,
      tokens: appendToken(input.tokens, { kind: singleCharToken, value: ch, line: input.line, col: input.index + 1 })
    })
  }

  if (ch === '"') {
    const parsedString = parseString(input.lineText, input.line, input.index)
    return tokenizeLine({
      ...input,
      index: parsedString.nextIndex,
      tokens: [...input.tokens, ...parsedString.tokens]
    })
  }

  const parsedWord = parseWord(input.lineText, input.line, input.index)
  return tokenizeLine({
    ...input,
    index: parsedWord.nextIndex,
    tokens: [...input.tokens, ...parsedWord.tokens]
  })
}

/**
 * Tokenize BTL source into a stream of typed tokens with line/column info.
 *
 * Validates:
 * - Indentation consistency (all spaces or all tabs, not mixed)
 * - Single indentation style throughout the file
 * - Valid keyword, identifier, and literal patterns
 *
 * @param source Raw BTL text
 * @returns Array of tokens with position information
 */
// DEVIATION(4.4): Tokenization keeps indent-state helpers in one total state-machine boundary for line-stable diagnostics.
// eslint-disable-next-line max-lines-per-function -- tokenize keeps indent state helpers colocated for a single recursive state-machine implementation.
export const tokenize = (source: string): readonly Token[] => {
  const lines = source.replace(/\r\n/g, '\n').split('\n')

  const withOptionalLineBreak = (
    input: {
      readonly tokens: readonly Token[]
      readonly idx: number
      readonly lineNumber: number
      readonly col: number
    }
  ): readonly Token[] => (
    input.idx < lines.length - 1
      ? appendToken(input.tokens, { kind: 'newline', value: '\n', line: input.lineNumber, col: input.col })
      : input.tokens
  )

  const resolveIndentStyle = (
    input: {
      readonly indentRaw: string
      readonly indentStyle: IndentStyle | undefined
      readonly lineNumber: number
      readonly tokens: readonly Token[]
    }
  ): {
    readonly nextIndentStyle: IndentStyle | undefined
    readonly tokens: readonly Token[]
    readonly hasError: boolean
  } => {
    if (input.indentRaw.length === 0) {
      return { nextIndentStyle: input.indentStyle, tokens: input.tokens, hasError: false }
    }

    const currentStyle: IndentStyle = input.indentRaw.includes('\t') ? 'tabs' : 'spaces'
    if (input.indentStyle !== undefined && input.indentStyle !== currentStyle) {
      return {
        nextIndentStyle: input.indentStyle,
        tokens: appendToken(input.tokens, { kind: 'error', value: 'Mixed indentation: inconsistent indentation style', line: input.lineNumber, col: 1 }),
        hasError: true
      }
    }

    return {
      nextIndentStyle: input.indentStyle ?? currentStyle,
      tokens: input.tokens,
      hasError: false
    }
  }

  const dedentTo = (
    input: {
      readonly indentWidth: number
      readonly lineNumber: number
      readonly stack: readonly number[]
      readonly tokens: readonly Token[]
    }
  ): { readonly stack: readonly number[]; readonly tokens: readonly Token[] } => {
    const top = input.stack[input.stack.length - 1] ?? 0
    if (top <= input.indentWidth) {
      return { stack: input.stack, tokens: input.tokens }
    }

    return dedentTo({
      ...input,
      stack: input.stack.slice(0, -1),
      tokens: appendToken(input.tokens, { kind: 'dedent', value: '', line: input.lineNumber, col: 1 })
    })
  }

  const applyIndentTransition = (
    input: {
      readonly indentWidth: number
      readonly lineNumber: number
      readonly indentStack: readonly number[]
      readonly tokens: readonly Token[]
    }
  ): { readonly stack: readonly number[]; readonly tokens: readonly Token[] } => {
    const previousIndent = input.indentStack[input.indentStack.length - 1] ?? 0
    if (input.indentWidth > previousIndent) {
      return {
        stack: [...input.indentStack, input.indentWidth],
        tokens: appendToken(input.tokens, { kind: 'indent', value: '', line: input.lineNumber, col: 1 })
      }
    }

    if (input.indentWidth < previousIndent) {
      const dedented = dedentTo({
        indentWidth: input.indentWidth,
        lineNumber: input.lineNumber,
        stack: input.indentStack,
        tokens: input.tokens
      })
      const dedentedTop = dedented.stack[dedented.stack.length - 1] ?? 0
      return dedentedTop === input.indentWidth
        ? dedented
        : {
            stack: dedented.stack,
            tokens: appendToken(dedented.tokens, { kind: 'error', value: 'Invalid dedent level', line: input.lineNumber, col: 1 })
          }
    }

    return { stack: input.indentStack, tokens: input.tokens }
  }

  const closeRemainingIndents = (
    stack: readonly number[],
    tokens: readonly Token[]
  ): readonly Token[] => {
    if (stack.length <= 1) {
      return tokens
    }

    return closeRemainingIndents(
      stack.slice(0, -1),
      appendToken(tokens, { kind: 'dedent', value: '', line: lines.length, col: 1 })
    )
  }

  // Recursively process each line
  // DEVIATION(4.4): Recursive line processing centralizes indentation transitions and preserves deterministic ordering.
  // eslint-disable-next-line max-lines-per-function -- recursive line processor intentionally centralizes indentation state transitions.
  const processLines = (
    input: {
      readonly idx: number
      readonly tokens: readonly Token[]
      readonly indentStack: readonly number[]
      readonly indentStyle: IndentStyle | undefined
    }
  ): readonly Token[] => {
    if (input.idx >= lines.length) {
      const finalTokens = closeRemainingIndents(input.indentStack, input.tokens)
      return [
        ...finalTokens,
        { kind: 'eof', value: '', line: lines.length + 1, col: 1 }
      ]
    }

    const lineNumber = input.idx + 1
    const currentLine = lines[input.idx] ?? ''
    const { indentRaw, content } = readIndent(currentLine)

    // Only comment/whitespace
    if (hasOnlyCommentOrWhitespace(content)) {
      const nextTokens = withOptionalLineBreak({
        tokens: input.tokens,
        idx: input.idx,
        lineNumber,
        col: currentLine.length + 1
      })
      return processLines({ ...input, idx: input.idx + 1, tokens: nextTokens })
    }

    // Mixed indent error
    if (isMixedIndent(indentRaw)) {
      const nextTokens = withOptionalLineBreak(
        {
          tokens: appendToken(input.tokens, { kind: 'error', value: 'Mixed indentation: tabs and spaces on same line', line: lineNumber, col: 1 }),
          idx: input.idx,
          lineNumber,
          col: currentLine.length + 1
        }
      )
      return processLines({ ...input, idx: input.idx + 1, tokens: nextTokens })
    }

    const styleResolution = resolveIndentStyle({
      indentRaw,
      indentStyle: input.indentStyle,
      lineNumber,
      tokens: input.tokens
    })
    if (styleResolution.hasError) {
      return processLines({
        ...input,
        idx: input.idx + 1,
        tokens: styleResolution.tokens,
        indentStyle: styleResolution.nextIndentStyle
      })
    }

    const indentWidth = toIndentWidth(indentRaw)
    const transitioned = applyIndentTransition({
      indentWidth,
      lineNumber,
      indentStack: input.indentStack,
      tokens: styleResolution.tokens
    })

    // Tokenize content (functional)
    const lineTokens = tokenizeLine({ lineText: content, line: lineNumber, index: 0, tokens: [] })
    const withLineTokens = [...transitioned.tokens, ...lineTokens]
    const nextTokens = withOptionalLineBreak({
      tokens: withLineTokens,
      idx: input.idx,
      lineNumber,
      col: currentLine.length + 1
    })

    return processLines({
      ...input,
      idx: input.idx + 1,
      tokens: nextTokens,
      indentStack: transitioned.stack,
      indentStyle: styleResolution.nextIndentStyle
    })
  }

  return processLines({ idx: 0, tokens: [], indentStack: [BASE_INDENT_LEVEL], indentStyle: undefined })
}
