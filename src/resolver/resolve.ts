/**
 * @module resolver/resolve
 *
 * Resolve validated AST structures into immutable organizational tree artifacts.
 *
 * @packageDocumentation
 */

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
import { findO, fromNullable, getOrElseOption, intoMap, isNone, matchOption } from '@tsfpp/prelude'
import type { AstNode, AstOrg, AstVisualDirective } from '../types/ast'
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
  const valueOption = fromNullable(value)
  if (isNone(valueOption)) {
    return undefined
  }
  const safeValue = valueOption.value

  const trimmed = safeValue.trim()
  if (!trimmed.startsWith('$')) {
    return safeValue
  }

  const variableName = trimmed.slice(1)
  const resolved = variables.get(variableName)
  const resolvedOption = fromNullable(resolved)
  if (isNone(resolvedOption)) {
    return safeValue
  }

  return stripMatchingQuotes(resolvedOption.value.trim())
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
  getOrElseOption<string>(() => 'node')(fromNullable(nodeToHandle.get(astNode)))

const firstLayoutHint = (node: AstNode): AstNode['layoutHints'][number]['kind'] | undefined =>
  node.layoutHints[0]?.kind

/**
 * Build display title from node's [title: ...] attribute and display name.
 * Format is "Name\nTitle" if both present, otherwise returns available one.
 */
