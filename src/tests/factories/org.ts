import { asDeptId, asNodeId } from '../../types/branded'
import type { OrgNode } from '../../types/org-tree'

export type DepartmentFactoryInput = {
  readonly id: string
  readonly name: string
  readonly head: string
  readonly members: readonly OrgNode[]
}

/** Build a minimal employee node fixture for org-tree tests. */
export const mkOrgEmployee = (input: {
  readonly id: string
  readonly title: string
  readonly children: readonly OrgNode[]
}): OrgNode => ({
  kind: 'employee',
  id: asNodeId(input.id),
  meta: { title: input.title },
  children: input.children,
  staff: []
})

/** Build a minimal department node fixture for org-tree tests. */
export const mkOrgDepartment = (input: DepartmentFactoryInput): OrgNode => ({
  kind: 'department',
  id: asDeptId(input.id),
  name: input.name,
  head: asNodeId(input.head),
  members: input.members
})
