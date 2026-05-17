import { describe, expect, it } from 'vitest'
import { tokenize } from '../lexer/tokenize'
import { parse } from './grammar'

const requireParseOk = (
  result: ReturnType<typeof parse>
): Extract<ReturnType<typeof parse>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected parser to succeed in this test setup')

const requireParseErr = (
  result: ReturnType<typeof parse>
): Extract<ReturnType<typeof parse>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected parser to fail in this test setup') : result

describe('parse when the source contains a valid org with one member', () => {
  it('returns an AstOrg with an employee root and one child node', () => {
    const tokens = tokenize(['org "Acme"', '  Alice @alice'].join('\n'))

    const result = requireParseOk(parse(tokens))

    expect(result.value.name).toBe('Acme')
    expect(result.value.root.children.length).toBe(1)
  })
})

describe('parse when config and links sections are present', () => {
  it('parses config pairs and link entries', () => {
    const source = [
      'config',
      '  theme: corporate',
      'org "Acme"',
      '  Alice @alice',
      'links',
      '  @alice --> @alice [kind: dt]'
    ].join('\n')
    const tokens = tokenize(source)

    const result = requireParseOk(parse(tokens))

    expect(result.value.config.pairs.length).toBe(1)
    expect(result.value.links.length).toBe(1)
    expect(result.value.links[0]?.from).toBe('alice')
  })
})

describe('parse when the root block contains staff entries', () => {
  it('places staff nodes under root.staffNodes instead of root.children', () => {
    const tokens = tokenize(['org "Acme"', '  ~staff Executive Assistant'].join('\n'))

    const result = requireParseOk(parse(tokens))

    expect(result.value.root.staffNodes.length).toBe(1)
    expect(result.value.root.children.length).toBe(0)
  })
})

describe('parse when a layout hint kind is unknown', () => {
  it('returns a parse error for unknown layout hint kind', () => {
    const tokens = tokenize(['org "Acme"', '  Alice %mystery'].join('\n'))

    const result = requireParseErr(parse(tokens))

    expect(result.error.includes('Unknown layout hint kind')).toBe(true)
  })
})

describe('parse when a handle marker is present without an identifier', () => {
  it('returns a parse error for missing handle identifier', () => {
    const tokens = tokenize(['org "Acme"', '  Alice @'].join('\n'))

    const result = requireParseErr(parse(tokens))

    expect(result.error.includes('Expected handle identifier')).toBe(true)
  })
})

describe('parse when an attribute key token is invalid', () => {
  it('returns a parse error from attribute-key validation', () => {
    const tokens = tokenize(['org "Acme"', '  Alice [@]'].join('\n'))

    const result = requireParseErr(parse(tokens))

    expect(result.error.includes('Expected attribute key')).toBe(true)
  })
})