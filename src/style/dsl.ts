/**
 * @module style/dsl
 *
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Parses the `style` block embedded in BTL, strips it from the source while
 * preserving line numbers, and resolves selectors into per-node render styles.
 * This module owns the translation from textual style DSL to immutable maps
 * consumed by layout and rendering.
 *
 * @packageDocumentation
 */

import type { EdgeStyleValue } from '../layout/types'
import { fromNullable, intoMap, intoSet, isNone } from '@tsfpp/prelude'
import { extractTopLevelBlock, type BlockLine } from './dsl-blocks'
import type { AstNodeKind } from '../types/ast'
import type { ParseErr } from '../types/results'
import type { IconPos } from '../icons/render'
import { emptyDefinitions, emptyStyleSheet, parseVariableDeclaration, applyVariableDeclaration } from './dsl-definitions'
/** Re-export stylesheet merge and definition application helpers used by compile orchestration. */
export { mergeStyleSheets, applyDefinitionsToStyleSheet } from './dsl-definitions'
/** Re-export selector resolution from stylesheet rules to per-node render styles. */
export { resolveStyleSheet } from './dsl-resolve'

type BorderStyleValue = 'solid' | 'dashed' | 'dotted' | 'none'

type StylePropertyName = 'background-color' | 'border-color' | 'border-style' | 'border-width' | 'color' | 'edge-style' | 'edge-width' | 'font-size' | 'font-weight' | 'icon' | 'icon-color' | 'icon-pos' | 'icon-size' | 'icon-opacity' | 'line-spacing'

type StyleSelector =
  | { readonly kind: 'node'; readonly line: number; readonly col: number }
  | { readonly kind: 'handle'; readonly handle: string; readonly line: number; readonly col: number }
  | { readonly kind: 'children'; readonly handle: string; readonly line: number; readonly col: number }
  | { readonly kind: 'role'; readonly role: string; readonly line: number; readonly col: number }
  | { readonly kind: 'role-children'; readonly role: string; readonly line: number; readonly col: number }
  | { readonly kind: 'type'; readonly type: string; readonly line: number; readonly col: number }
  | { readonly kind: 'type-children'; readonly type: string; readonly line: number; readonly col: number }
  | { readonly kind: 'node-kind'; readonly nodeKind: AstNodeKind; readonly line: number; readonly col: number }
  | { readonly kind: 'node-kind-children'; readonly nodeKind: AstNodeKind; readonly line: number; readonly col: number }
  | { readonly kind: 'node-name'; readonly line: number; readonly col: number }
  | { readonly kind: 'node-title'; readonly line: number; readonly col: number }

type StyleDeclaration = {
  readonly property: StylePropertyName
  readonly rawValue: string
  readonly line: number
  readonly col: number
}

type StyleRule = {
  readonly selector: StyleSelector
  readonly declarations: readonly StyleDeclaration[]
}

type VariableIconEntry = {
  readonly variable: string
  readonly icon: string
  readonly normalizedValue: string
}

type ParsedDefinitions = {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: ReadonlyArray<VariableIconEntry>
}

type ParsedStyleSheet = {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: ReadonlyArray<VariableIconEntry>
  readonly rules: readonly StyleRule[]
}

/**
 * Resolved node-level visual style values after selector evaluation.
 */
export type ResolvedNodeStyle = {
  readonly backgroundColor?: string
  readonly borderColor?: string
  readonly borderStyle?: BorderStyleValue
  readonly borderWidth?: number
  readonly color?: string
  readonly edgeStyle?: EdgeStyleValue
  readonly edgeWidth?: number
  readonly fontSize?: number
  readonly fontWeight?: string
  readonly lineSpacing?: number
  readonly icon?: readonly string[]
  readonly iconColor?: string
  readonly iconPos?: IconPos
  readonly iconSize?: number
  readonly iconOpacity?: number
}

/**
 * Immutable node-style map keyed by resolved node handle.
 */
export type ResolvedStyleMap = ReadonlyMap<string, ResolvedNodeStyle>

/**
 * Shared text style values for node-name and node-title rendering.
 */
export type ResolvedTextStyle = {
  readonly color?: string
  readonly fontSize?: number
  readonly fontWeight?: string
  readonly lineSpacing?: number
}

/**
 * Text-style bundle for node-name and node-title selectors.
 */
export type ResolvedTextStyles = {
  readonly nodeName: ResolvedTextStyle
  readonly nodeTitle: ResolvedTextStyle
}

