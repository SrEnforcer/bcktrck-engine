---
applyTo: "{**/routes/**,**/handlers/**,**/api/**}/*.ts"
---

# TSF++ API rules

Full standard: `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md`
Boundary API: `node_modules/@tsfpp/boundary/README.md`
Extends: tsfpp-base.instructions.md (all base rules apply)

## Handler shape

Handlers are thin. The only permitted steps are: parse → call use-case → map response.

```ts
const createTrackHandler = async (req: Request): Promise<Response> => {
  const ctx    = extractContext(req)                        // 1. context
  const body   = CreateTrackSchema.safeParse(await req.json())
  if (!body.success) return fromZodError(body.error, ctx.traceId)  // 2. validate

  const result = await createTrack(body.data)              // 3. use-case
  return pipe(result, fold(apiErrorToResponse, createdResponse))    // 4. map
}
```

## Boundary imports

All HTTP primitives come from `@tsfpp/boundary`:

```ts
import {
  extractContext, fromZodError, apiErrorToResponse,
  okResponse, createdResponse, noContentResponse, acceptedResponse,
  problemResponse, mkProblem,
} from '@tsfpp/boundary'
```

Never construct `new Response(...)` directly in a handler.

## Validation

All input validated with Zod at the boundary. Schema lives next to the route:

```ts
const CreateTrackSchema = z.object({
  title:    z.string().min(1).max(255),
  artistId: z.string().uuid(),
})
```

Never pass unvalidated `req.body` or `req.json()` into the domain.

## Errors

```ts
// Yes — Result propagates; mapped once at the boundary
const result: Result<Track, ApiError> = await createTrack(input)
return pipe(result, fold(apiErrorToResponse, createdResponse))

// No — throw crosses the boundary untyped
throw new Error('not found')
```

## Context

```ts
const { traceId, principalId } = extractContext(req)
// Never: req.headers.get('x-trace-id') in business logic
```

## Status codes

| Situation | Code | Builder |
|-----------|------|---------|
| Read success | 200 | `okResponse` |
| Created | 201 | `createdResponse` |
| Accepted (async) | 202 | `acceptedResponse` |
| No content | 204 | `noContentResponse` |
| Validation failure | 422 | `fromZodError` |
| Not found | 404 | `problemResponse(mkProblem(404, ...))` |
| Conflict | 409 | `problemResponse(mkProblem(409, ...))` |
| Server error | 500 | `problemResponse(mkProblem(500, ...))` |

## Security

- All routes require authentication unless explicitly marked `// PUBLIC`
- Never log `principalId`, credentials, or request bodies at `info` level
- Never reflect user input in error messages without sanitisation
- Idempotency keys required on mutating operations — use `withIdempotency`