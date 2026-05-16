---
name: boundary-api
description: >
  Complete API surface of @tsfpp/boundary: typed request context, RFC 9457 error
  responses, ApiError taxonomy, response builders, cursor pagination, long-running
  operations, bulk operations, idempotency, observability middleware, webhook
  signing, rate-limit headers, CORS, and cache policy. Load when writing or
  reviewing any HTTP handler that imports from @tsfpp/boundary, or when choosing
  between response builders, error mappers, or middleware composition patterns.
---

# @tsfpp/boundary API

Framework-agnostic Fetch API primitives. One peer dependency: `@tsfpp/prelude`.
`kind` is the discriminant for all ADTs in this module.

## Import path

```ts
import { extractContext, apiErrorToResponse, ... } from '@tsfpp/boundary';
```

---

## Core exports by group

### Branded primitives

| Type | Smart constructor | Constraint |
|---|---|---|
| `TraceId` | `mkTraceId(raw)` → `Option<TraceId>` | any non-empty string |
| `PrincipalId` | `mkPrincipalId(raw)` → `Option<PrincipalId>` | any non-empty string |
| `Cursor` | internal — use `encodeCursor` | never construct directly |
| `IdempotencyKey` | `mkIdempotencyKey(raw)` → `Option<IdempotencyKey>` | `[A-Za-z0-9_-]{1,255}` |
| `WebhookEventId` | `mkWebhookEventId(raw)` → `Option<WebhookEventId>` | any non-empty string |

### Request context

| Export | Description |
|---|---|
| `RequestContext` | `{ traceId, principalId: Option<PrincipalId>, idempotencyKey: Option<IdempotencyKey>, method, url, routeTemplate }` |
| `extractContext(req, routeTemplate)` | Call at the top of every handler. Reads `traceparent` / `x-request-id` / `x-trace-id`; generates UUID fallback. `routeTemplate` must be the parameterised path (`/v1/tracks/:id`), never the resolved URL. |
| `extractTraceId(req)` | Reads trace headers only; generates UUID fallback. |

### Validation

| Export | Description |
|---|---|
| `ValidationError` | `{ kind: 'validation'; message: string; issues: ReadonlyArray<FieldIssue> }` |
| `FieldIssue` | `{ field: string; message: string }` |
| `fromZodError(zodError)` | Lifts a `ZodError` into a `ValidationError`. Use after `safeParse`. |
| `mkValidationError(message, issues?)` | Manual construction for non-Zod sources. |

### `ApiError` taxonomy

Discriminated union on `kind`. Pass to `apiErrorToResponse`; never construct `ProblemDetails` manually for these variants.

| `kind` | Extra fields | HTTP |
|---|---|---|
| `validation` | `message`, `issues: ReadonlyArray<FieldIssue>` | 422 |
| `not_found` | `resource: string`, `id: string` | 404 |
| `conflict` | `detail: string` | 409 |
| `permission` | `required: string` | 403 |
| `unauthenticated` | — | 401 + `WWW-Authenticate` |
| `rate_limit` | `retryAfterSeconds?: number` | 429 + `Retry-After` |
| `precondition` | `detail: string` | 412 |
| `gone` | `resource: string` | 410 |
| `dependency` | `dependency: string`, `cause: unknown` | 502 — **log `cause` before calling mapper** |
| `internal` | `cause: unknown` | 500 — **log `cause` before calling mapper** |

### Problem Details (RFC 9457)

| Export | Description |
|---|---|
| `ProblemDetails` | `{ type, title, status, code, detail?, instance?, traceId, errors? }` |
| `mkProblem(status, code, title, traceId, opts?)` | Constructs a `ProblemDetails`. `type` defaults to `'about:blank'`. |
| `problemResponse(problem, headers?)` | `Response` with `Content-Type: application/problem+json`. |

### Response builders

| Export | Status | Notes |
|---|---|---|
| `okResponse(body, headers?)` | 200 | |
| `createdResponse(body, location, headers?)` | 201 | Sets `Location` header |
| `acceptedResponse(operation, location, headers?)` | 202 | LRO — sets `Location` header |
| `noContentResponse(headers?)` | 204 | No body — use after mutations with no return value |
| `redirectResponse(status, location, headers?)` | 301/302/307/308 | Prefer 308 over 301, 307 over 302 |
| `jsonResponse(status, body, headers?)` | any | Fallback when the above don't fit |

### Error mapping

| Export | Description |
|---|---|
| `apiErrorToProblem(error, ctx)` | `ApiError` → `ProblemDetails`. Exhaustive; never leaks `cause`. |
| `apiErrorToResponse(error, ctx)` | `ApiError` → `Response`. Adds `WWW-Authenticate` on `unauthenticated`, `Retry-After` on `rate_limit`. **Prefer this over manual `problemResponse`**. |
| `ErrorMapper<E>` | `(error: E, ctx: RequestContext) => Response` — implement for app-specific variants; delegate canonical variants to `apiErrorToResponse`. |

### Pagination

