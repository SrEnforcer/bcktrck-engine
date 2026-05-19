# TSF++ Audit — src/compile.test.ts

**Target:** src/compile.test.ts
**Focus:** test
**Standard:** @tsfpp/standard v1.1.0
**Date:** 2026-05-19 17:35
**Status:** ⚠️ Violations found

---

## Summary

Top priorities:
1. Test descriptions use implementation echoes and fragments instead of behavior-level full sentences (Rule 1.2).
2. Several tests do not maintain explicit AAA phase separation with a blank line between Arrange and Act (Rule 3.3).

| Category    | Violations | Deviations | Passed | N/A |
|-------------|-----------|------------|--------|-----|
| Types       | 0         | 0          | 1      | 0   |
| Purity      | 0         | 0          | 1      | 0   |
| Boundary    | 0         | 0          | 0      | 1   |
| Annotations | 0         | 0          | 1      | 0   |
| Complexity  | 0         | 0          | 1      | 0   |
| Prelude     | 0         | 0          | 1      | 0   |
| React       | 0         | 0          | 0      | 1   |
| Data        | 0         | 0          | 0      | 1   |
| Security    | 0         | 0          | 1      | 0   |
| Tests       | 2         | 0          | 18     | 9   |

_N/A — focus not applicable to this target (e.g. React row when no `.tsx` files in scope)_

---

## Slices

| # | Path | Status |
|---|------|--------|
| 1 | `src/compile.test.ts` | ⚠️ |

---

<!-- Slices are appended below as the audit progresses -->

### Slice 1 — `src/compile.test.ts`

**Status:** ⚠️ Violations found

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 1.2  | `line 12`, `line 21`, `line 29`, `line 39` | MUST | Test descriptions are implementation echoes/fragments (`returns parseError`, `returns unknown_handle resolveErrors`) rather than behavior-spec full sentences. |
| 3.3  | `line 13`, `line 31`, `line 40` | MUST | AAA phase separation is inconsistent: Arrange and Act are combined without a blank-line phase break in multiple tests. |

#### Checklist

**Structure and behaviour (§1–§3)**
- [x] 1.1 — Tests assert on observable outputs, not implementation details
- [ ] 1.2 — Test descriptions are full sentences describing behaviour, not implementation echoes
- [x] 1.3 — One logical assertion concept per test
- [x] 1.4 — No wall-clock time, randomness without seed, network, or filesystem in unit tests
- [x] 1.5 — No shared mutable state between tests; `beforeEach` resets all state
- [ ] 3.3 — AAA structure with blank line separating phases
- [x] 3.4 — No branching or loops in test bodies

**Toolchain (§2)**
- [ ] 2.2 — Pure functions and combinators have fast-check property tests for documented laws
- [x] 2.3 — React components tested with RTL only; no Enzyme or shallow rendering
- [x] 2.4 — Network mocked with MSW; no stubbed `fetch` or HTTP client
- [x] 2.5 — DAL tests run against real or containerised store; in-memory stubs for use-case tests
- [x] 2.6 — No snapshot tests for component structure or API response shape

**Coverage (§6)**
- [x] 6.2 — Every public export has at least one test covering the primary success case
- [x] 6.3 — Every error path (`Err`, `None`, non-2xx) has a corresponding test
- [ ] 6.4 — Every branch, switch case, and ternary arm is exercised by at least one test

**Forbidden patterns (§5)**
- [x] 5.1 — No `getByTestId` queries — use `getByRole`, `getByLabelText`, `getByText`
- [x] 5.2 — No `vi.fn()` to implement a port interface — use in-memory implementations
- [x] 5.3 — No assertions on internal function calls — assert on observable outcome
- [x] 5.4 — No `any` in test code
- [x] 5.5 — No `beforeAll` for state that mutates between tests
- [x] 5.6 — No `setTimeout` delays — use `waitFor` or `findBy*`

**Factories and fixtures (§7)**
- [x] 7.1 — Test data produced by typed factory functions, not raw inline object literals
- [x] 7.2 — Factories live in `tests/factories/`, not co-located with test files
- [x] 7.4 — No production or staging IDs in fixtures

**Layer-specific (§4)**
- [ ] 4.1 Core — every smart constructor tested at valid/invalid boundary values
- [ ] 4.2 Use-case — each distinct `Err` variant has a test; in-memory stubs used
- [ ] 4.3 Handler — each missing required field produces 422; each `ApiError` variant covered
- [ ] 4.4 DAL — insert+read round-trip tested; not-found returns `None`
- [ ] 4.5 React — loading state, error state, and user interactions all covered

**Cross-cutting (always active)**
- [x] Annotations — No comments that paraphrase code; no commented-out code
- [x] Security — No secrets or sensitive output in test source
- [x] Log — No `console.*` usage in this test file
- [x] Config — No `process.env` mutation/access in this test file

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| None | — | No `DEVIATION(...)` markers in this slice. |
