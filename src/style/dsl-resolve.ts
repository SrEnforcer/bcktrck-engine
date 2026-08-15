/**
 * @module style/dsl-resolve
 *
 * Internal style-rule resolution helpers for the DSL pipeline.
 *
 * @packageDocumentation
 */

import { assoc, entriesOf, findO, flatMapOption, fromNullable, getOrElseOption, intoMap, intoSet, isNone, matchOption, unique } from '@tsfpp/prelude'
import type { EdgeStyleValue, IndexedNode, IndexedTree } from '../layout/types'
import { buildHandleMap } from '../resolver/handles'
import { collectNodes } from '../resolver/tree'
import type { AstAttr, AstAttrValue, AstNodeKind, AstOrg } from '../types/ast'
import type { ResolveError } from '../types/results'
import type { IconPos } from '../icons/render'
import { isKnownIcon, ICON_POSITIONS } from '../icons/registry'

type BorderStyleValue = 'solid' | 'dashed' | 'dotted' | 'none'

type StylePropertyName = 'background-color' | 'border-color' | 'border-style' | 'border-width' | 'color' | 'edge-style' | 'edge-width' | 'font-size' | 'font-weight' | 'icon' | 'icon-color' | 'icon-pos' | 'icon-size' | 'icon-opacity' | 'line-spacing'

type StyleSelector =
  | { readonly kind: 'node'; readonly line: number; readonly col: number }
  | { readonly kind: 'handle'; readonly handle: string; readonly line: number; readonly col: number }
  | { readonly kind: 'children'; readonly handle: string; readonly line: number; readonly col: number }
  | { readonly kind: 'role'; readonly role: string; readonly line: number; readonly col: number }
  | { readonly kind: 'role-children'; readonly role: string; readonly line: number; readonly col: number }
  | { readonly kind: 'type'; readonly type: string; readonly line: number; readonly col: number }
  | { readonly kind: 'type-children'; readonly type: string; readonly line: number; readonly col: number }
  | { readonly kind: 'node-kind'; readonly nodeKind: AstNodeKind; readonly line: number; readonly col: number }
  | { readonly kind: 'node-kind-children'; readonly nodeKind: AstNodeKind; readonly line: number; readonly col: number }
  | { readonly kind: 'node-name'; readonly line: number; readonly col: number }
  | { readonly kind: 'node-title'; readonly line: number; readonly col: number }

type StyleDeclaration = {
  readonly property: StylePropertyName
  readonly rawValue: string
  readonly line: number
  readonly col: number
}

type StyleRule = {
  readonly selector: StyleSelector
  readonly declarations: readonly StyleDeclaration[]
}

type VariableIconEntry = {
  readonly variable: string
  readonly icon: string
  readonly normalizedValue: string
}

type ParsedStyleSheet = {
  readonly variables: ReadonlyMap<string, string>
  readonly variableIcons: ReadonlyArray<VariableIconEntry>
  readonly rules: readonly StyleRule[]
}

type ResolvedNodeStyle = {
  readonly backgroundColor?: string
  readonly borderColor?: string
  readonly borderStyle?: BorderStyleValue
  readonly borderWidth?: number
  readonly color?: string
  readonly edgeStyle?: EdgeStyleValue
  readonly edgeWidth?: number
  readonly fontSize?: number
  readonly fontWeight?: string
  readonly lineSpacing?: number
  readonly icon?: readonly string[]
  readonly iconColor?: string
  readonly iconPos?: IconPos
  readonly iconSize?: number
  readonly iconOpacity?: number
}

type ResolvedTextStyle = {
  readonly color?: string
  readonly fontSize?: number
  readonly fontWeight?: string
  readonly lineSpacing?: number
}

type ResolvedTextStyles = {
  readonly nodeName: ResolvedTextStyle
  readonly nodeTitle: ResolvedTextStyle
}

type StyleResolutionResult =
  | { readonly ok: true; readonly styleMap: ReadonlyMap<string, ResolvedNodeStyle>; readonly textStyles: ResolvedTextStyles }
  | { readonly ok: false; readonly errors: readonly ResolveError[] }

