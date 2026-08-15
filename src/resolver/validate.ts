/**
 * @module resolver/validate
 *
 * Validate semantic references and constrained attributes across resolved AST nodes.
 *
 * @packageDocumentation
 */

/**
 * AST reference validator: ensures all semantic constraints are satisfied.
 *
 * Validates:
 * - All @handle references exist in the handle map
 * - Department heads are specified and unique
 * - Shadow nodes reference valid primary nodes
 * - Staff node 'side' attributes are 'left' or 'right'
 *
 * Returns structured errors with line/col info and suggestions for misspellings.
 */

import { assoc, fromNullable, getOrElseOption, intoMap, isNone, matchOption } from '@tsfpp/prelude'
import type { AstOrg } from '../types/ast'
import type { ResolveError } from '../types/results'
import type { HandleEntry } from './handles'
import { findHandleRefAttrValue, findStringAttrValue } from './attrs'
import { collectNodes } from './tree'

const numberRange = (startInclusive: number, endExclusive: number): ReadonlyArray<number> =>
  Array.from({ length: Math.max(0, endExclusive - startInclusive) }, (_value, index) => startInclusive + index)

const indexOr = (values: ReadonlyArray<number>, index: number, fallback: number): number =>
  getOrElseOption<number>(() => fallback)(fromNullable(values[index]))

const levenshtein = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  const buildRow = (prev: ReadonlyArray<number>, i: number): readonly number[] =>
    numberRange(1, n + 1).reduce<readonly number[]>(
      (row, j) => [
        ...row,
        a[i - 1] === b[j - 1]
          ? indexOr(prev, j - 1, 0)
          : 1 + Math.min(indexOr(prev, j, 0), indexOr(row, row.length - 1, 0), indexOr(prev, j - 1, 0))
      ],
      [i]
    )

  const firstRow = numberRange(0, n + 1)
  return indexOr(numberRange(1, m + 1).reduce<readonly number[]>((prev, i) => buildRow(prev, i), firstRow), n, 0)
}

const MAX_SUGGESTION_DISTANCE = 2

type DistanceMemo = ReadonlyMap<string, number>
type ValidationState = { readonly errors: readonly ResolveError[]; readonly memo: DistanceMemo }

const emptyValidationState = (): ValidationState => ({
  errors: [],
  memo: intoMap<string, number>([])
})

const distanceMemoKey = (a: string, b: string): string => `${a}\u0000${b}`

const getDistance = (
  target: string,
  candidate: string,
  memo: DistanceMemo
): { readonly distance: number; readonly memo: DistanceMemo } => {
  const key = distanceMemoKey(target, candidate)
  const cached = memo.get(key)
  const cachedOption = fromNullable(cached)
  if (!isNone(cachedOption)) {
    return { distance: cachedOption.value, memo }
  }

  const distance = levenshtein(target, candidate)
  return {
    distance,
    memo: assoc(key, distance)(memo)
  }
}

const closestHandle = (
  target: string,
  handleMap: ReadonlyMap<string, HandleEntry>,
  memo: DistanceMemo
): { readonly handle: string | undefined; readonly memo: DistanceMemo } => {
  const best = Array.from(handleMap.keys()).reduce<
    { readonly handle: string | undefined; readonly dist: number; readonly memo: DistanceMemo }
  >(
    (currentBest, key) => {
      const next = getDistance(target, key, currentBest.memo)
      return next.distance < currentBest.dist
        ? { handle: key, dist: next.distance, memo: next.memo }
        : { ...currentBest, memo: next.memo }
    },
    { handle: undefined, dist: MAX_SUGGESTION_DISTANCE + 1, memo }
  )

  return {
    handle: best.dist <= MAX_SUGGESTION_DISTANCE ? best.handle : undefined,
    memo: best.memo
  }
}

type UnknownHandleErrorInput = {
  readonly handle: string
  readonly line: number
  readonly col: number
  readonly suggestion: string | undefined
}

const optionalSuggestion = (suggestion: string | undefined): { readonly suggestion?: string } => {
  const suggestionOption = fromNullable(suggestion)
  return matchOption(() => ({}), (value: string) => ({ suggestion: value }))(suggestionOption)
}

const buildUnknownHandleError = (input: UnknownHandleErrorInput): ResolveError => ({
  kind: 'unknown_handle',
  handle: input.handle,
  line: input.line,
  col: input.col,
  message: `Unknown handle '${input.handle}'`,
  ...optionalSuggestion(input.suggestion)
})

const buildDuplicateHandleError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'duplicate_handle',
  handle,
  line,
  col,
  message: `Duplicate handle '${handle}'`
})

