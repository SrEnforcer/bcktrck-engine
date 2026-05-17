---
applyTo: "**/*.{test,spec}.{ts,tsx}"
---

# TSF++ test rules

Full standard: `node_modules/@tsfpp/standard/spec/TEST_CODING_STANDARD.md`
Extends: `tsfpp-base.instructions.md` (all base TSF++ rules apply to test code)

## Toolchain

| Layer | Runner | Property tests | Network | DB |
|---|---|---|---|---|
| Core | Vitest | fast-check | — | — |
| Use-case | Vitest | fast-check (optional) | — | In-memory stub |
| API / handler | Vitest | — | MSW | In-memory stub |
| DAL | Vitest | — | — | Real / containerised |
| React | Vitest + RTL | — | MSW | — |

## Test structure — AAA

```ts
it('returns None when the input string is empty', () => {
  const raw = ''                  // Arrange

  const result = mkTrackId(raw)   // Act

  expect(result).toEqual(none)    // Assert
})
```

One blank line between phases. One logical assertion per test. No branching or loops in test bodies.

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

Max two levels of nesting. Test descriptions are full sentences describing behaviour.

## Property-based tests — fast-check

Required for every pure function and combinator. Laws in `@law` JSDoc must have a corresponding property test.

```ts
import * as fc from 'fast-check'

it('satisfies the identity law: map(id) ≡ id', () => {
  fc.assert(
    fc.property(fc.integer(), (n) => {
      expect(pipe(ok(n), map(x => x))).toEqual(ok(n))
    }),
  )
})
```

## React components — RTL

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

it('calls onSelect with the track id when the row is clicked', async () => {
  const onSelect = vi.fn()
  render(<TrackRow track={makeTrack()} onSelect={onSelect} />)

  await userEvent.click(screen.getByRole('row', { name: /test track/i }))

  expect(onSelect).toHaveBeenCalledWith(expect.any(String))
})
```

Query hierarchy (use the first that works):
1. `getByRole` — always preferred
2. `getByLabelText`
3. `getByText`
4. `getByPlaceholderText`

Never `getByTestId`.

## Network mocking — MSW

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/api/tracks', () => HttpResponse.json(trackFixtures)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Never stub `fetch`, `axios`, or any HTTP client directly.

## Port stubs — in-memory implementations

```ts
// Good — typed in-memory implementation of the port
const repo = mkInMemoryTrackRepository()

// Bad — partial vi.fn() mock
const repo = { findById: vi.fn().mockResolvedValue(track) }
```

`vi.fn()` is permitted only for standalone callbacks (`onClose`, `onSelect`, etc.).

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
- Fixture IDs are deterministic strings that cannot collide with real data
- Never copy IDs from production or staging environments

## What to cover

| Layer | Must cover |
|---|---|
| Core | Every export · every smart constructor boundary · every error path · laws via fast-check |
| Use-case | Success path · each distinct `Err` variant · any enforced invariant |
| API handler | Each missing required field (422) · success status + headers · each `ApiError` variant · auth failure |
| DAL | Insert+read round-trip · not-found → `None` · constraint violation → typed `DataError` |
| React | Renders · user interactions · loading state · error state · keyboard/ARIA |

## Never

- `data-testid` queries
- `vi.fn()` to implement a port interface
- Assert that an internal function was called — assert on the observable outcome
- `any` in test code
- `setTimeout` delays — use `waitFor` or `findBy*`
- `beforeAll` for state that mutates between tests
- Snapshot tests for component structure or API response shape
- Direct access to non-exported symbols or internal state
- `shallow` rendering