const borderStyleValues: readonly BorderStyleValue[] = ['solid', 'dashed', 'dotted', 'none']
const edgeStyleValues: readonly (EdgeStyleValue | 'solid')[] = ['straight', 'solid', 'dashed', 'dotted']
const textUnsupportedProperties: ReadonlySet<StylePropertyName> = intoSet<StylePropertyName>([
  'background-color',
  'border-color',
  'border-style',
  'border-width',
  'edge-style',
  'edge-width',
  'icon-color',
  'icon-pos',
  'icon-size',
  'icon-opacity',
  'icon'
])

const isFontWeightKeyword = (value: string): value is 'normal' | 'bold' => value === 'normal' || value === 'bold'
const isBorderStyleValue = (value: string): value is BorderStyleValue => borderStyleValues.some((style) => style === value)
const isEdgeStyleValue = (value: string): value is EdgeStyleValue | 'solid' => edgeStyleValues.some((style) => style === value)
const isIconPosValue = (value: string): value is IconPos => ICON_POSITIONS.has(value)

const resolveError = (line: number, col: number, message: string): ResolveError => ({
  kind: 'invalid_attr_value',
  handle: 'style',
  line,
  col,
  message
})

const resolveErrorForHandle = (handle: string) => (line: number, col: number, message: string): ResolveError => ({
  ...resolveError(line, col, message),
  handle
})

const normalizeRole = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

const trimmedLookupOr = (variables: ReadonlyMap<string, string>, key: string, fallback: string): string => {
  const valueOption = fromNullable(variables.get(key))
  return matchOption(() => fallback, (value: string) => value.trim())(valueOption)
}

const resolveRoleAlias = (role: string, variables: ReadonlyMap<string, string>): string => {
  const trimmed = role.trim()
  if (trimmed.startsWith('$')) {
    return trimmedLookupOr(variables, trimmed.slice(1), trimmed)
  }
  if (trimmed.startsWith('@')) {
    return trimmedLookupOr(variables, trimmed.slice(1), trimmed)
  }
  return trimmed
}

const attrValueToString = (value: AstAttrValue): string => {
  switch (value.kind) {
    case 'string': return value.value
    case 'number': return String(value.value)
    case 'boolean': return String(value.value)
    case 'date': return value.value
    case 'url': return value.value
    case 'tags': return value.value.join(' ')
  }
}

const attrValueToRoleValues = (value: AstAttrValue, variables: ReadonlyMap<string, string>): readonly string[] => {
  if (value.kind === 'tags') {
    return value.value.map((entry) => resolveRoleAlias(entry, variables)).map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  }

  const single = resolveRoleAlias(attrValueToString(value), variables).trim()
  return single.length === 0 ? [] : [single]
}

const appendReadonly = <T>(values: ReadonlyArray<T>, value: T): ReadonlyArray<T> => [...values, value]

const appendRoleHandle = (
  roleToHandles: ReadonlyMap<string, readonly string[]>,
  role: string,
  handle: string
): ReadonlyMap<string, readonly string[]> => {
  const existing = getOrElseOption<readonly string[]>(() => [])(fromNullable(roleToHandles.get(role)))
  return assoc(role, appendReadonly(existing, handle))(roleToHandles)
}

const buildRoleHandleMap = (
  nodes: readonly AstOrg['root'][],
  nodeToHandle: ReadonlyMap<AstOrg['root'], string>,
  variables: ReadonlyMap<string, string>
): ReadonlyMap<string, readonly string[]> =>
  nodes.reduce<ReadonlyMap<string, readonly string[]>>((acc, node) => {
    const handleOption = fromNullable(nodeToHandle.get(node))
    if (isNone(handleOption)) {
      return acc
    }

    const roles = node.attrs
      .filter((attr) => attr.key === 'role' || attr.key === 'roles')
      .flatMap((attr) => attrValueToRoleValues(attr.value, variables))
      .map(normalizeRole)

    return roles.reduce((nextAcc, role) => appendRoleHandle(nextAcc, role, handleOption.value), acc)
  }, intoMap<string, readonly string[]>([]))

const buildKindHandleMap = (
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): ReadonlyMap<AstNodeKind, readonly string[]> =>
  [...handleMap.entries()].reduce<ReadonlyMap<AstNodeKind, readonly string[]>>((acc, [handle, mapEntry]) => {
    const existing = getOrElseOption<readonly string[]>(() => [])(fromNullable(acc.get(mapEntry.node.kind)))
    return assoc(mapEntry.node.kind, appendReadonly(existing, handle))(acc)
  }, intoMap<AstNodeKind, readonly string[]>([]))

