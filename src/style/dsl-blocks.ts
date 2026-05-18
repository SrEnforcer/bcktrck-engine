/**
 * @module style/dsl-blocks
 *
 * Helpers for extracting `defs` and `style` top-level DSL blocks while preserving line mapping.
 *
 * @packageDocumentation
 */

import { fromNullable, isNone } from '@tsfpp/prelude'

/**
 * Style/defs block extraction helpers.
 *
 * These helpers keep source line numbers stable by blanking extracted block
 * lines instead of removing them.
 */

/**
 * A single extracted block line with original source position metadata.
 */
export type BlockLine = {
  readonly text: string
  readonly line: number
  readonly indent: number
}

const leadingIndent = (line: string): number => {
  const match = line.match(/^[ \t]*/)
  const matchOption = fromNullable(match)
  if (isNone(matchOption)) {
    return 0
  }

  const firstSegmentOption = fromNullable(matchOption.value[0])
  return isNone(firstSegmentOption) ? 0 : firstSegmentOption.value.length
}

/**
 * Extract a top-level block by keyword while preserving original line numbers.
 *
 * Matching lines are replaced with empty lines in the returned source so that
 * downstream diagnostics remain line-stable.
 *
 * @param source Raw source text.
 * @param keyword Top-level keyword to extract, for example style or defs.
 * @returns Stripped source plus extracted indented block lines.
 */
export const extractTopLevelBlock = (
  source: string,
  keyword: string
): { readonly strippedSource: string; readonly blockLines: readonly BlockLine[] } => {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const keywordIdx = lines.findIndex((line) => line.trim() === keyword)

  if (keywordIdx === -1) {
    return {
      strippedSource: lines.join('\n'),
      blockLines: []
    }
  }

  const bodySlice = lines.slice(keywordIdx + 1)
  const relBlockEnd = bodySlice.findIndex((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('//') && leadingIndent(line) === 0
  })
  const blockEnd = relBlockEnd === -1 ? lines.length : keywordIdx + 1 + relBlockEnd

  return {
    strippedSource: lines
      .map((line, index) => (index >= keywordIdx && index < blockEnd ? '' : line))
      .join('\n'),
    blockLines: lines
      .slice(keywordIdx + 1, blockEnd)
      .map((text, relIdx) => ({ text, line: keywordIdx + 2 + relIdx, indent: leadingIndent(text) }))
      .filter(({ text, indent }) => indent > 0 || text.trim().length > 0)
  }
}