const buildInvalidSideError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Invalid 'side' value for staff node. Use 'left' or 'right'."
})

const buildInvalidHeadError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Invalid 'head' value for department node. Use @handle."
})

const buildMissingHeadError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Department requires [head: @handle] or at least one non-department member."
})

const buildInvalidShadowPrimaryError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Invalid 'primary' value for shadow node. Use [primary: @handle]."
})

const buildShadowPrimaryMustBeNonShadowError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Shadow primary must reference a non-shadow node."
})

const buildInvalidShadowTypeError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Invalid 'type' value for shadow node. Use 'employee' or 'staff'."
})

const buildInvalidShadowSideError = (handle: string, line: number, col: number): ResolveError => ({
  kind: 'invalid_attr_value',
  handle,
  line,
  col,
  message: "Invalid 'side' value for shadow node. Use 'left' or 'right'."
})

type ValidateAstReferencesInput = {
  readonly ast: AstOrg
  readonly handleMap: ReadonlyMap<string, HandleEntry>
  readonly nodeToHandle: ReadonlyMap<AstOrg['root'], string>
  readonly duplicates: readonly { readonly handle: string; readonly node: AstOrg['root'] }[]
}

/**
 * Validate semantic references and constrained attributes across the AST.
 *
 * @param input Validation context including AST, resolved handles, and duplicate-handle metadata.
 * @returns Immutable list of semantic resolution errors.
 */
export const validateAstReferences = (input: ValidateAstReferencesInput): readonly ResolveError[] => {
  const nodes = collectNodes(input.ast.root)
  return [
    ...validateDuplicateHandles(input.duplicates),
    ...validateLinkReferences(input.ast, input.handleMap),
    ...validateStaffSide(nodes, input.nodeToHandle),
    ...validateDepartmentHead(nodes, input.nodeToHandle, input.handleMap),
    ...validateShadowPrimary(nodes, input.nodeToHandle, input.handleMap)
  ]
}

const resolveNodeHandle = (
  node: AstOrg['root'],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>,
  fallback: string
): string => {
  const mappedHandleOption = fromNullable(nodeToHandle.get(node))
  if (!isNone(mappedHandleOption)) return mappedHandleOption.value

  const explicitHandleOption = fromNullable(node.handle)
  if (!isNone(explicitHandleOption)) return explicitHandleOption.value

  const displayNameOption = fromNullable(node.displayName)
  return matchOption(() => fallback, (value: string) => value)(displayNameOption)
}

const validateDuplicateHandles = (
  duplicates: readonly { readonly handle: string; readonly node: AstOrg['root'] }[]
): readonly ResolveError[] =>
  duplicates.map((duplicate) => buildDuplicateHandleError(duplicate.handle, duplicate.node.line, duplicate.node.col))

const validateLinkReferences = (
  ast: AstOrg,
  handleMap: ReadonlyMap<string, HandleEntry>
): readonly ResolveError[] => {
  type CheckHandleInput = {
    readonly handle: string
    readonly line: number
    readonly col: number
    readonly state: ValidationState
  }

  const checkHandle = (input: CheckHandleInput): ValidationState => {
    if (handleMap.has(input.handle)) return input.state
    const suggestion = closestHandle(input.handle, handleMap, input.state.memo)
    return {
      errors: [...input.state.errors, buildUnknownHandleError({
        handle: input.handle,
        line: input.line,
        col: input.col,
        suggestion: suggestion.handle
      })],
      memo: suggestion.memo
    }
  }

  const final = ast.links.reduce<ValidationState>(
    (state, link) => {
      const fromChecked = checkHandle({ handle: link.from, line: link.line, col: link.col, state })
      return checkHandle({ handle: link.to, line: link.line, col: link.col, state: fromChecked })
    },
    emptyValidationState()
  )
  return final.errors
}

const validateStaffSide = (
  nodes: readonly AstOrg['root'][],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>
): readonly ResolveError[] =>
  nodes
    .filter((node) => node.kind === 'staff')
    .flatMap((node) => {
      const side = findStringAttrValue('side', node.attrs)
      const sideOption = fromNullable(side)
      if (isNone(sideOption) || sideOption.value === 'left' || sideOption.value === 'right') return []
      const handle = resolveNodeHandle(node, nodeToHandle, 'staff')
      return [buildInvalidSideError(handle, node.line, node.col)]
    })

