/**
 * Semantic resolver: transforms an Abstract Syntax Tree into a resolved organizational tree.
 *
 * Validates:
 * - All referenced handles (use of @handle) exist and are unique
 * - Department nodes have a valid head reference
 * - Shadow nodes reference existing entities
 * - Attribute values are valid (e.g., side must be 'left' or 'right')
 *
 * On validation failure, returns detailed errors with line/col information and suggestions.
 * On success, produces an OrgTree with hierarchy, staff relationships, dotted edges, and shadows.
 */

// DEVIATION(2.4): Resolver remains centralized during staged extraction of icon, shadow, and edge adapters.

import { asDeptId, asNodeId } from '../types/branded'
import { intoMap } from '@tsfpp/prelude'
import type { AstNode, AstOrg } from '../types/ast'
import type { DottedEdge, OrgNode, OrgTree } from '../types/org-tree'
import type { ResolveResult } from '../types/results'
import { ICON_POSITIONS, DEFAULT_ICON_POS, DEFAULT_ICON_SIZE, isKnownIcon } from '../icons/registry'
import type { IconPos } from '../icons/render'

type VariableIconEntry = {
  readonly variable: string
  readonly icon: string
  readonly normalizedValue: string
}

type VariableIconMap = ReadonlyMap<string, string>

import { buildHandleMap } from './handles'
import { findNumberAttrValue, findStringAttrValue } from './attrs'
import { validateAstReferences } from './validate'

type ResolverVariables = ReadonlyMap<string, string>

/** Style values that suppress rendering (dotted edges, shadow connectors). */
const SUPPRESSED_STYLES = ['none', 'hidden', 'off']

const isSuppressedStyle = (style: string): boolean => SUPPRESSED_STYLES.includes(style)

/**
 * Convert AST node kind to matching OrgNode kind, treating any node that's not
 * explicitly 'vacant' as an 'employee' (handles staff, extern, group, etc.).
 */
const nodeKindToOrgKind = (kind: AstNode['kind']): 'employee' | 'vacancy' => {
  return kind === 'vacant' ? 'vacancy' : 'employee'
}

const stripMatchingQuotes = (value: string): string => {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}

const resolveStringVariable = (value: string | undefined, variables: ResolverVariables): string | undefined => {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith('$')) {
    return value
  }

  const variableName = trimmed.slice(1)
  const resolved = variables.get(variableName)
  if (resolved === undefined) {
    return value
  }

  return stripMatchingQuotes(resolved.trim())
}

const findResolvedStringAttrValue = (key: string, attrs: readonly AstNode['attrs'][number][], variables: ResolverVariables): string | undefined =>
  resolveStringVariable(findStringAttrValue(key, attrs), variables)

/**
 * Extract department head handle from a node's [head: @handle] attribute.
 */
const extractDeptHeadHandle = (node: AstNode, variables: ResolverVariables): string | undefined => {
  const raw = findResolvedStringAttrValue('head', node.attrs, variables)
  return raw?.startsWith('@') === true ? raw.slice(1) : undefined
}

/**
 * Extract staff node placement: 'left' if side attribute explicitly says so,
 * otherwise defaults to 'right'.
 */
const sideFromStaff = (staffNode: AstNode): 'left' | 'right' =>
  findStringAttrValue('side', staffNode.attrs) === 'left' ? 'left' : 'right'

/**
 * Extract optional side override for regular hanging layout children.
 */
const extractHangingSide = (node: AstNode): 'left' | 'right' | undefined => {
  const side = findStringAttrValue('side', node.attrs)
  return side === 'left' || side === 'right' ? side : undefined
}

/**
 * Resolve node to its assigned handle, defaulting to 'node' if not found.
 */
const getNodeIdForAstNode = (astNode: AstNode, nodeToHandle: ReadonlyMap<AstNode, string>): string =>
  nodeToHandle.get(astNode) ?? 'node'

const firstLayoutHint = (node: AstNode): AstNode['layoutHints'][number]['kind'] | undefined =>
  node.layoutHints[0]?.kind

/**
 * Build display title from node's [title: ...] attribute and display name.
 * Format is "Name\nTitle" if both present, otherwise returns available one.
 */