const applyDeclarations = <TStyle extends ResolvedNodeStyle | ResolvedTextStyle>(
  input: {
    readonly initialStyle: TStyle
    readonly declarations: readonly StyleDeclaration[]
    readonly variables: ReadonlyMap<string, string>
    readonly apply: (current: TStyle, declaration: StyleDeclaration, vars: ReadonlyMap<string, string>) => TStyle | ResolveError
  }
): { readonly style: TStyle; readonly errors: readonly ResolveError[] } =>
  input.declarations.reduce<{ readonly style: TStyle; readonly errors: readonly ResolveError[] }>(
    (acc, declaration) => {
      const next = input.apply(acc.style, declaration, input.variables)
      return 'kind' in next
        ? { style: acc.style, errors: [...acc.errors, next] }
        : { style: next, errors: acc.errors }
    },
    { style: input.initialStyle, errors: [] }
  )

type RuleTargetResolution = { readonly targets: readonly string[]; readonly error?: ResolveError }

const uniqueTargets = (targets: readonly string[]): readonly string[] => unique(targets)

const childHandlesOrEmpty = (indexed: IndexedTree, handle: string): readonly string[] => {
  const nodeOption = fromNullable(indexed.nodes.get(handle))
  return matchOption(() => [], (value: IndexedNode) => value.children)(nodeOption)
}

const resolveHandleTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'handle' }>,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution =>
  handleMap.has(selector.handle)
    ? { targets: [selector.handle] }
    : { targets: [], error: resolveErrorForHandle(selector.handle)(selector.line, selector.col, `Unknown handle in style selector: @${selector.handle}`) }

const resolveChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'children' }>,
  indexed: IndexedTree,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => {
  const parentOption = fromNullable(indexed.nodes.get(selector.handle))
  if (!isNone(parentOption)) {
    return { targets: parentOption.value.children }
  }

  return handleMap.has(selector.handle)
    ? { targets: [] }
    : { targets: [], error: resolveErrorForHandle(selector.handle)(selector.line, selector.col, `Unknown handle in style selector: @${selector.handle}:children`) }
}

const resolveRoleChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'role-children' }>,
  indexed: IndexedTree,
  roleToHandles: ReadonlyMap<string, readonly string[]>
): RuleTargetResolution => ({
  targets: uniqueTargets(
    getOrElseOption<readonly string[]>(() => [])(fromNullable(roleToHandles.get(selector.role))).flatMap((handle) => childHandlesOrEmpty(indexed, handle))
  )
})

const matchesTypeSelector = (
  mapEntry: { readonly node: AstOrg['root']; readonly handle: string },
  targetType: string
): boolean => {
  const typeAttrOption = findO((attr: AstAttr) => attr.key === 'type')(mapEntry.node.attrs)
  return !isNone(typeAttrOption)
    && 'value' in typeAttrOption.value
    && typeAttrOption.value.value.kind === 'string'
    && typeAttrOption.value.value.value.toLowerCase() === targetType
}

const resolveTypeChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'type-children' }>,
  indexed: IndexedTree,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => ({
  targets: uniqueTargets([...handleMap.entries()].flatMap(([handle, mapEntry]) => matchesTypeSelector(mapEntry, selector.type) ? childHandlesOrEmpty(indexed, handle) : []))
})

const resolveTypeTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'type' }>,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
): RuleTargetResolution => ({
  targets: [...handleMap.entries()].filter(([, mapEntry]) => matchesTypeSelector(mapEntry, selector.type)).map(([handle]) => handle)
})

const resolveNodeKindChildrenTargets = (
  selector: Extract<StyleSelector, { readonly kind: 'node-kind-children' }>,
  indexed: IndexedTree,
  kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
): RuleTargetResolution => ({
  targets: uniqueTargets(getOrElseOption<readonly string[]>(() => [])(fromNullable(kindToHandles.get(selector.nodeKind))).flatMap((handle) => childHandlesOrEmpty(indexed, handle)))
})

