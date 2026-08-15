/**
 * @module layout/staff-placement
 *
 * Compute sidebar staff node positions relative to already placed tree nodes.
 *
 * Staff placement is deterministic and based on side, index, and configured
 * offsets so render output is stable for identical layout inputs.
 *
 * @packageDocumentation
 */

import { fromNullable, getOrElseOption, isNone, pipe } from '@tsfpp/prelude'
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

type StaffAnchorInput = {
  readonly node: IndexedTree['nodes'] extends ReadonlyMap<string, infer N> ? N : never
  readonly placed: PlacedTree
  readonly parentY: number
  readonly config: PlaceStaffConfig
}

const toStaffPosition = (input: ToStaffPositionInput): StaffPosition => {
  const distanceFromParent = input.config.baseOffset + input.index * input.config.stepOffset
  const direction = input.side === 'left' ? -1 : 1
  const parentCenterX = input.parentX + input.config.nodeSize / 2
  return {
    id: input.staffId,
    label: pipe(
      fromNullable(input.tree.staffLabels?.get(input.staffId)),
      getOrElseOption(() => input.staffId)
    ),
    x: parentCenterX + direction * distanceFromParent - input.config.staffSize / 2,
    y: input.parentY - input.config.staffSize / 2,
    side: input.side
  }
}

const getStaffAnchorY = (input: StaffAnchorInput): number => {
  const parentBottomY = input.parentY + input.config.nodeSize
  const childTopYs = input.node.children
    .map((childId) => input.placed.positions.get(childId)?.y)
    .filter((childY): childY is number => childY !== undefined)
  const nearestChildTopY = childTopYs.reduce<number | undefined>(
    (currentMin, childY) => currentMin === undefined || childY < currentMin ? childY : currentMin,
    undefined
  )

  return nearestChildTopY !== undefined && nearestChildTopY > parentBottomY
    ? (parentBottomY + nearestChildTopY) / 2
    : input.parentY + input.config.nodeSize / 2
}

const buildStaffForNode = (input: BuildStaffForNodeInput): readonly StaffPosition[] => {
  const parentPosOption = fromNullable(input.placed.positions.get(input.node.id))
  if (isNone(parentPosOption)) {
    return []
  }
  const parentPos = parentPosOption.value
  const anchorY = getStaffAnchorY({
    node: input.node,
    placed: input.placed,
    parentY: parentPos.y,
    config: input.config
  })

  const reverseReadonly = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
    values.reduce<ReadonlyArray<T>>((acc, value) => [value, ...acc], [])

  const left = reverseReadonly(input.node.staffLeft)
    .map((staffId, index) => toStaffPosition({
      parentX: parentPos.x,
      parentY: anchorY,
      side: 'left',
      staffId,
      index,
      tree: input.tree,
      config: input.config
    }))
  const right = input.node.staffRight
    .map((staffId, index) => toStaffPosition({
      parentX: parentPos.x,
      parentY: anchorY,
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
 * When a visible gap exists between the parent box and its nearest regular child,
 * staff is vertically centered in that gap so the connector can branch from the
 * main trunk instead of reading as a peer-level node.
 */
export const placeStaff = (
  tree: IndexedTree,
  placed: PlacedTree,
  cfg: { readonly staffSize?: number; readonly nodeSize?: number } = {}
): PlacedStaff => {
  const staffSize = pipe(fromNullable(cfg.staffSize), getOrElseOption(() => 0.6))
  const nodeSize = pipe(fromNullable(cfg.nodeSize), getOrElseOption(() => 1))
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
