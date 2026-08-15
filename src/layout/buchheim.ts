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
import { fromNullable, getOrElseOption, isNone, matchOption } from '@tsfpp/prelude'
import type { ApportionInput, ApportionState, FirstWalkInput, SecondWalkInput } from './buchheim-types'
import {
  advanceApportionState,
  childIds,
  childMidpoint,
  executeShifts,
  firstChildId,
  leftmost,
  leftSibling,
  makeScratch,
  mutableMapFromEntries,
  mutableMapOf,
  mutableScratchOf,
  rightmost,
} from './buchheim-helpers'

// DEVIATION(6.2): Uses imperative contour merge loop and mutable scratch map for algorithmic parity and performance.
// DEVIATION(1.6): Non-null assertions in APPORTION rely on loop invariants and indexed-tree construction guarantees.
const apportion = (
  input: ApportionInput
): string => {
  const w = leftSibling(input.v, input.nodes)
  const wOption = fromNullable(w)
  if (!isNone(wOption)) {
    const parentIdOption = input.nodes.get(input.v)!.parentId
    const firstParentChild = matchOption(() => null, (value: string) => firstChildId(value, input.nodes))(parentIdOption)
    const somNodeId = getOrElseOption<string>(() => input.v)(fromNullable(firstParentChild))
    const initialState: ApportionState = {
      vip: input.v,
      vop: input.v,
      vim: wOption.value,
      vom: matchOption(() => input.v, (value: string) => firstChildId(value, input.nodes))(parentIdOption),
      sip: input.scratch.get(input.v)!.mod,
      sop: input.scratch.get(input.v)!.mod,
      sim: input.scratch.get(wOption.value)!.mod,
      som: matchOption(() => input.scratch.get(input.v)!.mod, () => input.scratch.get(somNodeId)!.mod)(parentIdOption),
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
      const target = getOrElseOption<string>(() => input.v)(fromNullable(finalState.vop))
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
      const target = getOrElseOption<string>(() => input.v)(fromNullable(finalState.vom))
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
    s.prelim = matchOption(() => 0, (value: string) => input.scratch.get(value)!.prelim + 1)(leftSibOption)
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
