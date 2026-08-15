---
name: prelude-api
description: >
  Provides the complete API surface of @tsfpp/prelude: all exported combinators,
  ADTs, and utility functions for Option, Result, List, ReadonlyMap, ReadonlySet,
  branded types, and record decoding. Load this skill when writing or reviewing
  TypeScript that imports from @tsfpp/prelude, when choosing between
  map/flatMap/traverseArray, when constructing or querying ReadonlyMap or
  ReadonlySet, when decoding unknown runtime values, or when deciding between
  pipe and flow.
---

# @tsfpp/prelude API

All combinators are curried data-last and compose with `pipe`.

## Import path

```ts
import { pipe, ok, err, some, none, ... } from '@tsfpp/prelude';
```

Never import sub-paths. Ramda is **not** a dependency (removed in standard v1.1.0): `@tsfpp/prelude` covers the ADTs and core combinators. For collection plumbing the standard *recommends* Remeda, but it is **not** a dependency of these packages — a project may add it if needed; do not assume it is present.

### Naming convention (Rule 7.8)

`Result` is the **base** ADT — its combinators are unsuffixed (`map`, `flatMap`, `getOrElse`, `match`, `mapErr`, `tap`). Every other ADT carries its full type name as a suffix: `mapOption` / `getOrElseOption` / `matchOption` (Option), `mapList` (List), `headNonEmpty` (NonEmpty). There is no abbreviated (`mapO`) or single-letter (`getOrElseR`) form. So bare `getOrElse` collapses a **`Result`**; `getOrElseOption` collapses an `Option`.

---

## Full API surface

For the complete, version-accurate export list:
`get_api_surface({ package: '@tsfpp/prelude' })`

---

## Decision rules

### `map` vs `flatMap`

- Transformation **cannot fail** → `map` / `mapOption`
- Transformation **can fail or be absent** → `flatMap` / `flatMapOption`
- Mismatching produces `Result<Result<T,E>,E>` or `Option<Option<T>>` — always wrong.

```ts
const upper = map((s: string) => s.toUpperCase())(name);   // cannot fail
const valid = flatMap(validateEmail)(input);                // can fail
```

### Combining — Semigroup / Monoid

`Eq` = "are these the same?", `Ord` = "which comes first?", `Monoid` = "how do
two combine?". The identity element makes folding an empty collection total.

```ts
concatAll(monoidSum)([]);                                   // 0 — no Option needed
foldMap(monoidSum)((o: Order) => o.seats)(orders);          // sum of a projection
foldMap(monoidAny)((o: Order) => mkAny(o.overdue))(orders); // "is any overdue?"
```

`monoidEvery` / `monoidAny` are distinct types on purpose — their identities are
`true` and `false`, so the wrong choice silently inverts the empty-collection result.
`semigroupFirst`/`Last`/`Max`/`Min` are Semigroups (no identity exists).

### Equality and ordering (Rule 4.7)

`===` on any non-primitive is **reference** equality. Pass an explicit `Eq`:

```ts
const eqUser = eqBy((u: User) => u.id, eqNumber);  // equality is identity of the key
uniqueWith(eqUser)(users);                          // not unique() — that is reference-based
elemWith(eqUser)(target)(users);                    // not .includes()
sortWith(ordBy((u: User) => u.age, ordNumber))(users); // sorts a copy, explicit comparator
```

`eqStructural()` compares plain data by contents; `eqStrict()` keeps `===` where it is correct.
`maxWith`/`minWith` take a `NonEmptyReadonlyArray` and are total.

### Keep the non-empty proof (`NonEmptyReadonlyArray`)

`.map()` on a proven non-empty array returns a plain `ReadonlyArray` — the proof is
discarded and every later `head` is back to `Option`. Use the preserving combinators:

```ts
mapNonEmpty(f)(xs);                          // not xs.map(f)
sortNonEmpty(ordNumber)(xs);                 // not [...xs].sort()
reverseNonEmpty(xs); concatNonEmpty(ys)(xs); // append/prependNonEmpty too
headNonEmpty(xs);                            // A, not Option<A>
reduceNonEmpty<number>((a, b) => a + b)(xs); // stdlib reduce w/o a seed THROWS on []
traverseNonEmpty(parseFoo)(xs);              // Result<NonEmptyReadonlyArray<Foo>, E>
```

`reduceNonEmpty` is the payoff: a partial stdlib function made total by the type.
`tailNonEmpty` deliberately returns a plain array — the tail of `[a]` *is* empty.
`semigroupNonEmpty()` is a Semigroup, never a Monoid — no empty non-empty array exists.

### `Result` vs `Validation` (Rule 6.8)

- Next step needs the previous step's value → `Result` (short-circuits on first `Err`)
- Independent checks, caller must see every failure → `Validation` (accumulates)

```ts
// Reports EVERY bad field, not just the first:
const v = sequenceStructValidation({ name: parseName(raw), email: parseEmail(raw) });
```

`Validation` has no `flatMap` by design — independence is what licenses accumulation.
Cross back with `validationToResult` / `resultToValidation`.

### `orElseOption` vs `getOrElseOption`

- Keep `Option` context → `orElseOption(() => some(fallback))`
- Collapse to concrete value → `getOrElseOption(() => fallback)`

### `pipe` vs `flow`

