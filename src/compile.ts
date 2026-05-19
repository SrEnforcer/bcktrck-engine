/**
 * @module compile
 *
 * Compose the full BTL-to-SVG pipeline from parsing through rendering.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Composes the full BTL-to-SVG pipeline. This module is the narrow orchestration
 * boundary that wires parsing, semantic resolution, layout, style resolution,
 * edge routing, and final SVG rendering into one deterministic transformation.
 */

// DEVIATION(2.4): This orchestrator intentionally centralizes end-to-end pipeline wiring during migration.
/* eslint-disable max-lines */

import type { Option } from '@tsfpp/prelude'
import { fromNullable, getOrElse, intoMap, isNone, isSome, none, some } from '@tsfpp/prelude'
import { parseAndResolveBtl } from './subtree/parse-and-resolve'
import { parseBtl } from './parser/parse'
import { isolateSubtree, isolateSubtrees, isolateUpstreamSubtree, listSubtrees } from './subtree/subtree'
import { buildHandleMap } from './resolver/handles'
import { indexTree } from './layout/index-tree'
import { buchheim } from './layout/buchheim'
import { applyLayoutHints } from './layout/apply-layout-hints'
import { placeStaff } from './layout/staff-placement'
import { routeEdgesWithDiagnostics } from './layout/route-edges'
import { renderSvg, defaultRenderConfig } from './layout/render-svg'
import { applyDefinitionsToStyleSheet, extractDefinitionsBlock, extractStyleSheet, mergeStyleSheets, resolveStyleSheet } from './style/dsl'
import type { RenderConfig, RenderError, RenderedSvg } from './layout/types'
import type { AstNode } from './types/ast'
import type { ParseErr, ResolveError } from './types/results'
import type { OrgNode, OrgTree } from './types/org-tree'
import type { IconSpec } from './icons/render'
import type { ResolvedNodeStyle } from './style/dsl'
import type { SubtreeEntry } from './subtree/subtree'

/**
 * Successful compile result. Extends `RenderedSvg` with a discriminant `ok: true`
 * so callers can narrow the sum type without accessing individual fields first.
 */
export type CompileOk = RenderedSvg & { readonly ok: true }

/**
 * Failed compile result. Carries the earliest phase failure:
 * either a `parseError` (lexer/parser) or one or more `resolveErrors` (semantic).
 * At most one of the two fields is present on any given failure.
 */
export type CompileErr = {
  readonly ok: false
  readonly parseError?: ParseErr
  readonly resolveErrors?: readonly ResolveError[]
}

/**
 * Discriminated union over the full BTL-to-SVG pipeline outcome.
 * Use `result.ok` to narrow to `CompileOk` (SVG string + metadata) or `CompileErr` (errors).
 */
export type CompileResult = CompileOk | CompileErr

const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> => intoMap(entries)

const mapEntries = <K, V>(map: ReadonlyMap<K, V>): ReadonlyArray<readonly [K, V]> =>
  Array.from(map.entries()).map(([key, value]) => [key, value] as const)

const mergeMaps = <K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
  mapFromEntries([...mapEntries(left), ...mapEntries(right)])

/**
 * Optional compile-time overlays.
 *
 * `styleSource` may contain only `defs` and `style` blocks. Its definitions and
 * style rules are layered on top of anything embedded in `source`.
 *
 * Set `ignoreSourceStyle` to `true` to ignore declarations and variables from
 * the embedded source `style` block while preserving root `defs` variables.
 *
 * Variable precedence, lowest to highest:
 * 1. Variables declared inside the source `style` block
 * 2. Variables declared inside the source `defs` block
 * 3. Variables declared inside the supplemental `styleSource` `style` block
 * 4. Variables declared inside the supplemental `styleSource` `defs` block
 * 5. Explicit `variables` passed in this options object
 *
 * When `subtreeId` is provided the output is limited to the sub-graph rooted
 * at that node. Use the `id` field from a `SubtreeEntry` returned by
 * `listSubtrees`. Dotted edges and shadow nodes that cross the subtree
 * boundary are automatically excluded.
 *
 * When `subtreeIds` is provided, `compile` renders the union of selected
 * subtrees. In case both are provided, `subtreeIds` takes precedence.
 */
