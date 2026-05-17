import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { countDirectSubordinates, isCountedDirectSubordinate, type SubordinateCandidate, type SubordinateCountPolicy } from './subordinate-count-policy'
import { mkSubordinateCandidate } from './tests/factories/subordinate'

describe('isCountedDirectSubordinate when the candidate is a department', () => {
  it('returns false', () => {
    const candidate = mkSubordinateCandidate({ kind: 'department', isShadow: false })
    const policy: SubordinateCountPolicy = { includeShadows: true, includeVacancies: true }

    const result = isCountedDirectSubordinate(candidate, policy)

    expect(result).toBe(false)
  })
})

describe('isCountedDirectSubordinate when the candidate is a vacancy and vacancies are disabled', () => {
  it('returns false', () => {
    const candidate = mkSubordinateCandidate({ kind: 'vacancy', isShadow: false })
    const policy: SubordinateCountPolicy = { includeShadows: true, includeVacancies: false }

    const result = isCountedDirectSubordinate(candidate, policy)

    expect(result).toBe(false)
  })
})

describe('isCountedDirectSubordinate when the candidate is a vacancy and vacancies are enabled', () => {
  it('returns true', () => {
    const candidate = mkSubordinateCandidate({ kind: 'vacancy', isShadow: false })
    const policy: SubordinateCountPolicy = { includeShadows: true, includeVacancies: true }

    const result = isCountedDirectSubordinate(candidate, policy)

    expect(result).toBe(true)
  })
})

describe('isCountedDirectSubordinate when shadows are disabled and the candidate is shadowed', () => {
  it('returns false', () => {
    const candidate = mkSubordinateCandidate({ kind: 'employee', isShadow: true })
    const policy: SubordinateCountPolicy = { includeShadows: false, includeVacancies: true }

    const result = isCountedDirectSubordinate(candidate, policy)

    expect(result).toBe(false)
  })
})

describe('isCountedDirectSubordinate when the candidate is an employee and shadows are enabled', () => {
  it('returns true', () => {
    const candidate = mkSubordinateCandidate({ kind: 'employee', isShadow: false })
    const policy: SubordinateCountPolicy = { includeShadows: true, includeVacancies: false }

    const result = isCountedDirectSubordinate(candidate, policy)

    expect(result).toBe(true)
  })
})

describe('countDirectSubordinates', () => {
  describe('when candidates contain mixed kinds and shadow flags', () => {
    it('counts only entries allowed by the policy', () => {
      const candidates: readonly SubordinateCandidate[] = [
        mkSubordinateCandidate({ kind: 'employee', isShadow: false }),
        mkSubordinateCandidate({ kind: 'employee', isShadow: true }),
        mkSubordinateCandidate({ kind: 'vacancy', isShadow: false }),
        mkSubordinateCandidate({ kind: 'department', isShadow: false })
      ]
      const policy: SubordinateCountPolicy = { includeShadows: false, includeVacancies: true }

      const result = countDirectSubordinates(candidates, policy)

      expect(result).toBe(2)
    })
  })

  it('returns a value between zero and candidate length', () => {
    const kinds = fc.constantFrom<SubordinateCandidate['kind']>('employee', 'department', 'vacancy')
    const candidateArb = fc.record({ kind: kinds, isShadow: fc.boolean() })
    const policyArb = fc.record({ includeShadows: fc.boolean(), includeVacancies: fc.boolean() })

    fc.assert(
      fc.property(fc.array(candidateArb, { minLength: 0, maxLength: 30 }), policyArb, (candidates, policy) => {
        const result = countDirectSubordinates(candidates, policy)

        expect(result >= 0).toBe(true)
        expect(result <= candidates.length).toBe(true)
      })
    )
  })
})