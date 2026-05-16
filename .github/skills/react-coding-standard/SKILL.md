---
name: react-coding-standard
description: >
  Normative TSF++/React rules for all .tsx and React-relevant .ts files:
  component shape, props contracts, state elimination ladder, effect discipline,
  memoization policy, server state via TanStack Query, forms via React Hook Form
  and Zod, routing via TanStack Router, global state via Zustand/Jotai, Tailwind
  and cva styling, accessibility, testing, and module organisation. Profile of
  coding-standard — all base TSF++ rules still apply. Load when writing or
  reviewing any component, hook, form, route, or store file.
---

# TSF++/React coding standard — v1.0.0

Profile of `CODING_STANDARD.md`. Every base TSF++ rule applies unchanged. This skill adds React-specific rules and refinements.

---

## Never (MUST NOT — React-specific additions)

```
class components / function declarations for components  (Rule 1.1)
module-level mutable state in components or hooks        (Rule 1.5)
optional flag props for mutually exclusive variants      (Rule 2.2)
prop drilling beyond two component levels                (Rule 2.3)
{...rest} spread onto DOM without explicit allow-list    (Rule 2.4)
DOM event types in domain callbacks                      (Rule 2.7)
useState for server state                                (Rule 3.2)
URL-shaped state in component state                      (Rule 3.3)
I/O inside reducers or store actions                     (Rule 3.8)
Context for high-frequency / per-keystroke state         (Rule 3.7)
useEffect for derived state                              (Rule 4.2)
useEffect for data fetching                              (Rule 4.3)
useEffect for user-event reactions                       (Rule 4.4)
effect that subscribes without returning a cleanup       (Rule 4.5)
disabling react-hooks/exhaustive-deps                    (Rule 4.6)
speculative useMemo / useCallback / React.memo           (Rule 5.1–5.3)
inline fetch in components                               (Rule 7.1)
inline string-array query keys                           (Rule 7.2)
throw in submit handlers                                 (Rule 8.2)
per-field useState in forms                              (Rule 8.5)
hand-built URL strings for navigation                    (Rule 9.3)
useStore((s) => s) — whole-store selection               (Rule 10.4)
inline hex codes or magic pixel values in className      (Rule 11.4)
if/else string concatenation for Tailwind variants       (Rule 11.3)
div with onClick for an action                           (Rule 16.1)
data-testid queries in tests                             (Rule 17.1)
stubbing fetch in tests                                  (Rule 17.3)
cross-feature deep imports past a feature's barrel       (Rule 18.2)
shared/ui importing from features/*                      (Rule 18.3)
```

---

## 1 — Component shape

```ts
// MUST: arrow const, explicit return type, ReactElement | ReactNode | null
const UserCard = ({ user }: UserCardProps): ReactElement => (
  <article className="rounded-lg border p-4">
    <h2>{user.displayName}</h2>
  </article>
)
```

- One public (exported) component per file (Rule 1.3)
- `.tsx` if and only if the file contains JSX (Rule 1.4)
- Co-locate component, types, test, story in one directory (Rule 1.6)

---

## 2 — Props contracts

```ts
// MUST: type alias, Props suffix, all fields readonly
type ButtonProps =
  | { readonly kind: 'submit'; readonly loading: boolean;  readonly children: ReactNode }
  | { readonly kind: 'link';   readonly href: string;      readonly children: ReactNode }
  | { readonly kind: 'icon';   readonly icon: ReactElement; readonly label: string }
```

- Mutually exclusive variants → discriminated union, never optional flags (Rule 2.2)
- Callbacks accept domain types, not DOM events (Rule 2.7): `onSelect: (id: UserId) => void`
- Boolean props named affirmatively: `open`, `closable` — not `isOpen`, `enabled` (Rule 2.5)
- Content slots: `ReactNode` over `string | ReactElement` (Rule 2.6)

---

## 3 — State elimination ladder (Rule 3.1)

Exhaust top-to-bottom before introducing state:

1. Derivable from props? → compute during render
2. Derivable from existing state? → compute during render or `useMemo` if expensive
3. Belongs in URL? → router (search params, path params)
4. Server data? → TanStack Query
5. Form state? → React Hook Form
6. Ephemeral UI state, one component? → `useState` / `useReducer`
7. Shared between siblings? → lift to common ancestor (Rule 3.5: lift no higher than needed)
8. Shared across distant subtrees, low-frequency? → Context
9. Shared across distant subtrees, high-frequency? → Zustand / Jotai