const resolveRuleTargets = (
  input: {
    readonly rule: StyleRule
    readonly indexed: IndexedTree
    readonly handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>
    readonly roleToHandles: ReadonlyMap<string, readonly string[]>
    readonly kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
  }
): RuleTargetResolution => {
  const selector = input.rule.selector
  switch (selector.kind) {
    case 'node':
      return { targets: [...input.handleMap.keys()] }
    case 'handle':
      return resolveHandleTargets(selector, input.handleMap)
    case 'children':
      return resolveChildrenTargets(selector, input.indexed, input.handleMap)
    case 'role':
      return { targets: getOrElseOption<readonly string[]>(() => [])(fromNullable(input.roleToHandles.get(selector.role))) }
    case 'role-children':
      return resolveRoleChildrenTargets(selector, input.indexed, input.roleToHandles)
    case 'type':
      return resolveTypeTargets(selector, input.handleMap)
    case 'type-children':
      return resolveTypeChildrenTargets(selector, input.indexed, input.handleMap)
    case 'node-kind':
      return { targets: getOrElseOption<readonly string[]>(() => [])(fromNullable(input.kindToHandles.get(selector.nodeKind))) }
    case 'node-kind-children':
      return resolveNodeKindChildrenTargets(selector, input.indexed, input.kindToHandles)
    case 'node-name':
    case 'node-title':
      return { targets: [] }
  }
}

const resolveValue = (input: { readonly rawValue: string; readonly variables: ReadonlyMap<string, string>; readonly line: number; readonly col: number }): string | ResolveError => {
  const trimmed = input.rawValue.trim()
  if (!trimmed.startsWith('$')) {
    return trimmed
  }

  const resolvedOption = fromNullable(input.variables.get(trimmed.slice(1)))
  return isNone(resolvedOption)
    ? resolveError(input.line, input.col, `Unknown style variable: ${trimmed}`)
    : resolvedOption.value.trim()
}

type NodeStyleApplier = (
  current: ResolvedNodeStyle,
  resolvedValue: string,
  declaration: StyleDeclaration
) => ResolvedNodeStyle | ResolveError

const parsePxOrUnitlessNumber = (value: string): number | undefined => {
  const match = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/)
  const matchArrayOption = fromNullable(match)
  if (isNone(matchArrayOption)) {
    return undefined
  }
  const groupOption = fromNullable(matchArrayOption.value[1])
  return matchOption(() => undefined, (value: string) => Number(value))(groupOption)
}

const MAX_ICON_STACK = 5

const applyFontSize: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const size = parsePxOrUnitlessNumber(resolvedValue)
  if (isNone(fromNullable(size))) {
    return resolveError(declaration.line, declaration.col, `Invalid font-size value: ${resolvedValue}`)
  }
  return { ...current, fontSize: getOrElseOption<number>(() => 0)(fromNullable(size)) }
}

const applyFontWeight: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.toLowerCase()
  const numericWeight = Number(normalized)
  const isKeyword = isFontWeightKeyword(normalized)
  const isNumeric = Number.isFinite(numericWeight) && numericWeight >= 100 && numericWeight <= 900
  return !isKeyword && !isNumeric
    ? resolveError(declaration.line, declaration.col, `Invalid font-weight value: ${resolvedValue}`)
    : { ...current, fontWeight: isKeyword ? normalized : String(Math.round(numericWeight)) }
}

const applyLineSpacing: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const spacing = parsePxOrUnitlessNumber(resolvedValue)
  const spacingOption = fromNullable(spacing)
  return isNone(spacingOption) || spacingOption.value < 0.5
    ? resolveError(declaration.line, declaration.col, `Invalid line-spacing value: ${resolvedValue} (must be >= 0.5)`)
    : { ...current, lineSpacing: spacingOption.value }
}

const applyBackgroundColor: NodeStyleApplier = (current, resolvedValue) => ({ ...current, backgroundColor: resolvedValue })
const applyBorderColor: NodeStyleApplier = (current, resolvedValue) => ({ ...current, borderColor: resolvedValue })

const applyBorderStyle: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.trim().toLowerCase()
  return !isBorderStyleValue(normalized)
    ? resolveError(declaration.line, declaration.col, `Invalid border-style value: ${resolvedValue}`)
    : { ...current, borderStyle: normalized }
}

const applyBorderWidth: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const width = parsePxOrUnitlessNumber(resolvedValue)
  const widthOption = fromNullable(width)
  return isNone(widthOption)
    ? resolveError(declaration.line, declaration.col, `Invalid border-width value: ${resolvedValue}`)
    : { ...current, borderWidth: widthOption.value }
}

