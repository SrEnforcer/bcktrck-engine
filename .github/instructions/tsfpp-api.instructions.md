---
applyTo: "{**/routes/**,**/handlers/**,**/api/**}/*.ts"
---

# TSF++ API rules

Full standard: `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md`
Boundary API: `node_modules/@tsfpp/boundary/README.md`
Extends: `tsfpp-base.instructions.md` (all base rules apply)

## Handler shape

Handlers are thin. The only permitted steps are: **parse → call use-case → map response**.

```ts
import {
  extractContext, fromZodError, apiErrorToResponse,
  createdResponse, okResponse, noContentResponse, acceptedResponse,
  withIdempotency, withRequestLog,
} from '@tsfpp/boundary'
import { isErr, pipe } from '@tsfpp/prelude'

const createTrackHandler: RawHandler = async (req) => {
  const ctx = extractContext(req, '/v1/tracks')           // 1. context — always first

  const raw    = await req.json().catch(() => null)
  const parsed = CreateTrackSchema.safeParse(raw)
  if (!parsed.success)                                    // 2. validate
    return apiErrorToResponse(fromZodError(parsed.error), ctx)

  const result = await createTrack(parsed.data)           // 3. use-case
  if (isErr(result)) return apiErrorToResponse(result.error, ctx)

  return createdResponse(result.value, `/v1/tracks/${result.value.id}`, {
    'X-Request-Id': ctx.traceId,
  })                                                      // 4. respond
}
```

## Boundary imports

All HTTP primitives come from `@tsfpp/boundary`. Never construct `new Response()` directly.

```ts
import {
  // Context
  extractContext,
  // Validation
  fromZodError, mkValidationError,
  // Error mapping
  apiErrorToResponse, apiErrorToProblem,
  // Response builders
  okResponse, createdResponse, noContentResponse,
  acceptedResponse, redirectResponse, jsonResponse, problemResponse, mkProblem,
  // Pagination
  mkPaginated, parsePaginationQuery, encodeCursor, decodeCursor,
  // LRO
  mkRunningOp, mkSucceededOp, mkFailedOp,
  // Bulk
  bulkResponse, mkBulkOkItem, mkBulkErrorItem,
  // Security
  baselineSecurityHeaders, corsHeaders, rateLimitHeaders,
  // Middleware
  withIdempotency, withRequestLog,
  // Webhooks
  signWebhook, verifyWebhook,
  // Types
  type RawHandler, type HandlerFactory, type RequestContext,
} from '@tsfpp/boundary'
```

## Validation

All input validated with Zod at the boundary via `safeParse` — never `parse` (throws):

```ts
const parsed = CreateTrackSchema.safeParse(raw)
if (!parsed.success) return apiErrorToResponse(fromZodError(parsed.error), ctx)
```

Never pass unvalidated `req.json()` into the domain.

## Error mapping

```ts
// Yes — Result propagates; mapped once at the boundary
const result = await createTrack(input)
if (isErr(result)) return apiErrorToResponse(result.error, ctx)

// No — throw crosses the boundary untyped
throw new Error('not found')
```

`dependency` and `internal` ApiError variants contain a `cause` — **log `cause` before calling `apiErrorToResponse`**, it is stripped from the response.

## Middleware composition

Compose via `pipe`, outermost-last. `withRequestLog` must always be outermost:

```ts
const handler: RawHandler = pipe(
  createTrackHandler,           // business logic
  withIdempotency(store),       // replay / in-flight guard
  withRequestLog(logger, '/v1/tracks'), // outermost — logs every outcome
)
```

## Pagination

```ts
const pageQuery = parsePaginationQuery(req.url, 100) // Result<PageQuery, ValidationError>
if (isErr(pageQuery)) return apiErrorToResponse(pageQuery.error, ctx)

const page = mkPaginated(items, nextCursor)           // totalCount omitted unless precomputed
return okResponse(page)
```

## Rate limiting

Attach `rateLimitHeaders` to **all** responses on rate-limited endpoints, not only 429s:

```ts
return okResponse(body, rateLimitHeaders(state))
```

## Security

```ts
// Merge baseline headers into every response
return okResponse(body, { ...baselineSecurityHeaders, ...rateLimitHeaders(state) })

// CORS — never reflect Origin blindly; allowedOrigins from config only
return okResponse(body, corsHeaders(allowedOrigins, requestOrigin))
```

- All routes require authentication unless explicitly marked `// PUBLIC`
- Never log `principalId`, credentials, or full request bodies at `info` level
- Never reflect user input in error messages without sanitisation
- Idempotency keys required on state-mutating operations — use `withIdempotency`

## Status codes

| Situation | Code | Builder |
|---|---|---|
| Read success | 200 | `okResponse` |
| Created | 201 | `createdResponse(body, location)` |
| Accepted (async / LRO) | 202 | `acceptedResponse(operation, pollUrl)` |
| No content | 204 | `noContentResponse` |
| Multi-status (bulk) | 207 | `bulkResponse(items)` |
| Validation failure | 422 | `apiErrorToResponse(fromZodError(e), ctx)` |
| Not found | 404 | `apiErrorToResponse({ kind: 'not_found', ... }, ctx)` |
| Conflict | 409 | `apiErrorToResponse({ kind: 'conflict', ... }, ctx)` |
| Rate limited | 429 | `apiErrorToResponse({ kind: 'rate_limit', ... }, ctx)` |
| Server error | 500 | `apiErrorToResponse({ kind: 'internal', cause }, ctx)` |