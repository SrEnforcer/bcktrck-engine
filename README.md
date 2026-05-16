# bcktrck engine

`@bcktrck/engine` is a TypeScript engine for:
- parsing BTL source into an AST,
- resolving org semantics and references,
- computing layout and edge routing,
- rendering org charts to SVG.

The project follows TSF++ standards (pure core, explicit deviations, strong typing, immutable-first modeling).

## Features

- BTL lexer and parser
- Semantic resolution for handles, links, shadows, and attributes
- Buchheim-based tree layout
- Staff placement and edge routing
- Style DSL support (`defs` and `style` blocks)
- SVG renderer for nodes, edges, dotted links, and shadows

## Installation

```bash
pnpm install
```

## Programmatic usage

```ts
import { compile } from '@bcktrck/engine'

const source = `org CEO
  staff "Executive Assistant"
`

const result = compile(source)

if (!result.ok) {
  console.error(result.parseError ?? result.resolveErrors)
} else {
  console.log(result.svg)
}
```

## Main scripts

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Note: `pnpm test` is currently a placeholder in this repository.

## Project layout

- `src/lexer`: tokenization
- `src/parser`: grammar and parser combinators
- `src/resolver`: semantic validation and tree resolution
- `src/layout`: node placement, routing, and SVG section rendering
- `src/style`: style DSL parsing and resolution
- `src/types`: core domain and result types
- `src/compile.ts`: top-level orchestration pipeline

## Standards

- TSF++ coding standard
- English-only code and docs
- Deviation comments required where rules are intentionally relaxed

## License

MIT
