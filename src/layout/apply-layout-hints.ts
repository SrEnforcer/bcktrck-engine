import type { IndexedNode, IndexedTree, LayoutPoint, PlacedTree } from './types'

// DEVIATION(2.4): Layout hint placement logic remains in one module until lane and shift helpers are extracted.

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

// DEVIATION(1.9): Immutable Map construction is required to return new map values without mutating existing state.
// eslint-disable-next-line no-restricted-syntax
const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> => new Map(entries)

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
  if (node === undefined) {
    return [nodeId]
  }

  return [nodeId, ...node.children.flatMap((childId) => collectSubtreeIds(childId, tree))]
}

const shiftSubtree = (input: ShiftSubtreeInput): ReadonlyMap<string, LayoutPoint> =>
  collectSubtreeIds(input.nodeId, input.tree).reduce((nextPositions, id) => {
    const pos = nextPositions.get(id)
    if (pos === undefined) {
      return nextPositions
    }

    return mapWithEntry(nextPositions, id, { x: pos.x + input.dx, y: pos.y + input.dy })
  }, input.positions)

const laneAndSide = (input: LaneAndSideInput): { readonly lane: number; readonly side: -1 | 1 } => {
  const overriddenSide = input.sideOverride === 'left'
    ? -1
    : input.sideOverride === 'right'
      ? 1
      : undefined

  if (input.hint === 'hanging-left') {
    return { lane: input.index, side: overriddenSide ?? -1 }
  }

  return { lane: input.index, side: overriddenSide ?? 1 }
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
  const childNode = input.tree.nodes.get(input.childId)
  if (childPos === undefined) {
    return input.state
  }

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
      dx: targetX - childPos.x,
      dy: targetY - childPos.y,
      tree: input.tree,
      positions: input.state.positions
    }),
    leftLane: result.nextLeftLane,
    rightLane: result.nextRightLane
  }
}

const applyNodeHint = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyMap<string, LayoutPoint> => {
  const node = tree.nodes.get(nodeId)
  const hint = node?.layoutHint
  if (node === undefined || !isHangingHint(hint) || node.children.length === 0) {
    return positions
  }

  const parentPos = positions.get(nodeId)
  if (parentPos === undefined) {
    return positions
  }

  const initialState: ApplyNodeHintState = { positions, leftLane: 0, rightLane: 0 }

  return node.children
    .map((childId, index) => ({ childId, index }))
    .reduce((state, child) => applyNodeHintChild({
      childId: child.childId,
      index: child.index,
      hint,
      tree,
      parentPos,
      state
    }), initialState)
    .positions
}

const walkPreOrder = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyMap<string, LayoutPoint> => {
  const afterNodeHint = applyNodeHint(nodeId, tree, positions)
  const node = tree.nodes.get(nodeId)
  if (node === undefined) {
    return afterNodeHint
  }

  return node.children.reduce(
    (nextPositions, childId) => walkPreOrder(childId, tree, nextPositions),
    afterNodeHint
  )
}

const createSubtreeHangingIndex = (tree: IndexedTree): ReadonlyMap<string, boolean> => {
  const allNodeIds = [...collectSubtreeIds(tree.rootId, tree), ...tree.nodes.keys()]
    .reduce<ReadonlyArray<string>>(
      (ids, nodeId) => (ids.includes(nodeId) ? ids : [...ids, nodeId]),
      []
    )

  return [...allNodeIds]
    .reverse()
    .reduce((memo, nodeId) => {
      const node = tree.nodes.get(nodeId)
      if (node === undefined) {
        return mapWithEntry(memo, nodeId, false)
      }

      const selfHanging = isHangingHint(node.layoutHint)
      const descendantHanging = node.children.some((childId) => memo.get(childId) === true)
      return mapWithEntry(memo, nodeId, selfHanging || descendantHanging)
    }, mapFromEntries<string, boolean>([]))
}

const subtreeSpan = (
  nodeId: string,
  tree: IndexedTree,
  positions: ReadonlyMap<string, LayoutPoint>
): { readonly minX: number; readonly maxX: number } | undefined => {
  const xs = collectSubtreeIds(nodeId, tree)
    .map((id) => positions.get(id)?.x)
    .filter((x): x is number => x !== undefined)

  if (xs.length === 0) {
    return undefined
  }

  return { minX: Math.min(...xs), maxX: Math.max(...xs) }
}

const compactChildrenForNode = (input: CompactChildrenForNodeInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  if (node === undefined || node.children.length < 2) {
    return input.positions
  }

  // Re-pack sibling branches if any child subtree is hanging-driven.
  const hasHangingChild = node.children.some((childId) => input.subtreeHasHanging.get(childId) === true)
  if (!hasHangingChild) {
    return input.positions
  }

  const minSiblingGap = 1.2
  const firstChildId = node.children[0]
  const initialSpan = firstChildId !== undefined ? subtreeSpan(firstChildId, input.tree, input.positions) : undefined

  return node.children.slice(1).reduce(
    (state, childId) => {
      const span = subtreeSpan(childId, input.tree, state.positions)
      if (state.previousSpan === undefined || span === undefined) {
        return { previousSpan: span, positions: state.positions }
      }

      const targetMinX = state.previousSpan.maxX + minSiblingGap
      const dx = targetMinX - span.minX
      const shiftedPositions = Math.abs(dx) > 0.000001
        ? shiftSubtree({ nodeId: childId, dx, dy: 0, tree: input.tree, positions: state.positions })
        : state.positions

      return {
        previousSpan: subtreeSpan(childId, input.tree, shiftedPositions),
        positions: shiftedPositions
      }
    },
    { previousSpan: initialSpan, positions: input.positions }
  ).positions
}

const childXsForNode = (
  node: IndexedNode,
  positions: ReadonlyMap<string, LayoutPoint>
): ReadonlyArray<number> =>
  node.children
    .map((childId) => positions.get(childId)?.x)
    .filter((x): x is number => x !== undefined)

const medianX = (xs: ReadonlyArray<number>): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  const middleIndex = Math.floor((sorted.length - 1) / 2)
  return sorted.length % 2 === 1
    ? (sorted[middleIndex] ?? 0)
    : ((sorted[middleIndex] ?? 0) + (sorted[middleIndex + 1] ?? 0)) / 2
}

const centerChildGroupUnderParent = (input: CenterChildGroupUnderParentInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  const parentPos = input.positions.get(input.nodeId)
  if (node === undefined || parentPos === undefined || node.children.length === 0) {
    return input.positions
  }

  const hasHangingChild = node.children.some((childId) => input.subtreeHasHanging.get(childId) === true)
  if (!hasHangingChild) {
    return input.positions
  }

  const childXs = childXsForNode(node, input.positions)

  if (childXs.length === 0) {
    return input.positions
  }

  const dx = parentPos.x - medianX(childXs)
  if (Math.abs(dx) < 0.000001) {
    return input.positions
  }

  return node.children.reduce(
    (nextPositions, childId) => shiftSubtree({ nodeId: childId, dx, dy: 0, tree: input.tree, positions: nextPositions }),
    input.positions
  )
}

 
const compactBranches = (input: CompactBranchesInput): ReadonlyMap<string, LayoutPoint> => {
  const node = input.tree.nodes.get(input.nodeId)
  if (node === undefined) {
    return input.positions
  }

  // Post-order: compact children's subtrees first so their spans are already
  // minimal before we measure them at this level.
  const compactedChildren = node.children.reduce(
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