export type CompileOptions = {
  readonly styleSource?: string
  readonly ignoreSourceStyle?: boolean
  readonly variables?: ReadonlyMap<string, string>
  /**
   * When set, renders only the subtree rooted at the node with this id.
   * Obtain valid ids via `listSubtrees(parseAndResolveBtl(source).tree)`.
   */
  readonly subtreeId?: string
  /**
   * When set, renders a forest union of selected subtree roots.
   * Unknown ids are ignored as long as at least one id exists in the tree.
   */
  readonly subtreeIds?: readonly string[]
  /**
   * When set, renders only the upstream managerial chain from this node to root.
   * Unknown ids fail with an `unknown_handle` resolve error.
   */
  readonly upstreamId?: string
}

const mergeOptionalStyleSource = (
  base: ReturnType<typeof applyDefinitionsToStyleSheet>,
  styleSource: string | undefined
): Option<ReturnType<typeof applyDefinitionsToStyleSheet>> => {
  const styleSourceOption = fromNullable(styleSource)
  if (isNone(styleSourceOption)) {
    return some(base)
  }

  const supplementalStyleSheet = parseSupplementalStyleSource(styleSourceOption.value)
  if (!supplementalStyleSheet.ok) {
    return none
  }

  return some(mergeStyleSheets(base, supplementalStyleSheet.styleSheet))
}

const astNodeToSubtreeKind = (kind: AstNode['kind']): SubtreeEntry['kind'] => {
  if (kind === 'dept') {
    return 'department'
  }

  if (kind === 'vacant') {
    return 'vacancy'
  }

  return 'employee'
}

const isStaffAstNode = (node: AstNode): boolean => node.kind === 'staff'

const astSubtrees = (
  node: AstNode,
  depth: number,
  nodeToHandle: ReadonlyMap<AstNode, string>
): readonly SubtreeEntry[] => {
  if (isStaffAstNode(node)) {
    return []
  }

  const resolvedHandleOption = fromNullable(nodeToHandle.get(node))
  const displayNameOption = fromNullable(node.displayName)
  const label = getOrElse<string>(() => getOrElse<string>(() => 'node')(resolvedHandleOption))(displayNameOption)

  const ownEntry: readonly SubtreeEntry[] =
    isSome(resolvedHandleOption)
      ? [{ kind: astNodeToSubtreeKind(node.kind), id: resolvedHandleOption.value, label, depth }]
      : []

  return [
    ...ownEntry,
    ...node.children.flatMap((child) => astSubtrees(child, depth + 1, nodeToHandle))
  ]
}

const fallbackSubtreesFromParsedAst = (source: string): readonly SubtreeEntry[] => {
  const parsed = parseBtl(source)
  if (!parsed.ok) {
    return []
  }

  const handleMap = buildHandleMap(parsed.value.root)
  return astSubtrees(parsed.value.root, 0, handleMap.nodeToHandle)
}

/**
 * List selectable subtree entries directly from full BTL source.
 *
 * Unlike calling `parseAndResolveBtl(source)` directly, this helper first strips
 * `defs` and `style` blocks and applies merged variables, so it works for the
 * same source shape accepted by `compile`.
 *
 * Returns an empty list when source parsing/resolution fails.
 */
export const listSubtreesFromSource = (
  source: string,
  options: Pick<CompileOptions, 'styleSource' | 'variables' | 'ignoreSourceStyle'> = {}
): readonly SubtreeEntry[] => {
  const sourceStyle = extractSourceStyle(source, options.ignoreSourceStyle === true)
  if (!sourceStyle.ok) return []

  const mergedStyleSheetOption = mergeOptionalStyleSource(sourceStyle.sourceStyleSheet, options.styleSource)
  if (isNone(mergedStyleSheetOption)) return []
  const safeMergedStyleSheet = mergedStyleSheetOption.value

  const variablesOption = fromNullable(options.variables)
  const effectiveVariables = isNone(variablesOption)
    ? safeMergedStyleSheet.variables
    : mergeMaps(safeMergedStyleSheet.variables, variablesOption.value)

  const parsed = parseAndResolveBtl(sourceStyle.strippedSource, {
    variables: effectiveVariables,
    variableIcons: safeMergedStyleSheet.variableIcons
  })

  return parsed.ok ? listSubtrees(parsed.tree) : fallbackSubtreesFromParsedAst(sourceStyle.strippedSource)
}

