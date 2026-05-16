/**
 * Organizational tree types: semantic representation after resolution.
 *
 * `OrgNode` encodes hierarchy (children, staff relationships) and metadata (title, FTE, etc.).
 * `DottedEdge` and `ShadowNode` represent computed/inferred relationships.
 * `OrgTree` is the resolved tree ready for layout and rendering.
 */

import type { DeptId, NodeId } from './branded'
import type { AstLayoutHintKind } from './ast'
import type { IconPos } from '../icons/render'

export type HrMetadata = {
  readonly title: string
  readonly department?: DeptId
  readonly fte?: number
  readonly vacant?: boolean
  readonly photoUrl?: string
  readonly tags?: readonly string[]
  readonly icon?: string
  readonly iconPos?: IconPos
  readonly iconSize?: number
  readonly iconOpacity?: number
}

export type StaffNode = {
  readonly id: NodeId
  readonly side: 'left' | 'right'
  readonly label: string
}

export type OrgNode =
  | {
      readonly kind: 'employee'
      readonly id: NodeId
      readonly meta: HrMetadata
      readonly layoutHint?: AstLayoutHintKind
      readonly hangingSide?: 'left' | 'right'
      readonly children: readonly OrgNode[]
      readonly staff: readonly StaffNode[]
      readonly triangleEffect?: { readonly color: string }
    }
  | {
      readonly kind: 'department'
      readonly id: DeptId
      readonly name: string
      readonly head: NodeId
      readonly layoutHint?: AstLayoutHintKind
      readonly hangingSide?: 'left' | 'right'
      readonly members: readonly OrgNode[]
      readonly triangleEffect?: { readonly color: string }
    }
  | {
      readonly kind: 'vacancy'
      readonly id: NodeId
      readonly meta: HrMetadata
      readonly layoutHint?: AstLayoutHintKind
      readonly hangingSide?: 'left' | 'right'
      readonly children: readonly OrgNode[]
      readonly triangleEffect?: { readonly color: string }
    }

export type DottedEdge = {
  readonly from: NodeId
  readonly to: NodeId
  readonly label?: string
  /** Discriminates alternative accountability lines, e.g. 'dt' or 'ovj'. */
  readonly kind?: string
}

export type ShadowNode = {
  readonly id: NodeId
  readonly primary: NodeId
  readonly label?: string
  readonly type?: 'employee' | 'staff'
  readonly side?: 'left' | 'right'
  readonly host?: NodeId
  readonly hideConnector?: boolean
}

export type OrgTree = {
  readonly root: OrgNode
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
}
