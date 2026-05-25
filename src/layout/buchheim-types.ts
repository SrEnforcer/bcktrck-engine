/**
 * @module layout/buchheim-types
 *
 * Internal Buchheim type definitions shared across the algorithm modules.
 *
 * @packageDocumentation
 */

import type { Option } from '@tsfpp/prelude'
import type { LayoutPoint } from './types'

/** Immutable indexed-node metadata needed by Buchheim contour and sibling logic. */
export type NodeMeta = {
  readonly parentId: Option<string>
  readonly childIndex: number
  readonly children: readonly string[]
  readonly depth: number
}

/** Per-node scratch state carried across Buchheim first and second walks. */
export type Scratch = {
  readonly prelim: number
  readonly mod: number
  readonly ancestor: string
  readonly change: number
  readonly shift: number
  readonly thread: string | null
  readonly childCount: number
}

/** One deferred shift adjustment applied during right-to-left sibling sweeps. */
export type ShiftUpdate = {
  readonly id: string
  readonly delta: number
}

/** Aggregate shift-planning state accumulated while executing shifts. */
export type ShiftPlanState = {
  readonly shift: number
  readonly change: number
  readonly updates: readonly ShiftUpdate[]
}

/** Mutable view over `Scratch` used only inside the imperative Buchheim helpers. */
export type MutableScratch = {
  prelim: number
  mod: number
  ancestor: string
  change: number
  shift: number
  thread: string | null
  childCount: number
}

/** Direction selector used when traversing tree contours. */
export type ContourDirection = 'left' | 'right'

/** Input for resolving one node id along a contour at a target depth. */
export type ContourAtDepthInput = {
  readonly id: string | null
  readonly depth: number
  readonly direction: ContourDirection
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input for leftmost/rightmost contour lookups. */
export type ContourLookupInput = {
  readonly id: string | null
  readonly depth: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input bundle for Buchheim ancestor resolution during apportion. */
export type ResolveAncestorInput = {
  readonly vim: string
  readonly v: string
  readonly defaultAncestorId: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input bundle for subtree-shift propagation between sibling ranges. */
export type MoveSubtreeInput = {
  readonly wlId: string
  readonly wrId: string
  readonly shift: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Full state tuple for one iteration of Buchheim apportion traversal. */
export type ApportionState = {
  readonly vip: string
  readonly vop: string | null
  readonly vim: string
  readonly vom: string | null
  readonly sip: number
  readonly sop: number
  readonly sim: number
  readonly som: number
  readonly rightNext: string | null
  readonly leftNext: string | null
}

/** Input bundle for advancing apportion state by one contour step. */
export type AdvanceApportionStateInput = {
  readonly state: ApportionState
  readonly v: string
  readonly defaultAncestor: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input for the top-level apportion routine. */
export type ApportionInput = {
  readonly v: string
  readonly defaultAncestor: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input for Buchheim first-walk recursion over indexed nodes. */
export type FirstWalkInput = {
  readonly v: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

/** Input for Buchheim second-walk recursion with accumulated modifier sum. */
export type SecondWalkInput = {
  readonly v: string
  readonly modSum: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
  readonly out: ReadonlyMap<string, LayoutPoint>
}