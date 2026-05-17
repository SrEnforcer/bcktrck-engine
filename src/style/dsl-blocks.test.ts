import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { extractTopLevelBlock } from './dsl-blocks'

describe('extractTopLevelBlock when the keyword is missing', () => {
  it('returns the source unchanged and no block lines', () => {
    const source = ['org Acme', '  dept Platform'].join('\n')

    const result = extractTopLevelBlock(source, 'style')

    expect(result).toEqual({
      strippedSource: source,
      blockLines: []
    })
  })
})

describe('extractTopLevelBlock when the keyword exists with an indented body', () => {
  it('blanks the extracted block region in the stripped source', () => {
    const source = [
      'style',
      '  node employee fill #fff',
      '  edge dashed',
      'org Acme'
    ].join('\n')

    const result = extractTopLevelBlock(source, 'style')

    expect(result.strippedSource).toBe(['', '', '', 'org Acme'].join('\n'))
  })

  it('returns the extracted lines with original line numbers and indentation', () => {
    const source = [
      'style',
      '  node employee fill #fff',
      '\tedge dashed',
      'org Acme'
    ].join('\n')

    const result = extractTopLevelBlock(source, 'style')

    expect(result.blockLines).toEqual([
      { text: '  node employee fill #fff', line: 2, indent: 2 },
      { text: '\tedge dashed', line: 3, indent: 1 }
    ])
  })
})

describe('extractTopLevelBlock properties', () => {
  it('always keeps stripped source line count equal to the normalized input line count', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 8 }), (lines) => {
        const source = lines.join('\n')

        const result = extractTopLevelBlock(source, 'style')

        expect(result.strippedSource.split('\n').length).toBe(source.replace(/\r\n/g, '\n').split('\n').length)
      })
    )
  })
})