type StyleExtractionResult =
  | { readonly ok: true; readonly strippedSource: string; readonly styleSheet: ParsedStyleSheet }
  | { readonly ok: false; readonly error: ParseErr }

type DefinitionsExtractionResult =
  | { readonly ok: true; readonly strippedSource: string; readonly definitions: ParsedDefinitions }
  | { readonly ok: false; readonly error: ParseErr }

const stylePropertyNames: readonly StylePropertyName[] = ['background-color', 'border-color', 'border-style', 'border-width', 'color', 'edge-style', 'edge-width', 'font-size', 'font-weight', 'icon', 'icon-color', 'icon-pos', 'icon-size', 'icon-opacity', 'line-spacing']
const styleProperties: ReadonlySet<string> = intoSet(stylePropertyNames)

const selectorNodeKindMap: Readonly<Record<string, AstNodeKind>> = {
  department: 'dept',
  dept: 'dept',
  vacancy: 'vacant',
  vacant: 'vacant',
  employee: 'employee',
  staff: 'staff',
  shared: 'shared',
  shadow: 'shadow',
  group: 'group',
  extern: 'extern'
}

const isStylePropertyName = (value: string): value is StylePropertyName => styleProperties.has(value)

const parseError = (line: number, col: number, error: string): ParseErr => ({ ok: false, line, col, error })

const isBlankOrComment = (line: string): boolean => {
  const trimmed = line.trim()
  return trimmed.length === 0 || trimmed.startsWith('//')
}


type ParseStyleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ParseErr }

const selectorError = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> => ({
  ok: false,
  error: parseError(lineNo, col, `Invalid style selector: ${line}`)
})

const normalizeSelectorNodeKind = (raw: string): AstNodeKind | undefined => selectorNodeKindMap[raw.toLowerCase()]

type ParseNodeKindSelectorMatchInput = {
  readonly line: string
  readonly lineNo: number
  readonly col: number
  readonly rawKind: string | undefined
  readonly kind: 'node-kind' | 'node-kind-children'
}

const parseNodeKindSelectorMatch = (input: ParseNodeKindSelectorMatchInput): ParseStyleResult<StyleSelector> => {
  const rawKindOption = fromNullable(input.rawKind)
  if (isNone(rawKindOption)) {
    return selectorError(input.line, input.lineNo, input.col)
  }

  const nodeKind = normalizeSelectorNodeKind(rawKindOption.value)
  const nodeKindOption = fromNullable(nodeKind)
  return isNone(nodeKindOption)
    ? { ok: false, error: parseError(input.lineNo, input.col, `Unknown kind selector: ${rawKindOption.value}`) }
    : {
        ok: true,
        value: {
          kind: input.kind,
          nodeKind: nodeKindOption.value,
          line: input.lineNo,
          col: input.col
        }
      }
}

const parseHandleSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const handleChildren = line.match(/^@([a-zA-Z0-9_-]+):children$/)
  const handleChildrenOption = fromNullable(handleChildren)
  if (!isNone(handleChildrenOption)) {
    const handleOption = fromNullable(handleChildrenOption.value[1])
    return isNone(handleOption)
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'children',
            handle: handleOption.value,
            line: lineNo,
            col
          }
        }
  }

  const handleOnly = line.match(/^@([a-zA-Z0-9_-]+)$/)
  const handleOnlyOption = fromNullable(handleOnly)
  if (isNone(handleOnlyOption)) {
    return undefined
  }

  const handleOption = fromNullable(handleOnlyOption.value[1])
  return isNone(handleOption)
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'handle',
          handle: handleOption.value,
          line: lineNo,
          col
        }
      }
}

const parseRoleSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const roleChildren = line.match(/^\.role-([a-zA-Z0-9_-]+):children$/)
  const roleChildrenOption = fromNullable(roleChildren)
  if (!isNone(roleChildrenOption)) {
    const roleOption = fromNullable(roleChildrenOption.value[1])
    return isNone(roleOption)
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'role-children',
            role: roleOption.value.toLowerCase(),
            line: lineNo,
            col
          }
        }
  }

  const roleOnly = line.match(/^\.role-([a-zA-Z0-9_-]+)$/)
  const roleOnlyOption = fromNullable(roleOnly)
  if (isNone(roleOnlyOption)) {
    return undefined
  }

  const roleOption = fromNullable(roleOnlyOption.value[1])
  return isNone(roleOption)
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'role',
          role: roleOption.value.toLowerCase(),
          line: lineNo,
          col
        }
      }
}

const parseTypeSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const typeChildren = line.match(/^\.type-([a-zA-Z0-9_-]+):children$/)
  const typeChildrenOption = fromNullable(typeChildren)
  if (!isNone(typeChildrenOption)) {
    const typeOption = fromNullable(typeChildrenOption.value[1])
    return isNone(typeOption)
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'type-children',
            type: typeOption.value.toLowerCase(),
            line: lineNo,
            col
          }
        }
  }

  const typeOnly = line.match(/^\.type-([a-zA-Z0-9_-]+)$/)
  const typeOnlyOption = fromNullable(typeOnly)
  if (isNone(typeOnlyOption)) {
    return undefined
  }

  const typeOption = fromNullable(typeOnlyOption.value[1])
  return isNone(typeOption)
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'type',
          type: typeOption.value.toLowerCase(),
          line: lineNo,
          col
        }
      }
}

const parseNodeKindSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const kindChildren = line.match(/^\.kind-([a-zA-Z0-9_-]+):children$/)
  const kindChildrenOption = fromNullable(kindChildren)
  if (!isNone(kindChildrenOption)) {
    return parseNodeKindSelectorMatch({
      line,
      lineNo,
      col,
      rawKind: kindChildrenOption.value[1],
      kind: 'node-kind-children'
    })
  }

  const kindOnly = line.match(/^\.kind-([a-zA-Z0-9_-]+)$/)
  const kindOnlyOption = fromNullable(kindOnly)
  if (isNone(kindOnlyOption)) {
    return undefined
  }

  return parseNodeKindSelectorMatch({
    line,
    lineNo,
    col,
    rawKind: kindOnlyOption.value[1],
    kind: 'node-kind'
  })
}

const parseSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> => {
  if (line === '.node') {
    return {
      ok: true,
      value: { kind: 'node', line: lineNo, col }
    }
  }

  const parsedHandleOption = fromNullable(parseHandleSelector(line, lineNo, col))
  if (!isNone(parsedHandleOption)) {
    return parsedHandleOption.value
  }

  const parsedRoleOption = fromNullable(parseRoleSelector(line, lineNo, col))
  if (!isNone(parsedRoleOption)) {
    return parsedRoleOption.value
  }

  const parsedTypeOption = fromNullable(parseTypeSelector(line, lineNo, col))
  if (!isNone(parsedTypeOption)) {
    return parsedTypeOption.value
  }

  const parsedKindOption = fromNullable(parseNodeKindSelector(line, lineNo, col))
  if (!isNone(parsedKindOption)) {
    return parsedKindOption.value
  }

  if (line === '.node-name') {
    return {
      ok: true,
      value: { kind: 'node-name', line: lineNo, col }
    }
  }

  if (line === '.node-title') {
    return {
      ok: true,
      value: { kind: 'node-title', line: lineNo, col }
    }
  }

  return selectorError(line, lineNo, col)
}

const parseDeclaration = (line: string, lineNo: number, col: number): ParseStyleResult<StyleDeclaration> => {
  const match = line.match(/^([a-z-]+)\s*:\s*(.+?)\s*;?$/)
  const matchOption = fromNullable(match)
  if (isNone(matchOption)) {
    return {
      ok: false,
      error: parseError(lineNo, col, `Invalid style declaration: ${line}`)
    }
  }

  const propertyTextOption = fromNullable(matchOption.value[1])
  const rawValueOption = fromNullable(matchOption.value[2])
  if (isNone(propertyTextOption) || isNone(rawValueOption)) {
    return {
      ok: false,
      error: parseError(lineNo, col, `Invalid style declaration: ${line}`)
    }
  }
  const propertyText = propertyTextOption.value
  const rawValue = rawValueOption.value

  if (!isStylePropertyName(propertyText)) {
    return {
      ok: false,
      error: parseError(lineNo, col, `Unsupported style property: ${propertyText}`)
    }
  }

  return {
    ok: true,
    value: {
      property: propertyText,
      rawValue,
      line: lineNo,
      col
    }
  }
}

type ParseLinesAcc =
  | { readonly ok: false; readonly error: ParseErr }
  | {
      readonly ok: true
      readonly variables: ReadonlyMap<string, string>
      readonly variableIcons: ReadonlyArray<VariableIconEntry>
      readonly rules: readonly StyleRule[]
      readonly currentRule: StyleRule | undefined
    }