Skip a rung with `// DEVIATION(3.1): <reason>`.

**`useReducer` over `useState`** when state has more than two related fields or transitions form a state machine (Rule 3.4):

```ts
type WizardState =
  | { readonly kind: 'step1' }
  | { readonly kind: 'step2'; readonly name: string }
  | { readonly kind: 'submitted'; readonly result: SubmitResult }
```

---

## 4 — Effect discipline

`useEffect` is reserved exclusively for synchronizing with systems **outside React**: subscriptions, browser APIs, imperative libraries, observers (Rule 4.1).

Legitimate: WebSocket, `IntersectionObserver`, `document.title`, canvas/map imperative init.

```ts
// MUST: cleanup every subscribing effect
useEffect(() => {
  const id = window.setInterval(tick, 1000)
  return () => window.clearInterval(id)   // Rule 4.5
}, [tick])
```

| Pattern | Correct tool |
|---|---|
| Derived value | Compute inline or `useMemo` |
| Data fetching | TanStack Query |
| User-event reaction | Event handler |
| Subscription | `useEffect` with cleanup |

---

## 5 — Memoization policy

**Speculative memoization is forbidden.** Add only after a profiler measurement identifies re-renders as the bottleneck.

- `useMemo` — only when result is passed to a memoized consumer or is genuinely expensive (Rule 5.1)
- `useCallback` — only when callback is passed to a memoized component or used in another hook's dep array (Rule 5.2)
- `React.memo` — only after profiler measurement (Rule 5.3)
- When the React Compiler is enabled: remove all manual memoization (Rule 5.5)

Always document the reason inline: `// Reason: passed to memoized DataGrid`

---

## 6 — Composition patterns

- Prefer composition (children, slots) over deeply parameterized props (Rule 6.1)
- Compound components communicate via typed context, not implicit child ordering (Rule 6.2)
- Component does exactly one thing: present, fetch, lay out, or coordinate (Rule 6.4)
- Presentation components must be storybookable with mock props only (Rule 6.5)
- JSX nesting depth ≤ 4; extract sub-components beyond that (Rule 6.6)

---

## 7 — Server state (TanStack Query)

```ts
// Query key factory — typed, factory-shaped (Rule 7.2)
const userKeys = {
  all:    ['users'] as const,
  byId:   (id: UserId)       => [...userKeys.all, id] as const,
  list:   (f: UserFilter)    => [...userKeys.all, 'list', f] as const,
}

// Query functions return T; mutation functions return Result<T, E> (Rule 7.3)
// Post-mutation effects (invalidation, navigation, toasts) in onSuccess/onError (Rule 7.4)
// Optimistic updates require all three: onMutate + onError rollback + onSettled (Rule 7.5)
```

Use TanStack Router loaders for route-level data; component-level queries for sub-resources and on-demand reads (Rule 7.6).

---

## 8 — Forms (React Hook Form + Zod)

```ts
// MUST: Zod schema is the single source of truth (Rule 8.1)
const userSchema = z.object({
  email: z.string().email(),
  age:   z.number().int().min(18),
})
type UserForm = z.infer<typeof userSchema>

const form = useForm<UserForm>({ resolver: zodResolver(userSchema) })

// Submit returns Result<T, E> — never throw (Rule 8.2)
const onSubmit = async (data: UserForm): Promise<Result<User, FormError>> => { ... }
```

- Field validation in the schema only, never in `onChange` handlers (Rule 8.3)
- Compose schemas (`partial`, `pick`, `extend`) instead of duplicating them (Rule 8.4)

---

## 9 — Routing (TanStack Router)

```ts
// MUST: typed navigate; never hand-built URL strings (Rule 9.3)
navigate({ to: '/users/$id', params: { id } })

// MUST: search params validated by Zod at the route definition (Rule 9.2)
```

- Routes declared with full type inference for params and search (Rule 9.1)
- Lazy-load routes not on the critical path (Rule 9.4)

---

## 10 — Global state (Zustand / Jotai)

Global store exists only after the elimination ladder is exhausted (Rule 10.1).

