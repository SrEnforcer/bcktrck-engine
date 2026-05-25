# TSF++ React rules

Full standard: `node_modules/@tsfpp/standard/spec/REACT_CODING_STANDARD.md`
Extends: `tsfpp-base.instructions.md` (all base rules apply to `.tsx` too)

## Component shape

```ts
// Props: type alias, Props suffix, all fields readonly, no optional fields
type TrackCardProps = {
  readonly track:    Track
  readonly onSelect: Option<(id: TrackId) => void>
}

// Component: arrow const, explicit return type
const TrackCard = ({ track, onSelect }: TrackCardProps): React.ReactElement => (
  <article className="rounded-lg border p-4">
    <h2>{track.title}</h2>
  </article>
)
```

One public exported component per file. `.tsx` only when the file contains JSX.

## State elimination ladder

Exhaust top-to-bottom before introducing state:

1. Derivable from props? → compute during render
2. Derivable from existing state? → compute during render or `useMemo` if expensive
3. Belongs in URL? → router search/path params
4. Server data? → TanStack Query
5. Form state? → React Hook Form
6. Ephemeral UI state, one component? → `useState` / `useReducer`
7. Shared between siblings? → lift to nearest common ancestor
8. Shared across distant subtrees, low-frequency? → Context
9. Shared across distant subtrees, high-frequency? → Zustand / Jotai

Model multi-field or state-machine state with `useReducer` over multiple `useState`:

```ts
// Yes
type EditorState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved';  readonly at: Date }
  | { readonly kind: 'error';  readonly message: string }

// No
const [isLoading, setIsLoading] = useState(false)
const [hasError,  setHasError]  = useState(false)
```

## Effect discipline

`useEffect` is reserved exclusively for synchronising with systems **outside React**: subscriptions, browser APIs, imperative third-party libraries.

```ts
// Yes — external subscription with cleanup
useEffect(() => {
  // NOTE(author, date): Syncing to ResizeObserver — no React equivalent
  const observer = new ResizeObserver(onResize)
  observer.observe(ref.current)
  return () => observer.disconnect()
}, [onResize])

// No — use TanStack Query
useEffect(() => { fetch('/api/tracks').then(setTracks) }, [])

// No — use event handler
useEffect(() => { if (submitted) navigate('/done') }, [submitted])

// No — compute during render
useEffect(() => { setFullName(`${first} ${last}`) }, [first, last])
```

Never disable `react-hooks/exhaustive-deps`. Every subscribing effect returns a cleanup.

## Data fetching — TanStack Query

```ts
// Yes
const { data, isPending, isError } = useQuery({
  queryKey: trackKeys.byId(id),
  queryFn:  () => fetchTrack(id),
})

// Query key factory — typed, never inline string arrays
const trackKeys = {
  all:  ['tracks'] as const,
  byId: (id: TrackId) => [...trackKeys.all, id] as const,
}
```

## Forms — React Hook Form + Zod

```ts
const schema = z.object({ title: z.string().min(1), artistId: z.string().uuid() })
type FormData = z.infer<typeof schema>

const form = useForm<FormData>({ resolver: zodResolver(schema) })

// Submit returns Result<T, E> — never throw
const onSubmit = async (data: FormData): Promise<Result<Track, ApiError>> => { ... }
```

## Routing — TanStack Router

```ts
// Yes — typed navigate
navigate({ to: '/tracks/$id', params: { id } })

// No — hand-built URL string
navigate(`/tracks/${id}`)
```

Search params validated by Zod at the route definition.

## Global state — Zustand / Jotai

```ts
// Yes — narrow selection
const title = useTrackStore((s) => s.track.title)

// No — whole-store selection
const store = useTrackStore((s) => s)
```

Store actions are pure `(state, payload) => state` — no I/O inside.

## Styling — Tailwind + cva

```ts
// Variants via cva — never if/else string concatenation
const buttonVariants = cva('rounded-lg px-3 py-2', {
  variants: {
    variant: {
      primary:     'bg-primary text-primary-foreground',
      destructive: 'bg-destructive text-destructive-foreground',
    },
  },
})

// Conditional classes via cn
const cls = cn('rounded-lg p-4', active && 'ring-2', disabled && 'opacity-50')

// Design tokens only — no hex codes or magic pixel values
// Good: className="bg-background text-foreground gap-4"
// Bad:  className="bg-[#0a0a0a] gap-[17px]"
```

## Memoization

Add memoization only after a profiler measurement identifies re-renders as the bottleneck. Document the reason inline.

```ts
// Only when passed to a memoized consumer or genuinely expensive
const sorted = useMemo(() => sortTracks(tracks), [tracks])
// Reason: passed to memoized VirtualList

// Only when passed to memoized component or in another hook's dep array
const handleSelect = useCallback((id: TrackId) => onSelect(id), [onSelect])
```

Never add speculative `useMemo` / `useCallback` / `React.memo`.

## Accessibility

- Interactive elements use semantic HTML — never `div` with `onClick`
- Forms: associated `label`; icon-buttons: `aria-label`; images: `alt`
- Keyboard navigation complete; focus order logical and visible

## Testing

```ts
// Yes — query by accessible role
screen.getByRole('button', { name: /save/i })

// No — data-testid
screen.getByTestId('save-button')
```

Network mocked with MSW — never stub `fetch` directly.

## Forbidden in React

- `useEffect` for data fetching, derived state, or user-event reactions
- Prop drilling beyond 2 levels
- `useState` for server state
- `useStore((s) => s)` whole-store selection
- Inline `if/else` string concatenation for Tailwind variants — use `cva`
- `div` with `onClick` for an action — use `button`
- `data-testid` queries in tests
- Per-field `useState` in forms — use React Hook Form
- Hand-built URL strings for navigation — use typed router API