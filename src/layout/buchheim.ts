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

/* eslint-disable @typescript-eslint/no-non-null-assertion */
 
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/* eslint-disable functional/immutable-data */
/* eslint-disable functional/no-let */
/* eslint-disable functional/no-loop-statements */
/* eslint-disable functional/prefer-readonly-type */


import type { IndexedTree, LayoutPoint, PlacedTree } from './types'

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

// DEVIATION(1.9): Immutable-style map construction is required in this algorithm module to avoid mutating input maps.
// eslint-disable-next-line no-restricted-syntax
const mutableMapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): Map<K, V> => new Map(entries)

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
        if (ws === undefined) {
          return acc
        }
        const nextChange = acc.change + ws.change
        const nextShift = acc.shift + ws.shift + nextChange
        return {
          shift: nextShift,
          change: nextChange,
          updates: [...acc.updates, { id: childId, delta: acc.shift }]
        }
      },
      { shift: 0, change: 0, updates: [] }
    )

  shiftPlan.updates.forEach(({ id, delta }) => {
    const ws = mutableScratchOf(scratch, id)
    if (ws === undefined) {
      return
    }
    ws.prelim += delta
    ws.mod += delta
  })
}

const childMidpoint = (children: readonly string[], scratch: ReadonlyMap<string, Scratch>): number => {
  const leftId = children[0]
  const rightId = children.length > 0 ? children[children.length - 1] : undefined
  const leftPrelim = leftId !== undefined ? (scratch.get(leftId)?.prelim ?? 0) : 0
  const rightPrelim = rightId !== undefined ? (scratch.get(rightId)?.prelim ?? 0) : 0
  return (leftPrelim + rightPrelim) / 2
}

// ---------------------------------------------------------------------------
// Contour traversal helpers
// ---------------------------------------------------------------------------

const childIds = (id: string, nodes: ReadonlyMap<string, NodeMeta>): readonly string[] =>
  nodes.get(id)?.children ?? []

const firstChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  return children.length > 0 ? (children[0] ?? null) : null
}

const lastChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  return children.length > 0 ? (children[children.length - 1] ?? null) : null
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

  while (current !== null && remainingDepth > 0) {
    const s = input.scratch.get(current)!
    const nextChild = childByDirection(current, input.direction, input.nodes)
    if (s.childCount > 0 && nextChild !== null) {
      current = nextChild
      remainingDepth -= 1
    } else if (s.thread !== null) {
      current = s.thread
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
  if (node.parentId === null || node.childIndex === 0) return null
  const sibling = nodes.get(node.parentId)!.children[node.childIndex - 1]
  return sibling ?? null
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
  const vom = input.state.vom !== null
    ? leftmost({ id: input.state.vom, depth: 1, nodes: input.nodes, scratch: input.scratch }) ?? input.state.vom
    : input.state.vom
  const vop = input.state.vop !== null
    ? rightmost({ id: input.state.vop, depth: 1, nodes: input.nodes, scratch: input.scratch }) ?? input.state.vop
    : input.state.vop

  if (vop !== null) {
    const scratchVop = mutableScratchOf(input.scratch, vop)
    if (scratchVop !== undefined) {
      scratchVop.ancestor = input.v
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
  return {
    vip,
    vop,
    vim,
    vom,
    sim: input.state.sim + input.scratch.get(vim)!.mod,
    sip: sipShifted + input.scratch.get(vip)!.mod,
    som: vom !== null ? input.state.som + input.scratch.get(vom)!.mod : input.state.som,
    sop: vop !== null ? sopShifted + input.scratch.get(vop)!.mod : sopShifted,
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
  if (w === null) return input.defaultAncestor

  const parentId = input.nodes.get(input.v)!.parentId
  const initialState: ApportionState = {
    vip: input.v,
    vop: input.v,
    vim: w,
    vom: parentId !== null ? firstChildId(parentId, input.nodes) : input.v,
    sip: input.scratch.get(input.v)!.mod,
    sop: input.scratch.get(input.v)!.mod,
    sim: input.scratch.get(w)!.mod,
    som: parentId !== null ? input.scratch.get(firstChildId(parentId, input.nodes) ?? input.v)!.mod : input.scratch.get(input.v)!.mod,
    rightNext: rightmost({ id: w, depth: 1, nodes: input.nodes, scratch: input.scratch }),
    leftNext: leftmost({ id: input.v, depth: 1, nodes: input.nodes, scratch: input.scratch })
  }

  let state = initialState
  while (state.rightNext !== null && state.leftNext !== null) {
    state = advanceApportionState({
      state,
      v: input.v,
      defaultAncestor: input.defaultAncestor,
      nodes: input.nodes,
      scratch: input.scratch
    })
  }

  const finalState = state

  if (finalState.rightNext !== null && (
    finalState.vop === null || rightmost({ id: finalState.vop, depth: 1, nodes: input.nodes, scratch: input.scratch }) === null
  )) {
    const target = finalState.vop ?? input.v
    const scratchTarget = mutableScratchOf(input.scratch, target)
    if (scratchTarget !== undefined) {
      scratchTarget.thread = finalState.rightNext
      scratchTarget.mod += finalState.sim - finalState.sop
    }
  }

  if (finalState.leftNext !== null && (
    finalState.vom === null || leftmost({ id: finalState.vom, depth: 1, nodes: input.nodes, scratch: input.scratch }) === null
  )) {
    const target = finalState.vom ?? input.v
    const scratchTarget = mutableScratchOf(input.scratch, target)
    if (scratchTarget !== undefined) {
      scratchTarget.thread = finalState.leftNext
      scratchTarget.mod += finalState.sip - finalState.som
    }
    return input.v
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
    s.prelim = leftSib !== null ? input.scratch.get(leftSib)!.prelim + 1 : 0
    return
  }

  void children.reduce((ancestor, childId) => {
    firstWalk({ v: childId, nodes: input.nodes, scratch: input.scratch })
    return apportion({ v: childId, defaultAncestor: ancestor, nodes: input.nodes, scratch: input.scratch })
  }, children[0]!)

  executeShifts(children, input.scratch)

  const midpoint = childMidpoint(children, input.scratch)

  const leftSib = leftSibling(input.v, input.nodes)
  if (leftSib !== null) {
    s.prelim = input.scratch.get(leftSib)!.prelim + 1
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
