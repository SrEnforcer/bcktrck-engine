/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Parses the `style` block embedded in BTL, strips it from the source while
 * preserving line numbers, and resolves selectors into per-node render styles.
 * This module owns the translation from textual style DSL to immutable maps
 * consumed by layout and rendering.
 */

// DEVIATION(2.4): Style DSL remains in one module during incremental migration; rule parser and resolver extraction is planned.
/* eslint-disable max-lines */

import type { EdgeStyleValue, IndexedTree } from '../layout/types'
import { assoc, entriesOfMap, intoMap, intoSet, unique } from '@tsfpp/prelude'
import { extractTopLevelBlock, type BlockLine } from './dsl-blocks'
import { buildHandleMap } from '../resolver/handles'
import { collectNodes } from '../resolver/tree'
import type { AstAttrValue, AstNodeKind, AstOrg } from '../types/ast'
import type { ParseErr, ResolveError } from '../types/results'
import type { IconPos } from '../icons/render'
import { isKnownIcon, ICON_POSITIONS } from '../icons/registry'

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

type StyleResolutionResult =
  | { readonly ok: true; readonly styleMap: ResolvedStyleMap; readonly textStyles: ResolvedTextStyles }
  | { readonly ok: false; readonly errors: readonly ResolveError[] }

const stylePropertyNames: readonly StylePropertyName[] = ['background-color', 'border-color', 'border-style', 'border-width', 'color', 'edge-style', 'edge-width', 'font-size', 'font-weight', 'icon', 'icon-color', 'icon-pos', 'icon-size', 'icon-opacity', 'line-spacing']
const styleProperties: ReadonlySet<string> = intoSet(stylePropertyNames)

const borderStyleValues: readonly BorderStyleValue[] = ['solid', 'dashed', 'dotted', 'none']
const edgeStyleValues: readonly (EdgeStyleValue | 'solid')[] = ['straight', 'solid', 'dashed', 'dotted']

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

const textUnsupportedProperties: ReadonlySet<StylePropertyName> = intoSet<StylePropertyName>([
  'background-color',
  'border-color',
  'border-style',
  'border-width',
  'edge-style',
  'edge-width',
  'icon-color',
  'icon-pos',
  'icon-size',
  'icon-opacity',
  'icon'
])

const isStylePropertyName = (value: string): value is StylePropertyName => styleProperties.has(value)
const isFontWeightKeyword = (value: string): value is 'normal' | 'bold' => value === 'normal' || value === 'bold'
const isBorderStyleValue = (value: string): value is BorderStyleValue =>
  borderStyleValues.some((style) => style === value)
const isEdgeStyleValue = (value: string): value is EdgeStyleValue | 'solid' =>
  edgeStyleValues.some((style) => style === value)
const isIconPosValue = (value: string): value is IconPos => ICON_POSITIONS.has(value)

const parseError = (line: number, col: number, error: string): ParseErr => ({ ok: false, line, col, error })

const resolveError = (line: number, col: number, message: string): ResolveError => ({
  kind: 'invalid_attr_value',
  handle: 'style',
  line,
  col,
  message
})

const resolveErrorForHandle = (handle: string) => (line: number, col: number, message: string): ResolveError => ({
  ...resolveError(line, col, message),
  handle
})

const isBlankOrComment = (line: string): boolean => {
  const trimmed = line.trim()
  return trimmed.length === 0 || trimmed.startsWith('//')
}

const emptyDefinitions = (): ParsedDefinitions => ({
  variables: intoMap<string, string>([]),
  variableIcons: []
})

const emptyStyleSheet = (): ParsedStyleSheet => ({
  ...emptyDefinitions(),
  rules: []
})

type VariableDeclaration = {
  readonly variableName: string
  readonly variableValue: string
  readonly variableIcon?: string
}

type ParseVariableDeclarationInput = {
  readonly line: string
  readonly lineNo: number
  readonly col: number
  readonly context: 'style' | 'defs'
}

