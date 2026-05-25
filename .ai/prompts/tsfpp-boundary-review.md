# TSF++ boundary review

A focused, read-only review of API handler and route code against the `@tsfpp/boundary` patterns and the API coding standard.

The API standard is at `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md`.
The boundary API surface is at `node_modules/@tsfpp/boundary/README.md` and `node_modules/@tsfpp/boundary/RECIPES.md`.

> Read only. No file edits. Findings are reported inline in chat.
> For a full audit with a tracked report, use the `tsfpp-audit` agent with `focus: boundary`.

---

## Required input

If a target has not been provided, ask:

> Which file(s) or directory should I review? (e.g. `src/routes/tracks.ts`, `src/routes/`)

---

## Checklist

Review every handler in the target against each item below. Report findings as a table at the end.

### Handler shape

- [ ] Handler is a pure function: `(req: Request) => Promise<Response>`
- [ ] Only three steps: parse → call use-case → map response
- [ ] No business logic inside the handler body
- [ ] No database calls, logging setup, or infrastructure imports in the handler

### Context extraction

- [ ] `extractContext` used to obtain `traceId` and `principalId`
- [ ] Raw headers (`req.headers.get(...)`) not accessed in business logic
- [ ] `traceId` passed to all `mkProblem` calls

### Input validation

- [ ] All input validated with a Zod schema before entering the domain
- [ ] Schema defined adjacent to the route, not inline in the handler
- [ ] `fromZodError` used to map `ZodError` to a typed response
- [ ] No unvalidated `req.json()` or `req.body` passed to the domain

### Response builders

- [ ] `okResponse` used for 200
- [ ] `createdResponse` used for 201
- [ ] `acceptedResponse` used for 202 (async operations)
- [ ] `noContentResponse` used for 204
- [ ] `problemResponse(mkProblem(...))` used for 4xx/5xx
- [ ] `new Response(...)` not constructed directly in a handler

### Error mapping

- [ ] `apiErrorToResponse` used as the single error mapping point
- [ ] No `throw` or `try/catch` in the handler body
- [ ] `fold` or `pipe` used to map `Result` to a response — no manual `if (isErr(...))` branching

### Security baseline

- [ ] Route requires authentication unless marked `// PUBLIC`
- [ ] `principalId` not logged at `info` level
- [ ] No user input reflected in error `detail` fields without sanitisation
- [ ] Mutating routes (`POST`, `PUT`, `PATCH`, `DELETE`) have idempotency handling or a documented reason why it is not needed

### Imports

- [ ] All boundary primitives imported from `@tsfpp/boundary`
- [ ] No boundary primitives re-implemented locally

---

## Output format

Report findings as a table per handler:

```
## `POST /v1/tracks` — createTrackHandler

| Check | Status | Finding |
|-------|--------|---------|
| Handler shape | ✅ | — |
| Context extraction | ⚠️ | `req.headers.get('x-trace-id')` used directly on line 14 |
| Input validation | ✅ | — |
| Response builders | ❌ | `new Response(JSON.stringify(...), { status: 200 })` on line 31 |
| Error mapping | ✅ | — |
| Security baseline | ✅ | — |
| Imports | ✅ | — |
```

After all handlers, append a one-line summary:

```
3 handlers reviewed · 2 findings · 1 clean
```

If no findings are found, say so explicitly — do not omit the summary.