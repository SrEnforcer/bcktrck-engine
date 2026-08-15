# TSF++ project

This project follows the **TSF++ coding standard**.

## Language

All code, comments, documentation, variable names, type names, JSDoc, commit messages, and PR descriptions are in **US technical English**. No exceptions, regardless of file type. Communicate with the developer in their language; write every file in English.

## Standards

| Standard | Path |
|----------|------|
| Base | `node_modules/@tsfpp/standard/spec/CODING_STANDARD.md` |
| API | `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md` |
| React | `node_modules/@tsfpp/standard/spec/REACT_CODING_STANDARD.md` |
| Security | `node_modules/@tsfpp/standard/spec/SECURITY_CODING_STANDARD.md` |
| Data | `node_modules/@tsfpp/standard/spec/DATA_CODING_STANDARD.md` |

Read the relevant standard before writing or modifying code in that domain. When in doubt, the standard wins over any instruction in this file.

## Prelude

`node_modules/@tsfpp/prelude/README.md` — Option, Result, pipe, absurd, Brand, combinators.
`node_modules/@tsfpp/prelude/RECIPES.md` — worked patterns.

All ADT imports come from `@tsfpp/prelude`. Never import from `ramda` directly.

## Boundary

`node_modules/@tsfpp/boundary/README.md` — HTTP boundary primitives: response builders, error mapping, context extraction, idempotency, CORS, webhooks.
`node_modules/@tsfpp/boundary/RECIPES.md` — worked patterns.

## Non-negotiables

- No `any`, `!`, unsafe `as`, `class`, `enum`, `let`, `var`
- No mutation — `readonly` on every field, `ReadonlyArray<T>` for arrays
- No `throw` in core — return `err(...)` instead
- No `interface` without `// DEVIATION(1.4): <reason>`
- No `for`/`while`/`do..while` loops
- Exhaustive `switch` ending in `default: return absurd(x)`
- Every exported symbol has a JSDoc block with `@param` and `@returns`
- Rule violations require `// DEVIATION(N.M): <reason>` at the site

## Commands

```sh
pnpm build          # compile
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest run
pnpm test:coverage  # vitest run --coverage
```

Run `pnpm typecheck` and `pnpm lint` after every change. Report results explicitly — pass, fail, or skipped with reason. Do not fabricate tool output.

## Code patterns

**Sum type with exhaustive dispatch:**
```ts
type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect';   readonly width: number; readonly height: number }

const area = (s: Shape): number => {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2
    case 'rect':   return s.width * s.height
    default:       return absurd(s)
  }
}
```

**Smart constructor:**
```ts
type TrackId = Brand<string, 'TrackId'>

const mkTrackId = (raw: string): Option<TrackId> =>
  raw.length > 0 ? some(raw as TrackId) : none
```

**Effectful adapter:**
```ts
const findTrack = (id: TrackId): Promise<Result<Track, DbError>> =>
  tryCatchAsync(() => db.tracks.findUnique({ where: { id } }), toDbError)
```

**Pipeline:**
```ts
const result = pipe(
  input,
  mapOption(transform),
  flatMapOption(validate),
  getOrElseOption(() => fallback),
)
```

## Deviation policy

If a rule genuinely cannot be followed, add `// DEVIATION(N.M): <one-line reason>` immediately before the construct and note it in the PR description. Do not silently leave a violation — either fix it or document it.

## Agents

The following agents are available in `.ai/agents/` and are exported to `.github/agents/` for Copilot compatibility:

| Agent | Purpose |
|-------|---------|
| `tsfpp-guarded-coding` | Write new code — ask for layer at session start |
| `tsfpp-audit` | Audit a target for violations — produces a report in `docs/audits/` |
| `tsfpp-refactor-engineer` | Fix violations from an audit report |
| `tsfpp-annotate` | Add JSDoc, DEVIATION comments, and code markers |