const parseVariableDeclaration = (input: ParseVariableDeclarationInput): ParseStyleResult<VariableDeclaration> | undefined => {
  const variableMatch = input.line.match(/^\$([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?::\s*([a-zA-Z0-9_-]+)\s*)?=\s*(.+)$/)
  if (variableMatch === null) {
    return undefined
  }

  const variableName = variableMatch[1]
  const variableIcon = variableMatch[2]
  const variableValue = variableMatch[3]
  if (variableName === undefined || variableValue === undefined) {
    return {
      ok: false,
      error: parseError(input.lineNo, input.col, `Invalid ${input.context} variable declaration: ${input.line}`)
    }
  }

  if (variableIcon !== undefined && !isKnownIcon(variableIcon)) {
    return {
      ok: false,
      error: parseError(input.lineNo, input.col, `Unknown icon in variable declaration: ${variableIcon}`)
    }
  }

  return {
    ok: true,
    value: {
      variableName,
      variableValue,
      ...(variableIcon !== undefined ? { variableIcon } : {})
    }
  }
}

const applyVariableDeclaration = (
  definitions: ParsedDefinitions,
  declaration: VariableDeclaration
): ParsedDefinitions => ({
  variables: assoc(declaration.variableName, declaration.variableValue)(definitions.variables),
  variableIcons: declaration.variableIcon === undefined
    ? definitions.variableIcons.filter((entry) => entry.variable !== declaration.variableName)
    : [
        ...definitions.variableIcons.filter((entry) => entry.variable !== declaration.variableName),
        {
          variable: declaration.variableName,
          icon: declaration.variableIcon,
          normalizedValue: declaration.variableValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
        }
      ]
})

const mergeDefinitions = (
  base: ParsedDefinitions,
  override: ParsedDefinitions
): ParsedDefinitions => {
  const variableIcons = Array.from(
    override.variableIcons.reduce<ReadonlyMap<string, VariableIconEntry>>(
      (iconMap, entry) => assoc(entry.variable, entry)(iconMap),
      intoMap(base.variableIcons.map((entry) => [entry.variable, entry] as const))
    ).values()
  )

  return {
    variables: intoMap([...entriesOfMap(base.variables), ...entriesOfMap(override.variables)]),
    variableIcons
  }
}

/**
 * Combine two parsed style sheets, with later variables and rules taking precedence.
 *
 * Variable bindings and variable-icon entries in `override` replace conflicting
 * entries from `base`. Rules are appended so later selectors naturally win when
 * they target the same node and declaration.
 *
 * @param base Existing parsed style sheet.
 * @param override Parsed style sheet layered on top of `base`.
 * @returns Merged style sheet with combined definitions and appended rules.
 */
export const mergeStyleSheets = (
  base: ParsedStyleSheet,
  override: ParsedStyleSheet
): ParsedStyleSheet => {
  const definitions = mergeDefinitions(base, override)
  return {
    ...definitions,
    rules: [...base.rules, ...override.rules]
  }
}

/**
 * Overlay shared `defs` declarations onto a parsed style sheet.
 *
 * Dev-mode strictness: root-level `defs` is the single source of variable and
 * variable-icon bindings for style resolution.
 *
 * @param styleSheet Parsed style sheet produced from the style block.
 * @param definitions Parsed definitions extracted from the defs block.
 * @returns Style sheet with variable bindings replaced by `defs` bindings.
 */
export const applyDefinitionsToStyleSheet = (
  styleSheet: ParsedStyleSheet,
  definitions: ParsedDefinitions
): ParsedStyleSheet => ({
  ...styleSheet,
  variables: definitions.variables,
  variableIcons: definitions.variableIcons
})

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
  if (input.rawKind === undefined) {
    return selectorError(input.line, input.lineNo, input.col)
  }

  const nodeKind = normalizeSelectorNodeKind(input.rawKind)
  return nodeKind === undefined
    ? { ok: false, error: parseError(input.lineNo, input.col, `Unknown kind selector: ${input.rawKind}`) }
    : {
        ok: true,
        value: {
          kind: input.kind,
          nodeKind,
          line: input.lineNo,
          col: input.col
        }
      }
}

const parseHandleSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const handleChildren = line.match(/^@([a-zA-Z0-9_-]+):children$/)
  if (handleChildren !== null) {
    const handle = handleChildren[1]
    return handle === undefined
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'children',
            handle,
            line: lineNo,
            col
          }
        }
  }

  const handleOnly = line.match(/^@([a-zA-Z0-9_-]+)$/)
  if (handleOnly === null) {
    return undefined
  }

  const handle = handleOnly[1]
  return handle === undefined
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'handle',
          handle,
          line: lineNo,
          col
        }
      }
}

const parseRoleSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const roleChildren = line.match(/^\.role-([a-zA-Z0-9_-]+):children$/)
  if (roleChildren !== null) {
    const role = roleChildren[1]
    return role === undefined
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'role-children',
            role: role.toLowerCase(),
            line: lineNo,
            col
          }
        }
  }

  const roleOnly = line.match(/^\.role-([a-zA-Z0-9_-]+)$/)
  if (roleOnly === null) {
    return undefined
  }

  const role = roleOnly[1]
  return role === undefined
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'role',
          role: role.toLowerCase(),
          line: lineNo,
          col
        }
      }
}

const parseTypeSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const typeChildren = line.match(/^\.type-([a-zA-Z0-9_-]+):children$/)
  if (typeChildren !== null) {
    const type = typeChildren[1]
    return type === undefined
      ? selectorError(line, lineNo, col)
      : {
          ok: true,
          value: {
            kind: 'type-children',
            type: type.toLowerCase(),
            line: lineNo,
            col
          }
        }
  }

  const typeOnly = line.match(/^\.type-([a-zA-Z0-9_-]+)$/)
  if (typeOnly === null) {
    return undefined
  }

  const type = typeOnly[1]
  return type === undefined
    ? selectorError(line, lineNo, col)
    : {
        ok: true,
        value: {
          kind: 'type',
          type: type.toLowerCase(),
          line: lineNo,
          col
        }
      }
}

const parseNodeKindSelector = (line: string, lineNo: number, col: number): ParseStyleResult<StyleSelector> | undefined => {
  const kindChildren = line.match(/^\.kind-([a-zA-Z0-9_-]+):children$/)
  if (kindChildren !== null) {
    return parseNodeKindSelectorMatch({
      line,
      lineNo,
      col,
      rawKind: kindChildren[1],
      kind: 'node-kind-children'
    })
  }

  const kindOnly = line.match(/^\.kind-([a-zA-Z0-9_-]+)$/)
  if (kindOnly === null) {
    return undefined
  }

  return parseNodeKindSelectorMatch({
    line,
    lineNo,
    col,
    rawKind: kindOnly[1],
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

  const parsedHandle = parseHandleSelector(line, lineNo, col)
  if (parsedHandle !== undefined) {
    return parsedHandle
  }

  const parsedRole = parseRoleSelector(line, lineNo, col)
  if (parsedRole !== undefined) {
    return parsedRole
  }

  const parsedType = parseTypeSelector(line, lineNo, col)
  if (parsedType !== undefined) {
    return parsedType
  }

  const parsedKind = parseNodeKindSelector(line, lineNo, col)
  if (parsedKind !== undefined) {
    return parsedKind
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
  if (match === null) {
    return {
      ok: false,
      error: parseError(lineNo, col, `Invalid style declaration: ${line}`)
    }
  }

  const propertyText = match[1]
  const rawValue = match[2]
  if (propertyText === undefined || rawValue === undefined) {
    return {
      ok: false,
      error: parseError(lineNo, col, `Invalid style declaration: ${line}`)
    }
  }

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
  if (variableDeclaration !== undefined) {
    if (!variableDeclaration.ok) {
      return { ok: false, error: variableDeclaration.error }
    }

    const nextDefinitions = applyVariableDeclaration(
      {
        variables: input.state.variables,
        variableIcons: input.state.variableIcons
      },
      variableDeclaration.value
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

  if (input.state.currentRule === undefined) {
    return { ok: false, error: parseError(input.lineNo, input.indent + 1, 'Style declaration must be under a selector') }
  }

  const declaration = parseDeclaration(input.trimmed, input.lineNo, input.indent + 1)
  if (!declaration.ok) {
    return { ok: false, error: declaration.error }
  }

  const updatedRule: StyleRule = {
    ...input.state.currentRule,
    declarations: [...input.state.currentRule.declarations, declaration.value]
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
  if (emptyRule !== undefined) {
    return {
      ok: false,
      error: parseError(emptyRule.selector.line, emptyRule.selector.col, 'Style selector must include at least one declaration')
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
  if (declaration === undefined) {
    return {
      ok: false,
      error: parseError(line.line, firstIndent + 1, 'Defs block only supports variable declarations')
    }
  }

  if (!declaration.ok) {
    return { ok: false, error: declaration.error }
  }

  return {
    ok: true,
    definitions: applyVariableDeclaration(state.definitions, declaration.value)
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

const normalizeRole = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

const resolveRoleAlias = (role: string, variables: ReadonlyMap<string, string>): string => {
  const trimmed = role.trim()
  if (trimmed.startsWith('$')) {
    const variableName = trimmed.slice(1)
    return variables.get(variableName)?.trim() ?? trimmed
  }
  if (trimmed.startsWith('@')) {
    const variableName = trimmed.slice(1)
    return variables.get(variableName)?.trim() ?? trimmed
  }
  return trimmed
}

const attrValueToString = (value: AstAttrValue): string => {
  switch (value.kind) {
    case 'string':
      return value.value
    case 'number':
      return String(value.value)
    case 'boolean':
      return String(value.value)
    case 'date':
      return value.value
    case 'url':
      return value.value
    case 'tags':
      return value.value.join(' ')
  }
}

const attrValueToRoleValues = (value: AstAttrValue, variables: ReadonlyMap<string, string>): readonly string[] => {
  if (value.kind === 'tags') {
    return value.value
      .map((entry) => resolveRoleAlias(entry, variables))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  const single = resolveRoleAlias(attrValueToString(value), variables).trim()
  if (single.length === 0) {
    return []
  }
  return [single]
}

const appendReadonly = <T>(values: ReadonlyArray<T>, value: T): ReadonlyArray<T> =>
  [...values, value]

const appendRoleHandle = (
  roleToHandles: ReadonlyMap<string, readonly string[]>,
  role: string,
  handle: string
): ReadonlyMap<string, readonly string[]> => {
  const existing = roleToHandles.get(role) ?? []
  return assoc(role, appendReadonly(existing, handle))(roleToHandles)
}

const buildRoleHandleMap = (
  nodes: readonly AstOrg['root'][],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>,
  variables: ReadonlyMap<string, string>
): ReadonlyMap<string, readonly string[]> =>
  nodes.reduce<ReadonlyMap<string, readonly string[]>>((acc, node) => {
    const handle = nodeToHandle.get(node)
    if (handle === undefined) {
      return acc
    }

    const roles = node.attrs
      .filter((attr) => attr.key === 'role' || attr.key === 'roles')
      .flatMap((attr) => attrValueToRoleValues(attr.value, variables))
      .map(normalizeRole)

    return roles.reduce((nextAcc, role) => appendRoleHandle(nextAcc, role, handle), acc)
  }, intoMap<string, readonly string[]>([]))

const buildKindHandleMap = (
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): ReadonlyMap<AstNodeKind, readonly string[]> =>
  [...handleMap.entries()].reduce<ReadonlyMap<AstNodeKind, readonly string[]>>((acc, [handle, mapEntry]) => {
    const key = mapEntry.node.kind
    const existing = acc.get(key) ?? []
    return assoc(key, appendReadonly(existing, handle))(acc)
  }, intoMap<AstNodeKind, readonly string[]>([]))

const applyDeclarations = <TStyle extends ResolvedNodeStyle | ResolvedTextStyle>(
  input: {
    readonly initialStyle: TStyle
    readonly declarations: readonly StyleDeclaration[]
    readonly variables: ReadonlyMap<string, string>
    readonly apply: (current: TStyle, declaration: StyleDeclaration, vars: ReadonlyMap<string, string>) => TStyle | ResolveError
  }
): { readonly style: TStyle; readonly errors: readonly ResolveError[] } =>
  input.declarations.reduce<{ readonly style: TStyle; readonly errors: readonly ResolveError[] }>(
    (acc, declaration) => {
      const next = input.apply(acc.style, declaration, input.variables)
      return 'kind' in next
        ? { style: acc.style, errors: [...acc.errors, next] }
        : { style: next, errors: acc.errors }
    },
    { style: input.initialStyle, errors: [] }
  )

type RuleTargetResolution = { readonly targets: readonly string[]; readonly error?: ResolveError }

const uniqueTargets = (targets: readonly string[]): readonly string[] => unique(targets)

const resolveHandleTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'handle' }>,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution =>
  handleMap.has(selector.handle)
    ? { targets: [selector.handle] }
    : {
        targets: [],
        error: resolveErrorForHandle(selector.handle)(
          selector.line,
          selector.col,
          `Unknown handle in style selector: @${selector.handle}`
        )
      }

const resolveChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'children' }>,
  indexed: IndexedTree,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => {
  const parent = indexed.nodes.get(selector.handle)
  if (parent !== undefined) {
    return { targets: parent.children }
  }

  if (handleMap.has(selector.handle)) {
    return { targets: [] }
  }

  return {
    targets: [],
    error: resolveErrorForHandle(selector.handle)(
      selector.line,
      selector.col,
      `Unknown handle in style selector: @${selector.handle}:children`
    )
  }
}

const resolveRoleChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'role-children' }>,
  indexed: IndexedTree,
  roleToHandles: ReadonlyMap<string, readonly string[]>
): RuleTargetResolution => ({
  targets: uniqueTargets((roleToHandles.get(selector.role) ?? [])
    .flatMap((handle) => indexed.nodes.get(handle)?.children ?? []))
})

const matchesTypeSelector = (
  mapEntry: { readonly node: AstOrg['root']; readonly handle: string },
  targetType: string
): boolean => {
  const typeAttr = mapEntry.node.attrs.find((attr) => attr.key === 'type')
  return typeAttr !== undefined
    && 'value' in typeAttr
    && typeAttr.value.kind === 'string'
    && typeAttr.value.value.toLowerCase() === targetType
}

const resolveTypeChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'type-children' }>,
  indexed: IndexedTree,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => ({
  targets: uniqueTargets([...handleMap.entries()].flatMap(([handle, mapEntry]) =>
    matchesTypeSelector(mapEntry, selector.type)
      ? (indexed.nodes.get(handle)?.children ?? [])
      : []))
})

const resolveTypeTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'type' }>,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => ({
  targets: [...handleMap.entries()]
    .filter(([, mapEntry]) => matchesTypeSelector(mapEntry, selector.type))
    .map(([handle]) => handle)
})

const resolveNodeKindChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'node-kind-children' }>,
  indexed: IndexedTree,
  kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
): RuleTargetResolution => ({
  targets: uniqueTargets((kindToHandles.get(selector.nodeKind) ?? [])
    .flatMap((handle) => indexed.nodes.get(handle)?.children ?? []))
})

const resolveRuleTargetsBaseSelector = (
  input: {
    readonly selector: Exclude<StyleSelector, { readonly kind: 'type' | 'type-children' | 'node-kind' | 'node-kind-children' }>
    readonly indexed: IndexedTree
    readonly handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
    readonly roleToHandles: ReadonlyMap<string, readonly string[]>
  }
): RuleTargetResolution => {
  switch (input.selector.kind) {
    case 'node':
      return { targets: [...input.handleMap.keys()] }
    case 'handle':
      return resolveHandleTargets(input.selector, input.handleMap)
    case 'children':
      return resolveChildrenTargets(input.selector, input.indexed, input.handleMap)
    case 'role-children':
      return resolveRoleChildrenTargets(input.selector, input.indexed, input.roleToHandles)
    case 'role':
      return { targets: input.roleToHandles.get(input.selector.role) ?? [] }
    case 'node-name':
    case 'node-title':
      return { targets: [] }
  }
}

type ResolveRuleTargetsBySelectorInput = {
  readonly selector: StyleSelector
  readonly indexed: IndexedTree
  readonly handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
  readonly roleToHandles: ReadonlyMap<string, readonly string[]>
  readonly kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
}

const resolveRuleTargetsBySelector = (input: ResolveRuleTargetsBySelectorInput): RuleTargetResolution => {
  if (input.selector.kind === 'type') {
    return resolveTypeTargets(input.selector, input.handleMap)
  }

  if (input.selector.kind === 'type-children') {
    return resolveTypeChildrenTargets(input.selector, input.indexed, input.handleMap)
  }

  if (input.selector.kind === 'node-kind') {
    return { targets: input.kindToHandles.get(input.selector.nodeKind) ?? [] }
  }

  if (input.selector.kind === 'node-kind-children') {
    return resolveNodeKindChildrenTargets(input.selector, input.indexed, input.kindToHandles)
  }

  return resolveRuleTargetsBaseSelector({
    selector: input.selector,
    indexed: input.indexed,
    handleMap: input.handleMap,
    roleToHandles: input.roleToHandles
  })
}

const resolveRuleTargets = (
  input: {
    readonly rule: StyleRule
    readonly indexed: IndexedTree
    readonly handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
    readonly roleToHandles: ReadonlyMap<string, readonly string[]>
    readonly kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
  }
): RuleTargetResolution =>
  resolveRuleTargetsBySelector({
    selector: input.rule.selector,
    indexed: input.indexed,
    handleMap: input.handleMap,
    roleToHandles: input.roleToHandles,
    kindToHandles: input.kindToHandles
  })

type ResolveValueInput = {
  readonly rawValue: string
  readonly variables: ReadonlyMap<string, string>
  readonly line: number
  readonly col: number
}

const resolveValue = (input: ResolveValueInput): string | ResolveError => {
  const trimmed = input.rawValue.trim()
  if (!trimmed.startsWith('$')) {
    return trimmed
  }

  const variableName = trimmed.slice(1)
  const resolved = input.variables.get(variableName)
  if (resolved === undefined) {
    return resolveError(input.line, input.col, `Unknown style variable: $${variableName}`)
  }
  return resolved.trim()
}

type NodeStyleApplier = (
  current: ResolvedNodeStyle,
  resolvedValue: string,
  declaration: StyleDeclaration
) => ResolvedNodeStyle | ResolveError

const parsePxOrUnitlessNumber = (value: string): number | undefined => {
  const match = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/)
  return match?.[1] === undefined ? undefined : Number(match[1])
}

const MAX_ICON_STACK = 5

const applyFontSize: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const size = parsePxOrUnitlessNumber(resolvedValue)
  if (size === undefined) {
    return resolveError(declaration.line, declaration.col, `Invalid font-size value: ${resolvedValue}`)
  }
  return {
    ...current,
    fontSize: size
  }
}

const applyFontWeight: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.toLowerCase()
  const numericWeight = Number(normalized)
  const isKeyword = isFontWeightKeyword(normalized)
  const isNumeric = Number.isFinite(numericWeight) && numericWeight >= 100 && numericWeight <= 900
  if (!isKeyword && !isNumeric) {
    return resolveError(declaration.line, declaration.col, `Invalid font-weight value: ${resolvedValue}`)
  }
  return {
    ...current,
    fontWeight: isKeyword ? normalized : String(Math.round(numericWeight))
  }
}

