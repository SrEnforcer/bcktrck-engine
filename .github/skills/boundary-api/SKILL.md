---
name: boundary-api
description: >
  Complete API surface of @tsfpp/boundary v1.2.0: typed request context, handler
  helpers (createJsonHandler, createHandler, parseJsonBody), RFC 9457 error
  responses, ApiError taxonomy, response builders, cursor pagination, long-running
  operations, bulk operations, idempotency, observability middleware, webhook
  signing, rate-limit headers, CORS, cache policy, loadConfig, and Node.js dev
  adapter. Load when writing or reviewing any HTTP handler that imports from
  @tsfpp/boundary, or when choosing between handler helpers, response builders,
  error mappers, or middleware composition patterns.
---

# @tsfpp/boundary API — v1.2.0

Framework-agnostic Fetch API primitives. One peer dependency: `@tsfpp/prelude`.
`kind` is the discriminant for all ADTs in this module.

## Import path

```ts
import { createJsonHandler, extractContext, apiErrorToResponse, ... } from '@tsfpp/boundary'
```

---

## Handler helpers (v1.2.0)

Prefer these over hand-rolling the parse → validate → respond pattern.

### `createJsonHandler` — the default for JSON POST/PUT/PATCH

```ts
export const createOrderHandler: HandlerFactory<Deps> = (deps) =>
  createJsonHandler({
    deps,
    routeTemplate: '/v1/orders',
    schema: createOrderBody,          // Zod schema
    handle: async ({ deps, ctx, body }) => {
      const result = await deps.orders.create(body)
      if (isErr(result)) return err(result.error)
      return ok(createdResponse(result.value, `/v1/orders/${result.value.id}`, {
        'X-Request-Id': ctx.traceId,
      }))
    },
  })
```

`handle` receives `{ deps, ctx, body }` where `body` is already parsed and validated.
Return `ok(Response)` for success or `err(ApiError)` for failure.
`createJsonHandler` calls `extractContext`, runs `safeParse`, lifts Zod errors via `fromZodError`,
and calls `apiErrorToResponse` on `Err`. You do not call these manually inside `handle`.

### `createHandler` — for handlers without a JSON body

```ts
const getOrderHandler: HandlerFactory<Deps> = (deps) =>
  createHandler({
    deps,
    routeTemplate: '/v1/orders/:id',
    handle: async ({ deps, ctx, req }) => {
      const id = new URL(req.url).pathname.split('/').at(-1) ?? ''
      const result = await deps.orders.findById(id)
      if (isErr(result)) return err(result.error)
      return ok(okResponse(result.value, { 'X-Request-Id': ctx.traceId }))
    },
  })
```

### `parseJsonBody` / `parseJsonWithSchema` — manual parsing when needed

```ts
// Parse + validate in one step
const body = await parseJsonWithSchema(req, createOrderBody)
if (isErr(body)) return apiErrorToResponse(body.error, ctx)

// Parse only (returns unknown)
const raw = await parseJsonBody(req)
if (isErr(raw)) return apiErrorToResponse(raw.error, ctx)
```

### `parsePaginationFromRequest` — cursor pagination from request

```ts
const page = parsePaginationFromRequest(req)   // Result<PageQuery, ValidationError>
if (isErr(page)) return apiErrorToResponse(page.error, ctx)
```

### `mkNextCursor` — build next page cursor

```ts
const nextCursor = mkNextCursor(items, page.limit, item => item.id)
return okResponse(mkPaginated(items.slice(0, page.limit), nextCursor))
```

---

## Canonical handler shape (with createJsonHandler)

```ts
import { createJsonHandler, type HandlerFactory, createdResponse,
         withIdempotency, withRequestLog } from '@tsfpp/boundary'
import { err, isErr, ok, pipe } from '@tsfpp/prelude'

export const createOrderHandler: HandlerFactory<Deps> = (deps) =>
  createJsonHandler({
    deps,
    routeTemplate: '/v1/orders',
    schema: createOrderBody,
    handle: async ({ deps, ctx, body }) => {
      const result = await deps.orders.create(body)
      if (isErr(result)) return err(result.error)
      return ok(createdResponse(result.value, `/v1/orders/${result.value.id}`, {
        'X-Request-Id': ctx.traceId,
      }))
    },
  })

// Middleware — outermost-last, withRequestLog always outermost
export const makeRoute = (deps: Deps, store: IdempotencyStore, logger: RequestLogger): RawHandler =>
  pipe(
    createOrderHandler(deps),
    withIdempotency(store),
    withRequestLog(logger, '/v1/orders'),
  )
```

---

## Manual handler shape (without createJsonHandler)

Use only when createJsonHandler does not fit (multipart, streaming, etc.):

```ts
export const handler: HandlerFactory<Deps> = (deps) => async (req) => {
  const ctx = extractContext(req, '/v1/orders')            // 1. always first

  const raw    = await req.json().catch(() => null)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return apiErrorToResponse(fromZodError(parsed.error), ctx)

  const result = await deps.orders.create(parsed.data)     // 3. use-case
  if (isErr(result)) return apiErrorToResponse(result.error, ctx)

  return createdResponse(result.value, `/v1/orders/${result.value.id}`, {
    'X-Request-Id': ctx.traceId,
  })
}
```

