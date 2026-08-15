/**
 * @module style/dsl-definitions
 *
 * Internal helpers for defs/style variable declarations and stylesheet merging.
 *
 * @packageDocumentation
 */

import { assoc, entriesOf, fromNullable, getOrElseOption, intoMap, isNone, matchOption } from '@tsfpp/prelude'
import { isKnownIcon } from '../icons/registry'
import type { AstNodeKind } from '../types/ast'
import type { ParseErr } from '../types/results'

type VariableIconEntry = {
  readonly variable: string
  readonly icon: string
  readonly normalizedValue: string
}

type ParsedDefinitions = {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: ReadonlyArray<VariableIconEntry>
}

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

type StylePropertyName = 'background-color' | 'border-color' | 'border-style' | 'border-width' | 'color' | 'edge-style' | 'edge-width' | 'font-size' | 'font-weight' | 'icon' | 'icon-color' | 'icon-pos' | 'icon-size' | 'icon-opacity' | 'line-spacing'

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

type ParsedStyleSheet = {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: ReadonlyArray<VariableIconEntry>
  readonly rules: readonly StyleRule[]
}

type ParseStyleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ParseErr }

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

const parseError = (line: number, col: number, error: string): ParseErr => ({ ok: false, line, col, error })

/**
 * Create an empty parsed definitions bundle.
 *
 * @returns Empty variables and variable-icon bindings.
 */
export const emptyDefinitions = (): ParsedDefinitions => ({
  variables: intoMap<string, string>([]),
  variableIcons: []
})

/**
 * Create an empty parsed stylesheet bundle.
 *
 * @returns Empty variables, variable-icon bindings, and rules.
 */
export const emptyStyleSheet = (): ParsedStyleSheet => ({
  ...emptyDefinitions(),
  rules: []
})

/**
 * Parse one `$var = value` style/defs declaration.
 *
 * @param input Current source line and parsing context.
 * @returns Parsed declaration when the line is a variable declaration.
 */
export const parseVariableDeclaration = (input: ParseVariableDeclarationInput): ParseStyleResult<VariableDeclaration> | undefined => {
  const variableMatch = input.line.match(/^\$([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?::\s*([a-zA-Z0-9_-]+)\s*)?=\s*(.+)$/)
  const variableMatchOption = fromNullable(variableMatch)
  if (isNone(variableMatchOption)) {
    return undefined
  }

  const variableNameOption = fromNullable(variableMatchOption.value[1])
  const variableIconOption = fromNullable(variableMatchOption.value[2])
  const variableValueOption = fromNullable(variableMatchOption.value[3])
  if (isNone(variableNameOption) || isNone(variableValueOption)) {
    return {
      ok: false,
      error: parseError(input.lineNo, input.col, `Invalid ${input.context} variable declaration: ${input.line}`)
    }
  }

  if (!isNone(variableIconOption) && !isKnownIcon(variableIconOption.value)) {
    return {
      ok: false,
      error: parseError(input.lineNo, input.col, `Unknown icon in variable declaration: ${variableIconOption.value}`)
    }
  }

  return {
    ok: true,
    value: {
      variableName: variableNameOption.value,
      variableValue: variableValueOption.value,
      ...matchOption(() => ({}), (value: string) => ({ variableIcon: value }))(variableIconOption)
    }
  }
}

/**
 * Apply one variable declaration to the accumulated defs bundle.
 *
 * @param definitions Current parsed definitions.
 * @param declaration Parsed declaration to apply.
 * @returns Updated definitions bundle.
 */
export const applyVariableDeclaration = (
  definitions: ParsedDefinitions,
  declaration: VariableDeclaration
): ParsedDefinitions => ({
  variables: assoc(declaration.variableName, declaration.variableValue)(definitions.variables),
  variableIcons: isNone(fromNullable(declaration.variableIcon))
    ? definitions.variableIcons.filter((entry) => entry.variable !== declaration.variableName)
    : [
        ...definitions.variableIcons.filter((entry) => entry.variable !== declaration.variableName),
        {
          variable: declaration.variableName,
          icon: getOrElseOption<string>(() => '')(fromNullable(declaration.variableIcon)),
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
    variables: intoMap([...entriesOf(base.variables), ...entriesOf(override.variables)]),
    variableIcons
  }
}

/**
 * Combine two parsed style sheets, giving precedence to later definitions.
 *
 * @param base Existing parsed style sheet.
 * @param override Parsed style sheet layered on top.
 * @returns Merged style sheet.
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
 * Replace style-sheet variable bindings with the shared defs bindings.
 *
 * @param styleSheet Parsed style sheet produced from the style block.
 * @param definitions Parsed defs block.
 * @returns Style sheet using defs-backed variable bindings.
 */
export const applyDefinitionsToStyleSheet = (
  styleSheet: ParsedStyleSheet,
  definitions: ParsedDefinitions
): ParsedStyleSheet => ({
  ...styleSheet,
  variables: definitions.variables,
  variableIcons: definitions.variableIcons
})