| Export | Description |
|---|---|
| `Paginated<T>` | `{ items: ReadonlyArray<T>; nextCursor: Cursor \| null; totalCount: number \| null }` |
| `PageQuery` | `{ limit: number; cursor: Cursor \| null }` |
| `mkPaginated(items, nextCursor, totalCount?)` | Constructs a `Paginated<T>` body. `totalCount` — return `null` unless precomputed. |
| `parsePaginationQuery(url, maxLimit?)` | Validates `limit` and `cursor` from URL query string → `Result<PageQuery, ValidationError>` |
| `encodeCursor(payload)` | Record → opaque `Cursor` (base64url) |
| `decodeCursor(cursor)` | `Cursor` → `Option<Record<string, unknown>>` |

### Long-running operations

`Operation<T>` is a discriminated union on `kind`: `running | succeeded | failed | cancelled`.

| Export | Description |
|---|---|
| `mkRunningOp(operationId, progress?)` | `progress` 0–100 |
| `mkSucceededOp(operationId, result, createdAt)` | |
| `mkFailedOp(operationId, error, createdAt)` | |
| `mkCancelledOp(operationId, createdAt)` | |

Return `acceptedResponse(op, pollUrl)` from the trigger handler; return `okResponse(op)` from the polling handler.

### Bulk operations

| Export | Description |
|---|---|
| `BulkItem<T>` | `ok` (200/201) or `error` (4xx/5xx) variant |
| `BulkResponse<T>` | `{ items: ReadonlyArray<BulkItem<T>> }` |
| `mkBulkOkItem(body, status?)` | Successful item |
| `mkBulkErrorItem(problem)` | Failed item from `ProblemDetails` |
| `bulkResponse(items)` | `207 Multi-Status` |

### Rate limiting

| Export | Description |
|---|---|
| `RateLimitState` | `{ limit: number; remaining: number; resetAt: Date }` |
| `rateLimitHeaders(state)` | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` — attach to **all** responses on rate-limited endpoints, not just 429s |
| `retryAfterHeader(seconds)` | `Retry-After` — add on 429 in addition to `rateLimitHeaders` |

### Security and CORS

| Export | Description |
|---|---|
| `baselineSecurityHeaders` | `HSTS`, `CSP`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Cache-Control: no-store` — merge into every response |
| `corsHeaders(allowedOrigins, requestOrigin, opts?)` | Never reflects `Origin` blindly. Returns `{}` for unlisted origins. Always sets `Vary: Origin`. `allowedOrigins` comes from config, never from headers. |

### Idempotency

| Export | Description |
|---|---|
| `IdempotencyStore` | Port — `check`, `markInFlight`, `store`. Implement with Redis / Postgres / any durable store. |
| `IdempotencyLookup` | Union — `first_request \| replay \| in_flight \| key_conflict` |
| `StoredResponse` | Serialisable response snapshot for replay |
| `withIdempotency(store)` | `(RawHandler) → RawHandler` HOF — full lifecycle |

### Observability

| Export | Description |
|---|---|
| `RequestLogger` | Port — `info(entry)`, `error(entry)`. Implement with pino, winston, etc. |
| `RequestLog` | Structured log entry type |
| `withRequestLog(logger, routeTemplate)` | `(RawHandler) → RawHandler` HOF — one entry per request |

### Webhooks

| Export | Description |
|---|---|
| `signWebhook(secret, id, body)` | HMAC-SHA256 over `{timestamp}.{body}` → `WebhookSignatureHeaders` |
| `verifyWebhook(secret, headers, body, maxAge?)` | Verifies signature + timestamp recency (default 5 min). Constant-time comparison. |
| `WebhookSignatureHeaders` | `x-webhook-id`, `x-webhook-timestamp`, `x-webhook-signature` |

### Cache headers

| Export | Description |
|---|---|
| `CachePolicy` | `'no-store' \| 'private-revalidate' \| 'public-short' \| 'public-long' \| 'immutable'` |
| `cacheHeaders(policy, etag?)` | Builds appropriate `Cache-Control` / `ETag` headers |

### Handler types

| Export | Description |
|---|---|
| `RawHandler` | `(req: Request) => Promise<Response>` |
| `HandlerFactory<Deps>` | `(deps: Deps) => RawHandler` — canonical factory shape |

---

## Canonical handler shape

```ts
export const createTrackHandler: HandlerFactory<Deps> = (deps) => async (req) => {
  const ctx = extractContext(req, '/v1/tracks');         // 1. context first

  const raw    = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return apiErrorToResponse(fromZodError(parsed.error), ctx); // 2. validate

  const result = await deps.tracks.create(parsed.data); // 3. use case
  if (isErr(result)) return apiErrorToResponse(result.error, ctx);

  return createdResponse(result.value, `/v1/tracks/${result.value.id}`, {
    'X-Request-Id': ctx.traceId,
  });                                                    // 4. respond
};
```

## Middleware composition via `pipe`

Compose outermost-last. `withRequestLog` must be outermost so it captures every outcome including idempotency replays.

```ts
const handler: RawHandler = pipe(
  createTrackHandler(deps),               // innermost: business logic
  withIdempotency(idempotencyStore),      // middle: replay / in-flight guard
  withRequestLog(logger, '/v1/tracks'),   // outermost: structured log
);
```

## Custom error extension pattern

```ts
type AppError = ApiError | QuotaExceededError;

const appErrorToResponse: ErrorMapper<AppError> = (error, ctx) => {
  switch (error.kind) {
    case 'quota_exceeded':
      return problemResponse(mkProblem(429, 'quota_exceeded', '...', ctx.traceId));
    default:
      return apiErrorToResponse(error, ctx); // delegate canonical variants
  }
};
```