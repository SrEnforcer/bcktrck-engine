/**
 * @module layout/apply-layout-hints
 *
 * Applies hanging-layout hints to an indexed layout by repositioning hinted child
 * branches and then compacting/re-centering affected sibling groups.
 *
 * @packageDocumentation
 */

import { fromNullable, getOrElse, intoMap, isNone } from '@tsfpp/prelude'
import type { IndexedNode, IndexedTree, LayoutPoint, PlacedTree } from './types'

// DEVIATION(2.4): Layout hint placement logic remains in one module until lane and shift helpers are extracted.
// NOTE(unknown, 2026-05-18): Hanging-branch compaction intentionally remains local until lane and subtree-span helpers are split.

type LaneAndSideResult = {
  readonly lane: number
  readonly side: -1 | 1
  readonly nextLeftLane: number
  readonly nextRightLane: number
}

type HangingHint = 'hanging' | 'hanging-left' | 'hanging-right' | 'hanging-both'

type ShiftSubtreeInput = {
  readonly nodeId: string
  readonly dx: number
  readonly dy: number
  readonly tree: IndexedTree
  readonly positions: ReadonlyMap<string, LayoutPoint>
}

type LaneAndSideInput = {
  readonly hint: HangingHint
  readonly index: number
  readonly sideOverride: IndexedNode['hangingSide'] | undefined
}

type ResolveBothSideHintInput = {
  readonly index: number
  readonly sideOverride: IndexedNode['hangingSide'] | undefined
  readonly leftLane: number
  readonly rightLane: number
}

type ResolveOneSideHintInput = {
  readonly hint: HangingHint
  readonly index: number
  readonly sideOverride: IndexedNode['hangingSide'] | undefined
  readonly leftLane: number
  readonly rightLane: number
}

type CompactChildrenForNodeInput = {
  readonly nodeId: string
  readonly tree: IndexedTree
  readonly positions: ReadonlyMap<string, LayoutPoint>
  readonly subtreeHasHanging: ReadonlyMap<string, boolean>
}

type CenterChildGroupUnderParentInput = {
  readonly nodeId: string
  readonly tree: IndexedTree
  readonly positions: ReadonlyMap<string, LayoutPoint>
  readonly subtreeHasHanging: ReadonlyMap<string, boolean>
}

type CompactBranchesInput = {
  readonly nodeId: string
  readonly tree: IndexedTree
  readonly positions: ReadonlyMap<string, LayoutPoint>
  readonly subtreeHasHanging: ReadonlyMap<string, boolean>
}

type ApplyNodeHintState = {
  readonly positions: ReadonlyMap<string, LayoutPoint>
  readonly leftLane: number
  readonly rightLane: number
}

type ApplyNodeHintChildInput = {
  readonly childId: string
  readonly index: number
  readonly hint: HangingHint
  readonly tree: IndexedTree
  readonly parentPos: LayoutPoint
  readonly state: ApplyNodeHintState
}

const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> => intoMap(entries)

const mapClone = <K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
  mapFromEntries(Array.from(source.entries()).map(([key, value]) => [key, value] as const))

