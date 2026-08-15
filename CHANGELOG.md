# Changelog

All notable changes to this project will be documented in this file.
This file is maintained automatically by [release-please](https://github.com/googleapis/release-please)
and supplemented during development via the `/trunk-changelog` prompt.

<!-- do not remove this comment - release-please uses it as an anchor -->
<!-- RELEASE-PLEASE-INSERTION-POINT -->

## [Unreleased]

### Features
- `feat(subtree): add upstream chain subtree rendering mode` — Enables rendering a root-to-target managerial path via compile options for manager-line focused views.
- `feat(icons): add cannabis icon support in the default registry` — Allows style and node icon configuration to render `cannabis` without custom icon wiring.

### Bug fixes
- `fix(subtree): use shared direct parent for sibling multi-select roots` — Multi-selecting sibling nodes now roots the isolated tree at their shared manager instead of the global top node.
- `fix(compile): keep subtree options available when resolve fails` — Subtree entry listing now falls back to parsed AST handles so selector UIs stay populated on semantic errors.

### Refactoring
- `refactor(core): split oversized modules into focused helpers` — Improves maintainability by extracting compile, parser, style, layout, render, and subtree internals into smaller modules without intended behavior changes.
- `refactor(core): migrate to @tsfpp/prelude 2.x and @tsfpp/boundary 2.x APIs` — Renames call sites for the v2 breaking changes (`mapOption`/`flatMapOption`/`getOrElseOption`/`entriesOf`, `mk`-prefixed boundary constructors) and eliminates two `Number.POSITIVE_INFINITY`/`NEGATIVE_INFINITY` reduce sentinels (dotted-edge routing, shared-channel routing) in favor of `mkNonEmpty` + `semigroupMin`/`semigroupMax`, removing the numeric-hazard pattern Rule 1.13 forbids.
- `refactor(core): adopt findO, matchOption/match, monoid, and typed-record helpers` — Replaces `fromNullable(arr.find(...))` with `findO`, `isNone`/`isSome`/`isOk`/`isErr` ternaries with total `matchOption`/`match` eliminators (Rule 8.5), ad hoc sum-reduces with `monoidSum`/`foldMap`/`concatAll`, and `Object.entries` on typed records with `entriesOfRecord`.

### Tests
- `test(core): replace mock-based pipeline tests with integration scenarios` — Improves regression confidence by exercising parse, resolve, and render behavior through real module boundaries.

### Documentation
- `docs(core): add TSF++ module and export documentation across src` — Expands API and module documentation to improve discoverability and maintainability for contributors.

### Chores
- `chore(tooling): upgrade TSF++ agents and standard dependencies` — Aligns local tooling and rule enforcement with newer TSF++ releases for development-time consistency.
- `chore(release): align package and release baseline version metadata` — Keeps package and release-please manifest versions synchronized for trunk release workflows.
- `chore(deps): upgrade @tsfpp/prelude, @tsfpp/boundary, @tsfpp/standard, and @tsfpp/agents to latest major versions` — Bumps `@tsfpp/prelude` 1.6→2.4, `@tsfpp/boundary` 1.2→2.1, `@tsfpp/standard` 1.3→5.0, and `@tsfpp/agents` 1.8→2.5, regenerating the `.ai/`/`.github/`/`.claude` guidance assets from the updated `init.mjs`.
