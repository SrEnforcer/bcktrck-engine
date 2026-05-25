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
  // Unknown decoding
  isRecord, fromUnknownString, fromUnknownArray, fromUnknownArrayOf, fromNonEmptyString,
  getStringField, getNumberField, getBooleanField, getTypedField,
  // ReadonlyMap
  intoMap, entriesOfMap, assoc, dissoc, lookup,
  // ReadonlySet
  intoSet, conj, disj, member,
  // Traversal
  traverseArray, traverseArrayO, sequenceArrayO, unique,
  // Pipe
  pipe, flow, comp, complement,
  // Utilities
  absurd,
  // Logger port
  type Logger, type LogEntry, type LogLevel,
  // Types
  type Option, type Result, type Unit, type Brand, type UnknownRecord,
} from '@tsfpp/prelude'
```

Never `import from 'ramda'`.

## Option\<A\>

```ts
const a: Option<number> = some(42)
const b: Option<number> = none

if (isSome(opt)) opt.value    // safe
if (isNone(opt)) return ...   // early exit

pipe(opt, mapO(n => n + 1))
pipe(opt, flatMapO(n => n > 0 ? some(n) : none))
pipe(opt, getOrElse(() => 0))          // collapse to value
pipe(opt, orElse(() => some(fallback))) // keep Option context

const opt = fromNullable(maybeNull)    // null | undefined → Option<T>
```

## Result\<T, E\>

```ts
const r: Result<number, string> = ok(42)
const e: Result<number, string> = err('oops')

if (isOk(r))  r.value
if (isErr(r)) r.error

pipe(r, map(v => v + 1))
pipe(r, flatMap(v => v > 0 ? ok(v) : err('non-positive')))

// Side effects — never break the pipe chain for logging
pipe(r,
  tap(v    => logger.debug({ message: 'parsed', traceId })),
  tapErr(e => logger.error({ message: 'parse.failed', code: e.code, traceId })),
)

// Wrapping throwing code
const result = tryCatch(() => JSON.parse(raw), e => `parse error: ${String(e)}`)
const result = await tryCatchAsync(() => db.findById(id), e => mkDbError(e))
```

## Result\<Unit, E\> for no-value success

```ts
// Never Result<void, E>
const save = (): Result<Unit, DbError> => ok(unit)
```

## absurd — exhaustiveness witness

```ts
switch (x.kind) {
  case 'a': return handleA(x)
  case 'b': return handleB(x)
  default:  return absurd(x)  // compile error if a variant is unhandled
}
```

## Branded types — smart constructor pattern

```ts
// Never brand() — use Brand type + smart constructor
type UserId = Brand<string, 'UserId'>

const mkUserId = (raw: string): Option<UserId> =>
  raw.length > 0
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor body
    ? some(raw as UserId)
    : none
```

## Unknown record decoding

```ts
import { isRecord, getStringField, getNumberField, getTypedField } from '@tsfpp/prelude'

const decode = (raw: unknown): Result<User, string> => {
  if (!isRecord(raw)) return err('not an object')
  const name = getStringField(raw, 'name')        // Option<string> — rejects empty/whitespace
  const age  = getNumberField(raw, 'age')         // Option<number> — rejects NaN/Infinity
  const id   = getTypedField(raw, 'id', isUserId) // Option<UserId> — custom guard
  return isSome(name) && isSome(age) && isSome(id)
    ? ok({ name: name.value, age: age.value, id: id.value })
    : err('missing or invalid fields')
}
```

## Array traversal

```ts
// Fallible map — short-circuits on first Err
const all = traverseArray(parseFoo)(rawItems)  // Result<ReadonlyArray<Foo>, E>
// Never: rawItems.map(parseFoo) — produces ReadonlyArray<Result<Foo,E>>

// Option traversal — None if any element is None
traverseArrayO(fromNullable)([1, 2, 3])    // Some([1, 2, 3])
traverseArrayO(fromNullable)([1, null, 3]) // None

// Guard typed arrays from unknown
const strings = fromUnknownArrayOf((v): v is string => typeof v === 'string')(raw)
```

## ReadonlyMap

```ts
// Never new Map()
const m  = intoMap([['a', 1], ['b', 2]])
const v  = pipe(m, lookup('a'))           // Some(1)
const m2 = pipe(m, assoc('c', 3))
const m3 = pipe(m2, dissoc('a'))
const es = entriesOfMap(m)                // ReadonlyArray<readonly [string, number]>
```

## ReadonlySet

```ts
// Never new Set()
const s   = intoSet([1, 2, 2, 3])   // {1, 2, 3}
const s2  = pipe(s, conj(4))
const s3  = pipe(s2, disj(2))
const has = pipe(s, member(1))       // true
```

## Logger port

```ts
// Logger, LogEntry, LogLevel are defined in @tsfpp/prelude
// Inject as a dependency — never import pino/winston directly in core/use-case/DAL

type Deps = { readonly logger: Logger }

pipe(
  result,
  tap(v    => deps.logger.info({ message: 'user.created', userId: v.id, traceId })),
  tapErr(e => deps.logger.error({ message: 'user.create.failed', code: e.code, traceId })),
)

// Infrastructure adapter
export const logger: Logger = {
  debug: (entry) => pinoInstance.debug(entry, entry.message),
  info:  (entry) => pinoInstance.info(entry, entry.message),
  warn:  (entry) => pinoInstance.warn(entry, entry.message),
  error: (entry) => pinoInstance.error(entry, entry.message),
}

// Silent logger for tests
export const silentLogger: Logger = {
  debug: () => undefined,
  info:  () => undefined,
  warn:  () => undefined,
  error: () => undefined,
}
```

## Discriminant convention

- Prelude ADTs (`Option`, `Result`) use `_tag` internally — **never access directly**
- Use exported guards: `isSome`, `isNone`, `isOk`, `isErr`
- Domain ADTs use `kind` as discriminant