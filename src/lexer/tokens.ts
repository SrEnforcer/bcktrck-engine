/**
 * @module lexer/tokens
 *
 * Token type definitions: represents lexically significant elements recognized during tokenization.
 *
 * Tokens include keywords (config, org, links, node types), operators (brackets, colons, etc.),
 * literals (identifiers, dates, numbers, URLs), indentation markers, and comment/EOF sentinels.
 *
 * @packageDocumentation
 */

/**
 * Discriminant for every token variant produced by the BTL lexer.
 * Exhaustive matching on `TokenKind` must use `absurd` as the default branch.
 */
export type TokenKind =
  | 'indent'
  | 'dedent'
  | 'newline'
  | 'eof'
  | 'error'
  | 'keyword_org'
  | 'keyword_config'
  | 'keyword_links'
  | 'keyword_staff'
  | 'keyword_dept'
  | 'keyword_group'
  | 'keyword_vacant'
  | 'keyword_shared'
  | 'keyword_shadow'
  | 'keyword_extern'
  | 'tilde'
  | 'at'
  | 'percent'
  | 'bang'
  | 'arrow'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'comma'
  | 'string_lit'
  | 'number_lit'
  | 'date_lit'
  | 'url_lit'
  | 'identifier'
  | 'display_text'

/**
 * A single lexical token produced by the BTL tokenizer.
 * `line` and `col` are 1-based source positions used for error reporting.
 */
export type Token = {
  readonly kind: TokenKind
  readonly value: string
  readonly line: number
  readonly col: number
}
