---
name: boundary-api
description: >
  Complete API surface of @tsfpp/boundary v2.0.0: typed request context, handler
  helpers (mkJsonHandler, mkHandler, parseJsonBody), RFC 9457 error
  responses, ApiError taxonomy, response builders, cursor pagination, long-running
  operations, bulk operations, idempotency, observability middleware, webhook
  signing, rate-limit headers, CORS, cache policy, loadConfig, and Node.js dev
  adapter. Load when writing or reviewing any HTTP handler that imports from
  @tsfpp/boundary, or when choosing between handler helpers, response builders,
  error mappers, or middleware composition patterns.
---

# @tsfpp/boundary API — v2.0.0

Framework-agnostic Fetch API primitives. One peer dependency: `@tsfpp/prelude`.
`kind` is the discriminant for all ADTs in this module.

## Import path

```ts
import { mkJsonHandler, extractContext, apiErrorToResponse, ... } from '@tsfpp/boundary'
```

---

## Handler helpers (v2.0.0)

Prefer these over hand-rolling the parse → validate → respond pattern.

### `mkJsonHandler` — the default for JSON POST/PUT/PATCH

```ts
export const createOrderHandler: HandlerFactory<Deps> = (deps) =>
  mkJsonHandler({
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
`mkJsonHandler` calls `extractContext`, runs `safeParse`, lifts Zod errors via `fromZodError`,
and calls `apiErrorToResponse` on `Err`. You do not call these manually inside `handle`.

### `mkHandler` — for handlers without a JSON body

```ts
const getOrderHandler: HandlerFactory<Deps> = (deps) =>
  mkHandler({
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

## Canonical handler shape (with mkJsonHandler)

```ts
import { mkJsonHandler, type HandlerFactory, createdResponse,
         withIdempotency, withRequestLog } from '@tsfpp/boundary'
import { err, isErr, ok, pipe } from '@tsfpp/prelude'

export const createOrderHandler: HandlerFactory<Deps> = (deps) =>
  mkJsonHandler({
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

## Manual handler shape (without mkJsonHandler)

Use only when mkJsonHandler does not fit (multipart, streaming, etc.):

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

## `ApiError` taxonomy

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

## Full API surface

For the complete, version-accurate export list:
`get_api_surface({ package: '@tsfpp/boundary' })`