const firstNonBlockLine = (source: string): { readonly line: number; readonly col: number; readonly text: string } | undefined =>
  source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => ({ line: index + 1, col: line.search(/\S/) + 1, text: line }))
    .find(({ text }) => {
      const trimmed = text.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })

const parseSupplementalStyleSource = (
  source: string
):
  | { readonly ok: true; readonly styleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>; readonly strippedSource: string }
  | { readonly ok: false; readonly error: ParseErr } => {
  const definitionsExtraction = extractDefinitionsBlock(source)
  if (!definitionsExtraction.ok) {
    return definitionsExtraction
  }

  const styleExtraction = extractStyleSheet(definitionsExtraction.strippedSource)
  if (!styleExtraction.ok) {
    return styleExtraction
  }

  const leftoverOption = fromNullable(firstNonBlockLine(styleExtraction.strippedSource))
  if (isSome(leftoverOption)) {
    const leftover = leftoverOption.value
    return {
      ok: false,
      error: {
        ok: false,
        line: leftover.line,
        col: leftover.col,
        error: 'Supplemental styleSource may only contain defs and style blocks'
      }
    }
  }

  return {
    ok: true,
    strippedSource: styleExtraction.strippedSource,
    styleSheet: applyDefinitionsToStyleSheet(styleExtraction.styleSheet, definitionsExtraction.definitions)
  }
}

/**
 * Walk the resolved OrgTree and collect per-node icon specs into a flat map.
 * Department nodes contribute icons only through their members; every other node
 * kind may contribute an icon when semantic resolution attached one to `meta.icon`.
 */
const mergeIconMaps = (
  left: ReadonlyMap<string, readonly IconSpec[]>,
  right: ReadonlyMap<string, readonly IconSpec[]>
): ReadonlyMap<string, readonly IconSpec[]> => mergeMaps(left, right)

const iconMapForNonDepartment = (node: Exclude<OrgNode, Extract<OrgNode, { readonly kind: 'department' }>>): ReadonlyMap<string, readonly IconSpec[]> =>
  isNone(fromNullable(node.meta.icon))
    ? mapFromEntries<string, readonly IconSpec[]>([])
    : mapFromEntries<string, readonly IconSpec[]>([
        [
          // DEVIATION(1.6): Serialization boundary requires unwrapping branded NodeId to a plain string key.
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded NodeId unwrap at serialization boundary for icon map keys.
          node.id as string,
          [
            {
              name: getOrElse<string>(() => '')(fromNullable(node.meta.icon)),
              pos: getOrElse<IconSpec['pos']>(() => 'upper-left')(fromNullable(node.meta.iconPos)),
              size: getOrElse<number>(() => 14)(fromNullable(node.meta.iconSize)),
              opacity: getOrElse<number>(() => 0.3)(fromNullable(node.meta.iconOpacity))
            }
          ]
        ]
      ])

const collectIconsFromNode = (node: OrgNode): ReadonlyMap<string, readonly IconSpec[]> => {
  if (node.kind === 'department') {
    return node.members
      .map((member) => collectIconsFromNode(member))
      .reduce<ReadonlyMap<string, readonly IconSpec[]>>(
        (acc, memberIcons) => mergeIconMaps(acc, memberIcons),
        mapFromEntries<string, readonly IconSpec[]>([])
      )
  }

  const currentIcon = iconMapForNonDepartment(node)

  if (node.kind === 'employee') {
    return node.children
      .map((child) => collectIconsFromNode(child))
      .reduce<ReadonlyMap<string, readonly IconSpec[]>>(
        (acc, childIcons) => mergeIconMaps(acc, childIcons),
        currentIcon
      )
  }

  return currentIcon
}

/**
 * Merge semantic icons from the resolved tree with style-level overrides.
 *
 * Tree metadata establishes the baseline icon set. Style rules may either
 * replace that set entirely (`icon`) or refine the presentation of already
 * derived icons (`icon-pos`, `icon-size`, `icon-opacity`).
 *
 * @param tree Resolved organizational tree carrying semantic icon metadata.
 * @param styleMap Resolved per-node style map from the style DSL.
 * @returns A flat node-id keyed icon map ready for SVG rendering.
 */