const validateDepartmentHead = (
  nodes: readonly AstOrg['root'][],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>,
  handleMap: ReadonlyMap<string, HandleEntry>
): readonly ResolveError[] => {
  const final = nodes
    .filter((node) => node.kind === 'dept')
    .reduce<ValidationState>((state, node) => {
      const handle = resolveNodeHandle(node, nodeToHandle, 'dept')
      const headHandle = findHandleRefAttrValue('head', node.attrs)
      const hasHeadAttr = !isNone(fromNullable(findStringAttrValue('head', node.attrs)))

      if (!hasHeadAttr) {
        const hasNonDeptMember = node.children.some((child) => child.kind !== 'dept')
        return hasNonDeptMember
          ? state
          : { ...state, errors: [...state.errors, buildMissingHeadError(handle, node.line, node.col)] }
      }

      const headHandleOption = fromNullable(headHandle)
      if (isNone(headHandleOption)) {
        return { ...state, errors: [...state.errors, buildInvalidHeadError(handle, node.line, node.col)] }
      }

      if (handleMap.has(headHandleOption.value)) return state
      const suggestion = closestHandle(headHandleOption.value, handleMap, state.memo)
      return {
        errors: [...state.errors, buildUnknownHandleError({
          handle: headHandleOption.value,
          line: node.line,
          col: node.col,
          suggestion: suggestion.handle
        })],
        memo: suggestion.memo
      }
    }, emptyValidationState())

  return final.errors
}

type ValidateShadowNodeInput = {
  readonly node: AstOrg['root']
  readonly state: ValidationState
  readonly nodeToHandle: ReadonlyMap<AstOrg['root'], string>
  readonly handleMap: ReadonlyMap<string, HandleEntry>
}

const hasInvalidShadowType = (normalizedType: string | undefined): boolean => {
  const normalizedTypeOption = fromNullable(normalizedType)
  return !isNone(normalizedTypeOption) && normalizedTypeOption.value !== 'employee' && normalizedTypeOption.value !== 'staff'
}

const hasInvalidShadowSide = (normalizedType: string | undefined, normalizedSide: string | undefined): boolean => {
  const normalizedSideOption = fromNullable(normalizedSide)
  return normalizedType === 'staff'
    && !isNone(normalizedSideOption)
    && normalizedSideOption.value !== 'left'
    && normalizedSideOption.value !== 'right'
}

const resolveShadowType = (node: AstOrg['root']): string | undefined =>
  findStringAttrValue('type', node.attrs)?.trim().toLowerCase()

const resolveShadowSide = (node: AstOrg['root']): string | undefined =>
  findStringAttrValue('side', node.attrs)?.trim().toLowerCase()

const validateShadowNode = (input: ValidateShadowNodeInput): ValidationState => {
  const handle = resolveNodeHandle(input.node, input.nodeToHandle, 'shadow')
  const primaryHandle = findHandleRefAttrValue('primary', input.node.attrs)
  const hasPrimaryAttr = !isNone(fromNullable(findStringAttrValue('primary', input.node.attrs)))
  const primaryHandleOption = fromNullable(primaryHandle)

  if (!hasPrimaryAttr || isNone(primaryHandleOption)) {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowPrimaryError(handle, input.node.line, input.node.col)] }
  }

  const normalizedType = resolveShadowType(input.node)
  if (hasInvalidShadowType(normalizedType)) {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowTypeError(handle, input.node.line, input.node.col)] }
  }

  const normalizedSide = resolveShadowSide(input.node)
  if (hasInvalidShadowSide(normalizedType, normalizedSide)) {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowSideError(handle, input.node.line, input.node.col)] }
  }

  const primaryEntryOption = fromNullable(input.handleMap.get(primaryHandleOption.value))
  if (isNone(primaryEntryOption)) {
    const suggestion = closestHandle(primaryHandleOption.value, input.handleMap, input.state.memo)
    return {
      errors: [...input.state.errors, buildUnknownHandleError({
        handle: primaryHandleOption.value,
        line: input.node.line,
        col: input.node.col,
        suggestion: suggestion.handle
      })],
      memo: suggestion.memo
    }
  }

  if (primaryEntryOption.value.node.kind === 'shadow') {
    return { ...input.state, errors: [...input.state.errors, buildShadowPrimaryMustBeNonShadowError(handle, input.node.line, input.node.col)] }
  }

  return input.state
}

const validateShadowPrimary = (
  nodes: readonly AstOrg['root'][],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>,
  handleMap: ReadonlyMap<string, HandleEntry>
): readonly ResolveError[] => {
  const final = nodes
    .filter((node) => node.kind === 'shadow')
    .reduce<ValidationState>(
      (state, node) => validateShadowNode({ node, state, nodeToHandle, handleMap }),
      emptyValidationState()
    )

  return final.errors
}
