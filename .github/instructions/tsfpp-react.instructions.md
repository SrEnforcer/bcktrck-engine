---
applyTo: "**/*.tsx"
---

# TSF++ React rules

Full standard: `node_modules/@tsfpp/standard/spec/REACT_CODING_STANDARD.md`
Extends: tsfpp-base.instructions.md (all base rules apply to `.tsx` too)

## Component shape

```ts
// Props: readonly record, no optional fields — use Option<T>
type TrackCardProps = {
  readonly track: Track
  readonly onSelect: Option<(id: TrackId) => void>
}

// Component: pure function, explicit return type
const TrackCard = ({ track, onSelect }: TrackCardProps): React.ReactElement => { ... }
```

## State

Model state as a discriminated union — never boolean soup:

```ts
// Yes
type LoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly data: ReadonlyArray<Track> }
  | { readonly kind: 'error';   readonly message: string }

// No
const [isLoading, setIsLoading] = useState(false)
const [hasError, setHasError] = useState(false)
const [data, setData] = useState(null)
```

## Data fetching

Use TanStack Query. Never `useEffect` for fetching:

```ts
// Yes
const { data, isPending, isError } = useQuery({ queryKey: ['tracks'], queryFn: fetchTracks })

// No
useEffect(() => { fetch('/api/tracks').then(...) }, [])
```

## useEffect

Allowed only for genuine external synchronisation (DOM events, third-party library lifecycle, WebSocket). Must include a comment explaining why `useEffect` is the only option:

```ts
useEffect(() => {
  // NOTE(author, date): Syncing to external ResizeObserver — no React equivalent
  const observer = new ResizeObserver(...)
  return () => observer.disconnect()
}, [ref])
```

## Forbidden in React

- `useEffect` for data fetching or derived state
- Prop drilling > 2 levels — lift state or use context/Jotai
- `any` in prop types or event handlers
- Mutable refs as state (`useRef` for values that drive rendering)
- Inline object/array literals in JSX props without `useMemo`

## Event handlers

```ts
// Yes — named, explicit type
const handleSelect = (id: TrackId): void => { ... }

// No — inline arrow in JSX prop recreated every render
<Button onClick={() => doSomething(id)} />
```

## Memoisation

- Wrap expensive computations in `useMemo`
- Wrap callbacks passed to child components in `useCallback`
- Do not memoize everything — only when a profiler or render trace shows it matters