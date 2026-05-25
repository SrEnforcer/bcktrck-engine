/**
 * @module compile/style-context
 *
 * Internal helpers for extracting and merging compile-time style sources.
 *
 * @packageDocumentation
 */

import { fromNullable, intoMap, isSome } from '@tsfpp/prelude'
import { applyDefinitionsToStyleSheet, extractDefinitionsBlock, extractStyleSheet, mergeStyleSheets } from '../style/dsl'
import type { ParseErr } from '../types/results'

/**
 * Parsed source style blocks stripped from the main compile source.
 */
export type SourceStyleExtraction =
  | {
      readonly ok: true
      readonly strippedSource: string
      readonly sourceStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>
    }
  | { readonly ok: false; readonly parseError: ParseErr }

/**
 * Merged style context used by the compile pipeline after optional overlays.
 */
export type CompileStyleContext =
  | {
      readonly ok: true
      readonly mergedStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>
      readonly effectiveVariables: ReadonlyMap<string, string>
    }
  | { readonly ok: false; readonly parseError: ParseErr }

type CompileStyleOptions = {
  readonly styleSource: string | undefined
  readonly variables: ReadonlyMap<string, string> | undefined
}

const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> =>
  intoMap(entries)

const mapEntries = <K, V>(map: ReadonlyMap<K, V>): ReadonlyArray<readonly [K, V]> =>
  Array.from(map.entries()).map(([key, value]) => [key, value] as const)

const mergeMaps = <K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
  mapFromEntries([...mapEntries(left), ...mapEntries(right)])

const firstNonBlockLine = (source: string): { readonly line: number; readonly col: number; readonly text: string } | undefined =>
  source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => ({ line: index + 1, col: line.search(/\S/) + 1, text: line }))
    .find(({ text }) => {
      const trimmed = text.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })

/**
 * Parse an optional supplemental style source that may contain only defs/style blocks.
 *
 * @param source Raw supplemental style text.
 * @returns Parsed style sheet or a parse error when non-style content remains.
 */
export const parseSupplementalStyleSource = (
  source: string
):
  | { readonly ok: true; readonly styleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>; readonly strippedSource: string }
  | { readonly ok: false; readonly error: ParseErr } => {
  const definitionsExtraction = extractDefinitionsBlock(source)
  if (!definitionsExtraction.ok) {
    return definitionsExtraction
  }

  const styleExtraction = extractStyleSheet(definitionsExtraction.strippedSource)
  if (!styleExtraction.ok) {
    return styleExtraction
  }

  const leftover = firstNonBlockLine(styleExtraction.strippedSource)
  const leftoverOption = fromNullable(leftover)
  if (isSome(leftoverOption)) {
    return {
      ok: false,
      error: {
        ok: false,
        line: leftoverOption.value.line,
        col: leftoverOption.value.col,
        error: 'Supplemental styleSource may only contain defs and style blocks'
      }
    }
  }

  return {
    ok: true,
    strippedSource: styleExtraction.strippedSource,
    styleSheet: applyDefinitionsToStyleSheet(styleExtraction.styleSheet, definitionsExtraction.definitions)
  }
}

/**
 * Extract embedded defs/style blocks from source before parse-and-resolve.
 *
 * @param source Raw BTL source.
 * @param ignoreSourceStyle When true, embedded style rules are dropped while defs variables remain.
 * @returns Stripped source and the effective source style sheet.
 */
export const extractSourceStyle = (source: string, ignoreSourceStyle: boolean): SourceStyleExtraction => {
  const definitionsExtraction = extractDefinitionsBlock(source)
  if (!definitionsExtraction.ok) {
    return {
      ok: false,
      parseError: definitionsExtraction.error
    }
  }

  const styleExtraction = extractStyleSheet(definitionsExtraction.strippedSource)
  if (!styleExtraction.ok) {
    return {
      ok: false,
      parseError: styleExtraction.error
    }
  }

  const sourceSheet = ignoreSourceStyle
    ? {
        ...styleExtraction.styleSheet,
        variables: mapFromEntries<string, string>([]),
        variableIcons: [],
        rules: []
      }
    : styleExtraction.styleSheet

  return {
    ok: true,
    strippedSource: styleExtraction.strippedSource,
    sourceStyleSheet: applyDefinitionsToStyleSheet(sourceSheet, definitionsExtraction.definitions)
  }
}

/**
 * Build the merged style context used by compile after applying optional overrides.
 *
 * @param sourceStyleSheet Style sheet extracted from the source document.
 * @param options Compile-time style options.
 * @returns Merged style sheet and effective variable map, or a parse error.
 */
export const buildCompileStyleContext = (
  sourceStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>,
  options: CompileStyleOptions
): CompileStyleContext => {
  const styleSourceOption = fromNullable(options.styleSource)
  if (!isSome(styleSourceOption)) {
    const variablesOption = fromNullable(options.variables)
    const effectiveVariables = isSome(variablesOption)
      ? mergeMaps(sourceStyleSheet.variables, variablesOption.value)
      : sourceStyleSheet.variables

    return {
      ok: true,
      mergedStyleSheet: sourceStyleSheet,
      effectiveVariables
    }
  }

  const supplementalStyleSheet = parseSupplementalStyleSource(styleSourceOption.value)
  if (!supplementalStyleSheet.ok) {
    return {
      ok: false,
      parseError: supplementalStyleSheet.error
    }
  }

  const mergedStyleSheet = mergeStyleSheets(sourceStyleSheet, supplementalStyleSheet.styleSheet)
  const variablesOption = fromNullable(options.variables)
  const effectiveVariables = isSome(variablesOption)
    ? mergeMaps(mergedStyleSheet.variables, variablesOption.value)
    : mergedStyleSheet.variables

  return {
    ok: true,
    mergedStyleSheet,
    effectiveVariables
  }
}