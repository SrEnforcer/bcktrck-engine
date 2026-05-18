---
applyTo: "**/*.ts"
---

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
- `import from 'ramda'` — use `@tsfpp/prelude`
- `new Map()` `new Set()` — use `intoMap` / `intoSet` from `@tsfpp/prelude`
- `if (x === null)` `if (x !== null)` `if (x === undefined)` `if (x !== undefined)` `if (!x)` `x ?? y` — any nullability check in any form; use `fromNullable` → `Option<T>`, then `isSome` / `isNone` / `getOrElse`
- `try/catch` in core — use `tryCatch` / `tryCatchAsync` from `@tsfpp/prelude`
- `console.log` `console.error` `console.warn` `console.info` — anywhere except `main.ts` / `server.ts` startup; use the injected `Logger` port from `@tsfpp/prelude`
- `process.env` outside the config loader — use the typed `Config` record injected as a dependency

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