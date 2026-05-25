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

### Tests
- `test(core): replace mock-based pipeline tests with integration scenarios` — Improves regression confidence by exercising parse, resolve, and render behavior through real module boundaries.

### Documentation
- `docs(core): add TSF++ module and export documentation across src` — Expands API and module documentation to improve discoverability and maintainability for contributors.

### Chores
- `chore(tooling): upgrade TSF++ agents and standard dependencies` — Aligns local tooling and rule enforcement with newer TSF++ releases for development-time consistency.
- `chore(release): align package and release baseline version metadata` — Keeps package and release-please manifest versions synchronized for trunk release workflows.