const applyLineSpacing: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const spacing = parsePxOrUnitlessNumber(resolvedValue)
  if (spacing === undefined || spacing < 0.5) {
    return resolveError(declaration.line, declaration.col, `Invalid line-spacing value: ${resolvedValue} (must be >= 0.5)`)
  }
  return {
    ...current,
    lineSpacing: spacing
  }
}

const applyBackgroundColor: NodeStyleApplier = (current, resolvedValue) => ({
  ...current,
  backgroundColor: resolvedValue
})

const applyBorderColor: NodeStyleApplier = (current, resolvedValue) => ({
  ...current,
  borderColor: resolvedValue
})

const applyBorderStyle: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.trim().toLowerCase()
  if (!isBorderStyleValue(normalized)) {
    return resolveError(declaration.line, declaration.col, `Invalid border-style value: ${resolvedValue}`)
  }

  return {
    ...current,
    borderStyle: normalized
  }
}

const applyBorderWidth: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const width = parsePxOrUnitlessNumber(resolvedValue)
  if (width === undefined) {
    return resolveError(declaration.line, declaration.col, `Invalid border-width value: ${resolvedValue}`)
  }

  return {
    ...current,
    borderWidth: width
  }
}

const applyEdgeStyle: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.trim().toLowerCase()
  if (!isEdgeStyleValue(normalized)) {
    return resolveError(declaration.line, declaration.col, `Invalid edge-style value: ${resolvedValue}`)
  }

  return {
    ...current,
    edgeStyle: normalized === 'solid' ? 'straight' : normalized
  }
}