```ts
// MUST: narrow selection — never whole-store (Rule 10.4)
const userName = useUserStore((s) => s.user.name)

// Store actions are pure (state, payload) => state; no I/O inside (Rule 10.3)
// Zustand: sliced by domain (Rule 10.2)
// Jotai: prefer for graph/canvas/grid with many small independent atoms (Rule 10.5)
// Persistence: opt-in per slice/atom; validate with Zod on rehydrate (Rule 10.6)
```

---

## 11 — Styling (Tailwind + shadcn/ui)

```ts
// MUST: cva for variants (Rule 11.3)
const buttonVariants = cva('rounded-lg px-3 py-2', {
  variants: {
    variant: {
      primary:     'bg-primary text-primary-foreground',
      destructive: 'bg-destructive text-destructive-foreground',
    },
  },
  defaultVariants: { variant: 'primary' },
})

// MUST: cn/clsx for conditional classes (Rule 11.2)
const cls = cn('rounded-lg p-4', active && 'ring-2', disabled && 'opacity-50')

// MUST: design tokens only — no hex/pixel literals (Rule 11.4)
// Good: className="bg-background text-foreground gap-4"
// Bad:  className="bg-[#0a0a0a] gap-[17px]"
```

- shadcn/ui components are vendored, not depended on as a package (Rule 11.5)
- `style={{ ... }}` only for runtime-computed values (e.g. CSS variables driven by state) (Rule 11.6)

---

## 12 — Animation (framer-motion)

```ts
// MUST: variants at module scope, not inline (Rule 12.2)
const fadeVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const

// MUST: respect prefers-reduced-motion (Rule 12.3)
const reduced = useReducedMotion()
```

CSS keyframes only for purely decorative loops with no state interaction.

---

## 13 — Loading and error boundaries

- Every async dependency has explicit loading and error states (Rule 13.1)
- Error boundaries wrap every route and isolated feature subtree (Rule 13.2)
- Error boundaries log to an observability sink and show a recoverable fallback (Rule 13.3)
- Suspense boundaries at content-meaningful seams, not per-atom (Rule 13.4)

---

## 14 — Custom hooks

- Name starts with `use` (Rule 14.1)
- One hook, one responsibility; >1 unrelated returned values → split (Rule 14.2)
- Consistent return shape: value, tuple, or record — pick one (Rule 14.3)
- Return type is explicit and exported (Rule 14.4)

---

## 15 — Performance

- Lists with >~50 visible items use TanStack Virtual or equivalent (Rule 15.3)
- Heavy dependencies (charts, editors, PDF) are dynamic-imported (Rule 15.2)
- Profile before optimizing; DevTools Profiler is the source of truth (Rule 15.5)

---

## 16 — Accessibility

- Interactive elements use semantic HTML: `button`, `a`, `input`, `select` — never `div` with `onClick` (Rule 16.1)
- Forms: associated `label`; icon-buttons: `aria-label`; images: `alt` (Rule 16.2)
- Keyboard navigation covers every interactive flow; focus order logical, visible, traps escapable (Rule 16.3)
- Color is never the sole channel for state; pair with text or icon (Rule 16.4)
- Radix UI / shadcn/ui for dialogs, menus, popovers, tabs, tooltips (Rule 16.5)

---

## 17 — Testing

```ts
// MUST: query by accessible role, not data-testid (Rule 17.1)
screen.getByRole('button', { name: /submit/i })

// MUST: network mocked with MSW, not by stubbing fetch (Rule 17.3)
// Pure logic (reducers, selectors, validators) unit-tested + fast-check (Rule 17.2)
```

---

## 18 — Module organisation

```
src/
  features/
    user-profile/
      UserCard.tsx          ← component
      UserCard.types.ts
      UserCard.test.tsx
      useUser.ts            ← hook
      userKeys.ts           ← query key factory
      userSchema.ts         ← Zod schema
  shared/
    ui/                     ← shadcn primitives, generic atoms (no features/* imports)
    hooks/                  ← cross-feature hooks
    lib/                    ← cn, formatters, type guards
  routes/                   ← route tree
  app/                      ← root, providers, error boundary
```

- Cross-feature imports go through the feature's `index.ts` barrel only (Rule 18.2)
- Path aliases (`@/features/...`) configured in `tsconfig.json`; no deep relative imports (Rule 18.4)