const applyEdgeStyle: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const normalized = resolvedValue.trim().toLowerCase()
  return !isEdgeStyleValue(normalized)
    ? resolveError(declaration.line, declaration.col, `Invalid edge-style value: ${resolvedValue}`)
    : { ...current, edgeStyle: normalized === 'solid' ? 'straight' : normalized }
}

const applyEdgeWidth: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const width = parsePxOrUnitlessNumber(resolvedValue)
  const widthOption = fromNullable(width)
  return isNone(widthOption)
    ? resolveError(declaration.line, declaration.col, `Invalid edge-width value: ${resolvedValue}`)
    : { ...current, edgeWidth: widthOption.value }
}

const applyIcon: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const names = resolvedValue.trim().split(/\s+/).filter((name) => name.length > 0)
  if (names.length === 0) {
    return resolveError(declaration.line, declaration.col, 'icon: expected at least one icon name')
  }
  if (names.length > MAX_ICON_STACK) {
    return resolveError(declaration.line, declaration.col, `icon: maximum ${MAX_ICON_STACK} icons allowed, got ${names.length}`)
  }
  const unknownNameOption = findO((name: string) => !isKnownIcon(name))(names)
  return !isNone(unknownNameOption)
    ? resolveError(declaration.line, declaration.col, `Unknown icon: ${unknownNameOption.value}`)
    : { ...current, icon: names }
}

const applyIconColor: NodeStyleApplier = (current, resolvedValue) => ({ ...current, iconColor: resolvedValue })

const applyIconPos: NodeStyleApplier = (current, resolvedValue, declaration) =>
  !isIconPosValue(resolvedValue)
    ? resolveError(declaration.line, declaration.col, `Invalid icon position: ${resolvedValue}`)
    : { ...current, iconPos: resolvedValue }

const applyIconSize: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const size = parsePxOrUnitlessNumber(resolvedValue)
  const sizeOption = fromNullable(size)
  if (isNone(sizeOption)) {
    return resolveError(declaration.line, declaration.col, `Invalid icon-size value: ${resolvedValue}`)
  }
  return sizeOption.value <= 0
    ? resolveError(declaration.line, declaration.col, `icon-size must be positive: ${resolvedValue}`)
    : { ...current, iconSize: Math.round(sizeOption.value) }
}

const applyIconOpacity: NodeStyleApplier = (current, resolvedValue, declaration) => {
  const opacityMatch = resolvedValue.match(/^(\d+(?:\.\d+)?)(?:%)?$/)
  const opacityMatchOption = fromNullable(opacityMatch)
  const opacityGroupOption = flatMapOption((m: RegExpMatchArray) => fromNullable(m[1]))(opacityMatchOption)
  if (isNone(opacityGroupOption)) {
    return resolveError(declaration.line, declaration.col, `Invalid icon-opacity value: ${resolvedValue}`)
  }
  const rawOpacity = Number(opacityGroupOption.value)
  const opacity = resolvedValue.includes('%') ? rawOpacity / 100 : rawOpacity
  return opacity < 0 || opacity > 1
    ? resolveError(declaration.line, declaration.col, `icon-opacity must be between 0 and 1 (or 0-100%): ${resolvedValue}`)
    : { ...current, iconOpacity: opacity }
}

const applyTextColor: NodeStyleApplier = (current, resolvedValue) => ({ ...current, color: resolvedValue })

const nodeStyleAppliers: Readonly<Record<StylePropertyName, NodeStyleApplier>> = {
  'font-size': applyFontSize,
  'font-weight': applyFontWeight,
  'line-spacing': applyLineSpacing,
  'background-color': applyBackgroundColor,
  'border-color': applyBorderColor,
  'border-style': applyBorderStyle,
  'border-width': applyBorderWidth,
  'edge-style': applyEdgeStyle,
  'edge-width': applyEdgeWidth,
  icon: applyIcon,
  'icon-color': applyIconColor,
  'icon-pos': applyIconPos,
  'icon-size': applyIconSize,
  'icon-opacity': applyIconOpacity,
  color: applyTextColor
}

const applyDeclaration = (
  current: ResolvedNodeStyle,
  declaration: StyleDeclaration,
  variables: ReadonlyMap<string, string>
): ResolvedNodeStyle | ResolveError => {
  const resolved = resolveValue({ rawValue: declaration.rawValue, variables, line: declaration.line, col: declaration.col })
  if (typeof resolved !== 'string') {
    return resolved
  }
  return nodeStyleAppliers[declaration.property](current, resolved, declaration)
}

