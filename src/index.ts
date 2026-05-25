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
/** Re-export branded identifier smart constructors for trusted boundary values. */
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
/** Re-export reporting and alternative accountability chain calculators. */
export { computeReportingChain, computeVerticalPath, computeAltChain } from './subtree/reporting-chain'
/** Re-export reporting-chain output types. */
export type { ReportingChain, VerticalPath, AltChain } from './subtree/reporting-chain'
/** Re-export subtree listing and isolation entrypoints. */
export { listSubtrees, isolateSubtree, isolateSubtrees, isolateUpstreamSubtree } from './subtree/subtree'
/** Re-export subtree listing DTOs for selector UIs. */
export type { SubtreeEntry } from './subtree/subtree'
/** Re-export span-of-control calculator and canonical default options. */
export { spanOfControl, defaultSpanOfControlOptions } from './subtree/span-of-control'
/** Re-export span-of-control options and result contracts. */
export type { SpanOfControlOptions, SpanOfControlResult } from './subtree/span-of-control'
/** Re-export direct subordinate counting helpers shared by layout and analytics. */
export { countDirectSubordinates, isCountedDirectSubordinate } from './subtree/subordinate-count-policy'
/** Re-export direct subordinate counting policy/value types. */
export type { SubordinateCandidate, SubordinateCountPolicy, SubordinateKind } from './subtree/subordinate-count-policy'
/** Re-export indexed-tree construction from resolved organizational trees. */
export { indexTree } from './layout/index-tree'
/** Re-export Buchheim tidy-tree placement over indexed nodes. */
export { buchheim } from './layout/buchheim'
/** Re-export layout-hint transformation over indexed trees. */
export { applyLayoutHints } from './layout/apply-layout-hints'
/** Re-export staff side-node placement for rendered layouts. */
export { placeStaff } from './layout/staff-placement'
/** Re-export edge routing with and without diagnostics metadata. */
export { routeEdges, routeEdgesWithDiagnostics } from './layout/route-edges'
/** Re-export edge routing diagnostics contracts. */
export type { RouteEdgesDiagnostic, RouteEdgesResult } from './layout/route-edges'
/** Re-export SVG projection entrypoint and default render configuration. */
export { renderSvg, defaultRenderConfig } from './layout/render-svg'
/** Re-export render-config validation helpers for boundary checks. */
export { validateRenderConfig } from './layout/render-config-validation'
/** Re-export render config validation result contracts. */
export type { ConfigValidationError, ConfigValidationResult } from './layout/render-config-validation'
/** Re-export parse-then-resolve orchestration for BTL source input. */
export { parseAndResolveBtl } from './subtree/parse-and-resolve'
/** Re-export compile entrypoint and source-driven subtree discovery helper. */
export { compile, listSubtreesFromSource } from './compile'
/** Re-export compile pipeline option/result contracts. */
export type { CompileOptions, CompileResult, CompileOk, CompileErr } from './compile'
/** Re-export built-in style packs and style-pack loader factory. */
export { getStylePack, createStylePackLoader, stylePacks } from './style/packs'
