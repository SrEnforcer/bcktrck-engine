/**
 * @module layout/buchheim
 *
 * Implements Buchheim's linear-time tidy-tree layout over indexed nodes using
 * internal mutable scratch state while exposing immutable placement results.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Buchheim tree layout algorithm.
 *
 * Based on: "Improving Walker's Algorithm to Run in Linear Time"
 * Buchheim, Jünger, Leipert – Graph Drawing 2002.
 *
 * Produces tidy, compact (x, y) positions for every node in an IndexedTree.
 * x increases left→right; y equals depth (root at 0).  All sibling spacing
 * is exactly 1 unit; subtrees are placed with a minimum 1-unit gap.
 */

// DEVIATION(2.4): Buchheim implementation remains consolidated for algorithmic parity; helper extraction is staged.
// NOTE(unknown, 2026-05-18): Core traversal keeps imperative structure to preserve algorithmic guarantees and contour invariants.

// DEVIATION(1.6): Internal traversal invariants guarantee map lookups for visited ids.
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// DEVIATION(1.6): Internal mutable scratch adapters require boundary assertions at the map-cast seam.
/* eslint-disable @typescript-eslint/consistent-type-assertions */
// DEVIATION(4.4): Buchheim contour merge is intentionally branch-heavy to mirror the reference algorithm.
/* eslint-disable complexity */
// DEVIATION(4.4): Single-file algorithm module remains co-located for traceability against the paper.
/* eslint-disable max-lines */
// DEVIATION(4.4): Core walk functions exceed size limits to preserve algorithmic parity during staged extraction.
/* eslint-disable max-lines-per-function */
// DEVIATION(6.2): Scratch structures are mutated in-place to maintain linear-time behavior.
/* eslint-disable functional/immutable-data */
// DEVIATION(6.2): Loop-based contour traversal is required for the reference implementation.
/* eslint-disable functional/no-let */
// DEVIATION(6.2): While-loops are required to advance contour pointers efficiently.
/* eslint-disable functional/no-loop-statements */
// DEVIATION(6.2): Internal mutation-oriented types intentionally use mutable fields in scratch state.
/* eslint-disable functional/prefer-readonly-type */

import type { IndexedTree, LayoutPoint, PlacedTree } from './types'
import { fromNullable, getOrElse, intoMap, isNone } from '@tsfpp/prelude'

// ---------------------------------------------------------------------------
// Mutable per-node scratch state (never escapes the module)
// ---------------------------------------------------------------------------

type NodeMeta = {
  readonly parentId: string | null
  readonly childIndex: number
  readonly children: readonly string[]
  readonly depth: number
}

type Scratch = {
  /** Preliminary x-coordinate. Set to midpoint of children, or sibling+1 for leaves. */
  readonly prelim: number
  /** Modifier propagated to all descendants in second walk. */
  readonly mod: number
  /** Per-paper ancestor field — points to the node last designated as ancestor for this node. */
  readonly ancestor: string
  /**
   * Distributed shift: change[w] accumulates the rate at which the running
   * shift changes as EXECUTE_SHIFTS sweeps right→left across siblings.
   */
  readonly change: number
  /** Total shift to apply to this subtree (accumulated by MOVE_SUBTREE). */
  readonly shift: number
  /** Contour thread pointer — replaces missing children for contour traversal. */
  readonly thread: string | null
  readonly childCount: number
}

type ShiftUpdate = {
  readonly id: string
  readonly delta: number
}

type ShiftPlanState = {
  readonly shift: number
  readonly change: number
  readonly updates: readonly ShiftUpdate[]
}

type MutableScratch = {
  prelim: number
  mod: number
  ancestor: string
  change: number
  shift: number
  thread: string | null
  childCount: number
}