const toHrTitle = (node: AstNode, variables: ResolverVariables): string => {
  const displayName = node.displayName?.trim()
  const title = findResolvedStringAttrValue('title', node.attrs, variables)?.trim()

  if (title === undefined) return displayName ?? ''
  return displayName !== undefined && displayName.length > 0 ? `${displayName}\n${title}` : title
}

/**
 * Extract shadow node's primary target reference from [primary: @handle] attribute.
 */
const extractShadowPrimaryHandle = (node: AstNode, variables: ResolverVariables): string | undefined => {
  const raw = findResolvedStringAttrValue('primary', node.attrs, variables)
  return raw?.startsWith('@') === true ? raw.slice(1) : undefined
}

/**
 * Extract shadow node label from [label: ...] attribute, falling back to display name.
 */
const extractShadowLabel = (node: AstNode, variables: ResolverVariables): string | undefined =>
  findResolvedStringAttrValue('label', node.attrs, variables) ?? node.displayName

const extractShadowType = (node: AstNode): 'employee' | 'staff' => {
  const value = findStringAttrValue('type', node.attrs)?.trim().toLowerCase()
  return value === 'staff' ? 'staff' : 'employee'
}

const extractShadowSide = (node: AstNode): 'left' | 'right' | undefined => {
  const value = findStringAttrValue('side', node.attrs)?.trim().toLowerCase()
  return value === 'left' || value === 'right' ? value : undefined
}

/**
 * Extract optional icon spec ([icon: name], [icon-pos: pos], [icon-size: n], [icon-opacity: num]) from a node.
 * Also checks if the [title: ...] attribute is a variable reference with an associated icon.
 */

// DEVIATION(4.4): Icon extraction intentionally keeps related validation branches in one adapter helper to preserve deterministic precedence.
/* eslint-disable complexity -- icon extraction combines explicit attrs and variable-fallback behavior in one resolver boundary helper. */
const extractIconAttrs = (
  node: AstNode,
  variables: ResolverVariables,
  variableIconMap: VariableIconMap = intoMap<string, string>([])
): { readonly icon?: string; readonly iconPos?: IconPos; readonly iconSize?: number; readonly iconOpacity?: number } => {
  const explicitIcon = findResolvedStringAttrValue('icon', node.attrs, variables)?.trim()
  const titleAttrRaw = findStringAttrValue('title', node.attrs)
  const titleIcon = titleAttrRaw !== undefined && titleAttrRaw.startsWith('$')
    ? variableIconMap.get(titleAttrRaw.slice(1))
    : undefined
  const iconName = explicitIcon ?? titleIcon

  if (iconName === undefined || !isKnownIcon(iconName)) return {}

  const rawPos = findResolvedStringAttrValue('icon-pos', node.attrs, variables)?.trim()
  // DEVIATION(1.6): Safe cast is constrained by ICON_POSITIONS runtime membership guard.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- membership in ICON_POSITIONS guarantees rawPos is a valid IconPos literal.
  const iconPos: IconPos = rawPos !== undefined && ICON_POSITIONS.has(rawPos) ? (rawPos as IconPos) : DEFAULT_ICON_POS

  const rawSize = findNumberAttrValue('icon-size', node.attrs)
  const iconSize = rawSize !== undefined && rawSize > 0 ? Math.round(rawSize) : DEFAULT_ICON_SIZE

  const rawOpacity = findNumberAttrValue('icon-opacity', node.attrs)
  const iconOpacity = rawOpacity !== undefined && rawOpacity >= 0 && rawOpacity <= 1 ? rawOpacity : undefined

  return { icon: iconName, iconPos, iconSize, ...(iconOpacity !== undefined ? { iconOpacity } : {}) }
}
/* eslint-enable complexity */

/**
 * Convert an AST node to an OrgNode, recursively processing children and staff.
 * Handles special case: departments default head to first non-department member
 * when explicit [head: @handle] attribute is missing.
 */

// Helper: extract optional triangle effect from the !new visual hint.
const extractTriangleEffect = (node: AstNode): { readonly color: string } | undefined => {
  const hint = node.visualHints?.find(h => h.name === 'new')
  if (hint === undefined) return undefined
  const rawColor = hint.params?.[0]
  const color = rawColor !== undefined && /^#([0-9a-fA-F]{3,8})$/.test(rawColor.trim())
    ? rawColor.trim()
    : '#e53935'
  return { color }
}