const applyEdgeWidth: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const width = parsePxOrUnitlessNumber(resolvedValue)
  if (width === undefined) {
    return resolveError(declaration.line, declaration.col, `Invalid edge-width value: ${resolvedValue}`)
  }

  return {
    ...current,
    edgeWidth: width
  }
}

const applyIcon: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const names = resolvedValue.trim().split(/\s+/).filter((n) => n.length > 0)
  if (names.length === 0) {
    return resolveError(declaration.line, declaration.col, `icon: expected at least one icon name`)
  }
  if (names.length > MAX_ICON_STACK) {
    return resolveError(declaration.line, declaration.col, `icon: maximum ${MAX_ICON_STACK} icons allowed, got ${names.length}`)
  }
  const unknownName = names.find((n) => !isKnownIcon(n))
  if (unknownName !== undefined) {
    return resolveError(declaration.line, declaration.col, `Unknown icon: ${unknownName}`)
  }
  return {
    ...current,
    icon: names
  }
}

const applyIconColor: NodeStyleApplier = (current, resolvedValue) => ({
  ...current,
  iconColor: resolvedValue
})

const applyIconPos: NodeStyleApplier = (current, resolvedValue, declaration) => {
  if (!isIconPosValue(resolvedValue)) {
    return resolveError(declaration.line, declaration.col, `Invalid icon position: ${resolvedValue}`)
  }
  return {
    ...current,
    iconPos: resolvedValue
  }
}