- Initial value is at hand → `pipe(value, f, g, h)`
- Named or reusable pipeline → `flow(f, g, h)` — returns a function
- `flow(f, g, h)(x) ≡ pipe(x, f, g, h)`

### `tap` vs `tapErr`

Use for side effects (logging, metrics). Neither changes the value.

```ts
pipe(
  parseInput(raw),
  tap((v)    => log.debug({ parsed: v })),
  flatMap(validate),
  tapErr((e) => log.warn({ error: e })),
)
```

Never break the chain to log. Always use `tap`/`tapErr`.

### `Result<Unit, E>` for success-only operations

Use `ok(unit)` when an operation succeeds but produces no value (write, save, dispatch). Never use `Result<void, E>`.

```ts
import { ok, err, unit, type Result, type Unit } from '@tsfpp/prelude';

const save = (x: Foo): Result<Unit, SaveError> =>
  persist(x) ? ok(unit) : err({ code: 'WRITE_FAILED' });
```

### `absurd` for exhaustive matching

Switch on `_tag` only in exhaustive `switch`. Use exported guards (`isOk`, `isSome`) everywhere else.

```ts
switch (result._tag) {
  case 'Ok':  return result.value;
  case 'Err': return result.error;
  default:    return absurd(result);
}
```

---

## Boundary patterns

### Wrapping throwing third-party code

```ts
const parsed = tryCatch(
  () => JSON.parse(raw),
  (e) => `parse failed: ${String(e)}`,
);
```

Never use raw `try/catch` inside your own code. Return `Result` directly.

### Lifting Zod into `Result`

```ts
const fromZod =
  <A>(schema: ZodSchema<A>) =>
  (raw: unknown): Result<A, ZodError> => {
    const r = schema.safeParse(raw);
    return r.success ? ok(r.data) : err(r.error);
  };
```

Zod owns the boundary. The prelude owns everything after.

### Decoding `unknown` records

```ts
import { isRecord, getStringField, getNumberField, isSome, type UnknownRecord } from '@tsfpp/prelude';

const decode = (raw: unknown): Result<Foo, string> => {
  if (!isRecord(raw)) return err('not an object');
  const name = getStringField(raw, 'name');   // Option<string> — rejects empty/whitespace
  const age  = getNumberField(raw, 'age');    // Option<number> — rejects NaN/Infinity
  return isSome(name) && isSome(age)
    ? ok({ name: name.value, age: age.value })
    : err('missing fields');
};
```

For domain types, use `getTypedField` with a runtime guard:

```ts
const userId = getTypedField(payload, 'userId', isUserId); // Option<UserId>
```

---

## Array patterns

### `traverseArray` — map a fallible function, short-circuit on first `Err`

```ts
const all = traverseArray(parseFoo)(rawItems); // Result<ReadonlyArray<Foo>, E>
// Never: rawItems.map(parseFoo) — produces ReadonlyArray<Result<Foo,E>>
```

### `traverseArrayOption` / `sequenceArrayOption` — collect only if every element is `Some`

```ts
traverseArrayOption(fromNullable)([1, 2, 3]);    // Some([1, 2, 3])
traverseArrayOption(fromNullable)([1, null, 3]); // None

// Already have ReadonlyArray<Option<A>>? Use sequenceArrayOption directly:
sequenceArrayOption([some(1), some(2)]); // Some([1, 2])
sequenceArrayOption([some(1), none]);    // None
```

### `fromUnknownArrayOf` — guard typed arrays from unknown

```ts
const strings = fromUnknownArrayOf(
  (v): v is string => typeof v === 'string'
)(raw); // Option<ReadonlyArray<string>>
```

---

## ReadonlyMap combinators

Always construct maps with `intoMap`. Never call `new Map()` directly.

```ts
import { intoMap, entriesOf, assoc, dissoc, lookup } from '@tsfpp/prelude';

const m  = intoMap([['a', 1], ['b', 2]]); // ReadonlyMap<string, number>
const v  = pipe(m, lookup('a'));           // Some(1)
const m2 = pipe(m, assoc('c', 3));        // insert or replace
const m3 = pipe(m2, dissoc('a'));          // remove
const es = entriesOf(m);               // ReadonlyArray<readonly [string, number]>
```

---

## ReadonlySet combinators

Always construct sets with `intoSet`. Never call `new Set()` directly.

```ts
import { intoSet, conj, disj, member } from '@tsfpp/prelude';

const s   = intoSet([1, 2, 2, 3]);  // ReadonlySet<number> — {1, 2, 3}
const s2  = pipe(s, conj(4));       // add
const s3  = pipe(s2, disj(2));      // remove (no-ops when absent)
const has = pipe(s, member(1));     // true
```

---

## `List` vs `ReadonlyArray`

Use `List` when: prepend-heavy (`cons` is O(1)), structurally recursive, pattern-matching on head/tail.
Use `ReadonlyArray` when: random access, interop with APIs, append-heavy.

```ts
import { fromArray, toArray, isCons, isNil } from '@tsfpp/prelude';

const asList = fromArray(rawArray);
// ... structural processing with isCons / isNil guards ...
const result = toArray(asList);
```

Fold operations: `foldList` (right-associative), `foldLeftList` / `foldLeftListCurried` (left-associative).