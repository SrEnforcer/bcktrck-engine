import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { tokenize } from './tokenize'

describe('tokenize when parsing a simple org declaration', () => {
  it('includes keyword, identifier, newline, and eof tokens', () => {
    const result = tokenize('org Acme')

    expect(result.map((token) => token.kind)).toEqual(['keyword_org', 'display_text', 'eof'])
  })
})

describe('tokenize when parsing arrows and punctuation', () => {
  it('emits arrow and delimiter token kinds in order', () => {
    const result = tokenize('alpha --> beta [key: value, @ref]')

    expect(result.map((token) => token.kind)).toEqual([
      'identifier',
      'arrow',
      'identifier',
      'lbracket',
      'identifier',
      'colon',
      'identifier',
      'comma',
      'at',
      'identifier',
      'rbracket',
      'eof'
    ])
  })
})

describe('tokenize when a line mixes tabs and spaces in indentation', () => {
  it('emits a mixed indentation error token', () => {
    const result = tokenize('org Acme\n \tstaff Team')
    const errorToken = result.find((token) => token.kind === 'error')

    expect(errorToken).toBeDefined()
    expect(errorToken?.value.includes('tabs and spaces on same line')).toBe(true)
  })
})

describe('tokenize when indentation style changes across lines', () => {
  it('emits an inconsistent indentation style error token', () => {
    const result = tokenize('org Acme\n  staff Team\n\tstaff Ops')
    const errorToken = result.find((token) => token.kind === 'error')

    expect(errorToken).toBeDefined()
    expect(errorToken?.value.includes('inconsistent indentation style')).toBe(true)
  })
})

describe('tokenize when dedent does not match any previous indent level', () => {
  it('emits an invalid dedent level error token', () => {
    const result = tokenize('org Acme\n  dept A\n x')
    const errorToken = result.find((token) => token.kind === 'error')

    expect(errorToken).toBeDefined()
    expect(errorToken?.value.includes('Invalid dedent level')).toBe(true)
  })
})

describe('tokenize when a string literal is not closed', () => {
  it('emits an unclosed string literal error token', () => {
    const result = tokenize('org "Acme')
    const errorToken = result.find((token) => token.kind === 'error')

    expect(errorToken).toBeDefined()
    expect(errorToken?.value.includes('Unclosed string literal')).toBe(true)
  })
})

describe('tokenize when processing comments and blank lines', () => {
  it('skips comment tokens and still finishes with eof', () => {
    const result = tokenize('org Acme\n// comment')

    expect(result[result.length - 1]?.kind).toBe('eof')
  })
})

describe('tokenize properties', () => {
  it('always appends eof as the final token', () => {
    fc.assert(
      fc.property(fc.string(), (source) => {
        const result = tokenize(source)

        expect(result[result.length - 1]?.kind).toBe('eof')
      })
    )
  })
})