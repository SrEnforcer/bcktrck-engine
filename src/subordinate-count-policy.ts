import { absurd } from '@tsfpp/prelude'

/**
 * Kind-level projection used by subordinate-count policy checks.
 */
export type SubordinateKind = 'employee' | 'department' | 'vacancy'

/**
 * Policy toggles for direct subordinate counting.
 */
export type SubordinateCountPolicy = {
  /** Count vacancy children as direct reports. */
  readonly includeVacancies: boolean
  /** Count shadow/shared children as direct reports. */
  readonly includeShadows: boolean
}

/**
 * Candidate direct report entry evaluated against `SubordinateCountPolicy`.
 */
export type SubordinateCandidate = {
  readonly kind: SubordinateKind
  readonly isShadow: boolean
}

/**
 * Returns whether a candidate counts as a direct subordinate.
 *
 * Rules:
 * - Department wrappers never count.
 * - Vacancies count only when `includeVacancies` is enabled.
 * - Shadows count only when `includeShadows` is enabled.
 */
export const isCountedDirectSubordinate = (
  candidate: SubordinateCandidate,
  policy: SubordinateCountPolicy
): boolean => {
  if (!policy.includeShadows && candidate.isShadow) {
    return false
  }

  switch (candidate.kind) {
    case 'department':
      return false
    case 'vacancy':
      return policy.includeVacancies
    case 'employee':
      return true
    default:
      return absurd(candidate.kind)
  }
}

/**
 * Counts direct subordinates from candidate entries using a shared policy.
 */
export const countDirectSubordinates = (
  candidates: readonly SubordinateCandidate[],
  policy: SubordinateCountPolicy
): number => candidates.filter((candidate) => isCountedDirectSubordinate(candidate, policy)).length