const applyIconSize: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const size = parsePxOrUnitlessNumber(resolvedValue)
  if (size === undefined) {
    return resolveError(declaration.line, declaration.col, `Invalid icon-size value: ${resolvedValue}`)
  }
  if (size <= 0) {
    return resolveError(declaration.line, declaration.col, `icon-size must be positive: ${resolvedValue}`)
  }
  return {
    ...current,
    iconSize: Math.round(size)
  }
}

const applyIconOpacity: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const opacityMatch = resolvedValue.match(/^(\d+(?:\.\d+)?)(?:%)?$/)
  if (opacityMatch?.[1] === undefined) {
    return resolveError(declaration.line, declaration.col, `Invalid icon-opacity value: ${resolvedValue}`)
  }

  const rawOpacity = Number(opacityMatch[1])
  const opacity = resolvedValue.includes('%') ? rawOpacity / 100 : rawOpacity

  if (opacity < 0 || opacity > 1) {
    return resolveError(declaration.line, declaration.col, `icon-opacity must be between 0 and 1 (or 0-100%): ${resolvedValue}`)
  }

  return {
    ...current,
    iconOpacity: opacity
  }
}

const applyTextColor: NodeStyleApplier = (current, resolvedValue) => ({
  ...current,
  color: resolvedValue
})

