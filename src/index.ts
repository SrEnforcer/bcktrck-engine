/**
 * @module index
 *
 * Public API surface for bcktrck core, layout, compile, and style exports.
 *
 * This barrel centralizes stable imports so consumers can depend on one entrypoint
 * instead of deep module paths that may change during internal refactors.
 *
 * @packageDocumentation
 */

/** Re-export AST domain types used by parser and resolver consumers. */
export type { AstAttr, AstAttrValue, AstConfig, AstLayoutHint, AstLayoutHintKind, AstLink, AstNode, AstNodeKind, AstOrg, AstVisualDirective } from './types/ast'
/** Re-export branded identifier types used across the public API. */
export type { Handle, NodeId, DeptId } from './types/branded'
export { asDeptId, asHandle, asNodeId } from './types/branded'
/** Re-export render/layout configuration contracts and presets. */
export type { HintOverride, LayoutConfig, PlacerStrategy, Theme, ThemeName, ZoomLevel } from './types/config'
/** Re-export generic layout output DTOs used by non-SVG consumers. */
export type { LayoutBounds, LayoutTree, PositionedNode, RoutedEdge, RoutedPoint, StaffOffset } from './types/layout'
/** Re-export resolved organizational tree node types. */
export type { DottedEdge, HrMetadata, OrgNode, OrgTree, ShadowNode, StaffNode } from './types/org-tree'
/** Re-export parser/resolver result ADTs for error-aware callers. */
export type { ParseAndResolveResult, ParseErr, ParseOk, ParseResult, ResolveError, ResolveErrorKind, ResolveResult } from './types/results'
/** Re-export layout engine runtime contracts used by routing and rendering steps. */
export type { EdgeRoute, EdgeRoutePoint, IndexedNode, IndexedTree, LayoutNodeKind, LayoutPoint, PlacedTree, PlacedStaff, RenderConfig, RenderError, RenderResult, RenderedSvg, StaffPosition } from './layout/types'
export { computeReportingChain, computeVerticalPath, computeAltChain } from './subtree/reporting-chain'
/** Re-export reporting-chain output types. */
export type { ReportingChain, VerticalPath, AltChain } from './subtree/reporting-chain'
export { listSubtrees, isolateSubtree, isolateSubtrees, isolateUpstreamSubtree } from './subtree/subtree'
/** Re-export subtree listing DTOs for selector UIs. */
export type { SubtreeEntry } from './subtree/subtree'
export { spanOfControl, defaultSpanOfControlOptions } from './subtree/span-of-control'
/** Re-export span-of-control options and result contracts. */
export type { SpanOfControlOptions, SpanOfControlResult } from './subtree/span-of-control'
export { countDirectSubordinates, isCountedDirectSubordinate } from './subtree/subordinate-count-policy'
/** Re-export direct subordinate counting policy/value types. */
export type { SubordinateCandidate, SubordinateCountPolicy, SubordinateKind } from './subtree/subordinate-count-policy'
export { indexTree } from './layout/index-tree'
export { buchheim } from './layout/buchheim'
export { applyLayoutHints } from './layout/apply-layout-hints'
export { placeStaff } from './layout/staff-placement'
export { routeEdges, routeEdgesWithDiagnostics } from './layout/route-edges'
/** Re-export edge routing diagnostics contracts. */
export type { RouteEdgesDiagnostic, RouteEdgesResult } from './layout/route-edges'
export { renderSvg, defaultRenderConfig } from './layout/render-svg'
export { validateRenderConfig } from './layout/render-config-validation'
/** Re-export render config validation result contracts. */
export type { ConfigValidationError, ConfigValidationResult } from './layout/render-config-validation'
export { parseAndResolveBtl } from './subtree/parse-and-resolve'
export { compile, listSubtreesFromSource } from './compile'
/** Re-export compile pipeline option/result contracts. */
export type { CompileOptions, CompileResult, CompileOk, CompileErr } from './compile'
export { getStylePack, createStylePackLoader, stylePacks } from './style/packs'
