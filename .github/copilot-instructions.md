# TSF++ coding standard — v1.1.0

This repository follows the TSF++ coding standard.
Canonical source: `node_modules/@tsfpp/standard/spec/CODING_STANDARD.md` — when this file and the standard conflict, the standard wins.

## Axioms (non-negotiable)

1. Referential transparency is the norm; effects are reified as `Promise<Result<T, E>>`.
2. Total functions — partiality is typed via `Option<A>` or `Result<T, E>`. Never concealed.
3. Algebraic data types are the primary modelling language: sum types via tagged discriminated unions, product types via readonly records.
4. Compiler first, property tests second, documentation third.

## Never

- `class` `this` `new` `instanceof` `namespace` `enum`
- `interface` without `// DEVIATION(1.4): <reason>`
- `any` — use `unknown` at I/O boundaries, narrow in scope
- `as` outside a smart constructor body
- `!` (non-null assertion)
- `let` `var`
- `for` `while` `do..while`
- `.push` `.pop` `.splice` `.sort` `.reverse` `.fill` `delete` (mutating methods)
- `throw` in core — return `err(...)` instead
- `==` `!=` or truthiness checks on non-booleans (`if (str)`, `if (value)`)
- Optional params `?` — use `Option<T>` or a defaults record
- `default:` in an exhaustive switch — use `absurd(x)` instead
- `import from 'ramda'` — use `@tsfpp/prelude`
- `new Map()` `new Set()` — use `intoMap` / `intoSet` from `@tsfpp/prelude`
- `if (x === null)` `if (x !== null)` `if (x === undefined)` `if (x !== undefined)` `if (!x)` `x ?? y` — any nullability check in any form; use `fromNullable` → `Option<T>`, then `isSome` / `isNone` / `getOrElse`
- `try/catch` in core — use `tryCatch` / `tryCatchAsync` from `@tsfpp/prelude`

## Always

- `const` for every binding
- `readonly` on every record field and `ReadonlyArray<T>` for arrays
- Explicit return type on every exported function
- Sum-type dispatch via `switch` ending in `default: return absurd(x)`
- Errors as data: `Result<T, E>` — never `throw` in core
- Pipelines via `pipe` from `@tsfpp/prelude`
- JSDoc on every exported symbol (`@param`, `@returns`, `@law` where applicable)
- `// DEVIATION(N.M): <reason>` immediately before any necessary rule violation

## Size limits

| Metric | Limit |
|--------|-------|
| Function body | ≤ 40 lines (excl. blank lines and comments) |
| Cyclomatic complexity | ≤ 10 |
| Nesting depth | ≤ 4 |
| Positional arity | ≤ 3 — use a readonly record for ≥ 3 |

## Canonical idioms

```ts
// Sum type — domain ADT uses `kind`
type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect';   readonly width: number; readonly height: number }

// Exhaustive match with totality witness
import { absurd } from '@tsfpp/prelude'

const area = (s: Shape): number => {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2
    case 'rect':   return s.width * s.height
    default:       return absurd(s)
  }
}

// Branded type — smart constructor only; `as` only inside the guard body
import { type Brand, some, none, type Option } from '@tsfpp/prelude'

type UserId = Brand<string, 'UserId'>
const mkUserId = (raw: string): Option<UserId> =>
  raw.length > 0
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor body
    ? some(raw as UserId)
    : none

// Total function via Option
const head = <A>(xs: ReadonlyArray<A>): Option<A> =>
  xs.length > 0 ? some(xs[0] as A) : none

// Pipeline
import { pipe, map, flatMap, tap, tapErr } from '@tsfpp/prelude'

pipe(
  parseInput(raw),
  flatMap(validate),
  tap(v  => log.debug({ v })),
  tapErr(e => log.warn({ e })),
)
```

## Import discipline

All ADT constructors, combinators, and utilities come from `@tsfpp/prelude`. Never import from `ramda` directly.

```ts
import {
  some, none, ok, err, unit,
  isSome, isNone, isOk, isErr,
  map, flatMap, flatMapAsync, tap, tapErr,
  mapO, flatMapO, orElse, getOrElse, fromNullable,
  tryCatch, tryCatchAsync,
  traverseArray, traverseArrayO, sequenceArrayO,
  intoMap, assoc, dissoc, lookup, entriesOfMap,
  intoSet, conj, disj, member,
  isRecord, getStringField, getNumberField, getTypedField,
  pipe, flow, absurd,
  type Option, type Result, type Unit, type Brand,
} from '@tsfpp/prelude'
```

## Prelude-first

Before writing any implementation, check if `@tsfpp/prelude` already provides what you need:

| If you need… | Use… |
|---|---|
| Nullable → Option | `fromNullable` |
| Fallible operation | `tryCatch` / `tryCatchAsync` |
| No-value success | `ok(unit)` — never `ok(undefined)` |
| Map over array that can fail | `traverseArray` |
| Key/value store | `intoMap`, `lookup`, `assoc`, `dissoc` |
| Deduplication / membership | `intoSet`, `conj`, `disj`, `member` |
| Decode unknown record | `isRecord` + `getStringField` / `getNumberField` / `getTypedField` |

## Code markers

```ts
// TODO(author, YYYY-MM-DD[, TICKET]): description
// FIXME(author, YYYY-MM-DD): description
// HACK(author, YYYY-MM-DD): description
// NOTE(author, YYYY-MM-DD): description
// OPTIMIZE(author, YYYY-MM-DD): description
// BUG(author, YYYY-MM-DD): description
// XXX(author, YYYY-MM-DD): description
```

## Generation workflow

1. **Types first** — model the domain as sum and product types before writing any function.
2. **Make it total** — every function returns `Option`/`Result` if it can fail or be absent.
3. **Pure vs effectful** — `T` means pure; `Promise<Result<T, E>>` means effectful.
4. **Test the laws** — fast-check property tests for every pure function.

## Editing existing code

- Never weaken a signature (e.g. do not replace `Option<T>` with `T | undefined`).
- Preserve `readonly`-ness transitively.
- Do not introduce forbidden constructs to fix a type error — rethink the types.
- Deviation: `// DEVIATION(N.M): <one-line justification>` at the violation site.

## When a task is ambiguous

Ask one focused question rather than guessing. Do not invent types, error cases, or effect boundaries.

## Agents and tooling

- TSF++ compliance audit: `.github/agents/tsfpp-audit.agent.md`
- Guarded implementation: `.github/agents/tsfpp-guarded-coding.agent.md`
- Refactoring: `.github/agents/tsfpp-refactor-engineer.agent.md`
- Annotation: `.github/agents/tsfpp-annotate.agent.md`
- Trunk workflow: `.github/instructions/trunk.instructions.md`