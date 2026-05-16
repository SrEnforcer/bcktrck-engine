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

import { assoc, intoMap } from '@tsfpp/prelude'
import type { AstOrg } from '../types/ast'
import type { ResolveError } from '../types/results'
import type { HandleEntry } from './handles'
import { findHandleRefAttrValue, findStringAttrValue } from './attrs'
import { collectNodes } from './tree'

const numberRange = (startInclusive: number, endExclusive: number): ReadonlyArray<number> =>
  Array.from({ length: Math.max(0, endExclusive - startInclusive) }, (_value, index) => startInclusive + index)

const levenshtein = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  const buildRow = (prev: ReadonlyArray<number>, i: number): readonly number[] =>
    numberRange(1, n + 1).reduce<readonly number[]>(
      (row, j) => [
        ...row,
        a[i - 1] === b[j - 1]
          ? (prev[j - 1] ?? 0)
          : 1 + Math.min(prev[j] ?? 0, row[row.length - 1] ?? 0, prev[j - 1] ?? 0)
      ],
      [i]
    )

  const firstRow = numberRange(0, n + 1)
  return numberRange(1, m + 1).reduce<readonly number[]>((prev, i) => buildRow(prev, i), firstRow)[n] ?? 0
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
  if (cached !== undefined) {
    return { distance: cached, memo }
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

const buildUnknownHandleError = (input: UnknownHandleErrorInput): ResolveError => ({
  kind: 'unknown_handle',
  handle: input.handle,
  line: input.line,
  col: input.col,
  message: `Unknown handle '${input.handle}'`,
  ...(input.suggestion !== undefined ? { suggestion: input.suggestion } : {})
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
): string => nodeToHandle.get(node) ?? node.handle ?? node.displayName ?? fallback

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
      if (side === undefined || side === 'left' || side === 'right') return []
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
      const hasHeadAttr = findStringAttrValue('head', node.attrs) !== undefined

      if (!hasHeadAttr) {
        const hasNonDeptMember = node.children.some((child) => child.kind !== 'dept')
        return hasNonDeptMember
          ? state
          : { ...state, errors: [...state.errors, buildMissingHeadError(handle, node.line, node.col)] }
      }

      if (headHandle === undefined) {
        return { ...state, errors: [...state.errors, buildInvalidHeadError(handle, node.line, node.col)] }
      }

      if (handleMap.has(headHandle)) return state
      const suggestion = closestHandle(headHandle, handleMap, state.memo)
      return {
        errors: [...state.errors, buildUnknownHandleError({
          handle: headHandle,
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

const resolveShadowType = (node: AstOrg['root']): string | undefined =>
  findStringAttrValue('type', node.attrs)?.trim().toLowerCase()

const resolveShadowSide = (node: AstOrg['root']): string | undefined =>
  findStringAttrValue('side', node.attrs)?.trim().toLowerCase()

// DEVIATION(4.4): A single ordered semantic guard chain keeps shadow validation diagnostics deterministic and clearer than splitting into tiny helpers.
// eslint-disable-next-line complexity -- shadow validation intentionally checks independent semantic constraints in boundary order.
const validateShadowNode = (input: ValidateShadowNodeInput): ValidationState => {
  const handle = resolveNodeHandle(input.node, input.nodeToHandle, 'shadow')
  const primaryHandle = findHandleRefAttrValue('primary', input.node.attrs)
  const hasPrimaryAttr = findStringAttrValue('primary', input.node.attrs) !== undefined

  if (!hasPrimaryAttr || primaryHandle === undefined) {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowPrimaryError(handle, input.node.line, input.node.col)] }
  }

  const normalizedType = resolveShadowType(input.node)
  if (normalizedType !== undefined && normalizedType !== 'employee' && normalizedType !== 'staff') {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowTypeError(handle, input.node.line, input.node.col)] }
  }

  const normalizedSide = resolveShadowSide(input.node)
  if (normalizedType === 'staff' && normalizedSide !== undefined && normalizedSide !== 'left' && normalizedSide !== 'right') {
    return { ...input.state, errors: [...input.state.errors, buildInvalidShadowSideError(handle, input.node.line, input.node.col)] }
  }

  const primaryEntry = input.handleMap.get(primaryHandle)
  if (primaryEntry === undefined) {
    const suggestion = closestHandle(primaryHandle, input.handleMap, input.state.memo)
    return {
      errors: [...input.state.errors, buildUnknownHandleError({
        handle: primaryHandle,
        line: input.node.line,
        col: input.node.col,
        suggestion: suggestion.handle
      })],
      memo: suggestion.memo
    }
  }

  if (primaryEntry.node.kind === 'shadow') {
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