---

## Core exports by group

### Branded primitives

| Type | Smart constructor |
|---|---|
| `TraceId` | `mkTraceId(raw)` → `Option<TraceId>` |
| `PrincipalId` | `mkPrincipalId(raw)` → `Option<PrincipalId>` |
| `IdempotencyKey` | `mkIdempotencyKey(raw)` → `Option<IdempotencyKey>` |
| `Cursor` | internal — use `encodeCursor` / `mkNextCursor` |
| `WebhookEventId` | `mkWebhookEventId(raw)` → `Option<WebhookEventId>` |

### Request context

| Export | Description |
|---|---|
| `RequestContext` | `{ traceId, principalId, idempotencyKey, method, url, routeTemplate }` |
| `extractContext(req, routeTemplate)` | Call first in every manual handler. Reads trace headers; generates UUID fallback. |

### Validation

| Export | Description |
|---|---|
| `ValidationError` | `{ kind: 'validation'; message: string; issues: ReadonlyArray<FieldIssue> }` |
| `fromZodError(zodError)` | Lifts `ZodError` → `ValidationError` |
| `mkValidationError(issues, message?)` | Manual construction |

### `ApiError` taxonomy

| `kind` | HTTP | Notes |
|---|---|---|
| `validation` | 422 | |
| `not_found` | 404 | |
| `conflict` | 409 | |
| `permission` | 403 | |
| `unauthenticated` | 401 | |
| `rate_limit` | 429 | |
| `precondition` | 412 | |
| `gone` | 410 | |
| `dependency` | 502 | **log `cause` before calling mapper** |
| `internal` | 500 | **log `cause` before calling mapper** |

### Problem Details — `mkProblem` (object form in v1.2.0)

```ts
// v1.2.0 — object argument form
mkProblem({ status: 429, code: 'quota_exceeded', title: 'Quota exceeded', traceId: ctx.traceId })
mkProblem({ status: 404, code: 'not_found', title: 'Not found', traceId, opts: { instance: ctx.url } })
```

### Response builders

| Export | Status |
|---|---|
| `okResponse(body, headers?)` | 200 |
| `createdResponse(body, location, headers?)` | 201 |
| `acceptedResponse(operation, location, headers?)` | 202 |
| `noContentResponse(headers?)` | 204 |
| `redirectResponse(status, location, headers?)` | 3xx |
| `jsonResponse(status, body, headers?)` | any |
| `problemResponse(problem, headers?)` | any |

### Error mapping

| Export | Description |
|---|---|
| `apiErrorToResponse(error, ctx)` | `ApiError` → `Response`. Prefer over manual `problemResponse`. |
| `apiErrorToProblem(error, ctx)` | `ApiError` → `ProblemDetails` |

### Pagination

```ts
const page = parsePaginationFromRequest(req)                // Result<PageQuery, ValidationError>
const nextCursor = mkNextCursor(items, page.limit, i => i.id)
return okResponse(mkPaginated(items.slice(0, page.limit), nextCursor))
```

| Export | Description |
|---|---|
| `parsePaginationQuery(url, maxLimit?)` | From URL query string |
| `parsePaginationFromRequest(req, maxLimit?)` | From Request directly (v1.2.0) |
| `mkPaginated(items, nextCursor, totalCount?)` | `totalCount` → `null` unless precomputed |
| `mkNextCursor(items, limit, keyFn)` | Builds cursor from last item (v1.2.0) |
| `encodeCursor` / `decodeCursor` | Manual cursor encode/decode |

### Long-running operations

```ts
acceptedResponse(mkRunningOp(operationId), pollUrl)  // 202 trigger
okResponse(mkSucceededOp(operationId, result, createdAt))  // polling endpoint
```

### Bulk

```ts
bulkResponse([mkBulkOkItem(body), mkBulkErrorItem(problem)])  // 207
```

### Rate limiting

```ts
// Attach to ALL responses on rate-limited endpoints, not just 429s
okResponse(body, rateLimitHeaders(state))
```

### Security

```ts
// Merge into every response
okResponse(body, { ...baselineSecurityHeaders, ...corsHeaders(allowedOrigins, requestOrigin) })
// corsHeaders never reflects Origin blindly; allowedOrigins from config only
```

### Idempotency + observability

```ts
pipe(handler, withIdempotency(store), withRequestLog(logger, '/v1/orders'))
// withRequestLog always outermost — logs replays too
```

### Configuration

```ts
import { loadConfig, type ConfigError } from '@tsfpp/boundary'
const result = loadConfig(zodSchema, process.env)  // Result<T, ConfigError>
```

### Node.js dev adapter

```ts
import { createNodeAdapter } from '@tsfpp/boundary'

const server = createNodeAdapter(
  pipe(appHandler, withRequestLog(logger, '/')),
  { port: config.server.port, logger },
)
server.listen()   // registers SIGINT/SIGTERM
// await server.close()  // graceful shutdown
```

Dev/test only. In production use a Fetch-native runtime (Hono, Bun.serve, Deno.serve).