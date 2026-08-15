# TSF++ coding standard — v5.0.0

Standard version: 5.0.0 (2026-07-26). When this skill and the full `CODING_STANDARD.md` conflict, the file wins.

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
import from 'ramda' / 'lodash'  → use @tsfpp/prelude (Remeda is the *recommended*, optional, collection lib — not a dep)
Number()·parseInt·parseFloat·unary +  in core  → parse at boundary; brand numerics (Rule 1.13)
NaN·Infinity leak; global isNaN·isFinite  → use Number.isNaN·Number.isFinite (Rule 1.13)
Date.now·new Date()·Math.random·crypto.randomUUID·process.env  in core  → inject via Deps (Rule 4.6)
string·Error as a domain error channel  → use a kind-tagged union (Rule 6.7)
=== · !== · .includes() on non-primitives  → reference equality! pass an Eq (Rule 4.7)
.sort() without a comparator  → string coercion; use sortWith(ord) (Rule 4.7)
.map()·.sort()·.reverse() on a NonEmpty* value  → widens and discards the proof; use mapNonEmpty etc. (Rule 1.15)
create* constructor prefix  → use mk* (Rule 7.3)
```

---

## Hard rules

For the complete rule set, call `get_layer({ layer })`.
For a specific rule, call `get_rule({ id })`.

Critical rules always in context:
- 1.12 — `_tag` for prelude ADTs · `kind` for domain ADTs
- 1.13 — No numeric coercion / `NaN` in core; brand constrained numerics (`Int`/`Positive`/`NonNegative`)
- 1.14 — Prefer `satisfies` over `as` for literal conformance
- 1.15 — Keep a refinement across transformation: `mapNonEmpty`/`sortNonEmpty`, never `.map()`/`.sort()` on a proven value (which widens and throws the proof away)
- 4.1 — Every exhaustive `switch` ends in `default: return absurd(x)`
- 4.6 — No ambient clock/entropy/env in core — inject via `Deps`
- 4.7 — `===` on non-primitives is REFERENCE equality; pass an explicit `Eq`/`Ord` (`uniqueWith`, `elemWith`, `sortWith`)
- 6.3 — No `null`/`undefined` — use `Option<A>`
- 6.7 — Error channels are `kind`-tagged unions, never `string`/`Error`
- 6.8 — Independent checks that must all be reported use `Validation` (accumulates); dependent steps use `Result` (short-circuits)
- 7.8 — `Result` combinators unsuffixed; other ADTs suffixed by full type name (`mapOption`, `headNonEmpty`)
- 8.5 — Collapse `Option`/`Result` with a total `match` when both arms yield a value
- 11.5 — Dependencies point INWARD only; core imports no adapter/transport/`node:*` — define a port, inject at the root
- 11.6 — No module-level side effects; importing a module only defines bindings

## Size limits

| Metric | Limit |
|---|---|
| Function body | ≤ 40 lines |
| Cyclomatic complexity | ≤ 10 |
| Nesting depth | ≤ 4 |
| File size | ≤ 400 LOC (800 max with deviation) |

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