const nodeStyleAppliers: Readonly<Record<StylePropertyName, NodeStyleApplier>> = {
  'font-size': applyFontSize,
  'font-weight': applyFontWeight,
  'line-spacing': applyLineSpacing,
  'background-color': applyBackgroundColor,
  'border-color': applyBorderColor,
  'border-style': applyBorderStyle,
  'border-width': applyBorderWidth,
  'edge-style': applyEdgeStyle,
  'edge-width': applyEdgeWidth,
  icon: applyIcon,
  'icon-color': applyIconColor,
  'icon-pos': applyIconPos,
  'icon-size': applyIconSize,
  'icon-opacity': applyIconOpacity,
  color: applyTextColor
}

const applyDeclaration = (
  current: ResolvedNodeStyle,
  declaration: StyleDeclaration,
  variables: ReadonlyMap<string, string>
): ResolvedNodeStyle | ResolveError => {
  const resolved = resolveValue({
    rawValue: declaration.rawValue,
    variables,
    line: declaration.line,
    col: declaration.col
  })
  if (typeof resolved !== 'string') {
    return resolved
  }

  const applier = nodeStyleAppliers[declaration.property]
  if (applier === undefined) {
    return resolveError(declaration.line, declaration.col, `Internal error: unsupported style property: ${declaration.property}`)
  }
  return applier(current, resolved, declaration)
}