type ToOrgNodeInput = {
  readonly node: AstNode
  readonly nodeToHandle: ReadonlyMap<AstNode, string>
  readonly variables: ResolverVariables
  readonly variableIconMap: VariableIconMap
}

// DEVIATION(4.4): Recursive transformation and branch-specific mapping stay co-located to preserve totality over node kinds.
// eslint-disable-next-line max-lines-per-function, complexity -- central recursive resolver keeps department/vacancy/employee branching and child recursion in one total transformation.
const toOrgNode = (input: ToOrgNodeInput): OrgNode => {
  const idValue = getNodeIdForAstNode(input.node, input.nodeToHandle)
  const kind = input.node.kind === 'dept' ? 'department' : nodeKindToOrgKind(input.node.kind)
  const layoutHint = firstLayoutHint(input.node)
  const hangingSide = extractHangingSide(input.node)

  const triangleEffect = extractTriangleEffect(input.node)

  const children = input.node.children.map((child) => toOrgNode({ ...input, node: child }))
  const staff = input.node.staffNodes.map((staffNode) => ({
    id: asNodeId(getNodeIdForAstNode(staffNode, input.nodeToHandle)),
    side: sideFromStaff(staffNode),
    label: toHrTitle(staffNode, input.variables)
  }))

  if (kind === 'department') {
    const headHandle = extractDeptHeadHandle(input.node, input.variables)
    const fallbackHeadAst = input.node.children.find((child) => child.kind !== 'dept')
    const fallbackHeadId = fallbackHeadAst !== undefined
      ? asNodeId(getNodeIdForAstNode(fallbackHeadAst, input.nodeToHandle))
      : asNodeId(`missing-head-${idValue}`)

    return {
      kind: 'department',
      id: asDeptId(idValue),
      name: input.node.displayName ?? idValue,
      ...(layoutHint !== undefined ? { layoutHint } : {}),
      ...(hangingSide !== undefined ? { hangingSide } : {}),
      ...(triangleEffect !== undefined ? { triangleEffect } : {}),
      head: headHandle !== undefined ? asNodeId(headHandle) : fallbackHeadId,
      members: children
    }
  }

  if (kind === 'vacancy') {
    const vacancyIconAttrs = extractIconAttrs(input.node, input.variables, input.variableIconMap)
    return {
      kind: 'vacancy',
      id: asNodeId(idValue),
      meta: {
        title: toHrTitle(input.node, input.variables),
        ...vacancyIconAttrs
      },
      ...(triangleEffect !== undefined ? { triangleEffect } : {}),
      ...(layoutHint !== undefined ? { layoutHint } : {}),
      ...(hangingSide !== undefined ? { hangingSide } : {}),
      children
    }
  }

  const empIconAttrs = extractIconAttrs(input.node, input.variables, input.variableIconMap)
  return {
    kind: 'employee',
    id: asNodeId(idValue),
    meta: {
      title: toHrTitle(input.node, input.variables),
      ...empIconAttrs
    },
    ...(triangleEffect !== undefined ? { triangleEffect } : {}),
    ...(layoutHint !== undefined ? { layoutHint } : {}),
    ...(hangingSide !== undefined ? { hangingSide } : {}),
    children,
    staff
  }
}

type ShadowNodeFromEntryInput = {
  readonly entry: { readonly node: AstNode; readonly parentHandle: string | undefined }
  readonly nodeToHandle: ReadonlyMap<AstNode, string>
  readonly variables: ResolverVariables
}

type ShadowNodeOptionalsInput = {
  readonly label: string | undefined
  readonly type: 'employee' | 'staff'
  readonly side: 'left' | 'right' | undefined
  readonly host: ReturnType<typeof asNodeId> | undefined
  readonly hideConnector: boolean | undefined
}

const shadowNodeOptionals = (input: ShadowNodeOptionalsInput): Partial<OrgTree['shadowNodes'][number]> => ({
  ...(input.label !== undefined ? { label: input.label } : {}),
  ...(input.type !== 'employee' ? { type: input.type } : {}),
  ...(input.side !== undefined ? { side: input.side } : {}),
  ...(input.host !== undefined ? { host: input.host } : {}),
  ...(input.hideConnector === true ? { hideConnector: true } : {})
})

