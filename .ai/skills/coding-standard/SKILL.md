# TSF++ coding standard — v1.1.0

Standard version: 1.1.0 (2026-05-15). When this skill and the full `CODING_STANDARD.md` conflict, the file wins.

---

## Never (MUST NOT — all layers)

```
class · this · new · instanceof · namespace · prototype inheritance
enum          → use string literal unions or `as const` objects
interface     → use `type`; deviation requires // DEVIATION(1.4): <reason>
any           → use `unknown` at I/O boundaries and narrow in scope
as            → only inside a smart constructor body after validation
!             → non-null assertion forbidden everywhere
let · var
for · while · do..while
push · pop · splice · sort · reverse · fill · copyWithin  (mutating methods)
property assignment · delete
throw         → only at adapter boundaries (Rule 6.2); core uses Result<T,E>
==  !=        → use === !==
truthiness checks on non-booleans  (if (str) · if (value))
optional params ?  → use Option<T> or a defaults record
default:      in an exhaustive switch  → use absurd(x)
direct _tag comparison outside @tsfpp/prelude  → use exported guards
import from 'ramda'  → use @tsfpp/prelude
```

---

## Hard rules (all layers)

| Rule | Level | Constraint |
|------|-------|-----------|
| 1.1 | MUST | Sum types: tagged discriminated union with a literal discriminant |
| 1.2 | MUST | Exhaustive `switch` ends in `default: return absurd(x)` |
| 1.3 | MUST | Nominal distinctions via branded types; only smart constructors (`mk*`, `from*`, `as*`) |
| 1.4 | MUST | `type` aliases; `interface` requires `// DEVIATION(1.4): <reason>` |
| 1.5 | MUST | No `any`; `unknown` at I/O boundaries, narrowed in scope |
| 1.6 | MUST | No `!`; no `as` outside smart constructor bodies |
| 1.8 | MUST | No `enum`; string literal unions or `as const` |
| 1.9 | MUST | No `class` · `this` · `new` · `instanceof` · `namespace` |
| 1.11 | MUST | Access prelude ADT discriminants via exported guards only (`isOk`, `isSome`, …) |
| 1.12 | MUST | Discriminant convention: `_tag` for prelude/library ADTs · `kind` for domain ADTs |
| 2.1 | MUST | `const` only; no `let`/`var` |
| 2.2 | MUST | `ReadonlyArray<T>` everywhere |
| 2.3 | MUST | No mutating methods or property assignment |
| 2.5 | MUST | `as const` for literal narrowing and config tables |
| 3.x | MUST | `readonly` on every record field |
| 4.1 | MUST | Every sum-type `switch` exhaustive; `default: return absurd(x)` |
| 4.5 | MUST | Strict equality only; no truthiness on non-booleans |
| 5.1 | MUST | Pipelines via `pipe` from `@tsfpp/prelude` |
| 6.2 | MUST | `throw` only in adapter boundaries; wrap with `tryCatch`/`tryCatchAsync` |
| 6.3 | MUST | No `null`/`undefined` propagation; use `Option<A>` |
| 6.6 | MUST | Prefer `Promise.allSettled` over `Promise.all` when partial failure is meaningful |
| 7.x | MUST | JSDoc on every exported symbol; algebraic laws for combinators |
| 8.4 | MUST | Parse, don't validate: convert `unknown` to domain types at the boundary |
| 9.6 | MUST | Pre-commit hooks enforce lint and typecheck |
| 11.1 | MUST | One type, one file; related constructors co-located |
| 11.2 | MUST | File ≤ 400 lines; 800 absolute maximum with deviation |

**Size limits:** function body ≤ 40 lines · cyclomatic complexity ≤ 10 · nesting depth ≤ 4.

---

## Discriminant convention (Rule 1.12)

| ADT origin | Discriminant field | Example |
|---|---|---|
| `@tsfpp/prelude` (Result, Option) | `_tag` | `{ _tag: 'Ok'; value: A }` |
| Domain code | `kind` | `{ kind: 'pending'; orderId: OrderId }` |

Access prelude ADTs through exported guards only — never `result._tag === 'Ok'`.  
`_tag` in a `switch` is permitted only when exhaustiveness via `absurd` requires it.

---

## Key idioms

```ts
// Sum type — domain ADT (kind)
type OrderStatus =
  | { readonly kind: 'pending';   readonly orderId: OrderId }
  | { readonly kind: 'fulfilled'; readonly orderId: OrderId; readonly at: Date }

// Exhaustive match
const label = (s: OrderStatus): string => {
  switch (s.kind) {
    case 'pending':   return 'Pending'
    case 'fulfilled': return 'Fulfilled'
    default:          return absurd(s)
  }
}

// Branded type — smart constructor only
type TrackId = Brand<string, 'TrackId'>
const mkTrackId = (raw: string): Option<TrackId> =>
  raw.length > 0
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor body
    ? some(raw as TrackId)
    : none

// Deviation marker
// DEVIATION(1.4): third-party plugin augmentation requires interface
```

---

## Deviation procedure

Every MUST violation requires all three:
1. Inline comment: `// DEVIATION(N.M): <one-line justification>`
2. At least one reviewer sign-off
3. Entry in `DEVIATIONS.md` for project-wide deviations

---

## Layer constraints

### `core`
- Zero framework imports. Zero I/O. Zero effects. Zero `Promise` in signatures.
- Domain types only: sum types, product types, branded types, smart constructors.
- No `@tsfpp/boundary`, no `process`, `fs`, `fetch`.

### `api`
- All input parsed with Zod at the boundary; lifted into `Result<A, ZodError>`.
- Handlers return `Promise<Response>` via `@tsfpp/boundary` response builders.
- Errors mapped through `apiErrorToResponse`; never raw `throw`.
- Context extracted via `extractContext`; never read raw headers in business logic.
- Handler shape: parse → domain map → use-case call → response map. Nothing else.
- Architecture: transport → boundary → use-case → domain core → adapters. One-way only.

### `dal`
- Adapter pattern: implement a port (interface) defined by the domain.
- Wrap all third-party calls in `tryCatchAsync` from `@tsfpp/prelude`.
- Map infrastructure errors to typed domain error ADTs before returning.
- No domain logic. No HTTP semantics. Pure data translation.

### `react`
- Component state as discriminated union with `kind` discriminant; never boolean soup.
- Data fetching via TanStack Query; no raw `useEffect` for fetching.
- `useEffect` only for genuine external synchronisation; requires an explanatory comment.
- Props as `readonly` record; no optional props — use `Option<T>`.
- Components are pure render functions; side effects are isolated.
- Prop drilling limit: 2 levels; extract context or compose instead.

### `cli`
- `process.argv` parsed at the entry point boundary only; typed `Args` ADT internally.
- `process.exit` only at the outermost boundary after all async work resolves.
- Errors as `Result<T, E>`; convert to exit codes only at the shell boundary.
- No `console.log` in core — use a `Logger` port.