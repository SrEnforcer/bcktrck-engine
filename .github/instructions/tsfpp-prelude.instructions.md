---
applyTo: "**/*.ts"
---

# TSF++ prelude API

Full reference: `node_modules/@tsfpp/prelude/README.md`
Recipes: `node_modules/@tsfpp/prelude/RECIPES.md`

## Import

```ts
import {
  // ADT constructors
  some, none, ok, err, unit,
  // Type guards
  isSome, isNone, isOk, isErr,
  // Option combinators
  mapO, flatMapO, orElse, getOrElse, fromNullable, toNullable,
  // Result combinators
  map, flatMap, flatMapAsync, tap, tapErr,
  // Async adapters
  tryCatch, tryCatchAsync,
  // Traversal
  traverseArray, traverseArrayO, sequenceArrayO,
  // Unknown decoding
  isRecord, fromUnknownString, fromUnknownArray, fromUnknownArrayOf, fromNonEmptyString,
  getStringField, getNumberField, getBooleanField, getTypedField,
  // ReadonlyMap
  intoMap, entriesOfMap, assoc, dissoc, lookup,
  // ReadonlySet
  intoSet, conj, disj, member,
  // List
  fromArray, toArray, cons, nil, isCons, isNil,
  // Pipe
  pipe, flow, comp, complement,
  // Utilities
  absurd, unique,
  // Types
  type Option, type Result, type Unit, type Brand,
  type UnknownRecord,
} from '@tsfpp/prelude'
```

Never `import from 'ramda'`.

## Option\<A\>

```ts
const a: Option<number> = some(42)
const b: Option<number> = none

// Guard before accessing .value
if (isSome(opt)) opt.value   // safe
if (isNone(opt)) return ...  // early exit

// Transform
pipe(opt, mapO(n => n + 1))
pipe(opt, flatMapO(n => n > 0 ? some(n) : none))
pipe(opt, getOrElse(() => 0))          // collapse to value
pipe(opt, orElse(() => some(fallback))) // keep Option context

// Lift from nullable — never use if (x === null) directly
const opt = fromNullable(maybeNull)  // null | undefined → Option<T>
```

## Result\<T, E\>

```ts
const r: Result<number, string> = ok(42)
const e: Result<number, string> = err('oops')

// Guard before accessing .value / .error
if (isOk(r))  r.value   // T
if (isErr(r)) r.error   // E

// Transform
pipe(r, map(v => v + 1))
pipe(r, flatMap(v => v > 0 ? ok(v) : err('non-positive')))

// Side effects — never break the pipe chain for logging
pipe(r,
  tap(v  => log.debug({ v })),
  tapErr(e => log.warn({ e })),
)

// Wrapping throwing code — never use raw try/catch in core
const result = tryCatch(
  () => JSON.parse(raw),
  e  => `parse error: ${String(e)}`,
)
const result = await tryCatchAsync(
  () => db.findById(id),
  e  => mkDbError(e),
)
```

## Result\<Unit, E\> for no-value success

```ts
// Never Result<void, E>
const save = (): Result<Unit, DbError> => ok(unit)
```

## pipe vs flow

```ts
// pipe — value at hand
const result = pipe(input, mapO(transform), getOrElse(() => fallback))

// flow — reusable pipeline, returns a function
const process = flow(mapO(transform), getOrElse(() => fallback))
const result  = process(input)
```

## absurd — exhaustiveness witness

```ts
switch (result._tag) {
  case 'Ok':  return result.value
  case 'Err': return result.error
  default:    return absurd(result)
}
```

## Unknown record decoding

```ts
import { isRecord, getStringField, getNumberField, getTypedField } from '@tsfpp/prelude'

const decode = (raw: unknown): Result<Foo, string> => {
  if (!isRecord(raw)) return err('not an object')
  const name = getStringField(raw, 'name')        // Option<string> — rejects empty/whitespace
  const age  = getNumberField(raw, 'age')         // Option<number> — rejects NaN/Infinity
  const id   = getTypedField(raw, 'id', isFooId)  // Option<FooId> — custom guard
  return isSome(name) && isSome(age) && isSome(id)
    ? ok({ name: name.value, age: age.value, id: id.value })
    : err('missing or invalid fields')
}
```

## Array traversal

```ts
// Fallible map — short-circuits on first Err
const all = traverseArray(parseFoo)(rawItems) // Result<ReadonlyArray<Foo>, E>
// Never: rawItems.map(parseFoo) — produces ReadonlyArray<Result<Foo,E>>

// Option traversal — None if any element is None
traverseArrayO(fromNullable)([1, 2, 3])    // Some([1, 2, 3])
traverseArrayO(fromNullable)([1, null, 3]) // None

// Already have ReadonlyArray<Option<A>>?
sequenceArrayO([some(1), some(2)]) // Some([1, 2])
sequenceArrayO([some(1), none])    // None

// Guard typed arrays from unknown
const strings = fromUnknownArrayOf(
  (v): v is string => typeof v === 'string'
)(raw) // Option<ReadonlyArray<string>>
```

## ReadonlyMap

```ts
// Never new Map()
const m  = intoMap([['a', 1], ['b', 2]])  // ReadonlyMap<string, number>
const v  = pipe(m, lookup('a'))           // Some(1)
const m2 = pipe(m, assoc('c', 3))         // insert / replace
const m3 = pipe(m2, dissoc('a'))          // remove
const es = entriesOfMap(m)                // ReadonlyArray<readonly [string, number]>
```

## ReadonlySet

```ts
// Never new Set()
const s   = intoSet([1, 2, 2, 3])  // ReadonlySet<number> — {1, 2, 3}
const s2  = pipe(s, conj(4))       // add
const s3  = pipe(s2, disj(2))      // remove (no-op when absent)
const has = pipe(s, member(1))     // true
```

## Discriminant convention

| ADT origin | Field | Access |
|---|---|---|
| `@tsfpp/prelude` (Result, Option) | `_tag` | **via guards only** — never `x._tag === 'Ok'` |
| Domain ADTs | `kind` | `switch (x.kind)` with `absurd` |