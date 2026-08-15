---
applyTo: "{**/routes/**,**/handlers/**,**/api/**}/*.ts"
---

# TSF++ API rules

Full standard: `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md`
Boundary API: `node_modules/@tsfpp/boundary/README.md`
Extends: `tsfpp-base.instructions.md` — all base rules apply

## Default handler shape — `mkJsonHandler`

Prefer `mkJsonHandler` for all JSON POST/PUT/PATCH handlers. It handles
context extraction, Zod parsing, error lifting, and `apiErrorToResponse`
automatically. Your `handle` function receives already-validated data.

```ts
import {
  mkJsonHandler, type HandlerFactory,
  createdResponse, withIdempotency, withRequestLog,
} from '@tsfpp/boundary'
import { err, isErr, ok, pipe } from '@tsfpp/prelude'
import { z } from 'zod'

const createOrderBody = z.object({
  customerId:  z.string().uuid(),
  amountCents: z.number().int().positive(),
})

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
```

Use `mkHandler` for handlers without a JSON body (GET, DELETE, health checks).

## Manual handler shape

Only when `mkJsonHandler` does not fit (multipart, streaming, early exits before parse):

```ts
export const handler: HandlerFactory<Deps> = (deps) => async (req) => {
  const ctx = extractContext(req, '/v1/orders')           // 1. always first, always with routeTemplate

  const raw    = await req.json().catch(() => null)
  const parsed = createOrderBody.safeParse(raw)
  if (!parsed.success)                                    // 2. validate
    return apiErrorToResponse(fromZodError(parsed.error), ctx)

  const result = await deps.orders.create(parsed.data)   // 3. use-case
  if (isErr(result)) return apiErrorToResponse(result.error, ctx)

  return createdResponse(result.value, `/v1/orders/${result.value.id}`, {
    'X-Request-Id': ctx.traceId,
  })
}
```

## Boundary imports

All HTTP primitives come from `@tsfpp/boundary`. Never `new Response(...)`.

```ts
import {
  mkJsonHandler, mkHandler,
  parseJsonBody, parseJsonWithSchema,
  parsePaginationFromRequest, mkNextCursor,
  extractContext, fromZodError, apiErrorToResponse,
  okResponse, createdResponse, noContentResponse, acceptedResponse,
  mkProblem, problemResponse,
  mkPaginated, withIdempotency, withRequestLog,
  type HandlerFactory, type RawHandler,
  type IdempotencyStore, type RequestLogger,
} from '@tsfpp/boundary'
```

## Middleware composition

```ts
// Always: outermost-last, withRequestLog always outermost
export const makeRoute = (deps: Deps, store: IdempotencyStore, logger: RequestLogger): RawHandler =>
  pipe(
    createOrderHandler(deps),
    withIdempotency(store),
    withRequestLog(logger, '/v1/orders'),
  )
```

## Validation

```ts
// Inside mkJsonHandler — already handled, body is typed
handle: async ({ body }) => { /* body is z.infer<typeof schema> */ }

// Manual — always safeParse, never parse (throws)
const parsed = schema.safeParse(raw)
if (!parsed.success) return apiErrorToResponse(fromZodError(parsed.error), ctx)
```

## Error mapping

```ts
// Yes — Result propagates; mapped once at the boundary
if (isErr(result)) return apiErrorToResponse(result.error, ctx)

// Log cause before mapping dependency/internal errors
if (result.error.kind === 'dependency') {
  logger.error({ message: 'payment.gateway.failed', error: String(result.error.cause), traceId: ctx.traceId })
}
return apiErrorToResponse(result.error, ctx)

// No — never throw, never new Response
throw new Error('not found')
```

## `mkProblem` — object form (v2.0.0)

```ts
// Yes — object argument form
mkProblem({ status: 429, code: 'quota_exceeded', title: 'Quota exceeded', traceId: ctx.traceId })

// No — old positional form
mkProblem(429, 'quota_exceeded', 'Quota exceeded', ctx.traceId)
```

## Status codes

| Situation | Code | Builder |
|---|---|---|
| Read success | 200 | `okResponse` |
| Created | 201 | `createdResponse(body, location)` |
| Accepted (LRO) | 202 | `acceptedResponse(operation, pollUrl)` |
| No content | 204 | `noContentResponse` |
| Multi-status (bulk) | 207 | `bulkResponse(items)` |
| Validation failure | 422 | `apiErrorToResponse(fromZodError(e), ctx)` |
| Not found | 404 | `apiErrorToResponse({ kind: 'not_found', ... }, ctx)` |
| Server error | 500 | `apiErrorToResponse({ kind: 'internal', cause }, ctx)` |

## Security

- All routes require authentication unless explicitly marked `// PUBLIC`
- Never log `principalId`, credentials, or full request bodies at `info`
- Never reflect user input in error messages without sanitisation
- Mutating operations require idempotency — `withIdempotency` in middleware chain
- `baselineSecurityHeaders` merged into every response
- `corsHeaders(allowedOrigins, requestOrigin)` — never reflects `Origin` blindly