const buildShadowNodeFromEntry = (input: ShadowNodeFromEntryInput): OrgTree['shadowNodes'] => {
  const primaryHandle = extractShadowPrimaryHandle(input.entry.node, input.variables)
  if (primaryHandle === undefined) {
    return []
  }

  const id = asNodeId(getNodeIdForAstNode(input.entry.node, input.nodeToHandle))
  const primary = asNodeId(primaryHandle)
  const label = extractShadowLabel(input.entry.node, input.variables)
  const type = extractShadowType(input.entry.node)
  const side = extractShadowSide(input.entry.node)
  const host = type === 'staff' && input.entry.parentHandle !== undefined
    ? asNodeId(input.entry.parentHandle)
    : undefined

  const styleValue = findStringAttrValue('style', input.entry.node.attrs)?.trim().toLowerCase()
  const hideConnector = styleValue !== undefined && isSuppressedStyle(styleValue) ? true : undefined

  return [
    {
      id,
      primary,
      ...shadowNodeOptionals({ label, type, side, host, hideConnector })
    }
  ]
}

/**
 * Extract all dotted link edges, preserving optional labels where provided.
 */
const buildDottedEdges = (ast: AstOrg, variables: ResolverVariables): readonly DottedEdge[] =>
  ast.links.flatMap((link) => {
    const styleValue = findStringAttrValue('style', link.attrs)?.trim().toLowerCase()
    if (styleValue !== undefined && isSuppressedStyle(styleValue)) {
      return []
    }

    const label = resolveStringVariable(findStringAttrValue('label', link.attrs), variables)
    const kind = findStringAttrValue('kind', link.attrs)?.trim().toLowerCase()
    return [{
      from: asNodeId(link.from),
      to: asNodeId(link.to),
      ...(label !== undefined ? { label } : {}),
      ...(kind !== undefined ? { kind } : {})
    }]
  })

const buildShadowNodes = (
  ast: AstOrg,
  nodeToHandle: ReadonlyMap<AstNode, string>,
  variables: ResolverVariables
): OrgTree['shadowNodes'] => {
  type ShadowAstEntry = {
    readonly node: AstNode
    readonly parentHandle: string | undefined
  }

  const collectShadowEntries = (
    node: AstNode,
    parentHandle: string | undefined
  ): readonly ShadowAstEntry[] => {
    const self = node.kind === 'shadow' ? [{ node, parentHandle }] : []
    const currentHandle = nodeToHandle.get(node) ?? node.handle
    const childEntries = node.children.flatMap((child) => collectShadowEntries(child, currentHandle))
    const staffEntries = node.staffNodes.flatMap((staffNode) => collectShadowEntries(staffNode, currentHandle))
    return [...self, ...childEntries, ...staffEntries]
  }

  return collectShadowEntries(ast.root, undefined)
    .flatMap((entry) => buildShadowNodeFromEntry({ entry, nodeToHandle, variables }))
}

const toVariableIconEntry = (entry: VariableIconEntry): readonly [string, string] => [entry.variable, entry.icon]

/**
 * Resolve an AST into an organizational tree with all validations applied.
 *
 * Orchestrates handle assignment, reference validation, and tree transformation.
 * Returns discriminated union: success contains validated tree, failure contains typed errors.
 *
 * @param ast Abstract Syntax Tree from parser.
 * @param variables Optional variable bindings for attribute resolution.
 * @param variableIconEntries Optional variable-icon bindings that apply icons to title attributes.
 * @returns `{ ok: true, tree }` on success, or `{ ok: false, errors }` on validation failure.
 */
export const resolveAst = (ast: AstOrg, variables: ResolverVariables = intoMap<string, string>([]), variableIconEntries: ReadonlyArray<VariableIconEntry> = []): ResolveResult => {
  const handleResult = buildHandleMap(ast.root)
  const errors = validateAstReferences({
    ast,
    handleMap: handleResult.map,
    nodeToHandle: handleResult.nodeToHandle,
    duplicates: handleResult.duplicates
  })

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    }
  }

  const variableIconMap: VariableIconMap = intoMap(variableIconEntries.map(toVariableIconEntry))
  const tree: OrgTree = {
    root: toOrgNode({ node: ast.root, nodeToHandle: handleResult.nodeToHandle, variables, variableIconMap }),
    dottedEdges: buildDottedEdges(ast, variables),
    shadowNodes: buildShadowNodes(ast, handleResult.nodeToHandle, variables)
  }

  return {
    ok: true,
    tree
  }
}