const mapWithEntry = <K, V>(source: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> =>
  mapFromEntries([
    ...Array.from(source.entries()).map(([entryKey, entryValue]) => [entryKey, entryValue] as const),
    [key, value] as const
  ])

const isHangingHint = (hint: IndexedNode['layoutHint']): hint is HangingHint =>
  hint === 'hanging' || hint === 'hanging-left' || hint === 'hanging-right' || hint === 'hanging-both'

const collectSubtreeIds = (nodeId: string, tree: IndexedTree): readonly string[] => {
  const node = tree.nodes.get(nodeId)
  const nodeOption = fromNullable(node)
  if (!isNone(nodeOption)) {
    return [nodeId, ...nodeOption.value.children.flatMap((childId) => collectSubtreeIds(childId, tree))]
  }
  return [nodeId]
}

const shiftSubtree = (input: ShiftSubtreeInput): ReadonlyMap<string, LayoutPoint> =>
  collectSubtreeIds(input.nodeId, input.tree).reduce((nextPositions, id) => {
    const pos = nextPositions.get(id)
    const posOption = fromNullable(pos)
    if (!isNone(posOption)) {
      return mapWithEntry(nextPositions, id, { x: posOption.value.x + input.dx, y: posOption.value.y + input.dy })
    }
    return nextPositions
  }, input.positions)

const laneAndSide = (input: LaneAndSideInput): { readonly lane: number; readonly side: -1 | 1 } => {
  const overriddenSide: -1 | 1 | undefined = input.sideOverride === 'left'
    ? -1
    : input.sideOverride === 'right'
      ? 1
      : undefined
  const overriddenSideOption = fromNullable(overriddenSide)

  if (input.hint === 'hanging-left') {
    return { lane: input.index, side: getOrElse<-1 | 1>(() => -1)(overriddenSideOption) }
  }

  return { lane: input.index, side: getOrElse<-1 | 1>(() => 1)(overriddenSideOption) }
}

const resolveBothSideHint = (input: ResolveBothSideHintInput): LaneAndSideResult => {
  const defaultSide: -1 | 1 = input.index % 2 === 0 ? 1 : -1
  const resolvedSide: -1 | 1 = input.sideOverride === 'left'
    ? -1
    : input.sideOverride === 'right'
      ? 1
      : defaultSide
  const lane = resolvedSide === -1 ? input.leftLane : input.rightLane

  return {
    lane,
    side: resolvedSide,
    nextLeftLane: resolvedSide === -1 ? input.leftLane + 1 : input.leftLane,
    nextRightLane: resolvedSide === 1 ? input.rightLane + 1 : input.rightLane
  }
}

const resolveOneSideHint = (input: ResolveOneSideHintInput): LaneAndSideResult => {
  const resolved = laneAndSide({ hint: input.hint, index: input.index, sideOverride: input.sideOverride })
  return {
    lane: resolved.lane,
    side: resolved.side,
    nextLeftLane: input.leftLane,
    nextRightLane: input.rightLane
  }
}

const applyNodeHintChild = (input: ApplyNodeHintChildInput): ApplyNodeHintState => {
  const childPos = input.state.positions.get(input.childId)
  const childPosOption = fromNullable(childPos)
  const childNode = input.tree.nodes.get(input.childId)
  if (!isNone(childPosOption)) {
    const sideOverride = childNode?.hangingSide
    const result = input.hint === 'hanging-both'
      ? resolveBothSideHint({
        index: input.index,
        sideOverride,
        leftLane: input.state.leftLane,
        rightLane: input.state.rightLane
      })
      : resolveOneSideHint({
        hint: input.hint,
        index: input.index,
        sideOverride,
        leftLane: input.state.leftLane,
        rightLane: input.state.rightLane
      })

    const targetX = input.parentPos.x + result.side
    const targetY = input.parentPos.y + result.lane + 1
    return {
      positions: shiftSubtree({
        nodeId: input.childId,
        dx: targetX - childPosOption.value.x,
        dy: targetY - childPosOption.value.y,
        tree: input.tree,
        positions: input.state.positions
      }),
      leftLane: result.nextLeftLane,
      rightLane: result.nextRightLane
    }
  }
  return input.state
}

const applyNodeHint = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyMap<string, LayoutPoint> => {
  const node = tree.nodes.get(nodeId)
  const nodeOption = fromNullable(node)
  if (!isNone(nodeOption)) {
    const hint = nodeOption.value.layoutHint
    if (!isHangingHint(hint) || nodeOption.value.children.length === 0) {
      return positions
    }

    const parentPos = positions.get(nodeId)
    const parentPosOption = fromNullable(parentPos)
    if (!isNone(parentPosOption)) {
      const initialState: ApplyNodeHintState = { positions, leftLane: 0, rightLane: 0 }

      return nodeOption.value.children
        .map((childId, index) => ({ childId, index }))
        .reduce((state, child) => applyNodeHintChild({
          childId: child.childId,
          index: child.index,
          hint,
          tree,
          parentPos: parentPosOption.value,
          state
        }), initialState)
        .positions
    }
  }
  return positions
}

const walkPreOrder = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyMap<string, LayoutPoint> => {
  const afterNodeHint = applyNodeHint(nodeId, tree, positions)
  const node = tree.nodes.get(nodeId)
  const nodeOption = fromNullable(node)
  if (!isNone(nodeOption)) {
    return nodeOption.value.children.reduce(
      (nextPositions, childId) => walkPreOrder(childId, tree, nextPositions),
      afterNodeHint
    )
  }
  return afterNodeHint
}

const createSubtreeHangingIndex = (tree: IndexedTree): ReadonlyMap<string, boolean> => {
  const allNodeIds = [...collectSubtreeIds(tree.rootId, tree), ...tree.nodes.keys()]
    .reduce<ReadonlyArray<string>>(
      (ids, nodeId) => (ids.includes(nodeId) ? ids : [...ids, nodeId]),
      []
    )

  const reverseReadonly = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
    values.reduce<ReadonlyArray<T>>((acc, value) => [value, ...acc], [])

  return reverseReadonly(allNodeIds)
    .reduce((memo, nodeId) => {
      const node = tree.nodes.get(nodeId)
      const nodeOption = fromNullable(node)
      if (!isNone(nodeOption)) {
        const selfHanging = isHangingHint(nodeOption.value.layoutHint)
        const descendantHanging = nodeOption.value.children.some((childId) => memo.get(childId) === true)
        return mapWithEntry(memo, nodeId, selfHanging || descendantHanging)
      }
      return mapWithEntry(memo, nodeId, false)
    }, mapFromEntries<string, boolean>([]))
}

const subtreeSpan = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): { readonly minX: number; readonly maxX: number } | undefined => {
  const xs = collectSubtreeIds(nodeId, tree)
    .flatMap((id) => {
      const xOption = fromNullable(positions.get(id)?.x)
      return isNone(xOption) ? [] : [xOption.value]
    })

  if (xs.length === 0) {
    return undefined
  }

  return { minX: Math.min(...xs), maxX: Math.max(...xs) }
}