const applyTextDeclaration = (
  current: ResolvedTextStyle,
  declaration: StyleDeclaration,
  variables: ReadonlyMap<string, string>
): ResolvedTextStyle | ResolveError => {
  if (textUnsupportedProperties.has(declaration.property)) {
    return resolveError(declaration.line, declaration.col, `${declaration.property} is not supported for .node-name/.node-title text`)
  }

  const applied = applyDeclaration(current, declaration, variables)
  if ('kind' in applied) {
    return applied
  }

  const colorOption = fromNullable(applied.color)
  const fontSizeOption = fromNullable(applied.fontSize)
  const fontWeightOption = fromNullable(applied.fontWeight)
  const lineSpacingOption = fromNullable(applied.lineSpacing)
  return {
    ...matchOption(() => ({}), (value: string) => ({ color: value }))(colorOption),
    ...matchOption(() => ({}), (value: number) => ({ fontSize: value }))(fontSizeOption),
    ...matchOption(() => ({}), (value: string) => ({ fontWeight: value }))(fontWeightOption),
    ...matchOption(() => ({}), (value: number) => ({ lineSpacing: value }))(lineSpacingOption)
  }
}

type StyleResolutionAcc = {
  readonly styles: ReadonlyMap<string, ResolvedNodeStyle>
  readonly nodeNameStyle: ResolvedTextStyle
  readonly nodeTitleStyle: ResolvedTextStyle
  readonly errors: readonly ResolveError[]
}

type StyleResolutionContext = {
  readonly handleResult: ReturnType<typeof buildHandleMap>
  readonly roleToHandles: ReadonlyMap<string, readonly string[]>
  readonly kindToHandles: ReadonlyMap<AstNodeKind, readonly string[]>
}

const createStyleResolutionContext = (ast: AstOrg, styleSheet: ParsedStyleSheet): StyleResolutionContext => {
  const handleResult = buildHandleMap(ast.root)
  const allNodes = collectNodes(ast.root)
  return {
    handleResult,
    roleToHandles: buildRoleHandleMap(allNodes, handleResult.nodeToHandle, styleSheet.variables),
    kindToHandles: buildKindHandleMap(handleResult.map)
  }
}

const applyTextRule = (
  state: StyleResolutionAcc,
  rule: StyleRule,
  variables: ReadonlyMap<string, string>
): StyleResolutionAcc => {
  const isNodeNameRule = rule.selector.kind === 'node-name'
  const applied = applyDeclarations({
    initialStyle: isNodeNameRule ? state.nodeNameStyle : state.nodeTitleStyle,
    declarations: rule.declarations,
    variables,
    apply: applyTextDeclaration
  })
  return {
    ...state,
    nodeNameStyle: isNodeNameRule ? applied.style : state.nodeNameStyle,
    nodeTitleStyle: rule.selector.kind === 'node-title' ? applied.style : state.nodeTitleStyle,
    errors: [...state.errors, ...applied.errors]
  }
}

const applyNodeRuleTargets = (input: {
  readonly targets: readonly string[]
  readonly currentStyles: ReadonlyMap<string, ResolvedNodeStyle>
  readonly declarations: readonly StyleDeclaration[]
  readonly variables: ReadonlyMap<string, string>
}): { readonly styles: ReadonlyMap<string, ResolvedNodeStyle>; readonly errors: readonly ResolveError[] } =>
  input.targets.reduce<{ readonly styles: ReadonlyMap<string, ResolvedNodeStyle>; readonly errors: readonly ResolveError[] }>((styleAcc, target) => {
    const currentStyle = getOrElseOption<ResolvedNodeStyle>(() => ({}))(fromNullable(styleAcc.styles.get(target)))
    const applied = applyDeclarations({ initialStyle: currentStyle, declarations: input.declarations, variables: input.variables, apply: applyDeclaration })
    return {
      styles: assoc(target, applied.style)(styleAcc.styles),
      errors: applied.errors
    }
  }, { styles: input.currentStyles, errors: [] })