const applyStyleToIcons = (
  style: ResolvedNodeStyle,
  existing: readonly IconSpec[] | undefined
): readonly IconSpec[] | undefined => {
  const styleIconOption = fromNullable(style.icon)
  if (!isNone(styleIconOption) && styleIconOption.value.length > 0) {
    const pos = styleIconOption.value.length === 1
      ? getOrElse<IconSpec['pos']>(() => 'upper-left')(fromNullable(style.iconPos))
      : 'upper-left'
    return styleIconOption.value.map((name) => ({
      name,
      pos,
      size: getOrElse<number>(() => 14)(fromNullable(style.iconSize)),
      opacity: getOrElse<number>(() => 0.3)(fromNullable(style.iconOpacity))
    }))
  }
  const existingOption = fromNullable(existing)
  if (!isNone(existingOption)) {
    return existingOption.value.map((spec) => ({
      name: spec.name,
      pos: getOrElse<IconSpec['pos']>(() => spec.pos)(fromNullable(style.iconPos)),
      size: getOrElse<number>(() => spec.size)(fromNullable(style.iconSize)),
      opacity: getOrElse<number>(() => getOrElse<number>(() => 0.3)(fromNullable(spec.opacity)))(fromNullable(style.iconOpacity))
    }))
  }
  return undefined
}

const buildIconMap = (
  tree: OrgTree,
  styleMap: ReadonlyMap<string, ResolvedNodeStyle> | undefined
): ReadonlyMap<string, readonly IconSpec[]> => {
  const base = collectIconsFromNode(tree.root)
  const effectiveStyleMap = getOrElse<ReadonlyMap<string, ResolvedNodeStyle>>(() => mapFromEntries<string, ResolvedNodeStyle>([]))(fromNullable(styleMap))
  return Array.from(effectiveStyleMap.entries()).reduce<ReadonlyMap<string, readonly IconSpec[]>>(
    (acc, [nodeId, style]) => {
      const updated = applyStyleToIcons(style, acc.get(nodeId))
      const updatedOption = fromNullable(updated)
      return isNone(updatedOption)
        ? acc
        : mapFromEntries([...mapEntries(acc), [nodeId, updatedOption.value] as const])
    },
    mapFromEntries(mapEntries(base))
  )
}

const layoutPositionErrors = (
  indexedIds: readonly string[],
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
): readonly ResolveError[] =>
  indexedIds
    .filter((id) => !positions.has(id))
    .map((id) => ({
      kind: 'invalid_attr_value' as const,
      handle: id,
      line: 0,
      col: 0,
      message: `Missing layout position for node '${id}'`
    }))

const routeDiagnosticsToErrors = (
  diagnostics: readonly { readonly kind: 'missing_parent_position' | 'missing_child_position'; readonly parentId: string; readonly childId?: string }[]
): readonly ResolveError[] =>
  diagnostics.map((diag) => ({
    kind: 'invalid_attr_value' as const,
    handle: diag.kind === 'missing_parent_position'
      ? diag.parentId
      : getOrElse<string>(() => diag.parentId)(fromNullable(diag.childId)),
    line: 0,
    col: 0,
    message: diag.kind === 'missing_parent_position'
      ? `Cannot route edges: missing parent position '${diag.parentId}'`
      : `Cannot route edges: missing child position '${getOrElse<string>(() => '')(fromNullable(diag.childId))}' under parent '${diag.parentId}'`
  }))

const renderErrorToResolveError = (error: RenderError): ResolveError => {
  switch (error.kind) {
    case 'missing_layout_position':
      return {
        kind: 'invalid_attr_value',
        handle: error.nodeId,
        line: 0,
        col: 0,
        message: error.message
      }
  }
}

type SourceStyleExtraction =
  | {
      readonly ok: true
      readonly strippedSource: string
      readonly sourceStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>
    }
  | { readonly ok: false; readonly parseError: ParseErr }