const compactChildrenForNode = (input: CompactChildrenForNodeInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  const nodeOption = fromNullable(node)
  if (!isNone(nodeOption) && nodeOption.value.children.length >= 2) {
    // Re-pack sibling branches if any child subtree is hanging-driven.
    const hasHangingChild = nodeOption.value.children.some((childId) => input.subtreeHasHanging.get(childId) === true)
    if (!hasHangingChild) {
      return input.positions
    }

    const minSiblingGap = 1.2
    const firstChildId = nodeOption.value.children[0]
    const firstChildIdOption = fromNullable(firstChildId)
    const initialSpan = isNone(firstChildIdOption)
      ? undefined
      : subtreeSpan(firstChildIdOption.value, input.tree, input.positions)

    return nodeOption.value.children.slice(1).reduce(
      (state, childId) => {
        const span = subtreeSpan(childId, input.tree, state.positions)
        const previousSpanOption = fromNullable(state.previousSpan)
        const spanOption = fromNullable(span)
        if (!isNone(previousSpanOption) && !isNone(spanOption)) {
          const targetMinX = previousSpanOption.value.maxX + minSiblingGap
          const dx = targetMinX - spanOption.value.minX
          const shiftedPositions = Math.abs(dx) > 0.000001
            ? shiftSubtree({ nodeId: childId, dx, dy: 0, tree: input.tree, positions: state.positions })
            : state.positions

          return {
            previousSpan: subtreeSpan(childId, input.tree, shiftedPositions),
            positions: shiftedPositions
          }
        }
        return { previousSpan: span, positions: state.positions }
      },
      { previousSpan: initialSpan, positions: input.positions }
    ).positions
  }
  return input.positions
}

