# TSF++ core rules

Full standard: `node_modules/@tsfpp/standard/spec/CODING_STANDARD.md`

## Never

- `class` `this` `new` `instanceof` `namespace` `enum`
- `interface` without `// DEVIATION(1.4): <reason>`
- `any` — use `unknown` at I/O boundaries, narrow in scope
- `as` outside a smart constructor body
- `!` (non-null assertion)
- `let` `var`
- `for` `while` `do..while`
- `.push` `.pop` `.splice` `.sort` `.reverse` `.fill` `delete`
- `throw` in core — return `err(...)` instead
- `==` `!=` or truthiness checks on non-booleans (`if (str)`, `if (value)`)
- Optional params `?` — use `Option<T>` or a defaults record
- `default:` in an exhaustive switch — use `absurd(x)` instead
- `import from 'ramda'` / `'lodash'` — use `@tsfpp/prelude` (Ramda is not a dep; Remeda is the recommended, optional, collection lib — not a dep either)
- `new Map()` `new Set()` — use `intoMap` / `intoSet` from `@tsfpp/prelude`
- `if (x === null)` `if (x !== null)` `if (x === undefined)` `if (x !== undefined)` `if (!x)` `x ?? y` — any nullability check in any form; use `fromNullable` → `Option<T>`, then `isSome` / `isNone` / `getOrElseOption`
- `try/catch` in core — use `tryCatch` / `tryCatchAsync` from `@tsfpp/prelude`
- `console.log` `console.error` `console.warn` `console.info` — anywhere except `main.ts` / `server.ts` startup; use the injected `Logger` port from `@tsfpp/prelude`
- `process.env` outside the config loader — use the typed `Config` record injected as a dependency
- `Number(x)` `parseInt` `parseFloat` unary `+` in core — parse at the boundary and brand constrained numerics (`Int`/`Positive`/`NonNegative`); `NaN`/`Infinity` never leak inward (Rule 1.13)
- global `isNaN` / `isFinite` — use `Number.isNaN` / `Number.isFinite` (Rule 1.13)
- `Date.now()` `new Date()` `Math.random()` `crypto.randomUUID()` in core — inject a clock/entropy port via `Deps` (Rule 4.6)
- `string` or `Error` as a `Result` error channel — use a `kind`-tagged discriminated union (Rule 6.7)
- `create*` constructor prefix — use `mk*` (Rule 7.3)
- `===` / `!==` / `.includes()` / `unique()` on records or arrays expecting structural equality — `===` is REFERENCE equality (`{id:1} === {id:1}` is `false`); pass an explicit `Eq` (`uniqueWith`, `elemWith`, `lookupWith`). Still correct for primitives and string-literal discriminants (Rule 4.7)
- outward imports from `core`/`domain` (adapters, transports, `node:*`, frameworks) — define a port and inject it at the composition root (Rule 11.5)
- module-level side effects: `const x = new Date()`, `process.env.X`, top-level `await`, bare calls at module scope — importing a module must only define bindings (Rule 11.6)
- `.sort()` without a comparator — sorts by string coercion (`[10,9]` stays `[10,9]`); use `sortWith(ord)` (Rule 4.7)
- `.map()` / `.sort()` / `.reverse()` on a refined value like `NonEmptyReadonlyArray` — the stdlib method widens back to `ReadonlyArray` and silently discards the proof, so every later `head` needs an `Option` again; use the preserving combinator (`mapNonEmpty`, `sortNonEmpty`, `reverseNonEmpty`) (Rule 1.15)

## Always

- `const` for every binding
- `readonly` on every record field and `ReadonlyArray<T>` for arrays
- Explicit return type on every exported function
- Sum-type dispatch via `switch` ending in `default: return absurd(x)`
- Errors as data: `Result<T, E>` where `E` is a `kind`-tagged union — never `throw`, `string`, or `Error` in core (Rule 6.7)
- Collapse `Option`/`Result` with a total `match` / `matchOption` when both arms yield a value (Rule 8.5)
- `Validation<E, A>` (not `Result`) when independent checks must ALL be reported — form/request-body fields, anything feeding an RFC 9457 `errors` array. `Result` short-circuits on the first failure (Rule 6.8)
- `satisfies` (not `as`) to check a literal against a type without widening (Rule 1.14)
- Refinement-preserving combinators on refined values, so a proof established once at the boundary survives the whole pipeline (Rule 1.15)
- ADT combinators: `Result` unsuffixed, others suffixed by full type name — `mapOption`, `getOrElseOption`, `headNonEmpty` (Rule 7.8)
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
| Pipeline depth | ≤ 8 stages |

## ADT patterns

```ts
// Sum type — domain ADTs use `kind`
type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect';   readonly width: number; readonly height: number }

// Exhaustive match
switch (shape.kind) {
  case 'circle': return Math.PI * shape.radius ** 2
  case 'rect':   return shape.width * shape.height
  default:       return absurd(shape)
}

// Branded type — `as` only inside the smart constructor guard body
type UserId = Brand<string, 'UserId'>
const mkUserId = (raw: string): Option<UserId> =>
  raw.length > 0
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor body
    ? some(raw as UserId)
    : none

// Total function
const head = <A>(xs: ReadonlyArray<A>): Option<A> =>
  xs.length > 0 ? some(xs[0] as A) : none
```

## Discriminant convention

| ADT origin | Field | Example |
|---|---|---|
| `@tsfpp/prelude` (Result, Option) | `_tag` | accessed via guards only — never `x._tag === 'Ok'` |
| Domain ADTs | `kind` | `{ kind: 'pending'; ... }` |

## Imports

All ADT constructors, combinators, and utilities come from `@tsfpp/prelude`. Never import from `ramda` directly.

Logger port: `import { type Logger, type LogEntry } from '@tsfpp/prelude'`
Config loader: `import { loadConfig, type ConfigError } from '@tsfpp/boundary'`

## Markers

```ts
// TODO(author, YYYY-MM-DD[, TICKET]): description
// FIXME(author, YYYY-MM-DD): description
// HACK(author, YYYY-MM-DD): description
// NOTE(author, YYYY-MM-DD): description
// OPTIMIZE(author, YYYY-MM-DD): description
// BUG(author, YYYY-MM-DD): description
// XXX(author, YYYY-MM-DD): description
```