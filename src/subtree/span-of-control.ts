/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Span-of-control calculation: determines how many people a manager or leader
 * has direct accountability for.
 *
 * Typical use-cases:
 *  - Planning how-goes-its, continuous dialogue talks, and performance reviews.
 *  - Identifying over- or under-loaded managers across an org chart.
 *
 * The manual `fte` attribute on a node acts as an explicit override when
 * present.  Otherwise the span is derived by counting qualifying direct-report
 * child nodes, excluding organisational unit wrappers (departments/teams) and,
 * by default, shadow placements.
 *
 * @packageDocumentation
 */

import { absurd, fromNullable, intoSet, isNone } from '@tsfpp/prelude'
import type { DeptId, NodeId } from '../types/branded'
import type { OrgNode, OrgTree } from '../types/org-tree'
import { countDirectSubordinates, type SubordinateCountPolicy } from './subordinate-count-policy'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Parameters controlling span-of-control calculation.
 *
 * All fields are required so that callsites remain explicit and total.
 * Use `defaultSpanOfControlOptions` for the canonical defaults.
 */
export type SpanOfControlOptions = SubordinateCountPolicy & {
  /**
   * Include vacancy (unfilled position) nodes in the count.
   *
   * Vacancies represent future direct reports and typically still carry
   * management overhead (recruitment, onboarding planning).
   *
   * Default: `true`.
   */
  readonly includeVacancies: boolean
  /**
   * Include shadow (shared/secondary placement) nodes in the count.
   *
   * Shadow nodes represent people shared across organisational boundaries.
   * They are excluded by default because the shadow's primary manager already
   * carries full accountability for those conversations.
   *
   * Default: `false`.
   */
  readonly includeShadows: boolean
  /**
   * When `true` and the node carries an explicit `fte` attribute, return that
   * value directly rather than calculating from child nodes.
   *
   * Default: `true`.
   */
  readonly useManualFte: boolean
}

/**
 * Result of a span-of-control calculation for a single org node.
 */
export type SpanOfControlResult = {
  /** Raw id of the evaluated node (NodeId or DeptId as string). */
  readonly nodeId: string
  /** Computed or manual span count (≥ 0). */
  readonly span: number
  /**
   * Discriminant describing how the span was obtained:
   *  - `'manual'`     — derived from the node's explicit `fte` attribute.
   *  - `'calculated'` — derived by counting qualifying direct-report children.
   */
  readonly source: 'manual' | 'calculated'
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Canonical default options for span-of-control calculation.
 *
 * - Vacancies are counted (they represent planned headcount).
 * - Shadows are excluded (the primary manager owns those conversations).
 * - Manual `fte` overrides take precedence when present.
 */
export const defaultSpanOfControlOptions: SpanOfControlOptions = {
  includeVacancies: true,
  includeShadows: false,
  useManualFte: true,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Unwraps a branded id to a plain string for map/set key comparisons. */
const rawId = (id: NodeId | DeptId): string => id

const setFromValues = <T>(values: ReadonlyArray<T>): ReadonlySet<T> => intoSet(values)

/**
 * Returns the direct-report children of a node, normalised across all kinds.
 *
 * For `department` nodes, `members` serves the same structural role as
 * `children` does for `employee`/`vacancy` nodes.
 */
const directChildren = (node: OrgNode): readonly OrgNode[] => {
  switch (node.kind) {
    case 'employee':   return node.children
    case 'vacancy':    return node.children
    case 'department': return node.members
    default:           return absurd(node)
  }
}

/**
 * Extracts the manual FTE override from a node's metadata when available.
 *
 * Department nodes carry no FTE metadata; they always return `undefined`.
 */
const manualFteFrom = (node: OrgNode): number | undefined => {
  switch (node.kind) {
    case 'employee':   return node.meta.fte
    case 'vacancy':    return node.meta.fte
    case 'department': return undefined
    default:           return absurd(node)
  }
}

/**
 * Builds an O(1)-lookup set of all shadow node ids from the resolved tree.
 */
const buildShadowIdSet = (tree: OrgTree): ReadonlySet<string> =>
  setFromValues(tree.shadowNodes.map((s) => rawId(s.id)))

/**
 * Counts qualifying direct-report children according to the given options.
 *
 * Rules applied in order:
 *  1. Department wrappers are never counted (they are org units, not people).
 *  2. Vacancies are excluded when `options.includeVacancies` is `false`.
 *  3. Shadow placements are excluded when `options.includeShadows` is `false`.
 */
const calculateSpan = (
  node: OrgNode,
  shadowIds: ReadonlySet<string>,
  options: SpanOfControlOptions,
): number => {
  const candidates = directChildren(node).map((child) => ({
    kind: child.kind,
    isShadow: shadowIds.has(rawId(child.id))
  }))

  return countDirectSubordinates(candidates, {
    includeVacancies: options.includeVacancies,
    includeShadows: options.includeShadows
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates the span of control for a single org node.
 *
 * Span of control represents the number of people a manager or leader has
 * direct accountability for — typically used to plan how-goes-its, continuous
 * dialogue talks, and performance review capacity.
 *
 * When `options.useManualFte` is `true` (the default) and the node carries an
 * explicit `fte` attribute, that value is returned directly as `source:
 * 'manual'`.  Otherwise the span is derived by counting qualifying
 * direct-report children (`source: 'calculated'`):
 *
 *  - Department wrapper nodes (`kind === 'department'`) are never counted.
 *  - Shadow placements are excluded by default (`options.includeShadows`).
 *  - Vacancy nodes are included by default (`options.includeVacancies`).
 *
 * @param node    - The manager/leader node to evaluate.
 * @param tree    - The resolved org tree; used to identify shadow placements.
 * @param options - Calculation parameters; defaults to `defaultSpanOfControlOptions`.
 * @returns A `SpanOfControlResult` with the span count and its derivation source.
 *
 * @example
 * ```typescript
 * const result = spanOfControl(ceoNode, orgTree)
 * // { nodeId: 'ceo', span: 4, source: 'calculated' }
 * ```
 */
export const spanOfControl = (
  node: OrgNode,
  tree: OrgTree,
  options: SpanOfControlOptions = defaultSpanOfControlOptions,
): SpanOfControlResult => {
  const nodeId = rawId(node.id)

  if (options.useManualFte) {
    const fte = manualFteFrom(node)
    const fteOption = fromNullable(fte)
    if (!isNone(fteOption)) {
      return { nodeId, span: fteOption.value, source: 'manual' }
    }
  }

  const shadowIds = buildShadowIdSet(tree)
  const span = calculateSpan(node, shadowIds, options)
  return { nodeId, span, source: 'calculated' }
}