const childXsForNode = (
  node: IndexedNode,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyArray<number> =>
  node.children
    .flatMap((childId) => {
      const xOption = fromNullable(positions.get(childId)?.x)
      return isNone(xOption) ? [] : [xOption.value]
    })

const insertAscending = (sorted: ReadonlyArray<number>, value: number): ReadonlyArray<number> => {
  const insertionIndex = sorted.findIndex((entry) => entry > value)
  return insertionIndex === -1
    ? [...sorted, value]
    : [...sorted.slice(0, insertionIndex), value, ...sorted.slice(insertionIndex)]
}

const sortAscending = (values: ReadonlyArray<number>): ReadonlyArray<number> =>
  values.reduce<ReadonlyArray<number>>((sorted, value) => insertAscending(sorted, value), [])

const medianX = (xs: ReadonlyArray<number>): number => {
  const sorted = sortAscending(xs)
  const middleIndex = Math.floor((sorted.length - 1) / 2)
  const middle = sorted[middleIndex]
  const upperMiddle = sorted[middleIndex + 1]
  const middleOption = fromNullable(middle)
  const upperMiddleOption = fromNullable(upperMiddle)
  return sorted.length % 2 === 1
    ? getOrElse<number>(() => 0)(middleOption)
    : (getOrElse<number>(() => 0)(middleOption) + getOrElse<number>(() => 0)(upperMiddleOption)) / 2
}

const centerChildGroupUnderParent = (input: CenterChildGroupUnderParentInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  const parentPos = input.positions.get(input.nodeId)
  const nodeOption = fromNullable(node)
  const parentPosOption = fromNullable(parentPos)
  if (!isNone(nodeOption) && !isNone(parentPosOption) && nodeOption.value.children.length > 0) {
    const hasHangingChild = nodeOption.value.children.some((childId) => input.subtreeHasHanging.get(childId) === true)
    if (!hasHangingChild) {
      return input.positions
    }

    const childXs = childXsForNode(nodeOption.value, input.positions)

    if (childXs.length === 0) {
      return input.positions
    }

    const dx = parentPosOption.value.x - medianX(childXs)
    if (Math.abs(dx) < 0.000001) {
      return input.positions
    }

    return nodeOption.value.children.reduce(
      (nextPositions, childId) => shiftSubtree({ nodeId: childId, dx, dy: 0, tree: input.tree, positions: nextPositions }),
      input.positions
    )
  }
  return input.positions
}

const compactBranches = (input: CompactBranchesInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  const nodeOption = fromNullable(node)
  if (!isNone(nodeOption)) {
    // Post-order: compact children's subtrees first so their spans are already
    // minimal before we measure them at this level.
    const compactedChildren = nodeOption.value.children.reduce(
      (nextPositions, childId) => compactBranches({
        nodeId: childId,
        tree: input.tree,
        positions: nextPositions,
        subtreeHasHanging: input.subtreeHasHanging
      }),
      input.positions
    )

    const compactedSiblings = compactChildrenForNode({
      nodeId: input.nodeId,
      tree: input.tree,
      positions: compactedChildren,
      subtreeHasHanging: input.subtreeHasHanging
    })
    return centerChildGroupUnderParent({
      nodeId: input.nodeId,
      tree: input.tree,
      positions: compactedSiblings,
      subtreeHasHanging: input.subtreeHasHanging
    })
  }
  return input.positions
}

/**
 * Apply hanging-layout hints to a Buchheim-placed tree.
 *
 * Repositions children declared with a `hanging` layout hint to appear to the
 * side of their parent rather than directly below it, then compacts sibling
 * branches and re-centers child groups under their parent.
 *
 * @param tree Indexed tree whose `layoutHint` / `hangingSide` fields drive repositioning.
 * @param placed Buchheim placement output (grid coordinates).
 * @returns A new `PlacedTree` with adjusted node positions.
 */
export const applyLayoutHints = (tree: IndexedTree, placed: PlacedTree): PlacedTree => {
  const subtreeHasHanging = createSubtreeHangingIndex(tree)
  const hintedPositions = walkPreOrder(tree.rootId, tree, mapClone(placed.positions))
  const positions = compactBranches({ nodeId: tree.rootId, tree, positions: hintedPositions, subtreeHasHanging })
  return { rootId: placed.rootId, positions }
}
