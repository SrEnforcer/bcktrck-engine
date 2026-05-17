import { intoMap } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import type { AstLink } from '../types/ast'
import { validateAstReferences } from './validate'
import {
  mkResolverAst,
  mkResolverHandleMap,
  mkResolverNode,
  mkResolverStringAttr
} from '../tests/factories/resolver-slice'

describe('validateAstReferences when duplicate handles are present', () => {
  it('returns duplicate_handle errors', () => {
    const root = mkResolverNode('employee')
    const duplicated = mkResolverNode('employee', { line: 4, col: 3 })

    const result = validateAstReferences({
      ast: mkResolverAst(root),
      handleMap: mkResolverHandleMap([]),
      nodeToHandle: intoMap([]),
      duplicates: [{ handle: 'dup', node: duplicated }]
    })

    expect(result[0]?.kind).toBe('duplicate_handle')
  })
})

describe('validateAstReferences when link handles are unknown', () => {
  it('returns unknown_handle errors with nearest suggestion when available', () => {
    const root = mkResolverNode('employee')
    const links: readonly AstLink[] = [{ line: 2, col: 1, from: 'alpa', to: 'omega', attrs: [] }]

    const result = validateAstReferences({
      ast: mkResolverAst(root, links),
      handleMap: mkResolverHandleMap([['alpha', root]]),
      nodeToHandle: intoMap([]),
      duplicates: []
    })

    const unknownHandle = result.find((error) => error.kind === 'unknown_handle')

    expect(unknownHandle).toBeDefined()
    expect(unknownHandle?.suggestion).toBe('alpha')
  })
})

describe('validateAstReferences when a staff node has an invalid side attribute', () => {
  it('returns an invalid_attr_value error', () => {
    const staff = mkResolverNode('staff', { attrs: [mkResolverStringAttr('side', 'center')], line: 3, col: 2 })
    const root = mkResolverNode('employee', { staffNodes: [staff] })

    const result = validateAstReferences({
      ast: mkResolverAst(root),
      handleMap: mkResolverHandleMap([]),
      nodeToHandle: intoMap([[staff, 's1']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes("Invalid 'side' value for staff node"))).toBe(true)
  })
})

describe('validateAstReferences when a department has no head attribute and no non-department members', () => {
  it('returns an invalid_attr_value error for a missing head', () => {
    const nestedDept = mkResolverNode('dept')
    const dept = mkResolverNode('dept', { children: [nestedDept], line: 5, col: 4 })

    const result = validateAstReferences({
      ast: mkResolverAst(dept),
      handleMap: mkResolverHandleMap([]),
      nodeToHandle: intoMap([[dept, 'dept-main']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes('Department requires [head: @handle]'))).toBe(true)
  })
})

describe('validateAstReferences when a department head attribute is not a handle reference', () => {
  it('returns an invalid head error', () => {
    const member = mkResolverNode('employee')
    const dept = mkResolverNode('dept', {
      attrs: [mkResolverStringAttr('head', 'plain-text')],
      children: [member],
      line: 6,
      col: 2
    })

    const result = validateAstReferences({
      ast: mkResolverAst(dept),
      handleMap: mkResolverHandleMap([]),
      nodeToHandle: intoMap([[dept, 'dept-main']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes("Invalid 'head' value for department node"))).toBe(true)
  })
})

describe('validateAstReferences when a shadow node has no primary handle', () => {
  it('returns an invalid primary error', () => {
    const shadow = mkResolverNode('shadow', { line: 7, col: 3 })

    const result = validateAstReferences({
      ast: mkResolverAst(shadow),
      handleMap: mkResolverHandleMap([]),
      nodeToHandle: intoMap([[shadow, 'shadow-1']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes("Invalid 'primary' value for shadow node"))).toBe(true)
  })
})

describe('validateAstReferences when a shadow node type is invalid', () => {
  it('returns an invalid type error', () => {
    const shadow = mkResolverNode('shadow', {
      attrs: [mkResolverStringAttr('primary', '@alpha'), mkResolverStringAttr('type', 'contractor')]
    })
    const primary = mkResolverNode('employee')

    const result = validateAstReferences({
      ast: mkResolverAst(shadow),
      handleMap: mkResolverHandleMap([['alpha', primary]]),
      nodeToHandle: intoMap([[shadow, 'shadow-1']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes("Invalid 'type' value for shadow node"))).toBe(true)
  })
})

describe('validateAstReferences when a staff-type shadow has an invalid side', () => {
  it('returns an invalid shadow side error', () => {
    const shadow = mkResolverNode('shadow', {
      attrs: [
        mkResolverStringAttr('primary', '@alpha'),
        mkResolverStringAttr('type', 'staff'),
        mkResolverStringAttr('side', 'middle')
      ]
    })
    const primary = mkResolverNode('employee')

    const result = validateAstReferences({
      ast: mkResolverAst(shadow),
      handleMap: mkResolverHandleMap([['alpha', primary]]),
      nodeToHandle: intoMap([[shadow, 'shadow-1']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes("Invalid 'side' value for shadow node"))).toBe(true)
  })
})

describe('validateAstReferences when a shadow node primary points to a shadow node', () => {
  it('returns a non-shadow primary error', () => {
    const shadowPrimary = mkResolverNode('shadow')
    const shadow = mkResolverNode('shadow', { attrs: [mkResolverStringAttr('primary', '@primary-shadow')] })

    const result = validateAstReferences({
      ast: mkResolverAst(shadow),
      handleMap: mkResolverHandleMap([['primary-shadow', shadowPrimary]]),
      nodeToHandle: intoMap([[shadow, 'shadow-2']]),
      duplicates: []
    })

    expect(result.some((error) => error.message.includes('Shadow primary must reference a non-shadow node'))).toBe(true)
  })
})

describe('validateAstReferences when references are valid', () => {
  it('returns an empty error list', () => {
    const head = mkResolverNode('employee', { handle: 'head-handle' })
    const dept = mkResolverNode('dept', {
      attrs: [mkResolverStringAttr('head', '@head-handle')],
      children: [head]
    })

    const result = validateAstReferences({
      ast: mkResolverAst(dept),
      handleMap: mkResolverHandleMap([['head-handle', head]]),
      nodeToHandle: intoMap([[dept, 'dept-main'], [head, 'head-handle']]),
      duplicates: []
    })

    expect(result).toEqual([])
  })
})