const parseStyleSelectorLine = (
  input: {
    readonly state: Extract<ParseLinesAcc, { readonly ok: true }>
    readonly trimmed: string
    readonly lineNo: number
    readonly firstIndent: number
  }
): ParseLinesAcc => {
  const selector = parseSelector(input.trimmed, input.lineNo, input.firstIndent + 1)
  if (!selector.ok) {
    return { ok: false, error: selector.error }
  }

  const newRule: StyleRule = { selector: selector.value, declarations: [] }
  return {
    ...input.state,
    currentRule: newRule,
    rules: [...input.state.rules, newRule]
  }
}

const parseStyleVariableOrSelectorLine = (
  input: {
    readonly state: Extract<ParseLinesAcc, { readonly ok: true }>
    readonly trimmed: string
    readonly lineNo: number
    readonly firstIndent: number
  }
): ParseLinesAcc => {
  const variableDeclaration = parseVariableDeclaration({
    line: input.trimmed,
    lineNo: input.lineNo,
    col: input.firstIndent + 1,
    context: 'style'
  })
  const variableDeclarationOption = fromNullable(variableDeclaration)
  if (!isNone(variableDeclarationOption)) {
    if (!variableDeclarationOption.value.ok) {
      return { ok: false, error: variableDeclarationOption.value.error }
    }

    const nextDefinitions = applyVariableDeclaration(
      {
        variables: input.state.variables,
        variableIcons: input.state.variableIcons
      },
      variableDeclarationOption.value.value
    )

    return {
      ...input.state,
      currentRule: undefined,
      variables: nextDefinitions.variables,
      variableIcons: nextDefinitions.variableIcons
    }
  }

  return parseStyleSelectorLine(input)
}

const parseStyleDeclarationLine = (
  input: {
    readonly state: Extract<ParseLinesAcc, { readonly ok: true }>
    readonly trimmed: string
    readonly lineNo: number
    readonly indent: number
    readonly firstIndent: number
  }
): ParseLinesAcc => {
  if (input.indent <= input.firstIndent) {
    return { ok: false, error: parseError(input.lineNo, input.indent + 1, 'Unexpected style indentation') }
  }

  const currentRuleOption = fromNullable(input.state.currentRule)
  if (isNone(currentRuleOption)) {
    return { ok: false, error: parseError(input.lineNo, input.indent + 1, 'Style declaration must be under a selector') }
  }
  const currentRule = currentRuleOption.value

  const declaration = parseDeclaration(input.trimmed, input.lineNo, input.indent + 1)
  if (!declaration.ok) {
    return { ok: false, error: declaration.error }
  }

  const updatedRule: StyleRule = {
    ...currentRule,
    declarations: [...currentRule.declarations, declaration.value]
  }
  return {
    ...input.state,
    currentRule: updatedRule,
    rules: [...input.state.rules.slice(0, -1), updatedRule]
  }
}

const parseStyleLine = (
  state: ParseLinesAcc,
  line: { readonly text: string; readonly line: number; readonly indent: number },
  firstIndent: number
): ParseLinesAcc => {
  if (!state.ok) return state
  if (isBlankOrComment(line.text)) return state

  const trimmed = line.text.trim()
  return line.indent === firstIndent
    ? parseStyleVariableOrSelectorLine({ state, trimmed, lineNo: line.line, firstIndent })
    : parseStyleDeclarationLine({ state, trimmed, lineNo: line.line, indent: line.indent, firstIndent })
}

const parseStyleLines = (
  lines: readonly { readonly text: string; readonly line: number; readonly indent: number }[]
):
  | { readonly ok: true; readonly styleSheet: ParsedStyleSheet }
  | { readonly ok: false; readonly error: ParseErr } => {
  const contentLines = lines.filter((line) => !isBlankOrComment(line.text))
  if (contentLines.length === 0) {
    return {
      ok: true,
      styleSheet: emptyStyleSheet()
    }
  }

  const firstIndent = Math.min(...contentLines.map((line) => line.indent))

  const finalState = lines.reduce<ParseLinesAcc>(
    (state, line): ParseLinesAcc => parseStyleLine(state, line, firstIndent),
    { ok: true, variables: intoMap<string, string>([]), variableIcons: [], rules: [], currentRule: undefined }
  )

  if (!finalState.ok) {
    return finalState
  }

  const emptyRule = finalState.rules.find((rule) => rule.declarations.length === 0)
  const emptyRuleOption = fromNullable(emptyRule)
  if (!isNone(emptyRuleOption)) {
    return {
      ok: false,
      error: parseError(emptyRuleOption.value.selector.line, emptyRuleOption.value.selector.col, 'Style selector must include at least one declaration')
    }
  }

  return {
    ok: true,
    styleSheet: { variables: finalState.variables, variableIcons: finalState.variableIcons, rules: finalState.rules }
  }
}

