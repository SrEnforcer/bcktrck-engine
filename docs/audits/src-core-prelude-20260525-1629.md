# TSF++ Audit — src

**Target:** src
**Focus:** core,prelude
**Standard:** @tsfpp/standard v1.3.0
**Date:** 2026-05-25 16:29
**Status:** ✅ Resolved

---

## Summary

Core and prelude checks were run across all src slices. The originally reported MUST and SHOULD violations have now been remediated slice-by-slice, with focused typecheck and test validation after each structural change.

| Category    | Violations | Deviations | Passed | N/A |
|-------------|-----------|------------|--------|-----|
| Types       | 0         | 3          | 11     | 0   |
| Purity      | 0         | 1          | 11     | 0   |
| Boundary    | 0         | 0          | 12     | 0   |
| Annotations | 0         | 0          | 12     | 0   |
| Complexity  | 0         | 2          | 10     | 0   |
| Prelude     | 0         | 0          | 12     | 0   |
| React       | 0         | 0          | 0      | 12  |
| Data        | 0         | 0          | 0      | 12  |
| Security    | 0         | 0          | 12     | 0   |
| Tests       | 0         | 0          | 12     | 0   |

_N/A — focus not applicable to this target (e.g. React row when no `.tsx` files in scope)_

---

## Slices

| # | Path | Status |
|---|------|--------|
| 1 | `src/{index.ts,cli.ts,compile.ts}` | ✅ |
| 2 | `src/lexer/**` | ✅ |
| 3 | `src/parser/**` | ✅ |
| 4 | `src/types/**` | ⚠️ |
| 5 | `src/resolver/**` | ✅ |
| 6 | `src/style/**` | ⚠️ |
| 7 | `src/layout/{buchheim,index-tree,route-edges,staff-placement,render-config-validation,types}.ts` | ✅ |
| 8 | `src/layout/render-svg/**` | ✅ |
| 9 | `src/icons/**` | ✅ |
| 10 | `src/subtree/**` | ✅ |
| 11 | `src/tests/factories/**` | ✅ |
| 12 | `src/*.{test.ts}` | ✅ |

---

### Slice 1 — `src/{index.ts,cli.ts,compile.ts}`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 11.2 | `src/compile.ts` | RESOLVED | Extracted style-source parsing and merge helpers into `src/compile/style-context.ts`; compile.ts is now 678 LOC. |
| 11.1 | `src/compile.ts` | RESOLVED | Source-style concerns are no longer co-located with the main orchestration path. |
| 1.6 | `src/compile.ts:216` | CLEAN | Existing branded-id boundary deviation remains justified and unchanged. |

#### Checklist

- [x] 1.5 — No `any`
- [x] 1.6 — No unguarded `as` / `!` in this slice (one justified deviation)
- [x] 2.1 — `const` bindings used
- [x] 4.5 — No non-boolean truthiness checks
- [x] 5.1 — Prelude combinators used for option/result flow
- [x] 6.2 — No core `throw` in compile pipeline
- [x] 11.2 — File size within limit

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(1.6) | `src/compile.ts:278` | Branded id unwrap at serialization boundary. |

### Slice 2 — `src/lexer/**`

**Status:** ✅ Clean

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| — | — | CLEAN | No core/prelude violations identified. |

#### Checklist

- [x] No `any`, `!`, or unsupported `as` usage
- [x] Option-first null handling (`fromNullable`, guards)
- [x] No `new Map()`/`new Set()`
- [x] No `x ?? y`

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(4.4) | `src/lexer/tokenize.ts:158` | Recursive scanner kept as one function for deterministic token precedence. |

### Slice 3 — `src/parser/**`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 11.2 | `src/parser/grammar.ts` | RESOLVED | Extracted grammar atoms and block parsers into `src/parser/grammar-atoms.ts` and `src/parser/grammar-blocks.ts`; grammar.ts is now 413 LOC. |
| 11.1 | `src/parser/grammar.ts` | RESOLVED | Config/link parsing and token/attribute primitives are now isolated from the top-level parser entrypoint. |

#### Checklist

- [x] 1.5 — No `any`
- [x] 1.6 — No non-null assertion usage
- [x] 6.2 — No throw in parser core
- [x] Prelude guards used instead of `_tag` comparisons
- [x] 11.2 — File size within limit

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(2.4) | `src/parser/grammar.ts:15` | Centralized grammar retained during staged extraction. |

### Slice 4 — `src/types/**`

**Status:** ✅ Clean

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| — | — | CLEAN | No current core/prelude violations remain in `src/types/**`. |
| 1.6 | `src/types/branded.ts:30` | CLEAN | Branded constructors retain the existing justified smart-constructor deviation. |

#### Checklist

- [x] 1.1/1.12 — Tagged unions use `kind` for domain ADTs
- [x] 1.8/1.9 — No enum/class/namespace
- [x] 3.x — Readonly fields used
- [x] 6.3 — Nullability represented via Option in domain contracts

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(1.6) | `src/types/branded.ts:29` | Smart constructor boundary cast for branding without runtime overhead. |

### Slice 5 — `src/resolver/**`

**Status:** ✅ Clean

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| — | — | CLEAN | No unwaived core/prelude violations identified. |

#### Checklist

- [x] No `any` / non-null assertion in resolver logic
- [x] Prelude map/set APIs used (`assoc`, `intoMap`, `intoSet`)
- [x] No direct `_tag` checks
- [x] No forbidden nullish coalescing

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(4.4) | `src/resolver/resolve.ts:186` | Icon extraction intentionally branch-dense for precedence guarantees. |

