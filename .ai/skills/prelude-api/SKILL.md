# @tsfpp/prelude API

All combinators are curried data-last and compose with `pipe`.

## Import path

```ts
import { pipe, ok, err, some, none, ... } from '@tsfpp/prelude';
```

Never import from `ramda` directly. Never import sub-paths.

---

## Core exports

| Group | Exports |
|---|---|
| Combinators | `pipe`, `flow`, `comp`, `complement` |
| Exhaustiveness | `absurd` |
| Option | `some`, `none`, `isSome`, `isNone`, `mapO`, `flatMapO`, `orElse`, `getOrElse` |
| Result | `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `flatMapAsync`, `tryCatch`, `tryCatchAsync`, `tap`, `tapErr` |
| Unit | `unit`, `Unit` |
| Guards / conversions | `fromNullable`, `toNullable`, `isRecord`, `fromUnknownString`, `fromUnknownArray`, `fromUnknownArrayOf`, `fromNonEmptyString` |
| Record decoding | `UnknownRecord`, `getStringField`, `getNumberField`, `getBooleanField`, `getTypedField` |
| Branded types | `Brand`, `Every`, `Any`, `mkEvery`, `mkAny` |
| Collections | `traverseArray`, `traverseArrayO`, `sequenceArrayO`, `unique` |
| List ADT | `List`, `nil`, `cons`, `singletonList`, `isCons`, `isNil`, `fromArray`, `toArray`, `headList`, `tailList`, `isEmptyList`, `lengthList`, `mapList`, `flatMapList`, `appendList`, `reverseList`, `filterList`, `foldList`, `foldLeftList`, `foldLeftListCurried`, `traverseList` |
| ReadonlyMap | `intoMap`, `entriesOfMap`, `assoc`, `dissoc`, `lookup` |
| ReadonlySet | `intoSet`, `conj`, `disj`, `member` |

---

## Decision rules

### `map` vs `flatMap`

- Transformation **cannot fail** → `map` / `mapO`
- Transformation **can fail or be absent** → `flatMap` / `flatMapO`
- Mismatching produces `Result<Result<T,E>,E>` or `Option<Option<T>>` — always wrong.

```ts
const upper = map((s: string) => s.toUpperCase())(name);   // cannot fail
const valid = flatMap(validateEmail)(input);                // can fail
```

### `orElse` vs `getOrElse`

- Keep `Option` context → `orElse(() => some(fallback))`
- Collapse to concrete value → `getOrElse(() => fallback)`

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

### `traverseArrayO` / `sequenceArrayO` — collect only if every element is `Some`

```ts
traverseArrayO(fromNullable)([1, 2, 3]);    // Some([1, 2, 3])
traverseArrayO(fromNullable)([1, null, 3]); // None

// Already have ReadonlyArray<Option<A>>? Use sequenceArrayO directly:
sequenceArrayO([some(1), some(2)]); // Some([1, 2])
sequenceArrayO([some(1), none]);    // None
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
import { intoMap, entriesOfMap, assoc, dissoc, lookup } from '@tsfpp/prelude';

const m  = intoMap([['a', 1], ['b', 2]]); // ReadonlyMap<string, number>
const v  = pipe(m, lookup('a'));           // Some(1)
const m2 = pipe(m, assoc('c', 3));        // insert or replace
const m3 = pipe(m2, dissoc('a'));          // remove
const es = entriesOfMap(m);               // ReadonlyArray<readonly [string, number]>
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