const parseDefinitionsLines = (
  lines: readonly BlockLine[]
):
  | { readonly ok: true; readonly definitions: ParsedDefinitions }
  | { readonly ok: false; readonly error: ParseErr } => {
  const contentLines = lines.filter((line) => !isBlankOrComment(line.text))
  if (contentLines.length === 0) {
    return {
      ok: true,
      definitions: emptyDefinitions()
    }
  }

  const firstIndent = Math.min(...contentLines.map((line) => line.indent))

  const finalState = contentLines.reduce<
    | { readonly ok: true; readonly definitions: ParsedDefinitions }
    | { readonly ok: false; readonly error: ParseErr }
  >((state, line) => parseDefinitionsLineAtIndent(state, line, firstIndent), {
    ok: true,
    definitions: emptyDefinitions()
  })

  return finalState
}

const parseDefinitionsLineAtIndent = (
  state:
    | { readonly ok: true; readonly definitions: ParsedDefinitions }
    | { readonly ok: false; readonly error: ParseErr },
  line: BlockLine,
  firstIndent: number
):
  | { readonly ok: true; readonly definitions: ParsedDefinitions }
  | { readonly ok: false; readonly error: ParseErr } => {
  if (!state.ok) {
    return state
  }

  if (line.indent !== firstIndent) {
    return {
      ok: false,
      error: parseError(line.line, line.indent + 1, 'Defs block only supports top-level variable declarations')
    }
  }

  const declaration = parseVariableDeclaration({
    line: line.text.trim(),
    lineNo: line.line,
    col: firstIndent + 1,
    context: 'defs'
  })
  const declarationOption = fromNullable(declaration)
  if (isNone(declarationOption)) {
    return {
      ok: false,
      error: parseError(line.line, firstIndent + 1, 'Defs block only supports variable declarations')
    }
  }
  const safeDeclaration = declarationOption.value

  if (!safeDeclaration.ok) {
    return { ok: false, error: safeDeclaration.error }
  }

  return {
    ok: true,
    definitions: applyVariableDeclaration(state.definitions, safeDeclaration.value)
  }
}

/**
 * Extract the first top-level defs block and parse variable declarations.
 *
 * @param source Raw BTL source that may include a defs block.
 * @returns Stripped source plus parsed definitions, or a parse error.
 */
export const extractDefinitionsBlock = (source: string): DefinitionsExtractionResult => {
  const extraction = extractTopLevelBlock(source, 'defs')

  if (extraction.blockLines.length === 0) {
    return {
      ok: true,
      strippedSource: extraction.strippedSource,
      definitions: emptyDefinitions()
    }
  }

  const parsedDefinitions = parseDefinitionsLines(extraction.blockLines)
  if (!parsedDefinitions.ok) {
    return parsedDefinitions
  }

  return {
    ok: true,
    strippedSource: extraction.strippedSource,
    definitions: parsedDefinitions.definitions
  }
}

/**
 * Extract the first top-level `style` block from raw BTL source.
 *
 * The returned `strippedSource` blanks out the extracted lines instead of
 * removing them so downstream parse and resolve diagnostics still point at the
 * original source line numbers.
 *
 * @param source Raw BTL text that may include a top-level `style` block.
 * @returns A parsed stylesheet plus line-stable source, or a parse error when
 * the style block is malformed.
 */
export const extractStyleSheet = (source: string): StyleExtractionResult => {
  const extraction = extractTopLevelBlock(source, 'style')

  if (extraction.blockLines.length === 0) {
    return {
      ok: true,
      strippedSource: extraction.strippedSource,
      styleSheet: emptyStyleSheet()
    }
  }

  const parsedStyle = parseStyleLines(extraction.blockLines)
  if (!parsedStyle.ok) {
    return parsedStyle
  }

  return {
    ok: true,
    strippedSource: extraction.strippedSource,
    styleSheet: parsedStyle.styleSheet
  }
}

/**
 * Resolve parsed style rules against the semantic org tree.
 *
 * This is a projection from selector rules to concrete node handles. Text
 * selectors are resolved separately from node styles because they target shared
 * typography defaults rather than individual nodes.
 *
 * @param styleSheet Parsed style DSL extracted from source.
 * @param ast Semantic AST used for role/type lookups and variable-icon bindings.
 * @param indexed Indexed layout tree used to resolve handle and children selectors.
 * @returns Immutable style maps on success, or collected resolve errors when a
 * selector or declaration cannot be satisfied.
 */