type ContourAtDepthInput = {
  readonly id: string | null
  readonly depth: number
  readonly direction: ContourDirection
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type ContourLookupInput = {
  readonly id: string | null
  readonly depth: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type ResolveAncestorInput = {
  readonly vim: string
  readonly v: string
  readonly defaultAncestorId: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type MoveSubtreeInput = {
  readonly wlId: string
  readonly wrId: string
  readonly shift: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type AdvanceApportionStateInput = {
  readonly state: ApportionState
  readonly v: string
  readonly defaultAncestor: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type ApportionInput = {
  readonly v: string
  readonly defaultAncestor: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type FirstWalkInput = {
  readonly v: string
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
}

type SecondWalkInput = {
  readonly v: string
  readonly modSum: number
  readonly nodes: ReadonlyMap<string, NodeMeta>
  readonly scratch: ReadonlyMap<string, Scratch>
  readonly out: ReadonlyMap<string, LayoutPoint>
}

const mutableScratchOf = (
  scratch: ReadonlyMap<string, Scratch>,
  id: string
): MutableScratch | undefined => scratch.get(id) as MutableScratch | undefined

const mutableMapOf = <K, V>(map: ReadonlyMap<K, V>): Map<K, V> => map as Map<K, V>

const mutableMapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): Map<K, V> =>
  intoMap(entries) as unknown as Map<K, V>

const makeScratch = (id: string, childCount: number): Scratch => ({
  prelim: 0,
  mod: 0,
  ancestor: id,
  change: 0,
  shift: 0,
  thread: null,
  childCount
})

const executeShifts = (
  children: readonly string[],
  scratch: ReadonlyMap<string, Scratch>
): void => {
  // PERF: keep scratch mutable and apply deltas in-place to preserve O(n) behavior.
  const shiftPlan = children
    .slice()
    .reverse()
    .reduce<ShiftPlanState>(
      (acc, childId) => {
        const ws = scratch.get(childId)
        const wsOption = fromNullable(ws)
        if (!isNone(wsOption)) {
          const nextChange = acc.change + wsOption.value.change
          const nextShift = acc.shift + wsOption.value.shift + nextChange
          return {
            shift: nextShift,
            change: nextChange,
            updates: [...acc.updates, { id: childId, delta: acc.shift }]
          }
        }
        return acc
      },
      { shift: 0, change: 0, updates: [] }
    )

  shiftPlan.updates.forEach(({ id, delta }) => {
    const ws = mutableScratchOf(scratch, id)
    const wsOption = fromNullable(ws)
    if (!isNone(wsOption)) {
      wsOption.value.prelim += delta
      wsOption.value.mod += delta
    }
  })
}

const scratchPrelimOrZero = (
  id: string | undefined,
  scratch: ReadonlyMap<string, Scratch>
): number => {
  const idOption = fromNullable(id)
  if (isNone(idOption)) return 0

  const nodeScratchOption = fromNullable(scratch.get(idOption.value))
  return isNone(nodeScratchOption) ? 0 : nodeScratchOption.value.prelim
}

const childMidpoint = (children: readonly string[], scratch: ReadonlyMap<string, Scratch>): number => {
  const leftId = children[0]
  const rightId = children.length > 0 ? children[children.length - 1] : undefined
  const leftPrelim = scratchPrelimOrZero(leftId, scratch)
  const rightPrelim = scratchPrelimOrZero(rightId, scratch)
  return (leftPrelim + rightPrelim) / 2
}

// ---------------------------------------------------------------------------
// Contour traversal helpers
// ---------------------------------------------------------------------------

const childIds = (id: string, nodes: ReadonlyMap<string, NodeMeta>): readonly string[] =>
  getOrElse<readonly string[]>(() => [])(fromNullable(nodes.get(id)?.children))

const nextContourOrSelf = (
  candidate: string | null,
  fallback: string
): string => getOrElse<string>(() => fallback)(fromNullable(candidate))

const firstChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  if (children.length === 0) {
    return null
  }
  const first = children[0]
  return getOrElse<string | null>(() => null)(fromNullable(first))
}

const lastChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  if (children.length === 0) {
    return null
  }
  const last = children[children.length - 1]
  return getOrElse<string | null>(() => null)(fromNullable(last))
}

type ContourDirection = 'left' | 'right'

const childByDirection = (
  id: string,
  direction: ContourDirection,
  nodes: ReadonlyMap<string, NodeMeta>
): string | null => (direction === 'left' ? firstChildId(id, nodes) : lastChildId(id, nodes))

// DEVIATION(6.2): Performance-critical contour traversal intentionally uses local reassignment and loop control.
// DEVIATION(1.6): Internal scratch-map invariants are established before traversal; non-null assertions avoid repeated guard overhead.
const contourAtDepth = (
  input: ContourAtDepthInput
): string | null => {
  let current = input.id
  let remainingDepth = input.depth

  while (remainingDepth > 0) {
    const currentOption = fromNullable(current)
    if (isNone(currentOption)) {
      return null
    }

    const currentId = currentOption.value
    const s = input.scratch.get(currentId)!
    const nextChild = childByDirection(currentId, input.direction, input.nodes)
    const nextChildOption = fromNullable(nextChild)
    const threadOption = fromNullable(s.thread)
    if (s.childCount > 0 && !isNone(nextChildOption)) {
      current = nextChildOption.value
      remainingDepth -= 1
    } else if (!isNone(threadOption)) {
      current = threadOption.value
      remainingDepth -= 1
    } else {
      return null
    }
  }

  return remainingDepth === 0 ? current : null
}

/**
 * Returns the leftmost node at `depth` levels below `id`, following threads
 * when the contour runs out of real children.
 */
const leftmost = (
  input: ContourLookupInput
): string | null => contourAtDepth({
  id: input.id,
  depth: input.depth,
  direction: 'left',
  nodes: input.nodes,
  scratch: input.scratch
})

/**
 * Returns the rightmost node at `depth` levels below `id`, following threads
 * when the contour runs out of real children.
 */
const rightmost = (
  input: ContourLookupInput
): string | null => contourAtDepth({
  id: input.id,
  depth: input.depth,
  direction: 'right',
  nodes: input.nodes,
  scratch: input.scratch
})

const leftSibling = (
  id: string,
  nodes: ReadonlyMap<string, NodeMeta>
): string | null => {
  // DEVIATION(1.6): Parent/child indexing invariants are established during index construction.
  const node = nodes.get(id)!
  const parentIdOption = fromNullable(node.parentId)
  if (!isNone(parentIdOption) && node.childIndex > 0) {
    const sibling = nodes.get(parentIdOption.value)!.children[node.childIndex - 1]
    return getOrElse<string | null>(() => null)(fromNullable(sibling))
  }
  return null
}

// ---------------------------------------------------------------------------
// ANCESTOR  (Buchheim §3 – checks ancestor[vil] is a sibling of v)
// ---------------------------------------------------------------------------

const resolveAncestor = (
  input: ResolveAncestorInput
): string => {
  // DEVIATION(1.6): APPORTION only passes node ids that are guaranteed to exist in scratch and node metadata.
  const vimAncestorId = input.scratch.get(input.vim)!.ancestor
  const vimAncestorParent = input.nodes.get(vimAncestorId)?.parentId
  const vParent = input.nodes.get(input.v)!.parentId
  return vimAncestorParent === vParent ? vimAncestorId : input.defaultAncestorId
}

// ---------------------------------------------------------------------------
// MOVE_SUBTREE  (Buchheim §3 – shifts wl..wr by `shift`, distributes change)
// ---------------------------------------------------------------------------

const moveSubtree = (
  input: MoveSubtreeInput
): void => {
  // DEVIATION(6.2): In-place scratch updates are intentional to preserve Buchheim's linear-time bookkeeping.
  // DEVIATION(1.6): Move-subtree ids are derived from validated sibling relationships and always exist in maps.
  // PERF: this imperative mutation mirrors Buchheim's original linear-time bookkeeping.
  const subtrees = input.nodes.get(input.wrId)!.childIndex - input.nodes.get(input.wlId)!.childIndex
  const wl = mutableScratchOf(input.scratch, input.wlId)!
  const wr = mutableScratchOf(input.scratch, input.wrId)!
  if (subtrees > 0) {
    wr.change -= input.shift / subtrees
    wl.change += input.shift / subtrees
  }
  wr.shift += input.shift
  wr.prelim += input.shift
  wr.mod += input.shift
}

// ---------------------------------------------------------------------------
// APPORTION  (core contour-merge loop)
// ---------------------------------------------------------------------------

type ApportionState = {
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

const advanceApportionState = (
  input: AdvanceApportionStateInput
): ApportionState => {
  // DEVIATION(1.6): Loop guard in APPORTION ensures rightNext/leftNext are non-null before this helper runs.
  const vim = input.state.rightNext!
  const vip = input.state.leftNext!
  const vomOption = fromNullable(input.state.vom)
  const vom = !isNone(vomOption)
    ? nextContourOrSelf(
      leftmost({ id: vomOption.value, depth: 1, nodes: input.nodes, scratch: input.scratch }),
      vomOption.value
    )
    : input.state.vom
  const vopOption = fromNullable(input.state.vop)
  const vop = !isNone(vopOption)
    ? nextContourOrSelf(
      rightmost({ id: vopOption.value, depth: 1, nodes: input.nodes, scratch: input.scratch }),
      vopOption.value
    )
    : input.state.vop

  const nextVopOption = fromNullable(vop)
  if (!isNone(nextVopOption)) {
    const scratchVop = mutableScratchOf(input.scratch, nextVopOption.value)
    const scratchVopOption = fromNullable(scratchVop)
    if (!isNone(scratchVopOption)) {
      scratchVopOption.value.ancestor = input.v
    }
  }

  const shift = input.scratch.get(vim)!.prelim + input.state.sim - (input.scratch.get(vip)!.prelim + input.state.sip) + 1
  const appliedShift = shift > 0 ? shift : 0
  if (appliedShift > 0) {
    const wlId = resolveAncestor({
      vim,
      v: input.v,
      defaultAncestorId: input.defaultAncestor,
      nodes: input.nodes,
      scratch: input.scratch
    })
    moveSubtree({ wlId, wrId: input.v, shift: appliedShift, nodes: input.nodes, scratch: input.scratch })
  }

  const sipShifted = input.state.sip + appliedShift
  const sopShifted = input.state.sop + appliedShift
  const resolvedVomOption = fromNullable(vom)
  const resolvedVopOption = fromNullable(vop)
  return {
    vip,
    vop,
    vim,
    vom,
    sim: input.state.sim + input.scratch.get(vim)!.mod,
    sip: sipShifted + input.scratch.get(vip)!.mod,
    som: isNone(resolvedVomOption) ? input.state.som : input.state.som + input.scratch.get(resolvedVomOption.value)!.mod,
    sop: isNone(resolvedVopOption) ? sopShifted : sopShifted + input.scratch.get(resolvedVopOption.value)!.mod,
    rightNext: rightmost({ id: vim, depth: 1, nodes: input.nodes, scratch: input.scratch }),
    leftNext: leftmost({ id: vip, depth: 1, nodes: input.nodes, scratch: input.scratch })
  }
}

// DEVIATION(6.2): Uses imperative contour merge loop and mutable scratch map for algorithmic parity and performance.
// DEVIATION(1.6): Non-null assertions in APPORTION rely on loop invariants and indexed-tree construction guarantees.
const apportion = (
  input: ApportionInput
): string => {
  const w = leftSibling(input.v, input.nodes)
  const wOption = fromNullable(w)
  if (!isNone(wOption)) {
    const parentId = input.nodes.get(input.v)!.parentId
    const parentIdOption = fromNullable(parentId)
    const firstParentChild = isNone(parentIdOption) ? null : firstChildId(parentIdOption.value, input.nodes)
    const somNodeId = getOrElse<string>(() => input.v)(fromNullable(firstParentChild))
    const initialState: ApportionState = {
      vip: input.v,
      vop: input.v,
      vim: wOption.value,
      vom: isNone(parentIdOption) ? input.v : firstChildId(parentIdOption.value, input.nodes),
      sip: input.scratch.get(input.v)!.mod,
      sop: input.scratch.get(input.v)!.mod,
      sim: input.scratch.get(wOption.value)!.mod,
      som: isNone(parentIdOption) ? input.scratch.get(input.v)!.mod : input.scratch.get(somNodeId)!.mod,
      rightNext: rightmost({ id: wOption.value, depth: 1, nodes: input.nodes, scratch: input.scratch }),
      leftNext: leftmost({ id: input.v, depth: 1, nodes: input.nodes, scratch: input.scratch })
    }

    let state = initialState
    while (!isNone(fromNullable(state.rightNext)) && !isNone(fromNullable(state.leftNext))) {
      state = advanceApportionState({
        state,
        v: input.v,
        defaultAncestor: input.defaultAncestor,
        nodes: input.nodes,
        scratch: input.scratch
      })
    }

    const finalState = state

    if (!isNone(fromNullable(finalState.rightNext)) && (
      !isNone(fromNullable(finalState.vop)) && !isNone(fromNullable(rightmost({ id: finalState.vop, depth: 1, nodes: input.nodes, scratch: input.scratch })))
    ) === false) {
      const target = getOrElse<string>(() => input.v)(fromNullable(finalState.vop))
      const scratchTarget = mutableScratchOf(input.scratch, target)
      const scratchTargetOption = fromNullable(scratchTarget)
      if (!isNone(scratchTargetOption)) {
        scratchTargetOption.value.thread = finalState.rightNext
        scratchTargetOption.value.mod += finalState.sim - finalState.sop
      }
    }

    if (!isNone(fromNullable(finalState.leftNext)) && (
      !isNone(fromNullable(finalState.vom)) && !isNone(fromNullable(leftmost({ id: finalState.vom, depth: 1, nodes: input.nodes, scratch: input.scratch })))
    ) === false) {
      const target = getOrElse<string>(() => input.v)(fromNullable(finalState.vom))
      const scratchTarget = mutableScratchOf(input.scratch, target)
      const scratchTargetOption = fromNullable(scratchTarget)
      if (!isNone(scratchTargetOption)) {
        scratchTargetOption.value.thread = finalState.leftNext
        scratchTargetOption.value.mod += finalState.sip - finalState.som
      }
      return input.v
    }

    return input.defaultAncestor
  }

  return input.defaultAncestor
}

// ---------------------------------------------------------------------------
// FIRST WALK  (post-order)
// ---------------------------------------------------------------------------

const firstWalk = (
  input: FirstWalkInput
): void => {
  // DEVIATION(6.2): Imperative updates to scratch are intentional for linear-time tree layout.
  // DEVIATION(1.6): FIRST_WALK traverses ids produced from the same indexed tree and scratch map.
  const children = childIds(input.v, input.nodes)
  const s = mutableScratchOf(input.scratch, input.v)!

  if (children.length === 0) {
    const leftSib = leftSibling(input.v, input.nodes)
    const leftSibOption = fromNullable(leftSib)
    s.prelim = isNone(leftSibOption) ? 0 : input.scratch.get(leftSibOption.value)!.prelim + 1
    return
  }

  void children.reduce((ancestor, childId) => {
    firstWalk({ v: childId, nodes: input.nodes, scratch: input.scratch })
    return apportion({ v: childId, defaultAncestor: ancestor, nodes: input.nodes, scratch: input.scratch })
  }, children[0]!)

  executeShifts(children, input.scratch)

  const midpoint = childMidpoint(children, input.scratch)

  const leftSib = leftSibling(input.v, input.nodes)
  const leftSibOption = fromNullable(leftSib)
  if (!isNone(leftSibOption)) {
    s.prelim = input.scratch.get(leftSibOption.value)!.prelim + 1
    s.mod = s.prelim - midpoint
  } else {
    s.prelim = midpoint
  }
}

// ---------------------------------------------------------------------------
// SECOND WALK  (pre-order)
// ---------------------------------------------------------------------------

const secondWalk = (
  input: SecondWalkInput
): void => {
  // DEVIATION(6.2): Mutable accumulator map avoids repeated allocations during pre-order traversal.
  // DEVIATION(1.6): SECOND_WALK only visits ids seeded during FIRST_WALK from validated indexed nodes.
  const s = input.scratch.get(input.v)!
  mutableMapOf(input.out).set(input.v, { x: s.prelim + input.modSum, y: input.nodes.get(input.v)!.depth })
  childIds(input.v, input.nodes).forEach((childId) => {
    secondWalk({ v: childId, modSum: input.modSum + s.mod, nodes: input.nodes, scratch: input.scratch, out: input.out })
  })
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Place an indexed tree on a tidy integer-like grid using Buchheim's linear-time algorithm.
 *
 * The result preserves tree depth on the y-axis and computes compact horizontal
 * spacing on the x-axis. Staff nodes are intentionally excluded here because they
 * are positioned later by the staff-placement stage.
 *
 * @param tree Indexed hierarchy containing only regular tree nodes.
 * @returns A map of node ids to stable layout coordinates in grid units.
 */
export const buchheim = (tree: IndexedTree): PlacedTree => {
  const { rootId, nodes } = tree

  const scratch = mutableMapFromEntries(
    [...nodes.entries()].map(([id, node]) => [id, makeScratch(id, node.children.length)] as const)
  )

  firstWalk({ v: rootId, nodes, scratch })

  const positions = mutableMapFromEntries<string, LayoutPoint>([])
  secondWalk({ v: rootId, modSum: 0, nodes, scratch, out: positions })

  return { rootId, positions }
}