### Slice 6 — `src/style/**`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 11.2 | `src/style/dsl.ts` | RESOLVED | Extracted defs/merge helpers into `src/style/dsl-definitions.ts` and resolution logic into `src/style/dsl-resolve.ts`; dsl.ts is now 718 LOC. |
| 11.1 | `src/style/dsl.ts` | RESOLVED | Parsing, definitions, and resolution responsibilities are now split across focused internal modules. |

#### Checklist

- [x] Prelude APIs used for maps/options
- [x] No `new Map`/`new Set`
- [x] No `x ?? fallback`
- [x] 11.2 — File size within limit

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(2.4) | `src/style/dsl.ts:14` | Temporary monolithic module during migration. |

### Slice 7 — `src/layout/{buchheim,index-tree,route-edges,staff-placement,render-config-validation,types}.ts`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 2.3 | `src/layout/staff-placement.ts` | RESOLVED | Replaced `.reverse()` usage with immutable reduction. |
| 2.3 | `src/layout/apply-layout-hints.ts` | RESOLVED | Replaced `.reverse()` and `.sort()` usages with immutable helper routines. |
| 6.3 | `src/layout/types.ts` | RESOLVED | `IndexedNode.parentId` now uses `Option<string>` and the layout pipeline/fixtures were updated accordingly. |
| 11.2 | `src/layout/buchheim.ts` | RESOLVED | Extracted internal Buchheim scratch and contour helpers into `src/layout/buchheim-helpers.ts` plus shared internal types into `src/layout/buchheim-types.ts`; buchheim.ts is now 212 LOC. |
| 1.6 | `src/layout/buchheim.ts:552` | NOTE | Non-null assertion appears under module-level `DEVIATION(1.6)` + lint waiver. |

#### Checklist

- [x] Prelude maps/sets used
- [x] No direct ADT `_tag` matching
- [x] 2.3 — No mutable array methods
- [x] 6.3 — No null/undefined propagation
- [x] 11.2 — File size within limit

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(1.6) | `src/layout/buchheim.ts:24` | Internal contour invariants documented for asserted lookups. |

### Slice 8 — `src/layout/render-svg/**`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 11.2 | `src/layout/render-svg/nodes.ts` | RESOLVED | Extracted node body fragment builders into `src/layout/render-svg/nodes-fragments.ts`; nodes.ts is now 340 LOC. |

#### Checklist

- [x] Prelude combinators used consistently
- [x] No forbidden nullish coalescing
- [x] 11.2 — File size within limit

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(2.4) | `src/layout/render-svg/nodes.ts:14` | Large helper module temporarily retained during migration. |

### Slice 9 — `src/icons/**`

**Status:** ✅ Clean

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 1.6 | `src/icons/render.ts:101` | NOTE | Cast is paired with explicit `DEVIATION(1.6)` and lint waiver. |

#### Checklist

- [x] No `new Map`/`new Set` usage
- [x] No direct `_tag` checks
- [x] Option-first null handling
- [x] Exported symbols documented

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(1.6) | `src/icons/render.ts:101` | Lucide attr runtime narrowing at rendering boundary. |

### Slice 10 — `src/subtree/**`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| 2.3 | `src/subtree/subtree.ts` | RESOLVED | Replaced the mutating reverse-based path logic with immutable helpers. |
| 6.3 | `src/subtree/reporting-chain.ts` | RESOLVED | Internal indexed node model now uses `Option<string>` for `parentId`. |
| 11.2 | `src/subtree/subtree.ts` | RESOLVED | Extracted upstream-path and node-search helpers into `src/subtree/subtree-helpers.ts`; subtree.ts is now 377 LOC. |
| SS2 | `src/subtree/parse-and-resolve.ts` | RESOLVED | Exported JSDoc was normalized to a single valid annotation contract. |

#### Checklist

- [x] Option/Result style flow maintained
- [x] No forbidden `x ?? y`
- [x] 2.3 — No mutable array methods
- [x] 6.3 — No null/undefined propagation
- [x] 11.2 — File size within limit
- [x] Annotations — exported symbol docs are structurally valid

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| DEVIATION(4.4) | `src/subtree/subtree.ts:170` | Forest-root synthesis intentionally retained as single total helper. |

### Slice 11 — `src/tests/factories/**`

**Status:** ✅ Clean

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| — | — | CLEAN | No core/prelude violations identified in factory helpers. |

#### Checklist

- [x] No `any` usage
- [x] Readonly object shapes preserved
- [x] No forbidden nullish/coalescing constructs

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| — | — | None |

### Slice 12 — `src/*.{test.ts}`

**Status:** ✅ Fixed

#### Findings

| Rule | Location | Severity | Finding |
|------|----------|----------|---------|
| Prelude | `src/compile.test.ts` | RESOLVED | Replaced nullish fallback with `fromNullable` + `getOrElse` prelude handling. |

#### Checklist

- [x] No `any`
- [x] No mutable loops/imperative control in tests
- [x] Prelude nullish fallback style (`??`) avoided

#### Deviation register

| Ref | Line | Justification |
|-----|------|---------------|
| — | — | None |

---

## Resolution Summary

1. All originally reported MUST violations were fixed and validated with focused typecheck and slice-level tests.
2. Remaining SHOULD size issues were resolved by extracting focused internal helper modules from `src/subtree/subtree.ts` and `src/layout/buchheim.ts`.
3. Existing deviations were retained only where they remained documented and justified by local algorithm or boundary invariants.
