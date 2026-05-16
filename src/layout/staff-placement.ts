import type { IndexedTree, PlacedTree, PlacedStaff, StaffPosition } from './types'

type PlaceStaffConfig = {
  readonly staffSize: number
  readonly nodeSize: number
  readonly baseOffset: number
  readonly stepOffset: number
}

type ToStaffPositionInput = {
  readonly parentX: number
  readonly parentY: number
  readonly side: 'left' | 'right'
  readonly staffId: string
  readonly index: number
  readonly tree: IndexedTree
  readonly config: PlaceStaffConfig
}

type BuildStaffForNodeInput = {
  readonly node: IndexedTree['nodes'] extends ReadonlyMap<string, infer N> ? N : never
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly config: PlaceStaffConfig
}

const toStaffPosition = (input: ToStaffPositionInput): StaffPosition => {
  const distanceFromParent = input.config.baseOffset + input.index * input.config.stepOffset
  const direction = input.side === 'left' ? -1 : 1
  const parentCenterX = input.parentX + input.config.nodeSize / 2
  const parentCenterY = input.parentY + input.config.nodeSize / 2
  return {
    id: input.staffId,
    label: input.tree.staffLabels?.get(input.staffId) ?? input.staffId,
    x: parentCenterX + direction * distanceFromParent - input.config.staffSize / 2,
    y: parentCenterY - input.config.staffSize / 2,
    side: input.side
  }
}

const buildStaffForNode = (input: BuildStaffForNodeInput): readonly StaffPosition[] => {
  const parentPos = input.placed.positions.get(input.node.id)
  if (parentPos === undefined) {
    return []
  }

  const left = [...input.node.staffLeft]
    .reverse()
    .map((staffId, index) => toStaffPosition({
      parentX: parentPos.x,
      parentY: parentPos.y,
      side: 'left',
      staffId,
      index,
      tree: input.tree,
      config: input.config
    }))
  const right = input.node.staffRight
    .map((staffId, index) => toStaffPosition({
      parentX: parentPos.x,
      parentY: parentPos.y,
      side: 'right',
      staffId,
      index,
      tree: input.tree,
      config: input.config
    }))

  return [...left, ...right]
}

/**
 * Places staff (advisor/assistant) nodes horizontally offset from their parents.
 *
 * Staff on each side are positioned at equal spacing (1 unit apart), with the
 * closest staff to the parent at baseOffset units on their respective side.
 * baseOffset = staffSize + 0.05 (tiny gap so staff appears immediately adjacent).
 */
export const placeStaff = (
  tree: IndexedTree,
  placed: PlacedTree,
  cfg: { readonly staffSize?: number; readonly nodeSize?: number } = {}
): PlacedStaff => {
  const staffSize = cfg.staffSize ?? 0.6
  const nodeSize = cfg.nodeSize ?? 1
  const config: PlaceStaffConfig = {
    staffSize,
    nodeSize,
    // Keep staff boxes outside the parent box: half parent + half staff + a tiny gap.
    baseOffset: (nodeSize + staffSize) / 2 + 0.05,
    // Ensure same-side staff do not overlap each other for large staff sizes.
    stepOffset: Math.max(1, staffSize + 0.05)
  }

  const staff = [...tree.nodes.values()].flatMap((node) => buildStaffForNode({
    node,
    tree,
    placed,
    config
  }))

  return { staff }
}