const applyTextDeclaration = (
  current: ResolvedTextStyle,
  declaration: StyleDeclaration,
  variables: ReadonlyMap<string, string>
): ResolvedTextStyle | ResolveError => {
  if (textUnsupportedProperties.has(declaration.property)) {
    return resolveError(
      declaration.line,
      declaration.col,
      `${declaration.property} is not supported for .node-name/.node-title text`
    )
  }

  const applied = applyDeclaration(current, declaration, variables)
  if ('kind' in applied) {
    return applied
  }

  return {
    ...(applied.color !== undefined ? { color: applied.color } : {}),
    ...(applied.fontSize !== undefined ? { fontSize: applied.fontSize } : {}),
    ...(applied.fontWeight !== undefined ? { fontWeight: applied.fontWeight } : {}),
    ...(applied.lineSpacing !== undefined ? { lineSpacing: applied.lineSpacing } : {})
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
export const resolveStyleSheet = (
  styleSheet: ParsedStyleSheet,
  ast: AstOrg,
  indexed: IndexedTree
): StyleResolutionResult => {
  const hasRules = styleSheet.rules.length > 0
  const hasVarIcons = styleSheet.variableIcons.length > 0

  if (!hasRules && !hasVarIcons) {
    return { ok: true, styleMap: intoMap<string, ResolvedNodeStyle>([]), textStyles: { nodeName: { fontWeight: 'bold' }, nodeTitle: {} } }
  }

  const resolutionContext = createStyleResolutionContext(ast, styleSheet)
  const finalState = applyStyleRules(styleSheet, indexed, resolutionContext)

  if (finalState.errors.length > 0) {
    return { ok: false, errors: finalState.errors }
  }

  // Derive icons from variable-icon bindings for nodes whose roles match, in declaration order.
  // Explicit icon: from a style rule takes precedence — only fill in when absent.
  const styleMapWithDerived = hasVarIcons
    ? deriveVariableIcons(styleSheet, resolutionContext.handleResult.map, finalState.styles)
    : finalState.styles

  return {
    ok: true,
    styleMap: styleMapWithDerived,
    textStyles: {
      nodeName: finalState.nodeNameStyle,
      nodeTitle: finalState.nodeTitleStyle
    }
  }
}

type StyleResolutionAcc = {
  readonly styles: ReadonlyMap<string, ResolvedNodeStyle>
  readonly nodeNameStyle: ResolvedTextStyle
  readonly nodeTitleStyle: ResolvedTextStyle
  readonly errors: readonly ResolveError[]
}

type StyleResolutionContext = {
  readonly handleResult: ReturnType<typeof buildHandleMap>
  readonly roleToHandles: ReadonlyMap<string, readonly string[]>
  readonly kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
}

const createStyleResolutionContext = (ast: AstOrg, styleSheet: ParsedStyleSheet): StyleResolutionContext => {
  const handleResult = buildHandleMap(ast.root)
  const nodeToHandle = handleResult.nodeToHandle
  const allNodes = collectNodes(ast.root)
  return {
    handleResult,
    roleToHandles: buildRoleHandleMap(allNodes, nodeToHandle, styleSheet.variables),
    kindToHandles: buildKindHandleMap(handleResult.map)
  }
}

const applyTextRule = (
  state: StyleResolutionAcc,
  rule: StyleRule,
  variables: ReadonlyMap<string, string>
): StyleResolutionAcc => {
  const isNodeNameRule = rule.selector.kind === 'node-name'
  const baseTextStyle = isNodeNameRule ? state.nodeNameStyle : state.nodeTitleStyle
  const applied = applyDeclarations({
    initialStyle: baseTextStyle,
    declarations: rule.declarations,
    variables,
    apply: applyTextDeclaration
  })
  return {
    ...state,
    nodeNameStyle: isNodeNameRule ? applied.style : state.nodeNameStyle,
    nodeTitleStyle: rule.selector.kind === 'node-title' ? applied.style : state.nodeTitleStyle,
    errors: [...state.errors, ...applied.errors]
  }
}

const applyNodeRuleTargets = (
  input: {
    readonly targets: readonly string[]
    readonly currentStyles: ReadonlyMap<string, ResolvedNodeStyle>
    readonly declarations: readonly StyleDeclaration[]
    readonly variables: ReadonlyMap<string, string>
  }
): { readonly styles: ReadonlyMap<string, ResolvedNodeStyle>; readonly errors: readonly ResolveError[] } =>
  input.targets.reduce<{ readonly styles: ReadonlyMap<string, ResolvedNodeStyle>; readonly errors: readonly ResolveError[] }>((styleAcc, target) => {
    const currentStyle = styleAcc.styles.get(target) ?? {}
    const applied = applyDeclarations({
      initialStyle: currentStyle,
      declarations: input.declarations,
      variables: input.variables,
      apply: applyDeclaration
    })
    return {
      styles: assoc(target, applied.style)(styleAcc.styles),
      errors: applied.errors
    }
  }, { styles: input.currentStyles, errors: [] })

const applyNodeRule = (
  input: {
    readonly state: StyleResolutionAcc
    readonly rule: StyleRule
    readonly styleSheet: ParsedStyleSheet
    readonly indexed: IndexedTree
    readonly context: StyleResolutionContext
  }
): StyleResolutionAcc => {
  const targetResolution = resolveRuleTargets({
    rule: input.rule,
    indexed: input.indexed,
    handleMap: input.context.handleResult.map,
    roleToHandles: input.context.roleToHandles,
    kindToHandles: input.context.kindToHandles
  })
  if (targetResolution.error !== undefined) {
    return {
      ...input.state,
      errors: [...input.state.errors, targetResolution.error]
    }
  }

  const nextStyles = applyNodeRuleTargets({
    targets: targetResolution.targets,
    currentStyles: input.state.styles,
    declarations: input.rule.declarations,
    variables: input.styleSheet.variables
  })

  return {
    ...input.state,
    styles: nextStyles.styles,
    errors: [...input.state.errors, ...nextStyles.errors]
  }
}

const applyStyleRules = (
  styleSheet: ParsedStyleSheet,
  indexed: IndexedTree,
  context: StyleResolutionContext
): StyleResolutionAcc => {
  const initialState: StyleResolutionAcc = {
    styles: intoMap<string, ResolvedNodeStyle>([]),
    nodeNameStyle: { fontWeight: 'bold' },
    nodeTitleStyle: {},
    errors: []
  }

  return styleSheet.rules.reduce<StyleResolutionAcc>((state, rule) =>
    rule.selector.kind === 'node-name' || rule.selector.kind === 'node-title'
      ? applyTextRule(state, rule, styleSheet.variables)
      : applyNodeRule({ state, rule, styleSheet, indexed, context }),
  initialState)
}

const deriveVariableIcons = (
  styleSheet: ParsedStyleSheet,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>,
  styles: ReadonlyMap<string, ResolvedNodeStyle>
): ReadonlyMap<string, ResolvedNodeStyle> =>
  [...handleMap.entries()].reduce<ReadonlyMap<string, ResolvedNodeStyle>>((acc, [handle, mapEntry]) => {
    const current = acc.get(handle)
    if (current?.icon !== undefined) {
      return acc
    }

    const nodeRoles = mapEntry.node.attrs
      .filter((attr) => attr.key === 'role' || attr.key === 'roles')
      .flatMap((attr) => attrValueToRoleValues(attr.value, styleSheet.variables))
      .map(normalizeRole)

    const derived = styleSheet.variableIcons
      .filter(({ normalizedValue }) => nodeRoles.includes(normalizedValue))
      .map(({ icon }) => icon)
      .slice(0, MAX_ICON_STACK)

    return derived.length === 0
      ? acc
      : intoMap([...entriesOfMap(acc), [handle, { ...(current ?? {}), icon: [...derived] }] as const])
  }, intoMap(entriesOfMap(styles)))
