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
  some, none, ok, err,
  // Type guards
  isSome, isNone, isOk, isErr,
  // Option combinators
  mapO, flatMapO, orElse, getOrElse, fromNullable,
  // Result combinators
  map, flatMap, flatMapAsync, mapErr, tap, tapErr,
  // Async adapters
  tryCatch, tryCatchAsync,
  // Traversal
  traverseArray, traverseArrayO, sequenceArrayO,
  // Pipe
  pipe, flow, comp, complement,
  // Utilities
  absurd, unit,
  // Types
  type Option, type Result, type Unit, type Brand,
} from '@tsfpp/prelude'
```

Never `import from 'ramda'`.

## Option\<A\>

```ts
// Construct
const a: Option<number> = some(42)
const b: Option<number> = none

// Guard before accessing .value
if (isSome(opt)) opt.value   // safe
if (isNone(opt)) return ...  // early exit

// Transform
pipe(opt, mapO(n => n + 1))
pipe(opt, flatMapO(n => n > 0 ? some(n) : none))
pipe(opt, getOrElse(() => 0))
pipe(opt, orElse(() => some(defaultValue)))

// Lift from nullable
const opt = fromNullable(maybeNull)  // null | undefined → Option<T>
```

## Result\<T, E\>

```ts
// Construct
const r: Result<number, string> = ok(42)
const e: Result<number, string> = err('oops')

// Guard before accessing .value / .error
if (isOk(r))  r.value   // T
if (isErr(r)) r.error   // E

// Transform
pipe(r, map(v => v + 1))
pipe(r, flatMap(v => v > 0 ? ok(v) : err('non-positive')))
pipe(r, mapErr(e => `Wrapped: ${e}`))

// Side effects without breaking the chain
pipe(r, tap(v  => log.debug({ v })))
pipe(r, tapErr(e => log.warn({ e })))

// Async adapter — wraps throwing code
const result = await tryCatchAsync(
  () => db.findById(id),
  e  => mkDbError(e),
)

// Sync adapter
const result = tryCatch(
  () => JSON.parse(raw),
  e  => `parse error: ${e}`,
)
```

## pipe

```ts
const result = pipe(
  input,
  mapO(transform),
  flatMapO(validate),
  getOrElse(() => fallback),
)
```

## Unit

```ts
// Success with no meaningful value — use ok(unit), not ok(undefined)
const save = (): Result<Unit, DbError> => ok(unit)
```

## absurd

```ts
// Exhaustiveness witness — type error if a union variant is unhandled
default: return absurd(x)
```

## Brand

```ts
type TrackId = Brand<string, 'TrackId'>

const mkTrackId = brand<string, 'TrackId'>(
  s => s.length > 0,
  s => `Invalid TrackId: "${s}"`,
)
```

## Traversal

```ts
// ReadonlyArray<A> → (A → Result<B, E>) → Result<ReadonlyArray<B>, E>
const results = traverseArray(validate)(items)

// ReadonlyArray<A> → (A → Option<B>) → Option<ReadonlyArray<B>>
const options = traverseArrayO(lookup)(items)
```

## Discriminant convention

- Prelude ADTs use `_tag` internally — **never access it directly**
- Use exported guards: `isSome`, `isNone`, `isOk`, `isErr`
- Domain ADTs use `kind` as discriminant