---
name: log-standard
description: >
  Normative TSF++ logging rules. Load when writing or reviewing any code that
  logs, uses the Logger port, implements a logger adapter, or calls tap/tapErr
  for side effects: Logger port from @tsfpp/prelude, LogEntry field conventions,
  log level semantics, structured message format, what never to log (PII,
  secrets, stack traces), withRequestLog for HTTP, silentLogger for tests.
---

# TSF++ log standard

Full standard: `node_modules/@tsfpp/standard/spec/LOG_CODING_STANDARD.md`

---

## Import

```ts
import { type Logger, type LogEntry, type LogLevel } from '@tsfpp/prelude'
```

Never import `pino`, `winston`, or `console` in core, use-case, or DAL code.

---

## Logger port

```ts
// Infrastructure adapter — inject this; never the library directly
import pino from 'pino'
import { type Logger } from '@tsfpp/prelude'

export const logger: Logger = {
  debug: (entry) => pinoInstance.debug(entry, entry.message),
  info:  (entry) => pinoInstance.info(entry, entry.message),
  warn:  (entry) => pinoInstance.warn(entry, entry.message),
  error: (entry) => pinoInstance.error(entry, entry.message),
}

// Tests — always use silentLogger, never the production logger
export const silentLogger: Logger = {
  debug: () => undefined,
  info:  () => undefined,
  warn:  () => undefined,
  error: () => undefined,
}
```

---

## Log levels

| Level | Use when |
|---|---|
| `debug` | Diagnostic detail — disabled in production by default. Never log PII even at debug. |
| `info` | A significant, expected business event occurred. One entry per meaningful outcome. |
| `warn` | Unexpected but recoverable — retry triggered, rate limit approached, deprecated path called. |
| `error` | Failure requiring attention — operation failed, dependency unreachable, unhandled `Err` at boundary. |

`info` is for **business events**, not execution steps. Never log "calling repository", "repository returned".

---

## LogEntry field conventions

```ts
// message — dot-separated event name, machine-readable
{ message: 'user.created' }
{ message: 'payment.charge.failed' }
{ message: 'session.expired' }

// Always include traceId in request-scoped logs
{ message: 'user.created', traceId: ctx.traceId, userId: user.id }

// Always include code on error-level logs
{ message: 'db.query.failed', code: 'db_timeout', traceId }

// duration for operations with performance budgets (milliseconds)
{ message: 'payment.charge.completed', duration: Date.now() - start, traceId }
```

Flat structure only — no nested objects. Log aggregators cannot query nested fields.

---

## Logging in pipelines — tap / tapErr

Never break a `pipe` chain to log. Use `tap` / `tapErr`:

```ts
// Good
pipe(
  validateInput(input),
  flatMap(createUser(deps.users)),
  tap(user  => deps.logger.info({ message: 'user.created', userId: user.id, traceId })),
  tapErr(err => deps.logger.error({ message: 'user.create.failed', code: err.code, traceId })),
)

// Bad — breaks the pipeline
const result = await createUser(deps.users)(input)
if (isOk(result)) deps.logger.info(...)  // separate from the pipeline
```

---

## Log `cause` before discarding it

`dependency` and `internal` `ApiError` variants carry a `cause` that is stripped by `apiErrorToResponse`. Log it first:

```ts
if (isErr(result) && result.error.kind === 'dependency') {
  deps.logger.error({
    message: 'payment.gateway.unreachable',
    code:    'dependency_error',
    error:   String(result.error.cause),
    traceId: ctx.traceId,
  })
  return apiErrorToResponse(result.error, ctx)
}
```

---

## HTTP request logging

Use `withRequestLog` from `@tsfpp/boundary` — never add manual logging to handler bodies.

```ts
const handler = pipe(
  createUserHandler(deps),
  withIdempotency(store),
  withRequestLog(logger, '/v1/users'),  // always outermost; routeTemplate not resolved URL
)
```

`routeTemplate` must be the parameterised path (`/v1/users/:id`), never the resolved URL.

---

## Never log

- PII — names, emails, phone numbers, addresses, national IDs
- Credentials — passwords, tokens, API keys, session IDs
- Full request or response bodies at `info` or above
- Stack traces in production — log `err.message`, not `err.stack`
- `process.env` or config values — they may contain secrets
- `console.*` anywhere except `main.ts` / `server.ts` startup boundary