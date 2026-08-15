/**
 * @module layout/buchheim-helpers
 *
 * Internal low-level helpers for Buchheim scratch bookkeeping and contour traversal.
 *
 * @packageDocumentation
 */

import type { Option } from '@tsfpp/prelude'
import { fromNullable, getOrElseOption, intoMap, isNone, matchOption } from '@tsfpp/prelude'
import type {
  AdvanceApportionStateInput,
  ApportionState,
  ContourAtDepthInput,
  ContourDirection,
  ContourLookupInput,
  MoveSubtreeInput,
  MutableScratch,
  NodeMeta,
  ResolveAncestorInput,
  Scratch,
  ShiftPlanState,
} from './buchheim-types'

const sameParentId = (left: Option<string>, right: Option<string>): boolean =>
  isNone(left)
    ? isNone(right)
    : !isNone(right) && left.value === right.value

/**
 * Return a mutable scratch reference for an id when present.
 *
 * @param scratch Scratch-state map keyed by node id.
 * @param id Node id whose mutable scratch view is needed.
 * @returns Mutable scratch entry, or `undefined` when the id is absent.
 */
export const mutableScratchOf = (
  scratch: ReadonlyMap<string, Scratch>,
  id: string
): MutableScratch | undefined => scratch.get(id) as MutableScratch | undefined

/**
 * Expose a mutable `Map` view over a readonly map for algorithm-internal updates.
 *
 * @param map Readonly map to treat as mutable within Buchheim internals.
 * @returns A mutable map view over the same backing entries.
 */
export const mutableMapOf = <K, V>(map: ReadonlyMap<K, V>): Map<K, V> => map as Map<K, V>

/**
 * Build a mutable map from readonly entries for scratch/output accumulation.
 *
 * @param entries Readonly key/value entries.
 * @returns Mutable map initialized from `entries`.
 */
export const mutableMapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): Map<K, V> =>
  intoMap(entries) as unknown as Map<K, V>

/**
 * Construct the initial scratch state for one indexed node.
 *
 * @param id Node id that seeds the initial ancestor pointer.
 * @param childCount Number of regular children for contour traversal decisions.
 * @returns Zero-initialized scratch state for Buchheim walks.
 */
export const makeScratch = (id: string, childCount: number): Scratch => ({
  prelim: 0,
  mod: 0,
  ancestor: id,
  change: 0,
  shift: 0,
  thread: null,
  childCount,
})

const reverseReadonly = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
  values.reduce<ReadonlyArray<T>>((acc, value) => [value, ...acc], [])

/**
 * Apply deferred sibling shifts from right to left across one children list.
 *
 * @param children Ordered child ids for one parent.
 * @param scratch Scratch-state map mutated in place for linear-time bookkeeping.
 * @returns No value; updates are applied directly to scratch entries.
 */
export const executeShifts = (
  children: readonly string[],
  scratch: ReadonlyMap<string, Scratch>
): void => {
  const shiftPlan = reverseReadonly(children).reduce<ShiftPlanState>(
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
  return matchOption(() => 0, (value: Scratch) => value.prelim)(nodeScratchOption)
}

/**
 * Compute the midpoint between the first and last child preliminary positions.
 *
 * @param children Ordered child ids for one node.
 * @param scratch Scratch-state map with preliminary coordinates.
 * @returns Midpoint used by Buchheim to center parent nodes over children.
 */
export const childMidpoint = (children: readonly string[], scratch: ReadonlyMap<string, Scratch>): number => {
  const leftId = children[0]
  const rightId = children.length > 0 ? children[children.length - 1] : undefined
  const leftPrelim = scratchPrelimOrZero(leftId, scratch)
  const rightPrelim = scratchPrelimOrZero(rightId, scratch)
  return (leftPrelim + rightPrelim) / 2
}

/**
 * Read the regular child-id list for a node from indexed metadata.
 *
 * @param id Node id.
 * @param nodes Indexed-node metadata map.
 * @returns Ordered child ids, or an empty array when missing.
 */
export const childIds = (id: string, nodes: ReadonlyMap<string, NodeMeta>): readonly string[] =>
  getOrElseOption<readonly string[]>(() => [])(fromNullable(nodes.get(id)?.children))

/**
 * Prefer a contour candidate id and fall back to the current id when absent.
 *
 * @param candidate Next contour id if available.
 * @param fallback Current id to preserve traversal continuity.
 * @returns `candidate` when present, otherwise `fallback`.
 */
export const nextContourOrSelf = (candidate: string | null, fallback: string): string =>
  getOrElseOption<string>(() => fallback)(fromNullable(candidate))

/**
 * Resolve the first child id for a node.
 *
 * @param id Node id.
 * @param nodes Indexed-node metadata map.
 * @returns First child id, or `null` when the node has no children.
 */
export const firstChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  if (children.length === 0) {
    return null
  }
  return getOrElseOption<string | null>(() => null)(fromNullable(children[0]))
}