const toHrTitle = (node: AstNode, variables: ResolverVariables): string => {
  const displayName = node.displayName?.trim()
  const title = findResolvedStringAttrValue('title', node.attrs, variables)?.trim()

  const titleOption = fromNullable(title)
  if (isNone(titleOption)) return getOrElseOption<string>(() => '')(fromNullable(displayName))
  return !isNone(fromNullable(displayName)) && getOrElseOption<string>(() => '')(fromNullable(displayName)).length > 0
    ? `${getOrElseOption<string>(() => '')(fromNullable(displayName))}\n${titleOption.value}`
    : titleOption.value
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
  getOrElseOption<string | undefined>(() => node.displayName)(fromNullable(findResolvedStringAttrValue('label', node.attrs, variables)))

const extractShadowType = (node: AstNode): 'employee' | 'staff' => {
  const value = findStringAttrValue('type', node.attrs)?.trim().toLowerCase()
  return value === 'staff' ? 'staff' : 'employee'
}

const extractShadowSide = (node: AstNode): 'left' | 'right' | undefined => {
  const value = findStringAttrValue('side', node.attrs)?.trim().toLowerCase()
  return value === 'left' || value === 'right' ? value : undefined
}

const resolveIconPos = (rawPos: string | undefined): IconPos => {
  switch (rawPos) {
    case undefined:
      return DEFAULT_ICON_POS
    case 'upper-left':
    case 'upper-right':
    case 'bottom-left':
    case 'bottom-right':
      return rawPos
    default:
      return DEFAULT_ICON_POS
  }
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
  const titleAttrRawOption = fromNullable(titleAttrRaw)
  const titleIcon = !isNone(titleAttrRawOption) && titleAttrRawOption.value.startsWith('$')
    ? variableIconMap.get(titleAttrRawOption.value.slice(1))
    : undefined
  const iconName = getOrElseOption<string | undefined>(() => titleIcon)(fromNullable(explicitIcon))
  const iconNameOption = fromNullable(iconName)

  if (isNone(iconNameOption) || !isKnownIcon(iconNameOption.value)) return {}

  const rawPos = findResolvedStringAttrValue('icon-pos', node.attrs, variables)?.trim()
  const rawPosOption = fromNullable(rawPos)
  const iconPos: IconPos = isNone(rawPosOption) || !ICON_POSITIONS.has(rawPosOption.value)
    ? DEFAULT_ICON_POS
    : resolveIconPos(rawPosOption.value)

  const rawSize = findNumberAttrValue('icon-size', node.attrs)
  const rawSizeOption = fromNullable(rawSize)
  const iconSize = !isNone(rawSizeOption) && rawSizeOption.value > 0 ? Math.round(rawSizeOption.value) : DEFAULT_ICON_SIZE

  const rawOpacity = findNumberAttrValue('icon-opacity', node.attrs)
  const rawOpacityOption = fromNullable(rawOpacity)
  const iconOpacity = !isNone(rawOpacityOption) && rawOpacityOption.value >= 0 && rawOpacityOption.value <= 1
    ? rawOpacityOption.value
    : undefined

  const iconOpacityOption = fromNullable(iconOpacity)
  return {
    icon: iconNameOption.value,
    iconPos,
    iconSize,
    ...matchOption(() => ({}), (value: number) => ({ iconOpacity: value }))(iconOpacityOption)
  }
}
/* eslint-enable complexity */

/**
 * Convert an AST node to an OrgNode, recursively processing children and staff.
 * Handles special case: departments default head to first non-department member
 * when explicit [head: @handle] attribute is missing.
 */

// Helper: extract optional triangle effect from the !new visual hint.
const extractTriangleEffect = (node: AstNode): { readonly color: string } | undefined => {
  const hintOption = findO((h: AstVisualDirective) => h.name === 'new')(node.visualHints)
  if (isNone(hintOption)) return undefined
  const rawColor = hintOption.value.params?.[0]
  const rawColorOption = fromNullable(rawColor)
  const color = !isNone(rawColorOption) && /^#([0-9a-fA-F]{3,8})$/.test(rawColorOption.value.trim())
    ? rawColorOption.value.trim()
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
    const fallbackHeadAstOption = findO((child: AstNode) => child.kind !== 'dept')(input.node.children)
    const fallbackHeadId = matchOption(
      () => asNodeId(`missing-head-${idValue}`),
      (child: AstNode) => asNodeId(getNodeIdForAstNode(child, input.nodeToHandle))
    )(fallbackHeadAstOption)
    const layoutHintOption = fromNullable(layoutHint)
    const hangingSideOption = fromNullable(hangingSide)
    const triangleEffectOption = fromNullable(triangleEffect)
    const headHandleOption = fromNullable(headHandle)

    return {
      kind: 'department',
      id: asDeptId(idValue),
      name: getOrElseOption<string>(() => idValue)(fromNullable(input.node.displayName)),
      ...matchOption(() => ({}), (value: AstNode['layoutHints'][number]['kind']) => ({ layoutHint: value }))(layoutHintOption),
      ...matchOption(() => ({}), (value: 'left' | 'right') => ({ hangingSide: value }))(hangingSideOption),
      ...matchOption(() => ({}), (value: { readonly color: string }) => ({ triangleEffect: value }))(triangleEffectOption),
      head: matchOption(() => fallbackHeadId, (value: string) => asNodeId(value))(headHandleOption),
      members: children
    }
  }

  if (kind === 'vacancy') {
    const vacancyIconAttrs = extractIconAttrs(input.node, input.variables, input.variableIconMap)
    const triangleEffectOption = fromNullable(triangleEffect)
    const layoutHintOption = fromNullable(layoutHint)
    const hangingSideOption = fromNullable(hangingSide)
    return {
      kind: 'vacancy',
      id: asNodeId(idValue),
      meta: {
        title: toHrTitle(input.node, input.variables),
        ...vacancyIconAttrs
      },
      ...matchOption(() => ({}), (value: { readonly color: string }) => ({ triangleEffect: value }))(triangleEffectOption),
      ...matchOption(() => ({}), (value: AstNode['layoutHints'][number]['kind']) => ({ layoutHint: value }))(layoutHintOption),
      ...matchOption(() => ({}), (value: 'left' | 'right') => ({ hangingSide: value }))(hangingSideOption),
      children
    }
  }

  const empIconAttrs = extractIconAttrs(input.node, input.variables, input.variableIconMap)
  const triangleEffectOption = fromNullable(triangleEffect)
  const layoutHintOption = fromNullable(layoutHint)
  const hangingSideOption = fromNullable(hangingSide)
  return {
    kind: 'employee',
    id: asNodeId(idValue),
    meta: {
      title: toHrTitle(input.node, input.variables),
      ...empIconAttrs
    },
    ...matchOption(() => ({}), (value: { readonly color: string }) => ({ triangleEffect: value }))(triangleEffectOption),
    ...matchOption(() => ({}), (value: AstNode['layoutHints'][number]['kind']) => ({ layoutHint: value }))(layoutHintOption),
    ...matchOption(() => ({}), (value: 'left' | 'right') => ({ hangingSide: value }))(hangingSideOption),
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

const optionalShadowLabel = (label: string | undefined): { readonly label?: string } => {
  const labelOption = fromNullable(label)
  return matchOption(() => ({}), (value: string) => ({ label: value }))(labelOption)
}

const optionalShadowSide = (side: 'left' | 'right' | undefined): { readonly side?: 'left' | 'right' } => {
  const sideOption = fromNullable(side)
  return matchOption(() => ({}), (value: 'left' | 'right') => ({ side: value }))(sideOption)
}

const optionalShadowHost = (
  host: ReturnType<typeof asNodeId> | undefined
): { readonly host?: ReturnType<typeof asNodeId> } => {
  const hostOption = fromNullable(host)
  return matchOption(() => ({}), (value: ReturnType<typeof asNodeId>) => ({ host: value }))(hostOption)
}

const shadowNodeOptionals = (input: ShadowNodeOptionalsInput): Partial<OrgTree['shadowNodes'][number]> => ({
  ...optionalShadowLabel(input.label),
  ...(input.type !== 'employee' ? { type: input.type } : {}),
  ...optionalShadowSide(input.side),
  ...optionalShadowHost(input.host),
  ...(input.hideConnector === true ? { hideConnector: true } : {})
})

const buildShadowNodeFromEntry = (input: ShadowNodeFromEntryInput): OrgTree['shadowNodes'] => {
  const primaryHandle = extractShadowPrimaryHandle(input.entry.node, input.variables)
  const primaryHandleOption = fromNullable(primaryHandle)
  if (isNone(primaryHandleOption)) {
    return []
  }

  const id = asNodeId(getNodeIdForAstNode(input.entry.node, input.nodeToHandle))
  const primary = asNodeId(primaryHandleOption.value)
  const label = extractShadowLabel(input.entry.node, input.variables)
  const type = extractShadowType(input.entry.node)
  const side = extractShadowSide(input.entry.node)
  const parentHandleOption = fromNullable(input.entry.parentHandle)
  const host = type === 'staff'
    ? matchOption(() => undefined, (value: string) => asNodeId(value))(parentHandleOption)
    : undefined

  const styleValue = findStringAttrValue('style', input.entry.node.attrs)?.trim().toLowerCase()
  const styleValueOption = fromNullable(styleValue)
  const hideConnector = matchOption(() => undefined, (value: string) => isSuppressedStyle(value) ? true : undefined)(styleValueOption)

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
    const styleValueOption = fromNullable(styleValue)
    if (!isNone(styleValueOption) && isSuppressedStyle(styleValueOption.value)) {
      return []
    }

    const label = resolveStringVariable(findStringAttrValue('label', link.attrs), variables)
    const labelOption = fromNullable(label)
    const kind = findStringAttrValue('kind', link.attrs)?.trim().toLowerCase()
    const kindOption = fromNullable(kind)
    return [{
      from: asNodeId(link.from),
      to: asNodeId(link.to),
      ...matchOption(() => ({}), (value: string) => ({ label: value }))(labelOption),
      ...matchOption(() => ({}), (value: string) => ({ kind: value }))(kindOption)
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
    const currentHandle = getOrElseOption<string | undefined>(() => node.handle)(fromNullable(nodeToHandle.get(node)))
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
