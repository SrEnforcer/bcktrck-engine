import type { SubordinateCandidate } from '../../subordinate-count-policy'

/** Build subordinate candidate fixtures for policy tests. */
export const mkSubordinateCandidate = (
  input: {
    readonly kind: SubordinateCandidate['kind']
    readonly isShadow: boolean
  }
): SubordinateCandidate => ({
  kind: input.kind,
  isShadow: input.isShadow
})