const lastChildId = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const children = childIds(id, nodes)
  if (children.length === 0) {
    return null
  }
  return getOrElseOption<string | null>(() => null)(fromNullable(children[children.length - 1]))
}

const childByDirection = (
  id: string,
  direction: ContourDirection,
  nodes: ReadonlyMap<string, NodeMeta>
): string | null => (direction === 'left' ? firstChildId(id, nodes) : lastChildId(id, nodes))

/**
 * Follow one contour (real children first, then threads) to a target depth.
 *
 * @param input Contour traversal input with start id, depth, direction, and maps.
 * @returns Node id at the requested contour depth, or `null` if traversal stops early.
 */
export const contourAtDepth = (input: ContourAtDepthInput): string | null => {
  let current = input.id
  let remainingDepth = input.depth

  while (remainingDepth > 0) {
    const currentOption = fromNullable(current)
    if (isNone(currentOption)) {
      return null
    }

    const currentId = currentOption.value
    const scratchState = input.scratch.get(currentId)!
    const nextChild = childByDirection(currentId, input.direction, input.nodes)
    const nextChildOption = fromNullable(nextChild)
    const threadOption = fromNullable(scratchState.thread)

    if (scratchState.childCount > 0 && !isNone(nextChildOption)) {
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
 * Resolve the leftmost contour node at a relative depth.
 *
 * @param input Contour lookup input.
 * @returns Left contour id at depth, or `null` when unavailable.
 */
export const leftmost = (input: ContourLookupInput): string | null =>
  contourAtDepth({
    id: input.id,
    depth: input.depth,
    direction: 'left',
    nodes: input.nodes,
    scratch: input.scratch
  })

/**
 * Resolve the rightmost contour node at a relative depth.
 *
 * @param input Contour lookup input.
 * @returns Right contour id at depth, or `null` when unavailable.
 */
export const rightmost = (input: ContourLookupInput): string | null =>
  contourAtDepth({
    id: input.id,
    depth: input.depth,
    direction: 'right',
    nodes: input.nodes,
    scratch: input.scratch
  })

/**
 * Find the immediate left sibling for a node id within its parent children array.
 *
 * @param id Node id to inspect.
 * @param nodes Indexed-node metadata map.
 * @returns Left sibling id, or `null` when none exists.
 */
export const leftSibling = (id: string, nodes: ReadonlyMap<string, NodeMeta>): string | null => {
  const node = nodes.get(id)!
  const parentIdOption = node.parentId
  if (!isNone(parentIdOption) && node.childIndex > 0) {
    const sibling = nodes.get(parentIdOption.value)!.children[node.childIndex - 1]
    return getOrElseOption<string | null>(() => null)(fromNullable(sibling))
  }
  return null
}

const resolveAncestor = (input: ResolveAncestorInput): string => {
  const vimAncestorId = input.scratch.get(input.vim)!.ancestor
  const vimAncestorParent = getOrElseOption<Option<string>>(() => input.nodes.get(input.vim)!.parentId)(fromNullable(input.nodes.get(vimAncestorId)?.parentId))
  const vParent = input.nodes.get(input.v)!.parentId
  return sameParentId(vimAncestorParent, vParent) ? vimAncestorId : input.defaultAncestorId
}

const moveSubtree = (input: MoveSubtreeInput): void => {
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

/**
 * Advance apportion state by one contour step and apply required subtree shifts.
 *
 * @param input Current apportion state plus node/scratch context.
 * @returns Next apportion state for the subsequent loop iteration.
 */
export const advanceApportionState = (input: AdvanceApportionStateInput): ApportionState => {
  const vim = input.state.rightNext!
  const vip = input.state.leftNext!
  const vomOption = fromNullable(input.state.vom)
  const vom = !isNone(vomOption)
    ? nextContourOrSelf(leftmost({ id: vomOption.value, depth: 1, nodes: input.nodes, scratch: input.scratch }), vomOption.value)
    : input.state.vom
  const vopOption = fromNullable(input.state.vop)
  const vop = !isNone(vopOption)
    ? nextContourOrSelf(rightmost({ id: vopOption.value, depth: 1, nodes: input.nodes, scratch: input.scratch }), vopOption.value)
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
    som: matchOption(() => input.state.som, (value: string) => input.state.som + input.scratch.get(value)!.mod)(resolvedVomOption),
    sop: matchOption(() => sopShifted, (value: string) => sopShifted + input.scratch.get(value)!.mod)(resolvedVopOption),
    rightNext: rightmost({ id: vim, depth: 1, nodes: input.nodes, scratch: input.scratch }),
    leftNext: leftmost({ id: vip, depth: 1, nodes: input.nodes, scratch: input.scratch })
  }
}