const applyNodeRule = (input: {
  readonly state: StyleResolutionAcc
  readonly rule: StyleRule
  readonly styleSheet: ParsedStyleSheet
  readonly indexed: IndexedTree
  readonly context: StyleResolutionContext
}): StyleResolutionAcc => {
  const targetResolution = resolveRuleTargets({
    rule: input.rule,
    indexed: input.indexed,
    handleMap: input.context.handleResult.map,
    roleToHandles: input.context.roleToHandles,
    kindToHandles: input.context.kindToHandles
  })
  const targetErrorOption = fromNullable(targetResolution.error)
  if (!isNone(targetErrorOption)) {
    return { ...input.state, errors: [...input.state.errors, targetErrorOption.value] }
  }

  const nextStyles = applyNodeRuleTargets({
    targets: targetResolution.targets,
    currentStyles: input.state.styles,
    declarations: input.rule.declarations,
    variables: input.styleSheet.variables
  })

  return {
    ...input.state,
    styles: nextStyles.styles,
    errors: [...input.state.errors, ...nextStyles.errors]
  }
}

const applyStyleRules = (
  styleSheet: ParsedStyleSheet,
  indexed: IndexedTree,
  context: StyleResolutionContext
): StyleResolutionAcc => {
  const initialState: StyleResolutionAcc = {
    styles: intoMap<string, ResolvedNodeStyle>([]),
    nodeNameStyle: { fontWeight: 'bold' },
    nodeTitleStyle: {},
    errors: []
  }

  return styleSheet.rules.reduce<StyleResolutionAcc>((state, rule) =>
    rule.selector.kind === 'node-name' || rule.selector.kind === 'node-title'
      ? applyTextRule(state, rule, styleSheet.variables)
      : applyNodeRule({ state, rule, styleSheet, indexed, context }),
  initialState)
}

const deriveVariableIcons = (
  styleSheet: ParsedStyleSheet,
  handleMap: ReadonlyMap<string, { readonly node: AstOrg['root']; readonly handle: string }>,
  styles: ReadonlyMap<string, ResolvedNodeStyle>
): ReadonlyMap<string, ResolvedNodeStyle> =>
  [...handleMap.entries()].reduce<ReadonlyMap<string, ResolvedNodeStyle>>((acc, [handle, mapEntry]) => {
    const current = acc.get(handle)
    const currentOption = fromNullable(current)
    if (!isNone(currentOption) && !isNone(fromNullable(currentOption.value.icon))) {
      return acc
    }

    const nodeRoles = mapEntry.node.attrs
      .filter((attr) => attr.key === 'role' || attr.key === 'roles')
      .flatMap((attr) => attrValueToRoleValues(attr.value, styleSheet.variables))
      .map(normalizeRole)

    const derived = styleSheet.variableIcons
      .filter(({ normalizedValue }) => nodeRoles.includes(normalizedValue))
      .map(({ icon }) => icon)
      .slice(0, MAX_ICON_STACK)

    return derived.length === 0
      ? acc
      : intoMap([...entriesOf(acc), [handle, { ...getOrElseOption<ResolvedNodeStyle>(() => ({}))(fromNullable(current)), icon: [...derived] }] as const])
  }, intoMap(entriesOf(styles)))

/**
 * Resolve parsed style rules against the semantic org tree.
 *
 * @param styleSheet Parsed style DSL extracted from source.
 * @param ast Semantic AST used for role/type lookups and variable-icon bindings.
 * @param indexed Indexed layout tree used to resolve handle and children selectors.
 * @returns Immutable style maps on success, or collected resolve errors.
 */
export const resolveStyleSheet = (
  styleSheet: ParsedStyleSheet,
  ast: AstOrg,
  indexed: IndexedTree
): StyleResolutionResult => {
  const hasRules = styleSheet.rules.length > 0
  const hasVarIcons = styleSheet.variableIcons.length > 0

  if (!hasRules && !hasVarIcons) {
    return { ok: true, styleMap: intoMap<string, ResolvedNodeStyle>([]), textStyles: { nodeName: { fontWeight: 'bold' }, nodeTitle: {} } }
  }

  const resolutionContext = createStyleResolutionContext(ast, styleSheet)
  const finalState = applyStyleRules(styleSheet, indexed, resolutionContext)

  if (finalState.errors.length > 0) {
    return { ok: false, errors: finalState.errors }
  }

  const styleMapWithDerived = hasVarIcons
    ? deriveVariableIcons(styleSheet, resolutionContext.handleResult.map, finalState.styles)
    : finalState.styles

  return {
    ok: true,
    styleMap: styleMapWithDerived,
    textStyles: {
      nodeName: finalState.nodeNameStyle,
      nodeTitle: finalState.nodeTitleStyle
    }
  }
}