import { describe, expect, it } from 'vitest'
import {
  applyDefinitionsToStyleSheet,
  extractDefinitionsBlock,
  extractStyleSheet,
  mergeStyleSheets,
  resolveStyleSheet
} from './dsl'
import { mkStyleDslAst, mkStyleDslIndexed } from '../tests/factories/style'

const requireDefinitions = (
  result: ReturnType<typeof extractDefinitionsBlock>
): Extract<ReturnType<typeof extractDefinitionsBlock>, { readonly ok: true }>['definitions'] =>
  result.ok ? result.definitions : expect.fail('Expected defs extraction success in test setup')

const requireStyleSheet = (
  result: ReturnType<typeof extractStyleSheet>
): Extract<ReturnType<typeof extractStyleSheet>, { readonly ok: true }>['styleSheet'] =>
  result.ok ? result.styleSheet : expect.fail('Expected style extraction success in test setup')

const requireResolveOk = (
  result: ReturnType<typeof resolveStyleSheet>
): Extract<ReturnType<typeof resolveStyleSheet>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected style resolution success in test setup')

const requireResolveErr = (
  result: ReturnType<typeof resolveStyleSheet>
): Extract<ReturnType<typeof resolveStyleSheet>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected style resolution failure in test setup') : result

describe('extractDefinitionsBlock', () => {
  it('returns empty definitions when no defs block exists', () => {
    const result = extractDefinitionsBlock('org "Acme"\n  CEO')
    const definitions = requireDefinitions(result)

    expect(result.ok).toBe(true)
    expect(definitions.variables.size).toBe(0)
  })

  it('returns parse error for invalid defs declarations', () => {
    const result = extractDefinitionsBlock('defs\n  not-a-variable\norg "Acme"')

    expect(result.ok).toBe(false)
  })
})

describe('extractStyleSheet', () => {
  it('parses a simple style block with one selector and declaration', () => {
    const result = extractStyleSheet('style\n  .node\n    color: #333\norg "Acme"')
    const extracted = requireStyleSheet(result)

    expect(result.ok).toBe(true)
    expect(extracted.rules.length).toBe(1)
  })
})

describe('merge/apply style definitions', () => {
  it('merges style rules and overlays defs variables onto style sheet', () => {
    const leftRaw = extractStyleSheet('style\n  .node\n    color: #111')
    const rightRaw = extractStyleSheet('style\n  .node-title\n    color: #222')
    const defsRaw = extractDefinitionsBlock('defs\n  $accent = #0b5fff')
    const left = requireStyleSheet(leftRaw)
    const right = requireStyleSheet(rightRaw)
    const defs = requireDefinitions(defsRaw)

    expect(leftRaw.ok).toBe(true)
    expect(rightRaw.ok).toBe(true)
    expect(defsRaw.ok).toBe(true)

    const merged = mergeStyleSheets(left, right)
    const withDefs = applyDefinitionsToStyleSheet(merged, defs)

    expect(merged.rules.length).toBe(2)
    expect(withDefs.variables.get('accent')).toBe('#0b5fff')
  })
})

describe('resolveStyleSheet', () => {
  it('returns default text styles when stylesheet is empty', () => {
    const extractedRaw = extractStyleSheet('org "Acme"\n  CEO')
    const extracted = requireStyleSheet(extractedRaw)

    expect(extractedRaw.ok).toBe(true)

    const resultRaw = resolveStyleSheet(extracted, mkStyleDslAst(), mkStyleDslIndexed())
    const result = requireResolveOk(resultRaw)

    expect(resultRaw.ok).toBe(true)
    expect(result.textStyles.nodeName.fontWeight).toBe('bold')
  })

  it('returns resolve errors for unknown handle selectors', () => {
    const extractedRaw = extractStyleSheet('style\n  @missing\n    color: #f00')
    const extracted = requireStyleSheet(extractedRaw)

    expect(extractedRaw.ok).toBe(true)

    const resultRaw = resolveStyleSheet(extracted, mkStyleDslAst(), mkStyleDslIndexed())
    const result = requireResolveErr(resultRaw)

    expect(resultRaw.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
