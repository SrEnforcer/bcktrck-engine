---
name: test-standard
description: >
  Normative TSF++ testing rules and idioms for all test files. Load when writing
  or reviewing *.test.ts or *.test.tsx files: toolchain per layer (Vitest,
  fast-check, RTL, MSW, testcontainers), AAA structure, property-based test
  patterns, in-memory port stubs, factory conventions, coverage requirements,
  and forbidden patterns (data-testid, vi.fn() for ports, snapshot tests,
  implementation assertions). Load alongside prelude-api when writing core tests.
---

# TSF++ test standard

Full standard: `node_modules/@tsfpp/standard/spec/TEST_CODING_STANDARD.md`

All base TSF++ rules apply to test code. No `any`, no `let`, no forbidden constructs.

---

## Toolchain per layer

| Layer | Runner | Property tests | Network | DB |
|---|---|---|---|---|
| Core | Vitest | fast-check — required | — | — |
| Use-case | Vitest | fast-check — optional | — | In-memory stub |
| API / handler | Vitest | — | MSW | In-memory stub |
| DAL | Vitest | — | — | Real / containerised |
| React | Vitest + RTL | — | MSW | — |

---

## Structure — AAA

```ts
it('returns None when the input string is empty', () => {
  const raw = ''                 // Arrange

  const result = mkTrackId(raw)  // Act

  expect(result).toEqual(none)   // Assert
})
```

One blank line between phases. One logical assertion concept per test.
Test descriptions are full sentences describing behaviour — never implementation echoes.

```ts
// Good
it('returns None when the input string is empty')
it('responds with 422 when title is missing')

// Bad
it('mkTrackId empty')
it('handler validation test')
```

---

## Describe block structure

```ts
describe('mkTrackId', () => {
  describe('when the input is valid', () => {
    it('returns Some containing a branded TrackId', () => { ... })
  })
  describe('when the input is empty', () => {
    it('returns None', () => { ... })
  })
})
```

Max two levels of nesting. No branching or loops in test bodies.

---

## Property-based tests — fast-check

Required for every pure function and every `@law` in JSDoc.

```ts
import * as fc from 'fast-check'

// Specific case
it('returns Some for a non-empty string', () => {
  expect(isSome(mkTrackId('abc'))).toBe(true)
})

// Law — holds for all inputs
it('satisfies: any non-empty string is accepted', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (s) => {
      expect(isSome(mkTrackId(s))).toBe(true)
    }),
  )
})

// Result identity law
it('satisfies map(id) ≡ id', () => {
  fc.assert(
    fc.property(fc.integer(), (n) => {
      expect(pipe(ok(n), map(x => x))).toEqual(ok(n))
    }),
  )
})
```

---

## React components — RTL

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

it('calls onSelect with the track id when clicked', async () => {
  const onSelect = vi.fn()
  render(<TrackCard track={makeTrack()} onSelect={some(onSelect)} />)

  await userEvent.click(screen.getByRole('article'))

  expect(onSelect).toHaveBeenCalledWith(expect.any(String))
})
```

Query hierarchy — use the first that works:
1. `getByRole`
2. `getByLabelText`
3. `getByText`
4. `getByPlaceholderText`

Never `getByTestId`.

---

## Network — MSW

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/api/tracks', () => HttpResponse.json(fixtures)),
)

beforeAll(()  => server.listen())
afterEach(()  => server.resetHandlers())
afterAll(()   => server.close())
```

Never stub `fetch`, `axios`, or any HTTP client directly.

---

## Port stubs — in-memory only

```ts
// Good — typed in-memory implementation
const repo = mkInMemoryTrackRepository()

// Bad — partial vi.fn() mock
const repo = { findById: vi.fn().mockResolvedValue(track) }
```

`vi.fn()` is permitted only for standalone callbacks (`onClose`, `onSelect`, etc.).

---

## API / handler tests

```ts
it('responds with 201 and a Location header on valid input', async () => {
  const req = new Request('http://localhost/v1/tracks', {
    method:  'POST',
    body:    JSON.stringify({ title: 'Test', artistId: 'a1' }),
    headers: { 'Content-Type': 'application/json' },
  })

  const res = await handler(req)

  expect(res.status).toBe(201)
  expect(res.headers.get('Location')).toMatch(/\/v1\/tracks\//)
})

it('responds with 422 when title is missing', async () => {
  const req = new Request('http://localhost/v1/tracks', {
    method:  'POST',
    body:    JSON.stringify({ artistId: 'a1' }),
    headers: { 'Content-Type': 'application/json' },
  })

  const res = await handler(req)

  expect(res.status).toBe(422)
})
```

---

## Factories

```ts
// tests/factories/track.factory.ts
const makeTrack = (overrides: Partial<Track> = {}): Track => ({
  id:       mkTrackId('test-track-001'),
  title:    'Default Title',
  artistId: mkArtistId('test-artist-001'),
  ...overrides,
})
```

- Factories live in `tests/factories/` — never inline raw object literals
- IDs are deterministic strings that cannot collide with real data
- Never copy IDs from production or staging

---

## Coverage requirements

- Every public export has at least one test for the primary success case
- Every error path (`Err`, `None`, non-2xx) has a corresponding test
- Every branch, switch case, and ternary arm is exercised
- Minimum enforced: 80 % statements, 80 % branches per package

---

## Option and Result assertions

Never use `if (isSome(...))` or `if (isOk(...))` as guards — this is branching and produces a test that passes silently when the value is absent.

```ts
// Bad — branching, silently passes if None
if (isSome(result.name)) {
  expect(result.name.value).toBe('Alice')
}

// Bad — branching, silently passes if Err
if (isOk(result)) {
  expect(result.value.id).toBe('usr-001')
}

// Good — assert on the full value, fails correctly if None/Err
expect(result.name).toEqual(some('Alice'))
expect(result).toEqual(ok({ id: 'usr-001', name: 'Alice' }))

// Good — multiple Option fields, no branching
expect(record.components.artikel).toEqual(some('5'))
expect(record.components.lid).toEqual(some('1'))
expect(record.components.onderdeel).toEqual(some('b'))
```

---

## Never

| Forbidden | Use instead |
|---|---|
| `getByTestId` | `getByRole`, `getByLabelText`, `getByText` |
| `vi.fn()` for a port interface | In-memory implementation |
| Assert internal function was called | Assert observable outcome |
| `any` in test code | Typed fixtures and factories |
| `setTimeout` delays | `waitFor` / `findBy*` |
| `beforeAll` for mutable state | `beforeEach` |
| Snapshot tests for components or API shape | Explicit assertions |
| Shallow rendering | RTL full render |
| Access non-exported symbols | Test through the public API |
| `if (isSome(...))` / `if (isOk(...))` guards | `toEqual(some(...))` / `toEqual(ok(...))` |
| `forEach` / `.map()` in test bodies | Separate `it` block per case |
| `toBeTruthy()` / `toBeFalsy()` | `toBe(true)` / `toBe(false)` or `toEqual(some(...))` |
| `expect(x).toBeDefined()` | `toEqual(some(...))` or explicit value assertion |
| Unawaited async assertions | Always `await` async `expect` or use `resolves` |
| `it.only` / `describe.only` committed | Only in local debugging, never committed |