const extractSourceStyle = (source: string, ignoreSourceStyle = false): SourceStyleExtraction => {
  const definitionsExtraction = extractDefinitionsBlock(source)
  if (!definitionsExtraction.ok) {
    return {
      ok: false,
      parseError: definitionsExtraction.error
    }
  }

  const styleExtraction = extractStyleSheet(definitionsExtraction.strippedSource)
  if (!styleExtraction.ok) {
    return {
      ok: false,
      parseError: styleExtraction.error
    }
  }

  const sourceSheet = ignoreSourceStyle
    ? {
        ...styleExtraction.styleSheet,
        variables: mapFromEntries<string, string>([]),
        variableIcons: [],
        rules: []
      }
    : styleExtraction.styleSheet

  return {
    ok: true,
    strippedSource: styleExtraction.strippedSource,
    sourceStyleSheet: applyDefinitionsToStyleSheet(sourceSheet, definitionsExtraction.definitions)
  }
}

type CompileStyleContext =
  | {
      readonly ok: true
      readonly mergedStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>
      readonly effectiveVariables: ReadonlyMap<string, string>
    }
  | { readonly ok: false; readonly parseError: ParseErr }

const buildCompileStyleContext = (
  sourceStyleSheet: ReturnType<typeof applyDefinitionsToStyleSheet>,
  options: CompileOptions
): CompileStyleContext => {
  const styleSourceOption = fromNullable(options.styleSource)
  if (isNone(styleSourceOption)) {
    const variablesOption = fromNullable(options.variables)
    const effectiveVariables = isNone(variablesOption)
      ? sourceStyleSheet.variables
      : mergeMaps(sourceStyleSheet.variables, variablesOption.value)

    return {
      ok: true,
      mergedStyleSheet: sourceStyleSheet,
      effectiveVariables
    }
  }

  const supplementalStyleSheet = parseSupplementalStyleSource(styleSourceOption.value)
  if (!supplementalStyleSheet.ok) {
    return {
      ok: false,
      parseError: supplementalStyleSheet.error
    }
  }

  const mergedStyleSheet = mergeStyleSheets(sourceStyleSheet, supplementalStyleSheet.styleSheet)

  const variablesOption = fromNullable(options.variables)
  const effectiveVariables = isNone(variablesOption)
    ? mergedStyleSheet.variables
    : mergeMaps(mergedStyleSheet.variables, variablesOption.value)

  return {
    ok: true,
    mergedStyleSheet,
    effectiveVariables
  }
}

type SelectedCompileTree =
  | { readonly ok: true; readonly tree: OrgTree }
  | { readonly ok: false; readonly resolveErrors: readonly ResolveError[] }

const normalizeSubtreeIds = (subtreeIds: readonly string[] | undefined): readonly string[] => {
  const subtreeIdsOption = fromNullable(subtreeIds)
  if (isNone(subtreeIdsOption)) {
    return []
  }

  return subtreeIdsOption.value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

const unknownHandleFromOptions = (requestedSubtreeIds: readonly string[], subtreeIdOption: Option<string>): string =>
  requestedSubtreeIds.length > 0
    ? requestedSubtreeIds.join(', ')
    : getOrElse<string>(() => '')(subtreeIdOption)

const selectCompileTree = (
  resolvedTree: OrgTree,
  options: CompileOptions
): SelectedCompileTree => {
  const requestedSubtreeIds = normalizeSubtreeIds(options.subtreeIds)
  const subtreeIdOption = fromNullable(options.subtreeId)
  const upstreamIdOption = fromNullable(options.upstreamId)
  const treeOrNone: Option<OrgTree> = requestedSubtreeIds.length > 0
    ? isolateSubtrees(resolvedTree, requestedSubtreeIds)
    : !isNone(subtreeIdOption)
      ? isolateSubtree(resolvedTree, subtreeIdOption.value)
      : !isNone(upstreamIdOption)
        ? isolateUpstreamSubtree(resolvedTree, upstreamIdOption.value)
        : some(resolvedTree)

  if (isNone(treeOrNone) === true) {
    const unknownHandle = unknownHandleFromOptions(requestedSubtreeIds, subtreeIdOption)
    return {
      ok: false,
      resolveErrors: [
        {
          kind: 'unknown_handle',
          handle: unknownHandle,
          line: 0,
          col: 0,
          message: requestedSubtreeIds.length > 0
            ? `No subtreeIds found in tree: "${unknownHandle}"`
            : !isNone(upstreamIdOption)
              ? `upstreamId not found in tree: "${upstreamIdOption.value}"`
            : `subtreeId not found in tree: "${getOrElse<string>(() => '')(subtreeIdOption)}"`
        }
      ]
    }
  }

  return {
    ok: true,
    tree: treeOrNone.value
  }
}

type CompileFromParsedTreeInput = {
  readonly parsed: Extract<ReturnType<typeof parseAndResolveBtl>, { readonly ok: true }>
  readonly compileStyle: Extract<CompileStyleContext, { readonly ok: true }>
  readonly cfg: RenderConfig
  readonly options: CompileOptions
}

const compileFromParsedTree = (input: CompileFromParsedTreeInput): CompileResult => {
  const selectedTree = selectCompileTree(input.parsed.tree, input.options)
  if (!selectedTree.ok) {
    return {
      ok: false,
      resolveErrors: selectedTree.resolveErrors
    }
  }

  return compileTreeToSvg({
    tree: selectedTree.tree,
    parsed: input.parsed,
    compileStyle: input.compileStyle,
    cfg: input.cfg
  })
}

type CompiledLayoutArtifacts =
  | {
      readonly ok: true
      readonly tree: OrgTree
      readonly indexed: ReturnType<typeof indexTree>
      readonly placedArtifacts: Extract<PlacementArtifacts, { readonly ok: true }>
      readonly styleResolved: Extract<ReturnType<typeof resolveStyleSheet>, { readonly ok: true }>
    }
  | { readonly ok: false; readonly resolveErrors: readonly ResolveError[] }

type PlacementArtifacts =
  | {
      readonly ok: true
      readonly placed: ReturnType<typeof applyLayoutHints>
      readonly staff: ReturnType<typeof placeStaff>
      readonly routed: ReturnType<typeof routeEdgesWithDiagnostics>
    }
  | { readonly ok: false; readonly resolveErrors: readonly ResolveError[] }

type BuildCompiledLayoutArtifactsInput = {
  readonly tree: OrgTree
  readonly parsed: Extract<ReturnType<typeof parseAndResolveBtl>, { readonly ok: true }>
  readonly compileStyle: Extract<CompileStyleContext, { readonly ok: true }>
  readonly cfg: RenderConfig
}

const buildCompiledLayoutArtifacts = (input: BuildCompiledLayoutArtifactsInput): CompiledLayoutArtifacts => {
  const indexed = indexTree(input.tree)
  const styleResolved = resolveCompileStyles(input.parsed, input.compileStyle, indexed)
  if (!styleResolved.ok) {
    return {
      ok: false,
      resolveErrors: styleResolved.errors
    }
  }

  const placedArtifacts = buildPlacementArtifacts(indexed, input.cfg, styleResolved.styleMap)
  if (!placedArtifacts.ok) {
    return {
      ok: false,
      resolveErrors: placedArtifacts.resolveErrors
    }
  }

  return {
    ok: true,
    tree: input.tree,
    indexed,
    placedArtifacts,
    styleResolved
  }
}

const buildPlacementArtifacts = (
  indexed: ReturnType<typeof indexTree>,
  cfg: RenderConfig,
  styleMap: ReadonlyMap<string, ResolvedNodeStyle>
): PlacementArtifacts => {
  const placedBase = buchheim(indexed)
  const placed = applyLayoutHints(indexed, placedBase)
  const positionErrors = layoutPositionErrors(Array.from(indexed.nodes.keys()), placed.positions)
  if (positionErrors.length > 0) {
    return {
      ok: false,
      resolveErrors: positionErrors
    }
  }

  const staff = placeStaff(indexed, placed, { staffSize: cfg.staffSize, nodeSize: cfg.nodeSize })
  const routed = routeEdgesWithDiagnostics({
    tree: indexed,
    placed,
    cfg,
    styleMap
  })
  if (routed.diagnostics.length > 0) {
    return {
      ok: false,
      resolveErrors: routeDiagnosticsToErrors(routed.diagnostics)
    }
  }

  return {
    ok: true,
    placed,
    staff,
    routed
  }
}

const resolveCompileStyles = (
  parsed: Extract<ReturnType<typeof parseAndResolveBtl>, { readonly ok: true }>,
  compileStyle: Extract<CompileStyleContext, { readonly ok: true }>,
  indexed: ReturnType<typeof indexTree>
): ReturnType<typeof resolveStyleSheet> =>
  resolveStyleSheet(
    {
      ...compileStyle.mergedStyleSheet,
      variables: compileStyle.effectiveVariables
    },
    parsed.ast,
    indexed
  )

type CompileTreeToSvgInput = {
  readonly tree: OrgTree
  readonly parsed: Extract<ReturnType<typeof parseAndResolveBtl>, { readonly ok: true }>
  readonly compileStyle: Extract<CompileStyleContext, { readonly ok: true }>
  readonly cfg: RenderConfig
}

const compileTreeToSvg = (input: CompileTreeToSvgInput): CompileResult => {
  const artifacts = buildCompiledLayoutArtifacts({
    tree: input.tree,
    parsed: input.parsed,
    compileStyle: input.compileStyle,
    cfg: input.cfg
  })
  if (!artifacts.ok) {
    return {
      ok: false,
      resolveErrors: artifacts.resolveErrors
    }
  }

  const iconMap = buildIconMap(artifacts.tree, artifacts.styleResolved.styleMap)
  const rendered = renderSvg({
    tree: artifacts.indexed,
    placed: artifacts.placedArtifacts.placed,
    staff: artifacts.placedArtifacts.staff,
    cfg: input.cfg,
    dottedEdges: artifacts.tree.dottedEdges,
    shadowNodes: artifacts.tree.shadowNodes,
    edgeRoutes: artifacts.placedArtifacts.routed.routes,
    styleMap: artifacts.styleResolved.styleMap,
    textStyles: artifacts.styleResolved.textStyles,
    iconMap
  })

  return rendered.ok
    ? {
        ok: true,
        svg: rendered.value.svg,
        viewBox: rendered.value.viewBox
      }
    : {
        ok: false,
        resolveErrors: [renderErrorToResolveError(rendered.error)]
      }
}

const parsedFailureToCompileErr = (
  parsed: Extract<ReturnType<typeof parseAndResolveBtl>, { readonly ok: false }>
): CompileErr => {
  const parseErrorOption = fromNullable(parsed.parseError)
  if (isSome(parseErrorOption)) {
    return {
      ok: false,
      parseError: parseErrorOption.value
    }
  }

  const resolveErrorsOption = fromNullable(parsed.resolveErrors)
  if (isSome(resolveErrorsOption)) {
    return {
      ok: false,
      resolveErrors: resolveErrorsOption.value
    }
  }

  return {
    ok: false
  }
}

/**
 * Full pipeline: BTL source → RenderedSvg.
 *
 * Parses, resolves, indexes, places (Buchheim + staff), and renders the
 * org chart to SVG in one call. Returns a discriminated union so callers
 * can handle parse / resolve errors without throwing.
 *
 * @param source   Raw BTL text.
 * @param cfg      Visual configuration (defaults to `defaultRenderConfig`).
 * @param options  Optional supplemental style source and explicit variables.
 * @returns Rendered SVG output on success, or structured parse/resolve errors.
 */
export const compile = (
  source: string,
  cfg: RenderConfig = defaultRenderConfig,
  options: CompileOptions = {}
): CompileResult => {
  const sourceStyle = extractSourceStyle(source, options.ignoreSourceStyle === true)
  if (!sourceStyle.ok) {
    return {
      ok: false,
      parseError: sourceStyle.parseError
    }
  }

  const compileStyle = buildCompileStyleContext(sourceStyle.sourceStyleSheet, options)
  if (!compileStyle.ok) {
    return {
      ok: false,
      parseError: compileStyle.parseError
    }
  }

  const parsed = parseAndResolveBtl(sourceStyle.strippedSource, {
    variables: compileStyle.effectiveVariables,
    variableIcons: compileStyle.mergedStyleSheet.variableIcons
  })

  if (!parsed.ok) {
    return parsedFailureToCompileErr(parsed)
  }

  return compileFromParsedTree({
    parsed,
    compileStyle,
    cfg,
    options
  })
}
